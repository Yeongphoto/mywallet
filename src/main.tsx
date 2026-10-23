import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { preloadD1Cache } from './d1-cache-preload';
import { registerPwaServiceWorker } from './pwa-register';
import { installNativeApi } from './auth/native-api';
import './styles.css';
import './mobile.css';
import './calendar.css';
import './app-behavior.css';
import './category-mobile-unify.css';
import './bottom-bars-sync.css';
import './loading-scale.css';
import './memoney-family.css';
import './family-adaptive.css';
import './entry-dialog.css';
import './theme1.css';
import './annual-chart-toggle.css';
import './bottom-nav-jelly.css';
import './settings-controls.css';
import './picker-jelly.css';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Root element not found');
}

const appRootElement = rootElement;

async function bootstrap() {
  const bundled = await installNativeApi();
  if (bundled && window.location.pathname === '/') {
    window.location.replace(window.localStorage.getItem('memoney:wallet-mode') === 'shared-web' ? '/wallet' : '/guest');
    return;
  }
  if (document.documentElement.hasAttribute('data-native-mememo') && window.MewalletLoadingArtwork?.variant !== 'mememo-native-v2') {
    // The existing web renderer URL is immutable. Refresh only the Android variant.
    await new Promise<void>(resolve => {
      const script = document.createElement('script');
      script.src = '/mewallet-loading-v2.js?native=mememo-v2';
      script.onload = () => resolve(); script.onerror = () => resolve();
      document.head.appendChild(script);
    });
  }
  if (window.location.pathname === '/guest') {
    const { default: GuestScreen } = await import('./auth/GuestScreen');
    createRoot(appRootElement).render(<StrictMode><GuestScreen /></StrictMode>);
    return;
  }
  if (window.location.pathname === '/sharing') {
    if (new URLSearchParams(window.location.hash.slice(1)).has('invite')) {
      const { pendingInvitation } = await import('./auth/invitation-client');
      pendingInvitation(); window.location.replace('/signin?join=1'); return;
    }
    const { default: SharingScreen } = await import('./auth/SharingScreen');
    createRoot(appRootElement).render(<StrictMode><SharingScreen /></StrictMode>);
    return;
  }
  if (window.location.pathname === '/browser-login') {
    const { default: BrowserApprovalScreen } = await import('./auth/BrowserLogin');
    createRoot(appRootElement).render(<StrictMode><BrowserApprovalScreen /></StrictMode>);
    return;
  }
  if (window.location.pathname === '/signin') {
    if (!window.location.search && window.localStorage.getItem('memoney:wallet-mode') === 'local') {
      window.location.replace('/guest');
      return;
    }
    const { default: SignInScreen } = await import('./auth/SignInScreen');
    createRoot(appRootElement).render(<StrictMode><SignInScreen /></StrictMode>);
    return;
  }
  if (window.location.pathname === '/wallet') {
    const { default: WalletScreen } = await import('./auth/WalletScreen');
    createRoot(appRootElement).render(<StrictMode><WalletScreen /></StrictMode>);
    return;
  }
  // With account onboarding enabled, an anonymous root visit must stay device-local.
  const configuration = await fetch('/api/auth/config', {cache:'no-store',credentials:'same-origin',signal:AbortSignal.timeout(10000)}).then(r=>r.ok?r.json():null).catch(()=>null);
  if (configuration?.personalOnboarding === true) {
    const session = await fetch('/api/auth/session', {cache:'no-store',credentials:'same-origin',signal:AbortSignal.timeout(10000)}).catch(()=>null);
    window.location.replace(session?.ok && window.localStorage.getItem('memoney:wallet-mode') !== 'local' ? '/wallet' : '/guest');
    return;
  }
  const { default: App } = await import('./App');
  await preloadD1Cache();
  registerPwaServiceWorker();

  createRoot(appRootElement).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

void bootstrap();
