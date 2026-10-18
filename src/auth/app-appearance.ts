export type AppAppearance = { theme: 'light' | 'dark' | 'system'; styleTheme: 'default' | 'theme1' | 'doodle' | 'mememo' };
const key = 'memoney:appearance:v1';
export function readAppAppearance(): AppAppearance | null {
  try {
    const value = JSON.parse(window.localStorage.getItem(key) || 'null');
    if (value && ['light', 'dark', 'system'].includes(value.theme) && ['default', 'theme1', 'doodle', 'mememo'].includes(value.styleTheme)) return value;
  } catch { /* Appearance is an optional device preference, never financial data. */ }
  return null;
}
export function saveAppAppearance(theme: AppAppearance['theme'], styleTheme: AppAppearance['styleTheme']) {
  try {
    const next = JSON.stringify({ theme, styleTheme });
    if (window.localStorage.getItem(key) === next) return;
    window.localStorage.setItem(key, next);
    window.dispatchEvent(new Event('memoney:appearance-changed'));
  } catch { /* Keep the currently rendered theme if preference storage is unavailable. */ }
}
export function appLogoSrc(_style: AppAppearance['styleTheme'], theme: 'light' | 'dark') {
  return theme === 'dark' ? '/images/mememo/mememo-met-mint.png' : '/images/mememo/mememo-met-green.png';
}
