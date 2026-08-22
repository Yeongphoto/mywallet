export function registerPwaServiceWorker() {
  if (typeof window === 'undefined') return;
  if (!('serviceWorker' in navigator)) return;

  if (window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost') {
    void navigator.serviceWorker.getRegistrations().then((registrations) => (
      Promise.all(registrations.map((registration) => registration.unregister()))
    ));
    return;
  }

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // PWA remains usable even when service worker registration fails.
    });
  });
}
