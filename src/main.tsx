import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles.css'
import './planning.css'
import './cloud.css'
import './welcome.css'
import { registerDoneDayServiceWorker } from './push'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><App /></React.StrictMode>,
)

if (import.meta.env.PROD) void registerDoneDayServiceWorker().catch(() => undefined)
