import { create } from 'zustand'
import { User, AuthCredentials } from '../types'
import { authService } from '../services/api'
import { getStoredAuthUser, setStoredAuthUser, clearUserData } from '../utils/adminData'

interface AuthStore {
  user: User | null
  balance: number
  isLoading: boolean
  isInitialized: boolean
  error: string | null
  isAuthenticated: boolean
  login: (credentials: AuthCredentials) => Promise<void>
  register: (email: string, password: string, username: string) => Promise<void>
  logout: () => void
  clearError: () => void
  setUser: (user: User | null) => void
  addBalance: (amount: number) => void
  deductBalance: (amount: number) => void
  initAuth: () => Promise<void>
}

const storedAuthUser = getStoredAuthUser()

export const useAuthStore = create<AuthStore>((set) => ({
  user: storedAuthUser,
  balance: storedAuthUser?.balance || 0,
  isLoading: false,
  isInitialized: false,
  error: null,
  isAuthenticated: !!storedAuthUser,

  login: async (credentials: AuthCredentials) => {
    set({ isLoading: true, error: null })
    try {
      clearUserData()
      const response = await authService.login(credentials.email, credentials.password)
      if (response.data.success && response.data.data) {
        localStorage.setItem('auth_token', response.data.data.token)
        setStoredAuthUser(response.data.data.user)
        set({ 
          user: response.data.data.user, 
          isAuthenticated: true,
          balance: response.data.data.user?.balance || 0
        })
      }
    } catch (error: any) {
      set({ error: error.response?.data?.error || 'Login failed' })
    } finally {
      set({ isLoading: false })
    }
  },

  register: async (email: string, password: string, username: string) => {
    set({ isLoading: true, error: null })
    try {
      clearUserData()
      const response = await authService.register(email, password, username)
      if (response.data.success && response.data.data) {
        localStorage.setItem('auth_token', response.data.data.token)
        setStoredAuthUser(response.data.data.user)
        set({ 
          user: response.data.data.user, 
          isAuthenticated: true,
          balance: response.data.data.user?.balance || 0
        })
      }
    } catch (error: any) {
      set({ error: error.response?.data?.error || 'Registration failed' })
    } finally {
      set({ isLoading: false })
    }
  },

  logout: () => {
    localStorage.removeItem('auth_token')
    setStoredAuthUser(null)
    clearUserData()
    set({ user: null, isAuthenticated: false, balance: 0 })
  },

  clearError: () => set({ error: null }),

  setUser: (user: User | null) => {
    set({ 
      user, 
      isAuthenticated: !!user,
      balance: user?.balance || 0
    })
    setStoredAuthUser(user)
  },

  addBalance: (amount: number) => set((state) => ({ 
    balance: state.balance + amount 
  })),

  deductBalance: (amount: number) => set((state) => ({ 
    balance: Math.max(0, state.balance - amount)
  })),

  initAuth: async () => {
    // On app initialization, try to restore user from server if token exists
    const token = localStorage.getItem('auth_token')
    
    if (!token) {
      set({ user: null, isAuthenticated: false, balance: 0, isInitialized: true })
      return
    }

    set({ isLoading: true })
    try {
      const response = await authService.getCurrentUser()
      if (response.data.success && response.data.data) {
        setStoredAuthUser(response.data.data)
        set({ 
          user: response.data.data, 
          isAuthenticated: true,
          balance: response.data.data.balance || 0,
          isInitialized: true,
        })
      } else {
        localStorage.removeItem('auth_token')
        setStoredAuthUser(null)
        set({ user: null, isAuthenticated: false, balance: 0, isInitialized: true })
      }
    } catch (_error: any) {
      const storedUser = getStoredAuthUser()
      if (storedUser) {
        set({ user: storedUser, isAuthenticated: true, balance: storedUser.balance || 0, isInitialized: true })
      } else {
        set({ isInitialized: true })
      }
    } finally {
      set({ isLoading: false })
    }
  },
}))

export default useAuthStore
