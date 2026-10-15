import { useLayoutEffect, useState } from 'react';
import type { CSSProperties, ReactNode, RefObject } from 'react';
import { createPortal } from 'react-dom';

export function FloatingTitleSuggestions({ anchorRef, children }: {
  anchorRef: RefObject<HTMLLabelElement | null>;
  children: ReactNode;
}) {
  const [position, setPosition] = useState<CSSProperties>();
  useLayoutEffect(() => {
    const place = () => {
      const anchor = anchorRef.current;
      if (!anchor) return;
      const rect = anchor.getBoundingClientRect();
      const viewport = window.visualViewport;
      const viewportTop = viewport?.offsetTop || 0;
      const viewportLeft = viewport?.offsetLeft || 0;
      const modal = anchor.closest('.modal-content');
      const header = (modal?.querySelector('.registration-mode-tabs') || modal?.querySelector('.modal-header'))?.getBoundingClientRect();
      const footer = modal?.querySelector('.entry-actions')?.getBoundingClientRect();
      const top = Math.max(viewportTop + 8, header?.bottom || 0);
      const bottom = Math.min(viewportTop + (viewport?.height ?? innerHeight) - 8, footer ? footer.top - 6 : Infinity);
      const above = Math.max(0, rect.top - top - 6);
      const below = Math.max(0, bottom - rect.bottom - 6);
      const up = below < 144 && above > below;
      const height = Math.min(264, up ? above : below);
      const width = Math.min(rect.width, (viewport?.width ?? innerWidth) - 16);
      const next: CSSProperties = {position:'fixed', left:Math.max(viewportLeft + 8, Math.min(rect.left, viewportLeft + (viewport?.width ?? innerWidth) - width - 8)), width,
        top:up ? rect.top - 6 : rect.bottom + 6, transform:up ? 'translateY(-100%)' : 'none', maxHeight:Math.max(44,height), visibility:'visible'};
      setPosition(previous => previous && Object.keys(next).every(key => previous[key as keyof CSSProperties] === next[key as keyof CSSProperties]) ? previous : next);
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    window.visualViewport?.addEventListener('resize', place);
    window.visualViewport?.addEventListener('scroll', place);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
      window.visualViewport?.removeEventListener('resize', place);
      window.visualViewport?.removeEventListener('scroll', place);
    };
  }, [anchorRef]);
  return createPortal(<div className="title-suggestions-dropdown entry-title-suggestions" style={position || {visibility:'hidden'}} onClick={e=>e.stopPropagation()}>{children}</div>, document.body);
}
