import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { preloadD1Cache } from './d1-cache-preload';
import { registerPwaServiceWorker } from './pwa-register';
import './asset-save-guard';
import './local-recovery';
import './local-recovery-visible';
import './settings-recovery-button';
import './app-behavior';
import './asset-drag-fix';
import './touch-sortable';
import './styles.css';
import './mobile.css';
import './calendar.css';
import './app-behavior.css';
import './ledger-mobile.css';
import './recurring-ledger-cleanup.css';
import './category-mobile-unify.css';
import './bottom-bars-sync.css';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Root element not found');
}

const appRootElement = rootElement;

async function bootstrap() {
  await preloadD1Cache();
  registerPwaServiceWorker();

  createRoot(appRootElement).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

void bootstrap();
