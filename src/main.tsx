import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import LoginGate from './components/LoginGate.tsx';
import './index.css';

const API_BASE = (import.meta as any).env?.VITE_API_BASE || "";

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <LoginGate apiBase={API_BASE}>
      <App />
    </LoginGate>
  </StrictMode>,
);
