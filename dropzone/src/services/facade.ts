import { productService, reviewService, userService, cartService, chatService, ordersService } from './api'
import * as adminData from '../utils/adminData'

const safeApiCall = async <T>(fn: () => Promise<any>, fallback: T): Promise<T> => {
  try {
    const res = await fn()
    if (res && res.data) return res.data.data ?? res.data
    return fallback
  } catch (err) {
    return fallback
  }
}

export const fetchProducts = async (params?: Record<string, any>) => {
  const fallback = adminData.getStoredProducts()
  const result = await safeApiCall(() => productService.getAll(params), fallback)
  // API повертає { items, total, page, pageSize }, але нам потрібен масив
  return result?.data?.items || result?.items || (Array.isArray(result) ? result : fallback)
}

export const fetchProductById = async (id: string) => {
  const fallback = adminData.getStoredProducts().find((p: any) => p.id === id) || null
  const result = await safeApiCall(() => productService.getById(id), fallback)
  return result
}

export const createProduct = async (data: any) => {
  try {
    const res = await productService.create(data)
    return res.data.data
  } catch {
    const products = adminData.getStoredProducts()
    const next = [{ ...data, id: 'prod-' + Date.now(), created_at: new Date().toISOString() }, ...products]
    adminData.saveStoredProducts(next)
    return next[0]
  }
}

export const updateProduct = async (id: string, data: any) => {
  try {
    const res = await productService.update(id, data)
    return res.data.data
  } catch {
    const products = adminData.getStoredProducts()
    const idx = products.findIndex((p: any) => p.id === id)
    if (idx !== -1) {
      products[idx] = { ...products[idx], ...data, updated_at: new Date().toISOString() }
      adminData.saveStoredProducts(products)
      return products[idx]
    }
    return null
  }
}

export const deleteProduct = async (id: string) => {
  try {
    await productService.delete(id)
    return true
  } catch {
    const products = adminData.getStoredProducts().filter((p: any) => p.id !== id)
    adminData.saveStoredProducts(products)
    return true
  }
}

export const getUser = async (id: string) => {
  const fallback = adminData.findStoredUserById(id) || null
  const result = await safeApiCall(() => userService.getById(id), fallback)
  return result
}

export const updateUser = async (id: string, data: any) => {
  try {
    const res = await userService.update(id, data)
    return res.data.data
  } catch {
    const users = adminData.getStoredUsers()
    const idx = users.findIndex((u: any) => u.id === id)
    if (idx !== -1) {
      users[idx] = { ...users[idx], ...data }
      adminData.saveStoredUsers(users)
      return users[idx]
    }
    return null
  }
}

export const getReviewsByProduct = async (productId: string) => {
  const fallback = adminData.getStoredReviews().filter((r: any) => r.product_id === productId)
  const result = await safeApiCall(() => reviewService.getByProduct(productId), fallback)
  return result
}

export const createReview = async (productId: string, rating: number, text: string) => {
  try {
    const res = await reviewService.create(productId, rating, text)
    return res.data.data
  } catch {
    const reviews = adminData.getStoredReviews()
    const product = adminData.getStoredProducts().find((item: any) => item.id === productId)
    const newRev = {
      id: 'rev-' + Date.now(),
      product_id: productId,
      seller_id: product?.seller_id,
      seller_name: product?.seller_name,
      rating,
      text,
      comment: text,
      created_at: new Date().toISOString(),
    }
    reviews.unshift(newRev)
    adminData.saveStoredReviews(reviews)
    return newRev
  }
}

// Chat helpers — use adminData as fallback
export const getChats = async () => {
  try {
    const res = await chatService.getThreads()
    return res.data.data ?? res.data ?? adminData.getStoredChats()
  } catch {
    return adminData.getStoredChats()
  }
}

export const createOrGetChatForSeller = async (sellerId: string) => {
  try {
    const res = await chatService.createThread(sellerId)
    return res.data.data ?? res.data
  } catch {
    const chats = adminData.getStoredChats()
    let chat = chats.find((c) => c.seller_id === sellerId)
    if (!chat) {
      chat = {
        id: 'chat-' + Date.now(),
        seller_id: sellerId,
        seller_name: sellerId,
        created_at: new Date().toISOString(),
        messages: [],
      }
      chats.unshift(chat)
      adminData.saveStoredChats(chats)
    }
    return chat
  }
}

export const sendMessageToSeller = async (sellerId: string, message: any) => {
  try {
    const threadsResponse = await chatService.getThreads()
    const threads = threadsResponse.data.data ?? threadsResponse.data ?? []
    let thread = ((Array.isArray(threads) ? threads : threads?.data) || []).find((item: any) => item.seller_id === sellerId)

    if (!thread) {
      const created = await chatService.createThread(sellerId)
      thread = created.data.data ?? created.data
    }

    if (!thread?.id) {
      throw new Error('Chat thread not found')
    }

    const payload = {
      text: message?.text || '',
      sender_id: message?.sender_id,
      sender_name: message?.sender_name,
      sender_role: message?.sender_role,
      isSystemMessage: message?.isSystemMessage,
    }

    const response = await chatService.sendMessage(thread.id, payload)
    const createdMessage = response.data.data ?? response.data
    if (!createdMessage) {
      return getChats()
    }

    return getChats()
  } catch {
    const chats = adminData.getStoredChats()
    const idx = chats.findIndex((c) => c.seller_id === sellerId)
    const now = new Date().toISOString()
    const newMsg = { id: 'msg-' + Date.now(), timestamp: now, ...message }
    if (idx === -1) {
      chats.unshift({ id: 'chat-' + Date.now(), seller_id: sellerId, seller_name: sellerId, created_at: now, messages: [newMsg] })
    } else {
      chats[idx].messages = [...(chats[idx].messages || []), newMsg]
    }
    adminData.saveStoredChats(chats)
    return chats
  }
}

export const getAllReviews = async () => {
  try {
    const res = await reviewService.getAll()
    return res.data.data ?? res.data ?? adminData.getStoredReviews()
  } catch {
    return adminData.getStoredReviews()
  }
}

export const getReviewsBySeller = async (sellerId: string) => {
  try {
    const res = await reviewService.getBySeller(sellerId)
    return res.data.data ?? res.data ?? []
  } catch {
    const all = await getAllReviews()
    return ((Array.isArray(all) ? all : all?.data) || []).filter((r: any) => r.seller_id === sellerId)
  }
}

// Orders helpers (fallback to adminData storage)
export const getOrders = async () => {
  try {
    // Try to get orders from backend
    const response = await ordersService.getAll()
    if (response.data.success && Array.isArray(response.data.data)) {
      return response.data.data
    }
  } catch (_err) {
  }
  // Fallback to localStorage
  return adminData.getStoredOrders()
}

export const saveOrders = async (orders: any[]) => {
  try {
    adminData.saveStoredOrders(orders)
    return orders
  } catch {
    adminData.saveStoredOrders(orders)
    return orders
  }
}

export const updateOrderStatus = async (orderId: string, status: string) => {
  const orders = adminData.getStoredOrders()
  const idx = orders.findIndex((o: any) => o.id === orderId)
  if (idx === -1) return null
  orders[idx].status = status
  if (status === 'completed') orders[idx].completed_at = new Date().toISOString()
  adminData.saveStoredOrders(orders)
  return orders[idx]
}

// Create order via backend API (backend-first, fallback to localStorage)
export const createOrder = async (productId: string, quantity: number = 1) => {
  try {
    const res = await cartService.addItem(productId, quantity)
    const checkout = await cartService.checkout()
    // Return checkout response which includes updated user balance and orders
    return checkout.data.data
  } catch (_err) {
    // Fallback: create order locally
    const product = adminData.getStoredProducts().find((p: any) => p.id === productId)
    if (!product) throw new Error('Product not found')
    const order = {
      id: 'order-' + Date.now(),
      product_id: productId,
      product_name: product.title,
      seller_id: product.seller_id,
      seller_name: product.seller_name,
      price: product.price,
      quantity: quantity,
      status: 'pending',
      created_at: new Date().toISOString(),
    }
    const orders = adminData.getStoredOrders()
    orders.push(order)
    adminData.saveStoredOrders(orders)
    return { orders: [order], message: 'Fallback to localStorage' }
  }
}

export default {
  fetchProducts,
  fetchProductById,
  createProduct,
  updateProduct,
  deleteProduct,
  getUser,
  updateUser,
  getReviewsByProduct,
  createReview,
  getChats,
  createOrGetChatForSeller,
  sendMessageToSeller,
  getAllReviews,
  getReviewsBySeller,
  getOrders,
  saveOrders,
  updateOrderStatus,
  createOrder,
}
