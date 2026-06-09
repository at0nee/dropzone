import React from 'react'
import { Link, Outlet, useLocation } from 'react-router-dom'
import Header from '../components/Header/Header'
import './MainLayout.css'

const MainLayout: React.FC = () => {
  const location = useLocation()
  const isChatPage = location.pathname.startsWith('/chat')
  const currentYear = new Date().getFullYear()

  return (
    <div className="main-layout">
      <Header onMenuClick={() => {}} />
      <main className={`main-content ${isChatPage ? 'chat-route' : ''}`}>
        <Outlet />
      </main>
      <footer className="site-footer">
        <div className="site-footer-inner">
          <a className="footer-link" href="mailto:support@dropzone.com">support@dropzone.com</a>
          <span className="footer-dot" aria-hidden="true">•</span>
          <Link className="footer-link" to="/rules">Правила сайту</Link>
          <span className="footer-dot" aria-hidden="true">•</span>
          <span className="footer-copy">© {currentYear} Dropzone</span>
        </div>
      </footer>
    </div>
  )
}

export default MainLayout
