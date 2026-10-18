import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { preloadD1Cache } from './d1-cache-preload';
import { registerPwaServiceWorker } from './pwa-register';
import './styles.css';
import './mobile.css';
import './calendar.css';
import './app-behavior.css';
import './category-mobile-unify.css';
import './bottom-bars-sync.css';
import './loading-scale.css';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Root element not found');
}

const appRootElement = rootElement;

async function bootstrap() {
  const path = window.location.pathname;
  if (path === '/signin') {
    const { default: Screen } = await import('./auth/SignInScreen');
    createRoot(appRootElement).render(<Screen />); return;
  }
  if (path === '/sharing') {
    if (new URLSearchParams(window.location.hash.slice(1)).has('invite')) {
      const { pendingInvitation } = await import('./auth/invitation-client');
      pendingInvitation(); window.location.replace('/signin?join=1'); return;
    }
    const { default: Screen } = await import('./auth/SharingScreen');
    createRoot(appRootElement).render(<StrictMode><Screen /></StrictMode>); return;
  }
  if (path === '/wallet') {
    const { default: Screen } = await import('./auth/WalletScreen');
    createRoot(appRootElement).render(<StrictMode><Screen /></StrictMode>); return;
  }
  try {
    const response = await fetch('/api/auth/config', { cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw Error('AUTH_CONFIG_UNAVAILABLE');
    const configuration = await response.json();
    if (configuration.required || configuration.enabled) { window.location.replace('/signin'); return; }
  } catch {
    createRoot(appRootElement).render(<main role="alert"><p>로그인 설정을 확인할 수 없어요. 연결 상태를 확인한 뒤 다시 시도해 주세요.</p><button onClick={() => location.reload()}>다시 시도</button></main>);
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
