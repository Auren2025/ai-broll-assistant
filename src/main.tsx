import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { PreviewWindow } from './preview/PreviewWindow.tsx'

const normalizedPath = window.location.pathname.replace(/\/+$/, '')
const RootComponent = normalizedPath === '/preview' ? PreviewWindow : App

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RootComponent />
  </StrictMode>,
)
