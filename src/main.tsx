import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { preloadD1Cache } from './d1-cache-preload';
import { registerPwaServiceWorker } from './pwa-register';
import './styles.css';
import './mobile.css';
import './calendar.css';
import './app-behavior.css';
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
