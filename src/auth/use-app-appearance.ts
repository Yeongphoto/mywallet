import { useEffect, useState } from 'react';
import { appLogoSrc, readAppAppearance } from './app-appearance';
export function useAppAppearance() {
  const [appearance] = useState(() => {
    const stored = readAppAppearance();
    const theme = stored?.theme || 'system';
    const resolved = theme === 'system' ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : theme;
    return { resolved, logo: appLogoSrc(stored?.styleTheme || 'default', resolved) };
  });
  useEffect(() => { document.documentElement.setAttribute('data-theme', appearance.resolved); }, [appearance]);
  return appearance;
}
