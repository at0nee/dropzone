import mysql from 'mysql2/promise'
import { createHash, randomUUID } from 'node:crypto'

export type Role = 'user' | 'admin' | 'support'
export type OrderStatus = 'pending' | 'completed' | 'disputed' | 'refunded'

export interface User {
  id: string
  email: string
  username: string
  name?: string
  role: Role
  balance: number
  rating: number
  reviews_count: number
  created_at: string
  updated_at: string
  passwordHash: string
}

export interface Product {
  id: string
  title: string
  description: string
  price: number
  stock: number
  category: string
  subcategory?: string
  image_url?: string
  images: string[]
  seller_id: string
  seller_name: string
  created_at: string
  updated_at: string
}

export interface CatalogCategory {
  id: string
  name: string
  emoji?: string
  parent_id: string | null
  sort_order: number
  created_at: string
  updated_at: string
}

export interface Review {
  id: string
  product_id: string | null
  seller_id: string
  seller_name?: string
  buyer_id: string
  buyer_name: string
  rating: number
  text: string
  order_id?: string
  product_title?: string
  created_at: string
}

export interface Order {
  id: string
  product_id: string | null
  product_name: string
  seller_id: string
  seller_name: string
  buyer_id: string
  buyer_name: string
  price: number
  quantity: number
  status: OrderStatus
  created_at: string
  completed_at?: string
  dispute_resolution?: 'refund' | 'seller'
  dispute_resolved_by?: string
  dispute_resolved_at?: string
}

export interface ChatMessage {
  id: string
  sender_id: string
  sender_name: string
  sender_role?: Role | 'system'
  text: string
  timestamp: string
  isSystemMessage?: boolean
}

export interface ChatThread {
  id: string
  seller_id: string
  seller_name: string
  buyer_id: string
  buyer_name: string
  product_id?: string
  product_name?: string
  created_at: string
  updated_at: string
  messages: ChatMessage[]
}

export interface CartItem {
  product_id: string
  quantity: number
}

export interface Database {
  users: User[]
  products: Product[]
  reviews: Review[]
  orders: Order[]
  chats: ChatThread[]
  carts: Record<string, CartItem[]>
  catalog_categories: CatalogCategory[]
}

const STATE_DB = process.env.MYSQL_DATABASE || 'dropzone'
const pool = mysql.createPool({
  host: process.env.MYSQL_HOST || '127.0.0.1',
  port: Number(process.env.MYSQL_PORT || 3306),
  user: process.env.MYSQL_USER || 'root',
  password: process.env.MYSQL_PASSWORD || 'root',
  database: STATE_DB,
  timezone: 'Z',
  dateStrings: true,
  waitForConnections: true,
  connectionLimit: 10,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,
  multipleStatements: true,
})

const USERS_TABLE = 'users'
const PRODUCTS_TABLE = 'products'
const REVIEWS_TABLE = 'reviews'
const ORDERS_TABLE = 'orders'
const CHATS_TABLE = 'chats'
const CHAT_MESSAGES_TABLE = 'chat_messages'
const CARTS_TABLE = 'carts'
const SESSIONS_TABLE = 'sessions'
const CATALOG_CATEGORIES_TABLE = 'catalog_categories'

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex')

const parseDateInput = (value: string | Date) => {
  if (value instanceof Date) return value

  const raw = String(value || '').trim()
  if (!raw) return new Date(NaN)

  // MySQL DATETIME has no timezone. Treat it as UTC to prevent repeated -timezone drift.
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(raw)) {
    return new Date(raw.replace(' ', 'T') + 'Z')
  }

  // ISO-like string without timezone suffix -> treat as UTC as well.
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?$/.test(raw)) {
    return new Date(raw + 'Z')
  }

  return new Date(raw)
}

const toMysqlDateTime = (value: string | Date) => {
  const date = parseDateInput(value)
  if (Number.isNaN(date.getTime())) return new Date().toISOString().slice(0, 19).replace('T', ' ')
  return date.toISOString().slice(0, 19).replace('T', ' ')
}

const now = () => toMysqlDateTime(new Date())
const makeId = (prefix: string) => `${prefix}-${randomUUID()}`

const seedDb = (): Database => {
  const createdAt = now()

  const admin: User = {
    id: 'user-admin',
    email: 'admin@dropzone.local',
    username: 'Admin',
    name: 'Admin',
    role: 'admin',
    balance: 0,
    rating: 5,
    reviews_count: 0,
    created_at: createdAt,
    updated_at: createdAt,
    passwordHash: sha256('admin123'),
  }

  const support: User = {
    id: 'user-support',
    email: 'support@dropzone.local',
    username: 'Support',
    name: 'Support',
    role: 'support',
    balance: 0,
    rating: 5,
    reviews_count: 0,
    created_at: createdAt,
    updated_at: createdAt,
    passwordHash: sha256('support123'),
  }

  const seller: User = {
    id: 'user-seller',
    email: 'seller@dropzone.local',
    username: 'ProSeller',
    name: 'ProSeller',
    role: 'user',
    balance: 1200,
    rating: 4.7,
    reviews_count: 3,
    created_at: createdAt,
    updated_at: createdAt,
    passwordHash: sha256('seller123'),
  }

  const buyer: User = {
    id: 'user-buyer',
    email: 'user@dropzone.local',
    username: 'TestUser',
    name: 'TestUser',
    role: 'user',
    balance: 9999,
    rating: 0,
    reviews_count: 0,
    created_at: createdAt,
    updated_at: createdAt,
    passwordHash: sha256('user123'),
  }

  const products: Product[] = [
    {
      id: 'prod-cs2-premium',
      title: 'CS2 Account - Premium',
      description: 'Premium CS2 account with inventory and active service.',
      price: 299,
      stock: 12,
      category: 'games',
      subcategory: 'Accounts',
      image_url: 'https://via.placeholder.com/600x400?text=CS2+Premium',
      images: ['https://via.placeholder.com/600x400?text=CS2+Premium'],
      seller_id: seller.id,
      seller_name: seller.username,
      created_at: createdAt,
      updated_at: createdAt,
    },
    {
      id: 'prod-telegram-1m',
      title: 'Telegram Premium 1 Month',
      description: 'Telegram Premium subscription for 1 month.',
      price: 59,
      stock: 25,
      category: 'subscriptions',
      subcategory: 'Premium',
      image_url: 'https://via.placeholder.com/600x400?text=Telegram+Premium',
      images: ['https://via.placeholder.com/600x400?text=Telegram+Premium'],
      seller_id: seller.id,
      seller_name: seller.username,
      created_at: createdAt,
      updated_at: createdAt,
    },
    {
      id: 'prod-windows-key',
      title: 'Windows Key',
      description: 'Retail Windows activation key.',
      price: 99,
      stock: 50,
      category: 'keys',
      subcategory: 'Keys',
      image_url: 'https://via.placeholder.com/600x400?text=Windows+Key',
      images: ['https://via.placeholder.com/600x400?text=Windows+Key'],
      seller_id: seller.id,
      seller_name: seller.username,
      created_at: createdAt,
      updated_at: createdAt,
    },
  ]

  const catalogCategories: CatalogCategory[] = [
    { id: 'games', name: 'Ігри', emoji: 'gamepad-2', parent_id: null, sort_order: 1, created_at: createdAt, updated_at: createdAt },
    { id: 'subscriptions', name: 'Підписки', emoji: 'smartphone', parent_id: null, sort_order: 2, created_at: createdAt, updated_at: createdAt },
    { id: 'keys', name: 'Ключі і Коди', emoji: 'key-round', parent_id: null, sort_order: 3, created_at: createdAt, updated_at: createdAt },
    { id: 'cs2', name: 'CS2', emoji: 'crosshair', parent_id: 'games', sort_order: 1, created_at: createdAt, updated_at: createdAt },
    { id: 'dota2', name: 'Dota 2', emoji: 'shield', parent_id: 'games', sort_order: 2, created_at: createdAt, updated_at: createdAt },
    { id: 'valorant', name: 'Valorant', emoji: 'zap', parent_id: 'games', sort_order: 3, created_at: createdAt, updated_at: createdAt },
    { id: 'pubg', name: 'PUBG', emoji: 'crosshair', parent_id: 'games', sort_order: 4, created_at: createdAt, updated_at: createdAt },
    { id: 'fortnite', name: 'Fortnite', emoji: 'puzzle', parent_id: 'games', sort_order: 5, created_at: createdAt, updated_at: createdAt },
    { id: 'telegram', name: 'Telegram', emoji: 'message-circle', parent_id: 'subscriptions', sort_order: 1, created_at: createdAt, updated_at: createdAt },
    { id: 'spotify', name: 'Spotify', emoji: 'music4', parent_id: 'subscriptions', sort_order: 2, created_at: createdAt, updated_at: createdAt },
    { id: 'discord', name: 'Discord', emoji: 'message-circle', parent_id: 'subscriptions', sort_order: 3, created_at: createdAt, updated_at: createdAt },
    { id: 'youtube', name: 'YouTube', emoji: 'play', parent_id: 'subscriptions', sort_order: 4, created_at: createdAt, updated_at: createdAt },
    { id: 'windows', name: 'Windows', emoji: 'monitor', parent_id: 'keys', sort_order: 1, created_at: createdAt, updated_at: createdAt },
    { id: 'office', name: 'Office', emoji: 'file-text', parent_id: 'keys', sort_order: 2, created_at: createdAt, updated_at: createdAt },
  ]

  const reviews: Review[] = [
    {
      id: 'rev-cs2-1',
      product_id: 'prod-cs2-premium',
      seller_id: seller.id,
      buyer_id: buyer.id,
      buyer_name: buyer.username,
      rating: 5,
      text: 'Все швидко і без проблем, аккаунт відповідає опису.',
      product_title: 'CS2 Account - Premium',
      created_at: createdAt,
    },
    {
      id: 'rev-telegram-1',
      product_id: 'prod-telegram-1m',
      seller_id: seller.id,
      buyer_id: buyer.id,
      buyer_name: buyer.username,
      rating: 4,
      text: 'Сервіс активувався миттєво, все ок.',
      product_title: 'Telegram Premium 1 Month',
      created_at: createdAt,
    },
    {
      id: 'rev-windows-1',
      product_id: 'prod-windows-key',
      seller_id: seller.id,
      buyer_id: buyer.id,
      buyer_name: buyer.username,
      rating: 5,
      text: 'Ключ прийшов одразу, активація успішна.',
      product_title: 'Windows Key',
      created_at: createdAt,
    },
  ]

  return {
    users: [admin, support, seller, buyer],
    products,
    reviews,
    orders: [],
    chats: [],
    carts: {},
    catalog_categories: catalogCategories,
  }
}

export const hashPassword = sha256
export const generateId = makeId

// Ensure DB schema exists. Automatically create missing tables and indexes.
const ensureSchema = async () => {
  // Create core tables if missing. Use IF NOT EXISTS to be idempotent.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${USERS_TABLE} (
      id VARCHAR(64) PRIMARY KEY,
      email VARCHAR(255) NOT NULL,
      username VARCHAR(255) NOT NULL,
      name VARCHAR(255),
      role VARCHAR(32) NOT NULL DEFAULT 'user',
      balance DOUBLE NOT NULL DEFAULT 0,
      rating DOUBLE NOT NULL DEFAULT 0,
      reviews_count INT NOT NULL DEFAULT 0,
      created_at DATETIME NOT NULL,
      updated_at DATETIME NOT NULL,
      password_hash VARCHAR(255)
    )
  `)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${PRODUCTS_TABLE} (
      id VARCHAR(64) PRIMARY KEY,
      title VARCHAR(255) NOT NULL,
      description TEXT,
      price DOUBLE NOT NULL DEFAULT 0,
      stock INT NOT NULL DEFAULT 0,
      category VARCHAR(128),
      subcategory VARCHAR(128),
      image_url VARCHAR(1024),
      images TEXT,
      seller_id VARCHAR(64),
      seller_name VARCHAR(255),
      created_at DATETIME NOT NULL,
      updated_at DATETIME NOT NULL
    )
  `)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${REVIEWS_TABLE} (
      id VARCHAR(64) PRIMARY KEY,
      product_id VARCHAR(64) NULL,
      seller_id VARCHAR(64) NOT NULL,
      buyer_id VARCHAR(64) NOT NULL,
      buyer_name VARCHAR(255),
      rating INT NOT NULL DEFAULT 0,
      text TEXT,
      order_id VARCHAR(64),
      product_title VARCHAR(255),
      created_at DATETIME NOT NULL
    )
  `)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${ORDERS_TABLE} (
      id VARCHAR(64) PRIMARY KEY,
      product_id VARCHAR(64) NULL,
      product_name VARCHAR(255),
      seller_id VARCHAR(64) NOT NULL,
      seller_name VARCHAR(255),
      buyer_id VARCHAR(64) NOT NULL,
      buyer_name VARCHAR(255),
      price DOUBLE NOT NULL DEFAULT 0,
      quantity INT NOT NULL DEFAULT 1,
      status VARCHAR(32) NOT NULL DEFAULT 'pending',
      created_at DATETIME NOT NULL,
      completed_at DATETIME NULL,
      dispute_resolution VARCHAR(32) NULL,
      dispute_resolved_by VARCHAR(64) NULL,
      dispute_resolved_at DATETIME NULL
    )
  `)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${CHATS_TABLE} (
      id VARCHAR(64) PRIMARY KEY,
      seller_id VARCHAR(64),
      seller_name VARCHAR(255),
      buyer_id VARCHAR(64),
      buyer_name VARCHAR(255),
      product_id VARCHAR(64),
      product_name VARCHAR(255),
      created_at DATETIME NOT NULL,
      updated_at DATETIME NOT NULL
    )
  `)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${CHAT_MESSAGES_TABLE} (
      id VARCHAR(64) PRIMARY KEY,
      chat_id VARCHAR(64) NOT NULL,
      sender_id VARCHAR(64) NOT NULL,
      sender_name VARCHAR(255),
      sender_role VARCHAR(32),
      text TEXT,
      timestamp DATETIME NOT NULL,
      is_system_message TINYINT(1) NOT NULL DEFAULT 0
    )
  `)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${CARTS_TABLE} (
      user_id VARCHAR(64) NOT NULL,
      product_id VARCHAR(64) NOT NULL,
      quantity INT NOT NULL DEFAULT 1,
      PRIMARY KEY (user_id, product_id)
    )
  `)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${SESSIONS_TABLE} (
      token VARCHAR(128) PRIMARY KEY,
      user_id VARCHAR(64) NOT NULL,
      created_at DATETIME NOT NULL,
      updated_at DATETIME NOT NULL
    )
  `)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${CATALOG_CATEGORIES_TABLE} (
      id VARCHAR(64) PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      emoji VARCHAR(32) NULL,
      parent_id VARCHAR(64) NULL,
      sort_order INT NOT NULL DEFAULT 0,
      created_at DATETIME NOT NULL,
      updated_at DATETIME NOT NULL
    )
  `)

  try {
    await pool.query(`ALTER TABLE ${CATALOG_CATEGORIES_TABLE} ADD COLUMN emoji VARCHAR(32) NULL AFTER name`)
  } catch {}

  // Create common indexes to improve query performance on large datasets
  // MySQL doesn't support CREATE INDEX IF NOT EXISTS until 8.0.13; wrapping in try to be safe.
  try {
    await pool.query(`CREATE INDEX idx_products_seller ON ${PRODUCTS_TABLE} (seller_id)`)
  } catch {}
  try {
    await pool.query(`CREATE INDEX idx_products_created ON ${PRODUCTS_TABLE} (created_at)`)
  } catch {}
  try {
    await pool.query(`CREATE INDEX idx_products_category ON ${PRODUCTS_TABLE} (category)`)
  } catch {}
  try {
    await pool.query(`CREATE INDEX idx_products_subcategory ON ${PRODUCTS_TABLE} (subcategory)`)
  } catch {}
  try {
    await pool.query(`CREATE INDEX idx_reviews_seller ON ${REVIEWS_TABLE} (seller_id)`)
  } catch {}
  try {
    await pool.query(`CREATE INDEX idx_reviews_product ON ${REVIEWS_TABLE} (product_id)`)
  } catch {}
  try {
    await pool.query(`CREATE INDEX idx_orders_product ON ${ORDERS_TABLE} (product_id)`)
  } catch {}
  try {
    await pool.query(`CREATE INDEX idx_orders_seller ON ${ORDERS_TABLE} (seller_id)`)
  } catch {}
}

const mapDate = (value: any) => {
  if (!value) return new Date().toISOString()
  if (value instanceof Date) {
    // Defensive normalization for DATETIME values that may arrive as local Date objects.
    // Rebuild as UTC using wall-clock fields to prevent repeated timezone drift.
    return new Date(Date.UTC(
      value.getFullYear(),
      value.getMonth(),
      value.getDate(),
      value.getHours(),
      value.getMinutes(),
      value.getSeconds(),
      value.getMilliseconds(),
    )).toISOString()
  }
  const parsed = parseDateInput(String(value))
  if (Number.isNaN(parsed.getTime())) return new Date().toISOString()
  return parsed.toISOString()
}

const toJsonArray = (value: any): string[] => {
  if (!value) return []
  if (Array.isArray(value)) return value.filter(Boolean).map(String)
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      return Array.isArray(parsed) ? parsed.filter(Boolean).map(String) : []
    } catch {
      return []
    }
  }
  return []
}

const loadUsers = async (): Promise<User[]> => {
  const [rows] = await pool.query<any[]>(`SELECT * FROM ${USERS_TABLE} ORDER BY created_at ASC`)
  return rows.map((row) => ({
    id: row.id,
    email: row.email,
    username: row.username,
    name: row.name || row.username,
    // avatar removed: use site default image on frontend instead
    role: row.role,
    balance: Number(row.balance || 0),
    rating: Number(row.rating || 0),
    reviews_count: Number(row.reviews_count || 0),
    created_at: mapDate(row.created_at),
    updated_at: mapDate(row.updated_at),
    passwordHash: row.password_hash,
  }))
}

const loadProducts = async (): Promise<Product[]> => {
  const [rows] = await pool.query<any[]>(`SELECT * FROM ${PRODUCTS_TABLE} ORDER BY created_at DESC`)
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    description: row.description,
    price: Number(row.price || 0),
    stock: Number(row.stock || 0),
    category: row.category,
    subcategory: row.subcategory || undefined,
    image_url: row.image_url || undefined,
    images: toJsonArray(row.images),
    seller_id: row.seller_id,
    seller_name: row.seller_name,
    created_at: mapDate(row.created_at),
    updated_at: mapDate(row.updated_at),
  }))
}

const loadOrders = async (): Promise<Order[]> => {
  const [rows] = await pool.query<any[]>(`SELECT * FROM ${ORDERS_TABLE} ORDER BY created_at DESC`)
  return rows.map((row) => ({
    id: row.id,
    product_id: row.product_id,
    product_name: row.product_name,
    seller_id: row.seller_id,
    seller_name: row.seller_name,
    buyer_id: row.buyer_id,
    buyer_name: row.buyer_name,
    price: Number(row.price || 0),
    quantity: Number(row.quantity || 1),
    status: row.status,
    created_at: mapDate(row.created_at),
    completed_at: row.completed_at ? mapDate(row.completed_at) : undefined,
    dispute_resolution: row.dispute_resolution || undefined,
    dispute_resolved_by: row.dispute_resolved_by || undefined,
    dispute_resolved_at: row.dispute_resolved_at ? mapDate(row.dispute_resolved_at) : undefined,
  }))
}

const loadReviews = async (): Promise<Review[]> => {
  const [rows] = await pool.query<any[]>(`SELECT * FROM ${REVIEWS_TABLE} ORDER BY created_at DESC`)
  return rows.map((row) => ({
    id: row.id,
    product_id: row.product_id,
    seller_id: row.seller_id,
    buyer_id: row.buyer_id,
    buyer_name: row.buyer_name,
    rating: Number(row.rating || 0),
    text: row.text || '',
    order_id: row.order_id || undefined,
    product_title: row.product_title || undefined,
    created_at: mapDate(row.created_at),
  }))
}

const loadChats = async (): Promise<ChatThread[]> => {
  const [chatRows] = await pool.query<any[]>(`SELECT * FROM ${CHATS_TABLE} ORDER BY updated_at DESC`)
  const [messageRows] = await pool.query<any[]>(`SELECT * FROM ${CHAT_MESSAGES_TABLE} ORDER BY timestamp ASC`)
  const messagesByChatId = new Map<string, ChatMessage[]>()

  messageRows.forEach((row) => {
    const list = messagesByChatId.get(row.chat_id) || []
    list.push({
      id: row.id,
      sender_id: row.sender_id,
      sender_name: row.sender_name,
      sender_role: row.sender_role,
      text: row.text,
      timestamp: mapDate(row.timestamp),
      isSystemMessage: Boolean(row.is_system_message),
    })
    messagesByChatId.set(row.chat_id, list)
  })

  return chatRows.map((row) => ({
    id: row.id,
    seller_id: row.seller_id,
    seller_name: row.seller_name,
    buyer_id: row.buyer_id,
    buyer_name: row.buyer_name,
    product_id: row.product_id || undefined,
    product_name: row.product_name || undefined,
    created_at: mapDate(row.created_at),
    updated_at: mapDate(row.updated_at),
    messages: messagesByChatId.get(row.id) || [],
  }))
}

const loadCarts = async (): Promise<Record<string, CartItem[]>> => {
  const [rows] = await pool.query<any[]>(`SELECT * FROM ${CARTS_TABLE}`)
  const carts: Record<string, CartItem[]> = {}
  rows.forEach((row) => {
    if (!carts[row.user_id]) carts[row.user_id] = []
    carts[row.user_id].push({ product_id: row.product_id, quantity: Number(row.quantity || 1) })
  })
  return carts
}

const loadCatalogCategories = async (): Promise<CatalogCategory[]> => {
  const [rows] = await pool.query<any[]>(`SELECT * FROM ${CATALOG_CATEGORIES_TABLE} ORDER BY sort_order ASC, created_at ASC`)
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    emoji: row.emoji || undefined,
    parent_id: row.parent_id || null,
    sort_order: Number(row.sort_order || 0),
    created_at: mapDate(row.created_at),
    updated_at: mapDate(row.updated_at),
  }))
}

const loadSeedIfEmpty = async () => {
  const [rows] = await pool.query<any[]>(`SELECT COUNT(*) AS count FROM ${USERS_TABLE}`)
  const count = Number(rows[0]?.count || 0)
  if (count > 0) return

  const seed = seedDb()
  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()
    for (const user of seed.users) {
      await connection.execute(
        `INSERT INTO ${USERS_TABLE} (id, email, username, name, role, balance, rating, reviews_count, created_at, updated_at, password_hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [user.id, user.email, user.username, user.name || null, user.role, user.balance, user.rating, user.reviews_count, toMysqlDateTime(user.created_at), toMysqlDateTime(user.updated_at), user.passwordHash]
      )
    }

    for (const product of seed.products) {
      await connection.execute(
        `INSERT INTO ${PRODUCTS_TABLE} (id, title, description, price, stock, category, subcategory, image_url, images, seller_id, seller_name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [product.id, product.title, product.description, product.price, product.stock, product.category, product.subcategory || null, product.image_url || null, JSON.stringify(product.images || []), product.seller_id, product.seller_name, toMysqlDateTime(product.created_at), toMysqlDateTime(product.updated_at)]
      )
    }

    await connection.commit()
  } catch (error) {
    await connection.rollback()
    throw error
  } finally {
    connection.release()
  }
}

const loadSeedCatalogIfMissing = async () => {
  const [rows] = await pool.query<any[]>(`SELECT COUNT(*) AS count FROM ${CATALOG_CATEGORIES_TABLE}`)
  const count = Number(rows[0]?.count || 0)
  if (count > 0) return

  const seed = seedDb()
  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()
    for (const category of seed.catalog_categories) {
      await connection.execute(
        `INSERT INTO ${CATALOG_CATEGORIES_TABLE} (id, name, emoji, parent_id, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [category.id, category.name, category.emoji || null, category.parent_id || null, category.sort_order, toMysqlDateTime(category.created_at), toMysqlDateTime(category.updated_at)]
      )
    }
    await connection.commit()
  } catch (error) {
    await connection.rollback()
    throw error
  } finally {
    connection.release()
  }
}

const migrateLegacySellerRoles = async () => {
  await pool.execute(`UPDATE ${USERS_TABLE} SET role = 'user' WHERE role = 'seller'`)
}

const syncSellerStatsFromReviews = async () => {
  const [rows] = await pool.query<any[]>(`
    SELECT seller_id, ROUND(AVG(rating), 1) AS rating, COUNT(*) AS reviews_count
    FROM ${REVIEWS_TABLE}
    GROUP BY seller_id
  `)

  for (const row of rows) {
    await pool.execute(
      `UPDATE ${USERS_TABLE} SET rating = ?, reviews_count = ?, updated_at = ? WHERE id = ?`,
      [Number(row.rating || 0), Number(row.reviews_count || 0), now(), row.seller_id]
    )
  }
}

const loadSeedReviewsIfMissing = async () => {
  const [[reviewCountRow], [productCountRow], [userCountRow]] = await Promise.all([
    pool.query<any[]>(`SELECT COUNT(*) AS count FROM ${REVIEWS_TABLE}`),
    pool.query<any[]>(`SELECT COUNT(*) AS count FROM ${PRODUCTS_TABLE}`),
    pool.query<any[]>(`SELECT COUNT(*) AS count FROM ${USERS_TABLE}`),
  ])

  const reviewCount = Number(reviewCountRow?.[0]?.count || 0)
  const productCount = Number(productCountRow?.[0]?.count || 0)
  const userCount = Number(userCountRow?.[0]?.count || 0)

  if (reviewCount > 0 || productCount === 0 || userCount === 0) {
    return
  }

  const seed = seedDb()
  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()

    for (const review of seed.reviews) {
      await connection.execute(
        `INSERT INTO ${REVIEWS_TABLE} (id, product_id, seller_id, buyer_id, buyer_name, rating, text, order_id, product_title, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [review.id, review.product_id, review.seller_id, review.buyer_id, review.buyer_name, review.rating, review.text, review.order_id || null, review.product_title || null, toMysqlDateTime(review.created_at)]
      )
    }

    await connection.commit()
  } catch (error) {
    await connection.rollback()
    throw error
  } finally {
    connection.release()
  }

  await syncSellerStatsFromReviews()
}

export const ensureDb = async (): Promise<Database> => {
  await ensureSchema()
  await migrateLegacySellerRoles()
  await loadSeedIfEmpty()
  await loadSeedReviewsIfMissing()
  await loadSeedCatalogIfMissing()
  await syncSellerStatsFromReviews()
  const [users, products, reviews, orders, chats, carts, catalog_categories] = await Promise.all([
    loadUsers(),
    loadProducts(),
    loadReviews(),
    loadOrders(),
    loadChats(),
    loadCarts(),
    loadCatalogCategories(),
  ])
  return { users, products, reviews, orders, chats, carts, catalog_categories }
}

export const saveDb = async (db: Database) => {
  await ensureSchema()
  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()

    const batchSize = 500

    const batchInsertUpsert = async (table: string, columns: string[], rows: any[][], updateColumns: string[]) => {
      if (!rows.length) return
      for (let i = 0; i < rows.length; i += batchSize) {
        const chunk = rows.slice(i, i + batchSize)
        const placeholders = chunk.map(() => `(${columns.map(() => '?').join(',')})`).join(',')
        const values = chunk.flat()
        const update = updateColumns.length > 0 ? ` ON DUPLICATE KEY UPDATE ${updateColumns.map(col => `${col}=VALUES(${col})`).join(',')}` : ''
        const sql = `INSERT INTO ${table} (${columns.join(',')}) VALUES ${placeholders}${update}`
        await connection.query(sql, values)
      }
    }

    // Upsert users
    const userRows = db.users.map((u) => [u.id, u.email, u.username, u.name || null, u.role, u.balance, u.rating, u.reviews_count, toMysqlDateTime(u.created_at), toMysqlDateTime(u.updated_at), u.passwordHash])
    await batchInsertUpsert(USERS_TABLE, ['id','email','username','name','role','balance','rating','reviews_count','created_at','updated_at','password_hash'], userRows, ['email','username','name','role','balance','rating','reviews_count','updated_at','password_hash'])

    // Upsert products
    const productRows = db.products.map((p) => [p.id, p.title, p.description, p.price, p.stock, p.category, p.subcategory || null, p.image_url || null, JSON.stringify(p.images || []), p.seller_id, p.seller_name, toMysqlDateTime(p.created_at), toMysqlDateTime(p.updated_at)])
    await batchInsertUpsert(PRODUCTS_TABLE, ['id','title','description','price','stock','category','subcategory','image_url','images','seller_id','seller_name','created_at','updated_at'], productRows, ['title','description','price','stock','category','subcategory','image_url','images','seller_id','seller_name','updated_at'])
    const productIds = db.products.map((product) => product.id)
    if (productIds.length === 0) {
      await connection.query(`DELETE FROM ${PRODUCTS_TABLE}`)
    } else {
      const deletePlaceholders = productIds.map(() => '?').join(',')
      await connection.query(
        `DELETE FROM ${PRODUCTS_TABLE} WHERE id NOT IN (${deletePlaceholders})`,
        productIds
      )
    }

    // Upsert reviews
    const reviewRows = db.reviews.map((r) => [r.id, r.product_id || null, r.seller_id, r.buyer_id, r.buyer_name, r.rating, r.text, r.order_id || null, r.product_title || null, toMysqlDateTime(r.created_at)])
    await batchInsertUpsert(REVIEWS_TABLE, ['id','product_id','seller_id','buyer_id','buyer_name','rating','text','order_id','product_title','created_at'], reviewRows, ['text','rating','product_title'])

    // Upsert orders
    const orderRows = db.orders.map((o) => [o.id, o.product_id || null, o.product_name, o.seller_id, o.seller_name, o.buyer_id, o.buyer_name, o.price, o.quantity, o.status, toMysqlDateTime(o.created_at), o.completed_at ? toMysqlDateTime(o.completed_at) : null, o.dispute_resolution || null, o.dispute_resolved_by || null, o.dispute_resolved_at ? toMysqlDateTime(o.dispute_resolved_at) : null])
    await batchInsertUpsert(ORDERS_TABLE, ['id','product_id','product_name','seller_id','seller_name','buyer_id','buyer_name','price','quantity','status','created_at','completed_at','dispute_resolution','dispute_resolved_by','dispute_resolved_at'], orderRows, ['status','completed_at','dispute_resolution','dispute_resolved_by','dispute_resolved_at'])

    // Upsert chats and messages
    const chatRows = db.chats.map((c) => [c.id, c.seller_id, c.seller_name, c.buyer_id, c.buyer_name, c.product_id || null, c.product_name || null, toMysqlDateTime(c.created_at), toMysqlDateTime(c.updated_at)])
    await batchInsertUpsert(CHATS_TABLE, ['id','seller_id','seller_name','buyer_id','buyer_name','product_id','product_name','created_at','updated_at'], chatRows, ['seller_name','buyer_name','product_id','product_name','updated_at'])

    const messageRows: any[][] = []
    for (const chat of db.chats) {
      for (const m of chat.messages || []) {
        messageRows.push([m.id, chat.id, m.sender_id, m.sender_name, m.sender_role || 'user', m.text, toMysqlDateTime(m.timestamp), m.isSystemMessage ? 1 : 0])
      }
    }
    await batchInsertUpsert(CHAT_MESSAGES_TABLE, ['id','chat_id','sender_id','sender_name','sender_role','text','timestamp','is_system_message'], messageRows, ['text','timestamp','is_system_message'])

    // Upsert carts (assume unique key on user_id+product_id)
    const cartRows: any[][] = []
    for (const [userId, items] of Object.entries(db.carts)) {
      for (const item of items) {
        cartRows.push([userId, item.product_id, item.quantity])
      }
    }
    if (cartRows.length) {
      await batchInsertUpsert(CARTS_TABLE, ['user_id','product_id','quantity'], cartRows, ['quantity'])
    }

    // Upsert catalog categories (sorted to satisfy parent constraints)
    const catRows = sortCatalogCategoriesForInsert(db.catalog_categories).map((c) => [c.id, c.name, c.emoji || null, c.parent_id || null, c.sort_order, toMysqlDateTime(c.created_at), toMysqlDateTime(c.updated_at)])
    await batchInsertUpsert(CATALOG_CATEGORIES_TABLE, ['id','name','emoji','parent_id','sort_order','created_at','updated_at'], catRows, ['name','emoji','parent_id','sort_order','updated_at'])
    const categoryIds = db.catalog_categories.map((category) => category.id)
    if (categoryIds.length === 0) {
      await connection.query(`DELETE FROM ${CATALOG_CATEGORIES_TABLE}`)
    } else {
      const deletePlaceholders = categoryIds.map(() => '?').join(',')
      await connection.query(
        `DELETE FROM ${CATALOG_CATEGORIES_TABLE} WHERE id NOT IN (${deletePlaceholders})`,
        categoryIds
      )
    }

    await connection.commit()
  } catch (error) {
    await connection.rollback()
    throw error
  } finally {
    connection.release()
  }
}

export const upsertSession = async (token: string, userId: string) => {
  await ensureSchema()
  await pool.execute(
    `INSERT INTO ${SESSIONS_TABLE} (token, user_id, created_at, updated_at) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE user_id = VALUES(user_id), updated_at = VALUES(updated_at)`,
    [token, userId, now(), now()]
  )
}

export const removeSession = async (token: string) => {
  await ensureSchema()
  await pool.execute(`DELETE FROM ${SESSIONS_TABLE} WHERE token = ?`, [token])
}

export const loadSessions = async () => {
  await ensureSchema()
  const [rows] = await pool.query<any[]>(`SELECT token, user_id FROM ${SESSIONS_TABLE}`)
  return new Map<string, string>(rows.map((row) => [row.token, row.user_id]))
}

export const publicUser = (user: User) => ({
  id: user.id,
  email: user.email,
  username: user.username,
  name: user.name || user.username,
  role: user.role,
  balance: user.balance,
  rating: user.rating,
  reviews_count: user.reviews_count,
  created_at: user.created_at,
  updated_at: user.updated_at,
})

export const publicProduct = (product: Product, db: Database) => {
  const seller = db.users.find((user) => user.id === product.seller_id)
  return {
    ...product,
    seller_id: product.seller_id,
    seller_name: product.seller_name,
    rating: seller ? seller.rating : 0,
    reviews_count: seller ? seller.reviews_count : 0,
    seller: seller ? publicUser(seller) : null,
  }
}

const sortCatalogCategoriesForInsert = (categories: CatalogCategory[]) => {
  const sorted: CatalogCategory[] = []
  const visited = new Set<string>()
  const byParent = new Map<string | null, CatalogCategory[]>()

  for (const category of categories) {
    const parentKey = category.parent_id || null
    const list = byParent.get(parentKey) || []
    list.push(category)
    byParent.set(parentKey, list)
  }

  const visit = (parentId: string | null) => {
    const children = (byParent.get(parentId) || []).sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name))
    for (const category of children) {
      if (visited.has(category.id)) continue
      visited.add(category.id)
      sorted.push(category)
      visit(category.id)
    }
  }

  visit(null)
  return sorted
}

export const buildCatalogTree = (categories: CatalogCategory[]) => {
  const roots = categories.filter((category) => !category.parent_id)
  return roots
    .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name))
    .map((root) => ({
      ...root,
      children: categories
        .filter((category) => category.parent_id === root.id)
        .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name)),
    }))
}

// Delete all rows created with a specific generated prefix (e.g. 'gen-')
export const deleteGeneratedPrefix = async (prefix = 'gen-') => {
  const like = `${prefix}%`
  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()

    // Reviews tied to generated users or generated products
    await connection.query(
      `DELETE r FROM ${REVIEWS_TABLE} r
       LEFT JOIN ${PRODUCTS_TABLE} p ON r.product_id = p.id
       WHERE r.seller_id LIKE ? OR r.buyer_id LIKE ? OR p.seller_id LIKE ?`,
      [like, like, like]
    )

    // Orders tied to generated users or generated products
    await connection.query(
      `DELETE o FROM ${ORDERS_TABLE} o
       LEFT JOIN ${PRODUCTS_TABLE} p ON o.product_id = p.id
       WHERE o.seller_id LIKE ? OR o.buyer_id LIKE ? OR p.seller_id LIKE ?`,
      [like, like, like]
    )

    // Chat messages related to generated chats or sent by generated users
    await connection.query(
      `DELETE m FROM ${CHAT_MESSAGES_TABLE} m
       JOIN ${CHATS_TABLE} c ON m.chat_id = c.id
       WHERE m.sender_id LIKE ? OR c.seller_id LIKE ? OR c.buyer_id LIKE ?`,
      [like, like, like]
    )

    // Chats where participants are generated
    await connection.query(`DELETE FROM ${CHATS_TABLE} WHERE seller_id LIKE ? OR buyer_id LIKE ?`, [like, like])

    // Carts for generated users
    await connection.query(
      `DELETE c FROM ${CARTS_TABLE} c
       JOIN ${USERS_TABLE} u ON c.user_id = u.id
       WHERE u.id LIKE ?`,
      [like]
    )

    // Sessions for generated users
    await connection.query(
      `DELETE s FROM ${SESSIONS_TABLE} s
       JOIN ${USERS_TABLE} u ON s.user_id = u.id
       WHERE u.id LIKE ?`,
      [like]
    )

    // Products by generated sellers
    await connection.query(`DELETE FROM ${PRODUCTS_TABLE} WHERE seller_id LIKE ?`, [like])

    // Finally users themselves
    await connection.query(`DELETE FROM ${USERS_TABLE} WHERE id LIKE ?`, [like])

    await connection.commit()
  } catch (err) {
    await connection.rollback()
    throw err
  } finally {
    connection.release()
  }
}
