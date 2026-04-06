import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { logger } from './utils/logger';
import { OnboardingHost } from './OnboardingHost';
import './styles.css';

// Global handler for unhandled promise rejections — surfaces silent failures
// (e.g. Firestore writes, Drive API calls) as Toast notifications.
window.addEventListener('unhandledrejection', (event) => {
  const msg = event.reason instanceof Error ? event.reason.message : String(event.reason);
  // Dispatch a custom event that the Toast system can pick up
  window.dispatchEvent(new CustomEvent('kissd-error', { detail: msg }));
  logger.error('[Unhandled rejection]', event.reason);
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// Separate React root for the onboarding overlay — completely isolated
// from App re-renders so mode/tab switches can't interfere.
ReactDOM.createRoot(document.getElementById('onboarding-root')!).render(
  <React.StrictMode>
    <OnboardingHost />
  </React.StrictMode>
);
