import React, { useState } from 'react'
import { Outlet } from 'react-router-dom'
import Header from '../components/Header/Header'
import './MainLayout.css'

const MainLayout: React.FC = () => {
  return (
    <div className="main-layout">
      <Header onMenuClick={() => {}} />
      <main className="main-content">
        <Outlet />
      </main>
    </div>
  )
}

export default MainLayout
