export type UserRole = 'user' | 'support' | 'admin'

export interface User {
  id: string
  username: string
  email: string
  avatar?: string
  role?: UserRole
  balance: number
  rating: number
  reviews_count: number
  created_at: string
}

export interface Product {
  id: string
  title: string
  description: string
  price: number
  category: string
  seller_id: string
  seller: User
  image_url: string
  images: string[]
  rating: number
  reviews_count: number
  stock: number
  created_at: string
  updated_at: string
}

export interface CatalogCategory {
  id: string
  name: string
  parent_id: string | null
  sort_order?: number
  icon?: string
  created_at: string
  updated_at: string
  children?: CatalogCategory[]
}

export interface CartItem {
  product_id: string
  quantity: number
  product: Product
}

export interface Review {
  id: string
  product_id: string
  user_id: string
  user: User
  rating: number
  text: string
  created_at: string
}

export interface AuthCredentials {
  email: string
  password: string
}

export interface AuthResponse {
  token: string
  user: User
}

export interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: string
  message?: string
}
