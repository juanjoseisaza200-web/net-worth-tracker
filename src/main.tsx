import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import { applyTheme, getThemePref } from './utils/theme'

// Before the first render, so a forced light/dark theme never flashes.
applyTheme(getThemePref())

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)

