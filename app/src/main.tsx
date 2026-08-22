import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './tokens.css'
import App from './App.tsx'
import { initTheme } from './lib/theme';

/* Before render: a dark flash then a correction is worse than either theme. */
initTheme();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
