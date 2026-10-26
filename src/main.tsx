import React from 'react';
import ReactDOM from 'react-dom/client';
import { AuthGate } from './auth/AuthGate';
import './styles/index.css';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <AuthGate />
  </React.StrictMode>
);

// Register Service Worker for offline PWA capabilities
if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .then((reg) => {
        // Successfully registered service worker
        if (reg.installing) {
          console.log('[SW] Service worker installing');
        } else if (reg.active) {
          console.log('[SW] Service worker active and serving cache');
        }
      })
      .catch((err) => {
        console.warn('[SW] Service worker registration failed:', err);
      });
  });
}
