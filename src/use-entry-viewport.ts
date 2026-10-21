import { useLayoutEffect } from 'react';

/** Keep the form unchanged and add scroll room for the software keyboard. */
export function useEntryViewport() {
  useLayoutEffect(() => {
    const root = document.documentElement;
    const viewport = window.visualViewport;
    let frame = 0;
    let resizeTimer = 0;
    let screenHeight = window.innerHeight;
    let screenWidth = window.innerWidth;
    let keyboardOpen = false;
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
        const visibleTop = Math.max(bounds.top, viewport?.offsetTop || 0) + 12;
        let delta = 0;
        if (rect.top < visibleTop) delta = rect.top - visibleTop;
        else if (rect.bottom > visibleBottom - 12) delta = rect.bottom - visibleBottom + 12;
        if (Math.abs(delta) > 1) scroller.scrollTo({top: scroller.scrollTop + delta,
          behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth'});
      });
    };
    const update = () => {
      const visibleHeight = viewport?.height ?? window.innerHeight;
      const active = document.activeElement;
      const editing = (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) && !active.readOnly;
      keyboardOpen = screenHeight - visibleHeight > 100 && (editing || keyboardOpen);
      if (window.innerWidth !== screenWidth || !keyboardOpen) {
        screenHeight = Math.max(window.innerHeight, visibleHeight);
        screenWidth = window.innerWidth;
        keyboardOpen = false;
      }
      const height = `${visibleHeight.toFixed(2)}px`;
      const top = `${(viewport?.offsetTop ?? 0).toFixed(2)}px`;
      const layoutHeight = `${screenHeight.toFixed(2)}px`;
      const keyboardInset = `${(keyboardOpen ? Math.max(0, screenHeight - visibleHeight) : 0).toFixed(2)}px`;
      if (root.style.getPropertyValue('--entry-screen-height') !== layoutHeight) root.style.setProperty('--entry-screen-height', layoutHeight);
      if (root.style.getPropertyValue('--entry-keyboard-inset') !== keyboardInset) root.style.setProperty('--entry-keyboard-inset', keyboardInset);
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
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(resizeTimer);
      viewport?.removeEventListener('resize', resize);
      viewport?.removeEventListener('scroll', update);
      window.removeEventListener('resize', resize);
      document.removeEventListener('focusin', revealInput);
      root.style.removeProperty('--entry-screen-height');
      root.style.removeProperty('--entry-keyboard-inset');
      root.style.removeProperty('--entry-viewport-height');
      root.style.removeProperty('--entry-viewport-top');
    };
  }, []);
}
