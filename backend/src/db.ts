import mysql from 'mysql2/promise'
import { createHash, randomUUID } from 'node:crypto'

export type Role = 'user' | 'admin' | 'support'
export type OrderStatus = 'pending' | 'completed' | 'disputed' | 'refunded'

export interface User {
  id: string
  email: string
  username: string
  name?: string
  avatar?: string
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
  parent_id: string | null
  sort_order: number
  created_at: string
  updated_at: string
}

export interface Review {
  id: string
  product_id: string
  seller_id: string
  buyer_id: string
  buyer_name: string
  rating: number
  text: string
  comment?: string
  order_id?: string
  product_title?: string
  created_at: string
}

export interface Order {
  id: string
  product_id: string
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
    { id: 'games', name: 'Ігри', parent_id: null, sort_order: 1, created_at: createdAt, updated_at: createdAt },
    { id: 'subscriptions', name: 'Підписки', parent_id: null, sort_order: 2, created_at: createdAt, updated_at: createdAt },
    { id: 'keys', name: 'Ключі і Коди', parent_id: null, sort_order: 3, created_at: createdAt, updated_at: createdAt },
    { id: 'cs2', name: 'CS2', parent_id: 'games', sort_order: 1, created_at: createdAt, updated_at: createdAt },
    { id: 'dota2', name: 'Dota 2', parent_id: 'games', sort_order: 2, created_at: createdAt, updated_at: createdAt },
    { id: 'valorant', name: 'Valorant', parent_id: 'games', sort_order: 3, created_at: createdAt, updated_at: createdAt },
    { id: 'pubg', name: 'PUBG', parent_id: 'games', sort_order: 4, created_at: createdAt, updated_at: createdAt },
    { id: 'fortnite', name: 'Fortnite', parent_id: 'games', sort_order: 5, created_at: createdAt, updated_at: createdAt },
    { id: 'telegram', name: 'Telegram', parent_id: 'subscriptions', sort_order: 1, created_at: createdAt, updated_at: createdAt },
    { id: 'spotify', name: 'Spotify', parent_id: 'subscriptions', sort_order: 2, created_at: createdAt, updated_at: createdAt },
    { id: 'discord', name: 'Discord', parent_id: 'subscriptions', sort_order: 3, created_at: createdAt, updated_at: createdAt },
    { id: 'youtube', name: 'YouTube', parent_id: 'subscriptions', sort_order: 4, created_at: createdAt, updated_at: createdAt },
    { id: 'windows', name: 'Windows', parent_id: 'keys', sort_order: 1, created_at: createdAt, updated_at: createdAt },
    { id: 'office', name: 'Office', parent_id: 'keys', sort_order: 2, created_at: createdAt, updated_at: createdAt },
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
      comment: 'Все швидко і без проблем, аккаунт відповідає опису.',
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
      comment: 'Сервіс активувався миттєво, все ок.',
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
      comment: 'Ключ прийшов одразу, активація успішна.',
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

// Таблиці уже створені вручну в Workbench, тому ensureSchema не створює їх
const ensureSchema = async () => {
  // Просто перевіримо, що таблиці існують
  try {
    await pool.query(`SELECT 1 FROM ${USERS_TABLE} LIMIT 1`)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ${CATALOG_CATEGORIES_TABLE} (
        id VARCHAR(64) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        parent_id VARCHAR(64) NULL,
        sort_order INT NOT NULL DEFAULT 0,
        created_at DATETIME NOT NULL,
        updated_at DATETIME NOT NULL,
        CONSTRAINT fk_catalog_categories_parent FOREIGN KEY (parent_id) REFERENCES ${CATALOG_CATEGORIES_TABLE}(id) ON DELETE CASCADE
      )
    `)
  } catch (err) {
    console.error('❌ Таблиці не знайдені! Створіть їх в Workbench за інструкцією.')
    throw new Error('Database tables not found. Please create them manually using the provided SQL.')
  }
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
    avatar: row.avatar || undefined,
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
    text: row.text,
    comment: row.comment || undefined,
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
        `INSERT INTO ${USERS_TABLE} (id, email, username, name, avatar, role, balance, rating, reviews_count, created_at, updated_at, password_hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [user.id, user.email, user.username, user.name || null, user.avatar || null, user.role, user.balance, user.rating, user.reviews_count, toMysqlDateTime(user.created_at), toMysqlDateTime(user.updated_at), user.passwordHash]
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
        `INSERT INTO ${CATALOG_CATEGORIES_TABLE} (id, name, parent_id, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`,
        [category.id, category.name, category.parent_id || null, category.sort_order, toMysqlDateTime(category.created_at), toMysqlDateTime(category.updated_at)]
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
        `INSERT INTO ${REVIEWS_TABLE} (id, product_id, seller_id, buyer_id, buyer_name, rating, text, comment, order_id, product_title, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [review.id, review.product_id, review.seller_id, review.buyer_id, review.buyer_name, review.rating, review.text, review.comment || null, review.order_id || null, review.product_title || null, toMysqlDateTime(review.created_at)]
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
    await connection.query(`DELETE FROM ${CHAT_MESSAGES_TABLE}`)
    await connection.query(`DELETE FROM ${CHATS_TABLE}`)
    await connection.query(`DELETE FROM ${REVIEWS_TABLE}`)
    await connection.query(`DELETE FROM ${ORDERS_TABLE}`)
    await connection.query(`DELETE FROM ${CARTS_TABLE}`)
    await connection.query(`DELETE FROM ${PRODUCTS_TABLE}`)
    await connection.query(`DELETE FROM ${CATALOG_CATEGORIES_TABLE}`)
    await connection.query(`DELETE FROM ${USERS_TABLE}`)

    for (const user of db.users) {
      await connection.execute(
        `INSERT INTO ${USERS_TABLE} (id, email, username, name, avatar, role, balance, rating, reviews_count, created_at, updated_at, password_hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [user.id, user.email, user.username, user.name || null, user.avatar || null, user.role, user.balance, user.rating, user.reviews_count, toMysqlDateTime(user.created_at), toMysqlDateTime(user.updated_at), user.passwordHash]
      )
    }

    for (const product of db.products) {
      await connection.execute(
        `INSERT INTO ${PRODUCTS_TABLE} (id, title, description, price, stock, category, subcategory, image_url, images, seller_id, seller_name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [product.id, product.title, product.description, product.price, product.stock, product.category, product.subcategory || null, product.image_url || null, JSON.stringify(product.images || []), product.seller_id, product.seller_name, toMysqlDateTime(product.created_at), toMysqlDateTime(product.updated_at)]
      )
    }

    for (const review of db.reviews) {
      await connection.execute(
        `INSERT INTO ${REVIEWS_TABLE} (id, product_id, seller_id, buyer_id, buyer_name, rating, text, comment, order_id, product_title, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [review.id, review.product_id, review.seller_id, review.buyer_id, review.buyer_name, review.rating, review.text, review.comment || null, review.order_id || null, review.product_title || null, toMysqlDateTime(review.created_at)]
      )
    }

    for (const order of db.orders) {
      await connection.execute(
        `INSERT INTO ${ORDERS_TABLE} (id, product_id, product_name, seller_id, seller_name, buyer_id, buyer_name, price, quantity, status, created_at, completed_at, dispute_resolution, dispute_resolved_by, dispute_resolved_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [order.id, order.product_id, order.product_name, order.seller_id, order.seller_name, order.buyer_id, order.buyer_name, order.price, order.quantity, order.status, toMysqlDateTime(order.created_at), order.completed_at ? toMysqlDateTime(order.completed_at) : null, order.dispute_resolution || null, order.dispute_resolved_by || null, order.dispute_resolved_at ? toMysqlDateTime(order.dispute_resolved_at) : null]
      )
    }

    for (const chat of db.chats) {
      await connection.execute(
        `INSERT INTO ${CHATS_TABLE} (id, seller_id, seller_name, buyer_id, buyer_name, product_id, product_name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [chat.id, chat.seller_id, chat.seller_name, chat.buyer_id, chat.buyer_name, chat.product_id || null, chat.product_name || null, toMysqlDateTime(chat.created_at), toMysqlDateTime(chat.updated_at)]
      )
      for (const message of chat.messages || []) {
        await connection.execute(
          `INSERT INTO ${CHAT_MESSAGES_TABLE} (id, chat_id, sender_id, sender_name, sender_role, text, timestamp, is_system_message) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [message.id, chat.id, message.sender_id, message.sender_name, message.sender_role || 'user', message.text, toMysqlDateTime(message.timestamp), message.isSystemMessage ? 1 : 0]
        )
      }
    }

    for (const [userId, items] of Object.entries(db.carts)) {
      for (const item of items) {
        await connection.execute(
          `INSERT INTO ${CARTS_TABLE} (user_id, product_id, quantity) VALUES (?, ?, ?)`,
          [userId, item.product_id, item.quantity]
        )
      }
    }

    for (const category of sortCatalogCategoriesForInsert(db.catalog_categories)) {
      await connection.execute(
        `INSERT INTO ${CATALOG_CATEGORIES_TABLE} (id, name, parent_id, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`,
        [category.id, category.name, category.parent_id || null, category.sort_order, toMysqlDateTime(category.created_at), toMysqlDateTime(category.updated_at)]
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
  avatar: user.avatar,
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
