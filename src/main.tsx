import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './app-behavior';
import './asset-drag-fix';
import './styles.css';
import './mobile.css';
import './calendar.css';
import './app-behavior.css';
import './ledger-mobile.css';
import './recurring-ledger-cleanup.css';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Root element not found');
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
