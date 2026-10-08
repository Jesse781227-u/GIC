import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import App from './App'
import './styles.css'
import { installMotionObserver } from './motion'
import { adminQueryClient } from './queryCache'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode><QueryClientProvider client={adminQueryClient}><BrowserRouter><App/></BrowserRouter></QueryClientProvider></React.StrictMode>
)

requestAnimationFrame(() => installMotionObserver())
