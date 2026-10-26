import React from 'react';
import ReactDOM from 'react-dom/client';
import { ApplicationEntry } from './app/ApplicationEntry';
import './styles/index.css';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <ApplicationEntry />
  </React.StrictMode>
);

// Request persistent storage for IndexedDB & CacheStorage resilience
if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.persist) {
  navigator.storage.persist().then((isPersistent) => {
    if (isPersistent) {
      console.log('[Storage] Persistent storage granted by browser environment');
    } else {
      console.log('[Storage] Storage is subject to normal eviction under extreme disk pressure');
    }
  }).catch(() => {});
}

// Register Service Worker for offline PWA capabilities
if (import.meta.env.PROD && typeof window !== 'undefined' && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .then((reg) => {
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
