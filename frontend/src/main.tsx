import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { initInstallPrompt } from './lib/install';
import 'maplibre-gl/dist/maplibre-gl.css';
import './index.css';

initInstallPrompt();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
