import { useLayoutEffect, useRef } from 'react';

declare global {
  interface Window {
    MewalletLoadingArtwork?: { draw: (canvas: HTMLCanvasElement) => () => void };
  }
}

export function LoadingGlyph() {
  const ref = useRef<HTMLCanvasElement>(null);
  useLayoutEffect(() => {
    if (ref.current) return window.MewalletLoadingArtwork?.draw(ref.current);
  }, []);
  return <canvas ref={ref} className="app-loading-glyph" width={49} height={49} aria-hidden="true" />;
}
