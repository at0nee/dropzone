import React from 'react'
import { Navigate } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'
import { getUserRole } from '../utils/adminData'

interface RoleRouteProps {
  allowedRoles: Array<'user' | 'support' | 'admin'>
  children: React.ReactNode
}

const RoleRoute: React.FC<RoleRouteProps> = ({ allowedRoles, children }) => {
  const { user, isAuthenticated } = useAuthStore()

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  const role = getUserRole(user?.role)
  const allowed = allowedRoles.includes(role)

  if (!allowed) {
    return <Navigate to="/" replace />
  }

  return <>{children}</>
}

export default RoleRoute
