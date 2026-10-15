import { useEffect, useState } from 'react';
import { appLogoSrc, readAppAppearance } from './app-appearance';
export function useAppAppearance() {
  const read = () => {
    const saved = readAppAppearance();
    const theme = saved?.theme || 'light';
    const style = saved?.styleTheme === 'theme1' ? 'theme1' as const : 'default' as const;
    const resolved = theme === 'system' ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : theme;
    return { resolved, style, logo: appLogoSrc(style, resolved) };
  };
  const [appearance, setAppearance] = useState(read);
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const refresh = () => setAppearance(read());
    window.addEventListener('memoney:appearance-changed', refresh);
    media.addEventListener('change', refresh);
    return () => { window.removeEventListener('memoney:appearance-changed', refresh); media.removeEventListener('change', refresh); };
  }, []);
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', appearance.resolved);
    document.documentElement.setAttribute('data-style-theme', 'default');
    document.documentElement.setAttribute('data-ui-theme', appearance.style);
    document.documentElement.style.colorScheme = appearance.resolved === 'light' ? 'only light' : 'dark light';
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', appearance.resolved === 'dark' ? '#9ec5a3' : '#add4af');
  }, [appearance]);
  return appearance;
}
