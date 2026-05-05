import React, { useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import Header from '../components/Header/Header'
import './MainLayout.css'

const MainLayout: React.FC = () => {
  const location = useLocation()
  const isChatPage = location.pathname.startsWith('/chat')

  return (
    <div className="main-layout">
      <Header onMenuClick={() => {}} />
      <main className={`main-content ${isChatPage ? 'chat-route' : ''}`}>
        <Outlet />
      </main>
    </div>
  )
}

export default MainLayout
