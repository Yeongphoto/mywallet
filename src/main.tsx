import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './asset-save-guard';
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

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
