import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { HTMLAttributes } from 'react';

type Position = { x: number; y: number; width: number; height: number; animate: boolean };

export function JellyToggle({ value, className = '', children, ...props }: HTMLAttributes<HTMLDivElement> & { value: string }) {
  const root = useRef<HTMLDivElement>(null);
  const positioned = useRef(false);
  const [position, setPosition] = useState<Position | null>(null);
  const measure = useCallback((animate: boolean) => {
    const container = root.current;
    const selected = container?.querySelector<HTMLButtonElement>(':scope > button[aria-pressed="true"], :scope > button.active');
    if (!container || !selected) return;
    const bounds = container.getBoundingClientRect(), button = selected.getBoundingClientRect();
    if (!button.width || !button.height) return;
    const next = {
      x: button.left - bounds.left - container.clientLeft + container.scrollLeft,
      y: button.top - bounds.top - container.clientTop + container.scrollTop,
      width: button.width, height: button.height, animate: animate && positioned.current,
    };
    positioned.current = true;
    setPosition(previous => previous && Object.keys(next).every(key => previous[key as keyof Position] === next[key as keyof Position]) ? previous : next);
  }, []);

  useLayoutEffect(() => { measure(true); }, [value, measure]);
  useEffect(() => {
    const container = root.current;
    if (!container) return;
    const observer = new ResizeObserver(() => measure(false));
    observer.observe(container);
    container.querySelectorAll(':scope > button').forEach(button => observer.observe(button));
    let disposed = false;
    void document.fonts.ready.then(() => { if (!disposed) measure(false); });
    return () => { disposed = true; observer.disconnect(); };
  }, [measure]);

  return <div {...props} ref={root} className={`${className} jelly-toggle`}>
    {position && <span className="jelly-toggle-thumb" aria-hidden="true" style={{
      width: position.width, height: position.height,
      transform: `translate(${position.x}px, ${position.y}px)`,
      transition: position.animate ? undefined : 'none',
    }} />}
    {children}
  </div>;
}
