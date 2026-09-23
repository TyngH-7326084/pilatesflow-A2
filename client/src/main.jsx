import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './App.css'
import App from './App.jsx'
import axios from 'axios'

// Expired/invalid token: clear the stale session and send the user back to login
axios.interceptors.response.use(
  (res) => res,
  (err) => {
    const isAuthRoute = err.config?.url?.includes('/api/auth/')
    if (err.response?.status === 401 && !isAuthRoute && localStorage.getItem('token')) {
      localStorage.removeItem('token')
      localStorage.removeItem('role')
      sessionStorage.setItem('authMessage', 'Your session has expired. Please log in again.')
      window.location.assign('/')
    }
    return Promise.reject(err)
  }
)

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)