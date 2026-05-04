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
  login: (credentials: AuthCredentials) => Promise<boolean>
  register: (email: string, password: string, username: string) => Promise<boolean>
  
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
        return true
      }
      set({ error: response.data.error || 'Login failed' })
      return false
    } catch (error: any) {
      set({ error: error.response?.data?.error || 'Login failed' })
      return false
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
        return true
      }
      set({ error: response.data.error || 'Registration failed' })
      return false
    } catch (error: any) {
      set({ error: error.response?.data?.error || 'Registration failed' })
      return false
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
    console.log(`[Auth] ⏳ initAuth() START`)
    const token = localStorage.getItem('auth_token')
    console.log(`[Auth] Token in localStorage: ${!!token} (${token ? token.slice(0, 8) + '...' : 'NONE'})`)
    
    if (!token) {
      console.log(`[Auth] ✓ No token, setting unauthenticated and isInitialized=true`)
      set({ user: null, isAuthenticated: false, balance: 0, isInitialized: true })
      console.log(`[Auth] ✓ initAuth() COMPLETE (no token)`)
      return
    }

    set({ isLoading: true })
    try {
      console.log(`[Auth] ⏳ Calling /auth/me with token ${token.slice(0, 8)}...`)
      const response = await authService.getCurrentUser()
      console.log(`[Auth] ✓ /auth/me response:`, response.status, response.data)
      
      if (response.data.success && response.data.data) {
        console.log(`[Auth] ✓ User restored: ${response.data.data.username}, setting isInitialized=true`)
        setStoredAuthUser(response.data.data)
        set({ 
          user: response.data.data, 
          isAuthenticated: true,
          balance: response.data.data.balance || 0,
          isInitialized: true,
        })
        console.log(`[Auth] ✓ initAuth() COMPLETE (success)`)
      } else {
        console.warn(`[Auth] ✗ Server response not successful, clearing token`)
        localStorage.removeItem('auth_token')
        setStoredAuthUser(null)
        set({ user: null, isAuthenticated: false, balance: 0, isInitialized: true })
        console.log(`[Auth] ✓ initAuth() COMPLETE (invalid response)`)
      }
    } catch (error: any) {
      console.warn(`[Auth] ✗ /auth/me failed:`, error.message)
      const storedUser = getStoredAuthUser()
      if (storedUser) {
        console.log(`[Auth] ✓ Using stored user (offline), setting isInitialized=true`)
        set({ user: storedUser, isAuthenticated: true, balance: storedUser.balance || 0, isInitialized: true })
        console.log(`[Auth] ✓ initAuth() COMPLETE (offline)`)
      } else {
        console.log(`[Auth] ✓ No stored user, setting isInitialized=true`)
        set({ isInitialized: true })
        console.log(`[Auth] ✓ initAuth() COMPLETE (offline, no user)`)
      }
    } finally {
      set({ isLoading: false })
    }
  },
}))

export default useAuthStore
