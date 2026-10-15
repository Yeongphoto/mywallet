import { useLayoutEffect } from 'react';

/** Keep entry dialogs inside the area actually visible above the keyboard. */
export function useEntryViewport() {
  useLayoutEffect(() => {
    const root = document.documentElement;
    const viewport = window.visualViewport;
    let frame = 0;
    let resizeTimer = 0;
    const revealInput = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const input = document.activeElement;
        if (!(input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement) || !input.closest('.entry-modal, .transaction-edit-modal')) return;
        const field = input.closest<HTMLElement>('.compact-entry-field, .form-group') || input;
        const scroller = field.closest<HTMLElement>('.entry-dialog-viewport');
        if (!scroller) return;
        const bounds = scroller.getBoundingClientRect();
        const rect = field.getBoundingClientRect();
        const visibleBottom = Math.min(bounds.bottom, (viewport?.offsetTop || 0) + (viewport?.height ?? window.innerHeight) - 8);
        // A single outer scroller moves the unchanged form above the keyboard.
        if (rect.top < bounds.top + 4) scroller.scrollTop += rect.top - bounds.top - 4;
        else if (rect.bottom > visibleBottom - 4) scroller.scrollTop += rect.bottom - visibleBottom + 4;
      });
    };
    const update = () => {
      const height = `${(viewport?.height ?? window.innerHeight).toFixed(2)}px`;
      const top = `${(viewport?.offsetTop ?? 0).toFixed(2)}px`;
      if (root.style.getPropertyValue('--entry-viewport-height') !== height) root.style.setProperty('--entry-viewport-height', height);
      if (root.style.getPropertyValue('--entry-viewport-top') !== top) root.style.setProperty('--entry-viewport-top', top);
    };
    // IME can briefly report the keyboard inset twice. Commit settled geometry,
    // while the separate full-screen backdrop continues covering the app.
    const resize = () => {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => { update(); revealInput(); }, 80);
    };
    update();
    viewport?.addEventListener('resize', resize);
    viewport?.addEventListener('scroll', update);
    window.addEventListener('resize', resize);
    document.addEventListener('focusin', revealInput);
    document.addEventListener('input', revealInput);
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(resizeTimer);
      viewport?.removeEventListener('resize', resize);
      viewport?.removeEventListener('scroll', update);
      window.removeEventListener('resize', resize);
      document.removeEventListener('focusin', revealInput);
      document.removeEventListener('input', revealInput);
      root.style.removeProperty('--entry-viewport-height');
      root.style.removeProperty('--entry-viewport-top');
    };
  }, []);
}
