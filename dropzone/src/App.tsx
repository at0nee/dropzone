import React from 'react'
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import { useAuthStore } from './stores/authStore'
import { ToastProvider } from './components/Toast'
import MainLayout from './layouts/MainLayout'
import HomePage from './pages/HomePage'
import CatalogPage from './pages/CatalogPage'
import ProductDetailPage from './pages/ProductDetailPage'
import ProfilePage from './pages/ProfilePage'
import AdminPage from './pages/AdminPage'
import LoginPage from './pages/LoginPage'
import CreateProductPage from './pages/CreateProductPage'
import ChatPage from './pages/ChatPage'
import OrdersPage from './pages/OrdersPage'
import SellerProfilePage from './pages/SellerProfilePage'
import BalanceTopUpPage from './pages/BalanceTopUpPage'
import RoleRoute from './components/RoleRoute'

function App() {
  const initAuth = useAuthStore((state) => state.initAuth)

  React.useEffect(() => {
    // Initialize auth on app load (restore user from token/server)
    initAuth()
  }, [initAuth])
  return (
    <ToastProvider>
      <Router>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            path="/admin"
            element={
              <RoleRoute allowedRoles={['admin', 'support']}>
                <AdminPage />
              </RoleRoute>
            }
          />
          
          <Route element={<MainLayout />}>
            <Route path="/" element={<HomePage />} />
            <Route path="/catalog" element={<CatalogPage />} />
            <Route path="/product/:id" element={<ProductDetailPage />} />
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="/orders" element={<OrdersPage />} />
            <Route path="/chat" element={<ChatPage />} />
            <Route path="/chat/:sellerId" element={<ChatPage />} />
            <Route path="/balance/topup" element={<BalanceTopUpPage />} />
            <Route path="/create-product" element={<CreateProductPage />} />
            <Route path="/create-product/:productId" element={<CreateProductPage />} />
            <Route path="/seller/:sellerId" element={<SellerProfilePage />} />
          </Route>
        </Routes>
      </Router>
    </ToastProvider>
  )
}

export default App
