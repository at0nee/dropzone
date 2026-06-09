import axios from 'axios'
import { ApiResponse, AuthResponse, Product, User, Review, CatalogCategory } from '../types'
import { setStoredAuthUser } from '../utils/adminData'

export interface BalanceTransaction {
  id: string
  user_id: string
  amount: number
  balance_before: number
  balance_after: number
  type: 'topup' | 'purchase_hold' | 'order_payout' | 'dispute_refund' | 'dispute_seller_payout' | 'withdrawal_request' | 'admin_adjustment'
  reason: string
  related_order_id?: string
  related_product_id?: string
  actor_user_id?: string
  created_at: string
}

export interface BalanceTransactionsPayload {
  items: BalanceTransaction[]
  total: number
  page: number
  pageSize: number
  summary: {
    totalIn: number
    totalOut: number
    net: number
    currentBalance: number
  }
}

export interface BalanceChartPoint {
  date: string
  totalIn: number
  totalOut: number
  net: number
}

export interface BalanceChartPayload {
  items: BalanceChartPoint[]
}

export interface WithdrawalRequest {
  id: string
  user_id: string
  amount_gross: number
  fee_percent: number
  fee_amount: number
  amount_net: number
  method: 'paypal' | 'card' | 'usdt_trc20'
  destination: string
  status: 'pending' | 'completed' | 'refunded' | 'rejected'
  current_balance_after: number
  created_at: string
  updated_at: string
  processed_at?: string
  processed_by?: string
  admin_note?: string
  user?: User | null
  processed_by_user?: User | null
}

// Use `VITE_API_BASE_URL` when provided (useful for direct backend ngrok URLs).
// Otherwise default to relative paths so the dev server (and ngrok) can proxy requests.
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? ''

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
})

// Добавляем токен к запросам
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('auth_token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
    console.log(`[API] Adding token to request: ${config.url}, token: ${token.slice(0, 8)}...`)
  } else {
    console.warn(`[API] No token found for request: ${config.url}`)
  }
  return config
})

// Auth endpoints
export const authService = {
  login: async (email: string, password: string) => {
    const response = await api.post<ApiResponse<AuthResponse>>('/auth/login', { email, password })
    const payload = response.data.data
    if (response.data.success && payload?.token) {
      localStorage.setItem('auth_token', payload.token)
      if (payload.user) {
        setStoredAuthUser(payload.user)
      }
    }
    return response
  },
  register: async (email: string, password: string, username: string, accepted_rules: boolean) => {
    const response = await api.post<ApiResponse<AuthResponse>>('/auth/register', { email, password, username, accepted_rules })
    const payload = response.data.data
    if (response.data.success && payload?.token) {
      localStorage.setItem('auth_token', payload.token)
      if (payload.user) {
        setStoredAuthUser(payload.user)
      }
    }
    return response
  },
  logout: async () => {
    try {
      await api.post<ApiResponse<void>>('/auth/logout')
    } catch {
      // local cleanup still happens even when backend logout endpoint is absent
    }
    localStorage.removeItem('auth_token')
    setStoredAuthUser(null)
    return { data: { success: true } }
  },
  getCurrentUser: () => {
    return api.get<ApiResponse<User>>('/auth/me')
  },
}

// Products endpoints
export const productService = {
  getAll: (params?: Record<string, any>) => api.get<ApiResponse<{ items: Product[]; total?: number }>>('/products', { params }),
  
  getById: (id: string) => api.get<ApiResponse<Product>>(`/products/${id}`),
  
  create: (data: Partial<Product>) => api.post<ApiResponse<Product>>('/products', data),
  update: (id: string, data: Partial<Product>) => api.put<ApiResponse<Product>>(`/products/${id}`, data),
  delete: (id: string) => api.delete<ApiResponse<void>>(`/products/${id}`),
  
  // Public popular products (global)
  getPopular: () => api.get<ApiResponse<Product[]>>('/public/popular-products'),
  getHomeSummary: () => api.get<ApiResponse<{ completedPurchasesCount: number; usersCount?: number; productsCount?: number; activeSellersCount?: number; categoriesCount?: number; popularProducts: Product[]; salesCountBySeller?: Record<string, number>; salesCountByProduct?: Record<string, number>; sellerNamesById?: Record<string, string> }>>('/public/home-summary'),
}

// Cart endpoints
export const cartService = {
  getCart: () => api.get<ApiResponse<{ items: any[] }>>('/cart'),
  
  addItem: (product_id: string, quantity: number) =>
    api.post<ApiResponse<{ items: any[] }>>('/cart/items', { product_id, quantity }),
  
  removeItem: (product_id: string) => api.delete<ApiResponse<{ items: any[] }>>(`/cart/items/${product_id}`),
  
  checkout: () => api.post<ApiResponse<{ orders: any[]; message?: string }>>('/cart/checkout'),
}

// Reviews endpoints
export const reviewService = {
  getAll: () => api.get<ApiResponse<Review[]>>('/reviews'),
  getByProduct: (product_id: string) =>
    api.get<ApiResponse<Review[]>>(`/reviews?product_id=${product_id}`),
  getBySeller: (seller_id: string) =>
    api.get<ApiResponse<Review[]>>(`/reviews?seller_id=${seller_id}`),
  create: (product_id: string, rating: number, text: string) =>
    api.post<ApiResponse<Review>>('/reviews', { product_id, rating, text }),
}

// Catalog taxonomy endpoints
export const catalogService = {
  getTaxonomy: () => api.get<ApiResponse<{ categories: CatalogCategory[]; apps?: any[] }>>('/catalog/taxonomy'),
  getAdminCategories: () => api.get<ApiResponse<{ categories: CatalogCategory[]; apps?: any[] }>>('/admin/catalog/categories'),
  createCategory: (data: { name: string; parent_id?: string | null; sort_order?: number }) =>
    api.post<ApiResponse<CatalogCategory>>('/admin/catalog/categories', data),
  updateCategory: (id: string, data: { name: string; parent_id?: string | null; sort_order?: number }) =>
    api.put<ApiResponse<CatalogCategory>>(`/admin/catalog/categories/${id}`, data),
  deleteCategory: (id: string) => api.delete<ApiResponse<{ deleted: boolean }>>(`/admin/catalog/categories/${id}`),
}

// Chat endpoints
export const chatService = {
  getThreads: () => api.get<ApiResponse<any[]>>('/chat/threads'),
  createThread: (seller_id: string, product_id?: string, buyer_id?: string) =>
    api.post<ApiResponse<any>>('/chat/threads', { seller_id, product_id, buyer_id }),
  getMessages: (threadId: string) => api.get<ApiResponse<any[]>>(`/chat/threads/${threadId}/messages`),
  sendMessage: (threadId: string, payload: any) =>
    api.post<ApiResponse<any>>(`/chat/threads/${threadId}/messages`, payload),
}

// Orders endpoints
export const ordersService = {
  getAll: () => api.get<ApiResponse<any[]>>('/orders'),
  getById: (id: string) => api.get<ApiResponse<any>>(`/orders/${id}`),
  updateStatus: (id: string, status: string) =>
    api.put<ApiResponse<any>>(`/orders/${id}/status`, { status }),
}

// Users endpoints
export const userService = {
  getAll: () => api.get<ApiResponse<User[]>>('/users'),
  getById: (id: string) => api.get<ApiResponse<User>>(`/users/${id}`),
  update: (id: string, data: Partial<User> & { current_password?: string; new_password?: string; balance_meta?: { source?: string; method?: string } }) => api.put<ApiResponse<User>>(`/users/${id}`, data),
}

export const balanceService = {
  getTransactions: (params?: { page?: number; pageSize?: number; from?: string; to?: string }) =>
    api.get<ApiResponse<BalanceTransactionsPayload>>('/balance/transactions', { params }),
  getChart: (params?: { from?: string; to?: string }) =>
    api.get<ApiResponse<BalanceChartPayload>>('/balance/transactions/chart', { params }),
  createWithdrawal: (data: { amount: number; method: 'paypal' | 'card' | 'usdt_trc20'; destination: string; current_password: string }) =>
    api.post<ApiResponse<{ request: WithdrawalRequest; user: User }>>('/balance/withdrawals', data),
  getMyWithdrawals: () =>
    api.get<ApiResponse<WithdrawalRequest[]>>('/balance/withdrawals'),
  getAdminWithdrawals: () =>
    api.get<ApiResponse<WithdrawalRequest[]>>('/admin/withdrawals'),
  completeWithdrawal: (id: string, data?: { admin_note?: string }) =>
    api.post<ApiResponse<{ request: WithdrawalRequest }>>(`/admin/withdrawals/${id}/complete`, data || {}),
  refundWithdrawal: (id: string, data?: { admin_note?: string }) =>
    api.post<ApiResponse<{ request: WithdrawalRequest; user: User }>>(`/admin/withdrawals/${id}/refund`, data || {}),
}

export default api
