import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Must land before any Sandpack code runs: plain-HTTP origins lack
// crypto.subtle, and the Sandpack bundler client crashes without it.
import '@/lib/crypto-subtle-polyfill'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
