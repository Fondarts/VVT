import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { OnboardingHost } from './OnboardingHost';
import './styles.css';

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
