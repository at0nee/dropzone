import { User, UserRole } from '../types'

const USERS_KEY = 'mock-users'
const AUTH_USER_KEY = 'auth_user'
const ORDERS_KEY = 'mock-orders'
const CHATS_KEY = 'mock-chats'
const PRODUCTS_KEY = 'mock-products'
const REVIEWS_KEY = 'mock-reviews'
const CATALOG_KEY = 'mock-catalog-categories'
const ADMIN_LOGS_KEY = 'admin-debug-logs'

const safeParse = <T>(raw: string | null, fallback: T): T => {
  if (!raw) return fallback
  try {
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

const normalizeUsers = (value: unknown): User[] => {
  if (Array.isArray(value)) {
    return value as User[]
  }

  if (value && typeof value === 'object') {
    return Object.values(value as Record<string, User>)
  }

  return []
}

const normalizeUserRecord = (user: Partial<User> & { id: string }): User => ({
  id: user.id,
  username: user.username || 'Unknown User',
  email: user.email || 'unknown@example.com',
  avatar: user.avatar,
  role: user.role || 'user',
  balance: Number(user.balance ?? 0),
  rating: Number(user.rating ?? 0),
  reviews_count: Number(user.reviews_count ?? 0),
  created_at: user.created_at || new Date().toISOString(),
})

export const getStoredUsers = (): User[] => {
  const raw = localStorage.getItem(USERS_KEY)
  const normalized = normalizeUsers(safeParse<unknown>(raw, []))
  return normalized.map((user) => normalizeUserRecord(user))
}

export const saveStoredUsers = (users: User[]) => {
  localStorage.setItem(USERS_KEY, JSON.stringify(users))
}

export const findStoredUserById = (userId: string) => {
  return getStoredUsers().find((user) => user.id === userId)
}

export const upsertStoredUser = (user: User) => {
  const users = getStoredUsers()
  const index = users.findIndex((storedUser) => storedUser.id === user.id)

  if (index === -1) {
    users.push(user)
  } else {
    users[index] = { ...users[index], ...user }
  }

  saveStoredUsers(users)
  return users
}

export const updateStoredUserRole = (userId: string, role: UserRole) => {
  const users = getStoredUsers()
  const index = users.findIndex((user) => user.id === userId)

  if (index === -1) {
    return users
  }

  users[index] = { ...users[index], role }
  saveStoredUsers(users)
  return users
}

export const refreshStoredUser = (nextUser: User) => {
  const users = getStoredUsers()
  const index = users.findIndex((user) => user.id === nextUser.id)

  if (index === -1) {
    users.push(normalizeUserRecord(nextUser))
  } else {
    users[index] = normalizeUserRecord({ ...users[index], ...nextUser })
  }

  saveStoredUsers(users)
  return users
}

export const getStoredAuthUser = () => {
  return safeParse<User | null>(localStorage.getItem(AUTH_USER_KEY), null)
}

export const setStoredAuthUser = (user: User | null) => {
  if (!user) {
    localStorage.removeItem(AUTH_USER_KEY)
    return
  }

  localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user))
}

export const getStoredOrders = () => {
  return safeParse<any[]>(localStorage.getItem(ORDERS_KEY), [])
}

export const saveStoredOrders = (orders: any[]) => {
  localStorage.setItem(ORDERS_KEY, JSON.stringify(orders))
}

export const getStoredChats = () => {
  const raw = safeParse<any[]>(localStorage.getItem(CHATS_KEY), [])

  // Normalize stored chats: remove any role prefixes that were previously
  // embedded into sender_name (e.g. "Адмін Ivan", "Сапорт Olga"). We
  // keep `sender_role` intact so admin UI can still show role badges.
  try {
    const normalized = (raw || []).map((chat) => ({
      ...chat,
      messages: (chat.messages || []).map((m: any) => ({
        ...m,
        sender_name: typeof m.sender_name === 'string'
          ? String(m.sender_name).replace(/^(Админ|Адмін|Сапорт|Support|Admin)\s+/i, '')
          : m.sender_name,
      })),
    }))
    // Persist cleaned version to avoid repeated fixes
    if (JSON.stringify(normalized) !== JSON.stringify(raw)) {
      localStorage.setItem(CHATS_KEY, JSON.stringify(normalized))
    }
    return normalized
  } catch {
    return raw
  }
}

export const saveStoredChats = (chats: any[]) => {
  localStorage.setItem(CHATS_KEY, JSON.stringify(chats))
}

// Clear all user-specific data from localStorage when switching users
export const clearUserData = () => {
  localStorage.removeItem(CHATS_KEY)
  localStorage.removeItem(ORDERS_KEY)
}

export const getStoredProducts = () => {
  return safeParse<any[]>(localStorage.getItem(PRODUCTS_KEY), [])
}

export const saveStoredProducts = (products: any[]) => {
  localStorage.setItem(PRODUCTS_KEY, JSON.stringify(products))
}

export const getStoredReviews = () => {
  return safeParse<any[]>(localStorage.getItem(REVIEWS_KEY), [])
}

export const saveStoredReviews = (reviews: any[]) => {
  localStorage.setItem(REVIEWS_KEY, JSON.stringify(reviews))
}

export const getStoredCatalogCategories = () => {
  return safeParse<any[]>(localStorage.getItem(CATALOG_KEY), [])
}

export const saveStoredCatalogCategories = (categories: any[]) => {
  localStorage.setItem(CATALOG_KEY, JSON.stringify(categories))
}

export const getAdminLogs = () => {
  return safeParse<any[]>(localStorage.getItem(ADMIN_LOGS_KEY), [])
}

export const appendAdminLog = (entry: { level: 'info' | 'error' | 'warn'; message: string; meta?: any }) => {
  const logs = getAdminLogs()
  const now = new Date().toISOString()
  const next = [{ id: 'log-' + Date.now(), timestamp: now, ...entry }, ...logs].slice(0, 25)
  localStorage.setItem(ADMIN_LOGS_KEY, JSON.stringify(next))
  return next
}

export const clearAdminLogs = () => {
  localStorage.removeItem(ADMIN_LOGS_KEY)
  return []
}

export const appendChatMessageToSellerThread = (
  sellerId: string,
  message: {
    sender_id: string
    sender_name: string
    text: string
    sender_role?: UserRole | 'system'
    isSystemMessage?: boolean
  }
) => {
  const chats = getStoredChats()
  const now = new Date().toISOString()
  const chatIndex = chats.findIndex((chat) => chat.seller_id === sellerId)

  const newMessage = {
    id: 'msg-' + Date.now(),
    timestamp: now,
    ...message,
  }

  if (chatIndex === -1) {
    chats.unshift({
      id: 'chat-' + Date.now(),
      seller_id: sellerId,
      seller_name: sellerId,
      created_at: now,
      messages: [ { ...newMessage, system_type: newMessage.isSystemMessage ? 'info' : undefined } ],
    })
  } else {
    chats[chatIndex].messages = [...(chats[chatIndex].messages || []), { ...newMessage, system_type: newMessage.isSystemMessage ? 'info' : undefined }]
  }

  saveStoredChats(chats)
  return chats
}

export const getUserRole = (role?: UserRole | null): UserRole => {
  return role ?? 'user'
}

export const canAccessAdminPanel = (role?: UserRole | null) => {
  const effectiveRole = getUserRole(role)
  return effectiveRole === 'admin' || effectiveRole === 'support'
}

export const resolveDispute = (
  orderId: string,
  resolution: 'refund' | 'seller',
  resolverName: string
) => {
  const orders = getStoredOrders()
  const orderIndex = orders.findIndex((order) => order.id === orderId)

  if (orderIndex === -1) {
    return null
  }

  const currentOrder = orders[orderIndex]
  if (currentOrder.dispute_resolution) {
    return null
  }

  const users = getStoredUsers()
  const chats = getStoredChats()
  const now = new Date().toISOString()
  const amount = Number(currentOrder.price || 0)
  const buyer = users.find((user) => user.id === currentOrder.buyer_id)
  const seller = users.find((user) => user.id === currentOrder.seller_id)

  let systemText = ''

  if (resolution === 'refund') {
    if (buyer) {
      buyer.balance = (buyer.balance || 0) + amount
    }
    systemText = `⚖️ Спір вирішено: кошти в сумі ${amount.toFixed(2)} ₴ повернено покупцю ${currentOrder.buyer_id}.`
    currentOrder.status = 'refunded'
  } else {
    if (seller) {
      seller.balance = (seller.balance || 0) + amount
    }
    systemText = `⚖️ Спір вирішено: кошти в сумі ${amount.toFixed(2)} ₴ передано продавцю ${currentOrder.seller_id}.`
    currentOrder.status = 'completed'
    currentOrder.completed_at = currentOrder.completed_at || now
  }

  currentOrder.dispute_resolution = resolution
  currentOrder.dispute_resolved_by = resolverName
  currentOrder.dispute_resolved_at = now

  orders[orderIndex] = currentOrder

  const chatIndex = chats.findIndex((chat) => chat.seller_id === currentOrder.seller_id)
    if (chatIndex !== -1) {
    chats[chatIndex].messages = [...(chats[chatIndex].messages || []), {
      id: 'msg-' + Date.now(),
      sender_id: 'system',
      sender_name: '⚖️ САПОРТ',
      text: systemText,
      timestamp: now,
      isSystemMessage: true,
      system_type: 'alert',
    }]
  }

  saveStoredUsers(users)
  saveStoredOrders(orders)
  saveStoredChats(chats)

  return {
    users,
    orders,
    chats,
    order: currentOrder,
  }
}
