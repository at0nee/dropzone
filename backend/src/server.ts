import 'dotenv/config'
import express, { type Request, type Response } from 'express'
import cors from 'cors'
import { randomUUID } from 'node:crypto'
import path from 'path'
import { fileURLToPath } from 'url'
import {
  ensureDb,
  buildCatalogTree,
  generateId,
  hashPassword,
  publicProduct,
  publicUser,
  deleteGeneratedPrefix,
  loadSessions,
  removeSession,
  saveDb,
  upsertSession,
  type CatalogCategory,
  type Database,
  type ChatMessage,
  type Order,
  type Product,
  type Review,
  type Role,
  type User,
} from './db'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const app = express()
const PORT = Number(process.env.PORT || 3000)
const sessions = new Map<string, string>()
// In-memory tracking of generate batches and progress
const seedBatchMap: any = {}

// Simple in-memory cache for products endpoint
const productsCache = new Map<string, { expires: number; payload: any }>()
const PRODUCTS_CACHE_TTL = Number(process.env.PRODUCTS_CACHE_TTL_MS || 5000)

const makeProductsCacheKey = (params: Record<string, any>) => {
  // include relevant params only
  const keyObj = {
    search: params.search || '',
    category: params.category || '',
    subcategory: params.subcategory || '',
    minPrice: params.minPrice !== undefined ? String(params.minPrice) : '',
    maxPrice: params.maxPrice !== undefined ? String(params.maxPrice) : '',
    page: Number(params.page || 1),
    pageSize: Number(params.pageSize || 12),
    includeOutOfStock: params.includeOutOfStock ? '1' : '0',
  }
  return JSON.stringify(keyObj)
}

const clearProductsCache = () => {
  productsCache.clear()
}

// Background persistence queue to avoid blocking during large generations
type Snapshot = {
  users: any[]
  products: any[]
  reviews: any[]
  orders: any[]
  chats: any[]
  carts: Record<string, any[]>
  catalog_categories: any[]
}

const persistQueue: Snapshot[] = []
let persistInProgress = false

const enqueueSaveSnapshot = (dbSnapshot: Snapshot) => {
  // store a deep clone to avoid mutations while queueing
  const clone = JSON.parse(JSON.stringify(dbSnapshot)) as Snapshot
  persistQueue.push(clone)
  processPersistQueue().catch((err) => console.error('Persist queue error', err))
}

const processPersistQueue = async () => {
  if (persistInProgress) return
  persistInProgress = true
  try {
    while (persistQueue.length) {
      const snap = persistQueue.shift()!
      try {
        await saveDb({
          users: snap.users,
          products: snap.products,
          reviews: snap.reviews,
          orders: snap.orders,
          chats: snap.chats,
          carts: snap.carts,
          catalog_categories: snap.catalog_categories,
        } as any)
        // Invalidate products cache after persistence
        try { clearProductsCache() } catch (e) { /* ignore */ }
      } catch (err) {
        console.error('Failed to persist snapshot, re-queueing', err)
        // push snapshot back and break to avoid tight loop
        persistQueue.unshift(snap)
        await new Promise((r) => setTimeout(r, 1000))
      }
      // slight delay to let event loop breathe
      await new Promise((r) => setTimeout(r, 50))
    }
  } finally {
    persistInProgress = false
  }
}

// Setup CORS and JSON parsing
app.use(cors({ origin: true, credentials: true }))
app.use(express.json())

// Serve frontend static files (React dist) from root
const distPath = path.join(__dirname, '..', '..', 'dropzone', 'dist')
app.use(express.static(distPath))

const asyncHandler = (fn: (req: Request, res: Response) => Promise<void>) => {
  return (req: Request, res: Response) => {
    Promise.resolve(fn(req, res)).catch((error) => {
      console.error(error)
      res.status(500).json({ success: false, error: 'Internal server error' })
    })
  }
}

// Validation limits
const MAX_USERNAME_LENGTH = 18
const PRODUCT_TITLE_MAX = 56
const PRODUCT_DESCRIPTION_MAX = 512
const REVIEW_COMMENT_MAX = 100

const send = (res: Response, data: unknown, status = 200) => {
  res.status(status).json({ success: true, data })
}

const fail = (res: Response, status: number, error: string, details?: unknown) => {
  res.status(status).json({ success: false, error, details })
}

const tokenFromRequest = (req: Request) => {
  const header = req.headers.authorization || ''
  const match = header.match(/^Bearer\s+(.+)$/i)
  return match?.[1] || null
}

const makeToken = () => randomUUID()

const getAuthUser = (db: Database, req: Request) => {
  const token = tokenFromRequest(req)
  if (!token) return null
  
  // Check in-memory sessions
  const userId = sessions.get(token)
  if (!userId) return null
  
  return db.users.find((user) => user.id === userId) || null
}

const requireAuth = (db: Database, req: Request, res: Response) => {
  const user = getAuthUser(db, req)
  if (!user) {
    const token = tokenFromRequest(req)
    console.warn(`❌ Auth failed: token='${token?.slice(0, 8)}...' found=${sessions.has(token || '')}`)
    fail(res, 401, 'Unauthorized')
    return null
  }
  return user
}

const requireRole = (db: Database, req: Request, res: Response, roles: Role[]) => {
  const user = requireAuth(db, req, res)
  if (!user) return null
  if (!roles.includes(user.role)) {
    fail(res, 403, 'Forbidden')
    return null
  }
  return user
}

const asNumber = (value: unknown, fallback = 0) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

const normalizeText = (value: unknown) => String(value || '').trim()

// Compact batch id to keep generated record IDs within DB column limits
const makeBatchId = () => `gen-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`

const shortId = (len = 8) => Math.random().toString(36).slice(2, 2 + len)

const pickByIndex = <T,>(items: T[], index: number) => items[index % items.length]

const userNameParts = {
  firstNames: ['Olena', 'Iryna', 'Andrii', 'Sofiia', 'Taras', 'Marta', 'Viktor', 'Diana', 'Oleh', 'Nadia'],
  lastNames: ['Shevchenko', 'Koval', 'Bondarenko', 'Melnyk', 'Tkachenko', 'Marchenko', 'Petrenko', 'Kravets', 'Hrytsenko', 'Moroz'],
}

const productNameParts = {
  adjectives: ['Urban', 'Modern', 'Premium', 'Classic', 'Bright', 'Cozy', 'Fresh', 'Smart', 'Rapid', 'Prime'],
  nouns: ['Chair', 'Lamp', 'Backpack', 'Table', 'Bottle', 'Notebook', 'Sneakers', 'Jacket', 'Speaker', 'Watch'],
}

const updateBatch = (id: string, data: Partial<{ stage: string; progress: number; message?: string }>) => {
  const b = seedBatchMap[id]
  if (!b) return
  if (data.stage !== undefined) b.stage = data.stage
  if (data.progress !== undefined) b.progress = data.progress
  if (data.message !== undefined) b.message = data.message
}

const rememberBatchIds = (batchId: string, key: 'userIds' | 'productIds' | 'orderIds' | 'reviewIds', ids: string[]) => {
  if (!seedBatchMap[batchId]) return
  seedBatchMap[batchId][key] = ids
}

const getBatchIds = (batchId: string, key: 'userIds' | 'productIds' | 'orderIds' | 'reviewIds') => {
  const batch = seedBatchMap[batchId]
  const ids = batch?.[key]
  return Array.isArray(ids) ? ids : []
}

const getGlobalHomeSummary = (db: Database) => {
  const completedOrders = (db.orders || []).filter((order) => order.status === 'completed')

  const salesCountByProduct = new Map<string, number>()
  const salesCountBySeller = new Map<string, number>()
  const sellerNamesById: Record<string, string> = {}

  completedOrders.forEach((order) => {
    // Only count sales for orders with valid product references
    if (order.product_id) {
      salesCountByProduct.set(order.product_id, (salesCountByProduct.get(order.product_id) || 0) + 1)
    }
    salesCountBySeller.set(order.seller_id, (salesCountBySeller.get(order.seller_id) || 0) + 1)
  })

  salesCountBySeller.forEach((_, sellerId) => {
    const seller = db.users.find((user) => user.id === sellerId)
    if (seller?.username) {
      sellerNamesById[sellerId] = seller.username
    }
  })

  const visibleProducts = (db.products || []).filter((product) => Number(product.stock || 0) > 0)
  const activeSellerIds = new Set<string>()
  const sellerNamesByProduct: Record<string, string> = {}

  visibleProducts.forEach((product) => {
    activeSellerIds.add(product.seller_id)
    if (product.seller_name) {
      sellerNamesByProduct[product.seller_id] = product.seller_name
    }
  })

  const popularProducts = [...visibleProducts]
    .map((product) => ({
      product,
      sales: salesCountByProduct.get(product.id) || 0,
    }))
    .sort((a, b) => {
      if (b.sales !== a.sales) return b.sales - a.sales
      return new Date(b.product.created_at).getTime() - new Date(a.product.created_at).getTime()
    })
    .filter((item) => item.sales > 0)
    .slice(0, 8)
    .map((item) => publicProduct(item.product, db))

  const fallbackPopularProducts = [...visibleProducts]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 8)
    .map((product) => publicProduct(product, db))

  return {
    completedPurchasesCount: completedOrders.length,
    productsCount: visibleProducts.length,
    activeSellersCount: activeSellerIds.size,
    categoriesCount: db.catalog_categories.filter((category) => Boolean(category.parent_id)).length,
    popularProducts: popularProducts.length > 0 ? popularProducts : fallbackPopularProducts,
    salesCountByProduct: Object.fromEntries(salesCountByProduct),
    salesCountBySeller: Object.fromEntries(salesCountBySeller),
    sellerNamesById: { ...sellerNamesByProduct, ...sellerNamesById },
  }
}

// Simple fake data generators (use existing db.generateId for uniqueness)
const fakeEmail = (username: string, batchId: string, idx: number) => `${username.toLowerCase()}.${idx}@${batchId}.local`

const generateUsers = (db: Database, batchId: string, count: number) => {
  const next: User[] = []
  for (let i = 0; i < count; i++) {
    const id = `${batchId}-user-${i}-${shortId(8)}`
    const firstName = pickByIndex(userNameParts.firstNames, i)
    const lastName = pickByIndex(userNameParts.lastNames, i + 3)
    const username = `${firstName.toLowerCase()}-${lastName.toLowerCase()}-${i + 1}`
    const nowIso = new Date().toISOString()
    const user: User = {
      id,
      email: fakeEmail(username, batchId.replace(/[:.]/g, '-'), i),
      username,
      name: username,
      role: 'user',
      balance: 0,
      rating: 0,
      reviews_count: 0,
      created_at: nowIso,
      updated_at: nowIso,
      passwordHash: hashPassword('password'),
    }
    db.users.push(user)
    next.push(user)
  }
  return next
}

const generateProducts = (db: Database, batchId: string, count: number) => {
  const nowIso = new Date().toISOString()
  const trackedUserIds = getBatchIds(batchId, 'userIds')
  // Prefer exact users created in this batch; fall back to prefix matching for older batches
  let sellers = trackedUserIds.length > 0
    ? db.users.filter((u) => u.role === 'user' && trackedUserIds.includes(u.id))
    : db.users.filter((u) => u.role === 'user' && String(u.id).startsWith(batchId))
  if (sellers.length === 0) return []  // No fallback - only batch users
  const next: Product[] = []
  for (let i = 0; i < count; i++) {
    const seller = sellers[i % sellers.length]
    const id = `${batchId}-prod-${i}-${shortId(8)}`
    const adjective = pickByIndex(productNameParts.adjectives, i)
    const noun = pickByIndex(productNameParts.nouns, i + 4)
    const product: Product = {
      id,
      title: `${adjective} ${noun} ${i + 1}`,
      description: 'Auto-generated sample product',
      price: Math.floor(Math.random() * 500) + 10,
      stock: Math.floor(Math.random() * 100),
      category: 'generated',
      images: [],
      seller_id: seller.id,
      seller_name: seller.username,
      created_at: nowIso,
      updated_at: nowIso,
    }
    db.products.push(product)
    next.push(product)
  }
  return next
}

const generateOrders = (db: Database, batchId: string, count: number) => {
  const nowIso = new Date().toISOString()
  const trackedProductIds = getBatchIds(batchId, 'productIds')
  const trackedUserIds = getBatchIds(batchId, 'userIds')
  // Only use entities generated in this batch
  let products = trackedProductIds.length > 0
    ? db.products.filter((p) => trackedProductIds.includes(p.id))
    : db.products.filter((p) => String(p.id).startsWith(batchId))
  let buyers = trackedUserIds.length > 0
    ? db.users.filter((u) => u.role === 'user' && trackedUserIds.includes(u.id))
    : db.users.filter((u) => u.role === 'user' && String(u.id).startsWith(batchId))
  if (products.length === 0 || buyers.length === 0) return []
  const next: Order[] = []
  for (let i = 0; i < count; i++) {
    const product = products[i % products.length]
    const buyer = buyers[(i + 3) % buyers.length]
    const id = `${batchId}-order-${i}-${shortId(8)}`
    const order: Order = {
      id,
      product_id: product.id,
      product_name: product.title,
      seller_id: product.seller_id,
      seller_name: product.seller_name,
      buyer_id: buyer.id,
      buyer_name: buyer.username,
      price: product.price,
      quantity: 1,
      status: Math.random() > 0.5 ? 'completed' : 'pending',
      created_at: nowIso,
    }
    if (order.status === 'completed') order.completed_at = nowIso
    db.orders.push(order)
    next.push(order)
  }
  return next
}

const generateReviews = (db: Database, batchId: string, count: number) => {
  const nowIso = new Date().toISOString()
  const trackedProductIds = getBatchIds(batchId, 'productIds')
  const trackedUserIds = getBatchIds(batchId, 'userIds')
  // Only use entities generated in this batch
  let products = trackedProductIds.length > 0
    ? db.products.filter((p) => trackedProductIds.includes(p.id))
    : db.products.filter((p) => String(p.id).startsWith(batchId))
  let buyers = trackedUserIds.length > 0
    ? db.users.filter((u) => u.role === 'user' && trackedUserIds.includes(u.id))
    : db.users.filter((u) => u.role === 'user' && String(u.id).startsWith(batchId))
  if (products.length === 0 || buyers.length === 0) return []
  const next: Review[] = []
  for (let i = 0; i < count; i++) {
    const product = products[i % products.length]
    const buyer = buyers[(i + 5) % buyers.length]
    const id = `${batchId}-rev-${i}-${shortId(8)}`
    const text = `Auto review ${i} for ${product.title}`
    const review: Review = {
      id,
      product_id: product.id,
      seller_id: product.seller_id,
      buyer_id: buyer.id,
      buyer_name: buyer.username,
      rating: Math.floor(Math.random() * 5) + 1,
      text,
      product_title: product.title,
      created_at: nowIso,
    }
    db.reviews.push(review)
    next.push(review)
  }
  return next
}

const calculateSellerStats = (db: Database, sellerId: string) => {
  const sellerReviews = db.reviews.filter((review) => review.seller_id === sellerId)
  const seller = db.users.find((user) => user.id === sellerId)
  if (!seller) return

  seller.reviews_count = sellerReviews.length
  seller.rating = sellerReviews.length
    ? Math.round((sellerReviews.reduce((sum, review) => sum + review.rating, 0) / sellerReviews.length) * 10) / 10
    : seller.rating || 0
  seller.updated_at = new Date().toISOString()
}

const normalizeCatalogName = (value: unknown) => normalizeText(value)

const resolveCatalogParentId = (db: Database, rawParentId: unknown) => {
  const value = normalizeCatalogName(rawParentId)
  if (!value) return null
  const byId = db.catalog_categories.find((category) => category.id === value)
  if (byId) return byId.id
  const byName = db.catalog_categories.find((category) => category.name.toLowerCase() === value.toLowerCase())
  if (byName) return byName.id
  return value
}

const resolveCatalogCategoryId = (db: Database, rawValue: unknown) => {
  const value = normalizeCatalogName(rawValue)
  if (!value) return null
  const byId = db.catalog_categories.find((category) => category.id === value)
  if (byId) return byId.id
  const byName = db.catalog_categories.find((category) => category.name.toLowerCase() === value.toLowerCase())
  if (byName) return byName.id
  return null
}

const isRootCatalogCategory = (db: Database, categoryId: string) => {
  const category = db.catalog_categories.find((item) => item.id === categoryId)
  return Boolean(category && !category.parent_id)
}

const wouldCreateCatalogCycle = (db: Database, categoryId: string, parentId: string | null) => {
  if (!parentId) return false
  let current = db.catalog_categories.find((category) => category.id === parentId) || null
  const visited = new Set<string>()

  while (current) {
    if (current.id === categoryId) return true
    if (visited.has(current.id)) return true
    visited.add(current.id)
    if (!current.parent_id) return false
    current = db.catalog_categories.find((category) => category.id === current?.parent_id) || null
  }

  return false
}

const slugifyCatalogName = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9а-яіїєґ]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'category'

const createCatalogCategoryId = (name: string) => `${slugifyCatalogName(name)}-${generateId('cat').slice(-8)}`

const buildCatalogApiPayload = (categories: CatalogCategory[]) => {
  const tree = buildCatalogTree(categories)
  return {
    categories: tree.map((category) => ({
      id: category.id,
      name: category.name,
      emoji: category.emoji,
      parent_id: category.parent_id,
      sort_order: category.sort_order,
      created_at: category.created_at,
      updated_at: category.updated_at,
      icon: category.emoji || 'gamepad-2',
      children: category.children.map((child) => ({
        id: child.id,
        name: child.name,
        emoji: child.emoji,
        parent_id: child.parent_id,
        sort_order: child.sort_order,
        created_at: child.created_at,
        updated_at: child.updated_at,
        icon: child.emoji || 'gamepad-2',
      })),
    })),
    apps: tree.flatMap((category) => category.children.map((child) => ({
      id: child.id,
      name: child.name,
      category: category.id,
      icon: child.emoji || 'gamepad-2',
      productTypes: [],
    }))),
  }
}

const getOrCreateChatThread = (db: Database, sellerId: string, buyerId: string, product?: Product) => {
  // Sort IDs to always have consistent order: smaller ID first
  // This ensures one chat between any two users regardless of who buys from whom
  const [participant1, participant2] = [sellerId, buyerId].sort()
  
  // Find existing chat between these two users (ONE chat per pair, regardless of products)
  let thread = db.chats.find((item) => 
    item.seller_id === participant1 && 
    item.buyer_id === participant2
  )
  
  if (thread) {
    console.log(`🔎 Found existing chat thread ${thread.id} for participants=${participant1} & ${participant2} product=${product?.id || 'none'}`)
    return thread
  }
  
  if (!thread) {
    const user1 = db.users.find((user) => user.id === participant1)
    const user2 = db.users.find((user) => user.id === participant2)
    thread = {
      id: generateId('chat'),
      seller_id: participant1,
      seller_name: user1?.username || participant1,
      buyer_id: participant2,
      buyer_name: user2?.username || participant2,
      product_id: product?.id,
      product_name: product?.title,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      messages: [],
    }
    db.chats.unshift(thread)
    console.log(`➕ Created new chat thread ${thread.id} for participants=${participant1} & ${participant2} product=${product?.id || 'none'}`)
  }
  return thread
}

type SystemMessageType = 'info' | 'alert'
const attachSystemMessage = (thread: NonNullable<ReturnType<typeof getOrCreateChatThread>>, text: string, type: SystemMessageType = 'info') => {
  const message: ChatMessage & { system_type?: SystemMessageType } = {
    id: generateId('msg'),
    sender_id: 'system',
    sender_name: 'System',
    sender_role: 'system',
    text,
    timestamp: new Date().toISOString(),
    isSystemMessage: true,
    system_type: type,
  }
  thread.messages.push(message)
  thread.updated_at = message.timestamp
}

app.get('/health', asyncHandler(async (_req, res) => {
  const db = await ensureDb()
  send(res, {
    status: 'ok',
    users: db.users.length,
    products: db.products.length,
    orders: db.orders.length,
    reviews: db.reviews.length,
    chats: db.chats.length,
  })
}))

app.get('/catalog/taxonomy', asyncHandler(async (_req, res) => {
  const db = await ensureDb()
  send(res, buildCatalogApiPayload(db.catalog_categories))
}))

app.post('/auth/register', asyncHandler(async (req, res) => {
  const db = await ensureDb()
  const email = normalizeText(req.body?.email)
  const password = normalizeText(req.body?.password)
  const username = normalizeText(req.body?.username || req.body?.name)

  if (!email || !password || !username) {
    return fail(res, 400, 'Validation error', ['email, password, username are required'])
  }

  if (username.length > MAX_USERNAME_LENGTH) {
    return fail(res, 400, 'Validation error', [`username must be at most ${MAX_USERNAME_LENGTH} characters`])
  }

  if (db.users.some((user) => user.email.toLowerCase() === email.toLowerCase())) {
    return fail(res, 409, 'User already exists')
  }

  // Strict email validation: require local@domain.tld (must contain a dot in domain)
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!emailPattern.test(email)) {
    return fail(res, 400, 'Validation error', ['email must be a valid address like name@domain.tld'])
  }

  // Generate a simple numeric user id (incrementing) for readability
  const nextNumericId = () => {
    const numericIds = db.users
      .map((u) => String(u.id))
      .map((id) => (/^\d+$/.test(id) ? Number(id) : NaN))
      .filter((n) => !Number.isNaN(n))
    const max = numericIds.length ? Math.max(...numericIds) : 0
    return String(max + 1)
  }

  const user: User = {
    id: nextNumericId(),
    email,
    username,
    name: username,
    role: 'user',
    balance: 0,
    rating: 0,
    reviews_count: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    passwordHash: hashPassword(password),
  }

  db.users.unshift(user)
  await saveDb(db)
  const token = makeToken()
  sessions.set(token, user.id)
  await upsertSession(token, user.id)
  console.log(`✅ Реєстрація: ${email} → token '${token.slice(0, 8)}...', всього сесій: ${sessions.size}`)
  send(res, { token, user: publicUser(user) }, 201)
}))

app.post('/auth/login', asyncHandler(async (req, res) => {
  const db = await ensureDb()
  const email = normalizeText(req.body?.email)
  const password = normalizeText(req.body?.password)
  const user = db.users.find((item) => item.email.toLowerCase() === email.toLowerCase())

  if (!user || user.passwordHash !== hashPassword(password)) {
    return fail(res, 401, 'Invalid credentials')
  }

  const token = makeToken()
  sessions.set(token, user.id)
  await upsertSession(token, user.id)
  console.log(`✅ Логін: ${email} (${user.role}) → token '${token.slice(0, 8)}...', всього сесій: ${sessions.size}`)
  send(res, { token, user: publicUser(user) })
}))

app.post('/auth/logout', asyncHandler(async (req, res) => {
  const token = tokenFromRequest(req)
  if (token) {
    sessions.delete(token)
    await removeSession(token)
  }
  send(res, { ok: true })
}))

app.get('/auth/me', asyncHandler(async (req, res) => {
  const db = await ensureDb()
  const user = getAuthUser(db, req)
  if (!user) return fail(res, 401, 'Unauthorized')
  send(res, publicUser(user))
}))

app.get('/products', asyncHandler(async (req, res) => {
  const db = await ensureDb()
  const search = normalizeText(req.query.search).toLowerCase()
  const category = normalizeText(req.query.category).toLowerCase()
  const subcategory = normalizeText(req.query.subcategory).toLowerCase()
  const minPriceRaw = normalizeText(req.query.minPrice)
  const maxPriceRaw = normalizeText(req.query.maxPrice)
  const minPrice = minPriceRaw !== '' ? Number(minPriceRaw) : null
  const maxPrice = maxPriceRaw !== '' ? Number(maxPriceRaw) : null
  const page = Math.max(1, asNumber(req.query.page, 1))
  // Allow very large page sizes for admin uses (practically unlimited, capped at 1M)
  const pageSize = Math.min(1000000, Math.max(1, asNumber(req.query.pageSize, 12)))
  const includeOutOfStock = String(req.query.includeOutOfStock || '').toLowerCase() === 'true' || String(req.query.includeOutOfStock || '') === '1'

  // Try products cache
  const cacheKey = makeProductsCacheKey({ search, category, subcategory, minPrice: minPriceRaw, maxPrice: maxPriceRaw, page, pageSize, includeOutOfStock })
  const cached = productsCache.get(cacheKey)
  if (cached && cached.expires > Date.now()) {
    return send(res, cached.payload)
  }

  const items = db.products
    .filter((product) => {
      const matchesSearch = !search || [product.title, product.description, product.seller_name].join(' ').toLowerCase().includes(search)
      const matchesCategory = !category || product.category.toLowerCase() === category
      const matchesSubcategory = !subcategory || (product.subcategory || '').toLowerCase() === subcategory
      const matchesMinPrice = minPrice === null || Number(product.price || 0) >= minPrice
      const matchesMaxPrice = maxPrice === null || Number(product.price || 0) <= maxPrice
      const hasStock = includeOutOfStock ? true : ((product.stock || 0) > 0)
      return matchesSearch && matchesCategory && matchesSubcategory && matchesMinPrice && matchesMaxPrice && hasStock
    })
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

  const sliced = items.slice((page - 1) * pageSize, page * pageSize).map((product) => publicProduct(product, db))
  const payload = { items: sliced, total: items.length, page, pageSize }
  productsCache.set(cacheKey, { expires: Date.now() + PRODUCTS_CACHE_TTL, payload })
  send(res, payload)
}))

// Provide catalog apps/categories for frontend UI
app.get('/catalog/apps', asyncHandler(async (_req, res) => {
  const db = await ensureDb()
  send(res, buildCatalogApiPayload(db.catalog_categories))
}))

// Admin: permanently delete all generated data (by id prefix)
app.delete('/admin/generated', asyncHandler(async (req, res) => {
  const db = await ensureDb()
  const admin = requireRole(db, req, res, ['admin'])
  if (!admin) return

  // Delete rows in DB with prefix 'gen-'
  await deleteGeneratedPrefix('gen-')
  // Clear products cache since many products/users removed
  clearProductsCache()

  // Clean up any in-memory sessions that referenced generated users
  for (const [token, userId] of Array.from(sessions.entries())) {
    if (String(userId).startsWith('gen-')) {
      sessions.delete(token)
      try { await removeSession(token) } catch (e) { /* ignore */ }
    }
  }

  send(res, { ok: true })
}))

app.get('/admin/catalog/categories', asyncHandler(async (req, res) => {
  const db = await ensureDb()
  const user = requireRole(db, req, res, ['admin'])
  if (!user) return
  send(res, buildCatalogApiPayload(db.catalog_categories))
}))

app.post('/admin/catalog/categories', asyncHandler(async (req, res) => {
  const db = await ensureDb()
  const user = requireRole(db, req, res, ['admin'])
  if (!user) return

  const name = normalizeCatalogName(req.body?.name)
  const parentId = resolveCatalogParentId(db, req.body?.parent_id)
  const sortOrder = Math.max(0, asNumber(req.body?.sort_order, 0))

  if (!name) return fail(res, 400, 'Validation error', ['name is required'])
  if (parentId && !db.catalog_categories.some((category) => category.id === parentId)) {
    return fail(res, 404, 'Parent category not found')
  }
  if (parentId && !isRootCatalogCategory(db, parentId)) {
    return fail(res, 400, 'Subcategories of subcategories are not allowed')
  }

  const duplicate = db.catalog_categories.some((category) =>
    category.parent_id === parentId && category.name.toLowerCase() === name.toLowerCase()
  )
  if (duplicate) return fail(res, 409, 'Category already exists')

  const category: CatalogCategory = {
    id: createCatalogCategoryId(name),
    name,
    emoji: normalizeText(req.body?.emoji) || 'gamepad-2',
    parent_id: parentId,
    sort_order: sortOrder,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }

  db.catalog_categories.unshift(category)
  await saveDb(db)
  send(res, category, 201)
}))

app.put('/admin/catalog/categories/:id', asyncHandler(async (req, res) => {
  const db = await ensureDb()
  const user = requireRole(db, req, res, ['admin'])
  if (!user) return

  const category = db.catalog_categories.find((item) => item.id === req.params.id)
  if (!category) return fail(res, 404, 'Category not found')

  const name = normalizeCatalogName(req.body?.name)
  const emoji = normalizeText(req.body?.emoji) || category.emoji || 'gamepad-2'
  const rawParentId = req.body?.parent_id === null ? null : req.body?.parent_id
  const parentId = rawParentId === null ? null : resolveCatalogParentId(db, rawParentId) || category.parent_id
  const sortOrder = typeof req.body?.sort_order !== 'undefined' ? Math.max(0, asNumber(req.body?.sort_order, category.sort_order)) : category.sort_order

  if (!name) return fail(res, 400, 'Validation error', ['name is required'])
  if (parentId === category.id) return fail(res, 400, 'Category cannot be its own parent')
  if (parentId && !db.catalog_categories.some((item) => item.id === parentId)) {
    return fail(res, 404, 'Parent category not found')
  }
  if (parentId && !isRootCatalogCategory(db, parentId)) {
    return fail(res, 400, 'Subcategories of subcategories are not allowed')
  }
  if (wouldCreateCatalogCycle(db, category.id, parentId)) {
    return fail(res, 400, 'Category hierarchy cycle detected')
  }

  const duplicate = db.catalog_categories.some((item) =>
    item.id !== category.id && item.parent_id === parentId && item.name.toLowerCase() === name.toLowerCase()
  )
  if (duplicate) return fail(res, 409, 'Category already exists')

  category.name = name
  category.emoji = emoji
  category.parent_id = parentId
  category.sort_order = sortOrder
  category.updated_at = new Date().toISOString()

  await saveDb(db)
  send(res, category)
}))

app.delete('/admin/catalog/categories/:id', asyncHandler(async (req, res) => {
  const db = await ensureDb()
  const user = requireRole(db, req, res, ['admin'])
  if (!user) return

  const target = db.catalog_categories.find((item) => item.id === req.params.id)
  if (!target) return fail(res, 404, 'Category not found')

  const idsToDelete = new Set<string>()
  const collect = (categoryId: string) => {
    idsToDelete.add(categoryId)
    db.catalog_categories
      .filter((item) => item.parent_id === categoryId)
      .forEach((child) => collect(child.id))
  }
  collect(target.id)

  db.catalog_categories = db.catalog_categories.filter((category) => !idsToDelete.has(category.id))
  await saveDb(db)
  send(res, { deleted: true, ids: Array.from(idsToDelete) })
}))

app.get('/products/:id', asyncHandler(async (req, res) => {
  const db = await ensureDb()
  const product = db.products.find((item) => item.id === req.params.id)
  if (!product) return fail(res, 404, 'Product not found')
  send(res, publicProduct(product, db))
}))

app.post('/products', asyncHandler(async (req, res) => {
  const db = await ensureDb()
  const user = requireAuth(db, req, res)
  if (!user) return

  const payload = req.body || {}
  const title = normalizeText(payload.title)
  const description = normalizeText(payload.description)
  const price = asNumber(payload.price)
  const stock = asNumber(payload.stock ?? payload.quantity, 1)
  const categoryId = resolveCatalogCategoryId(db, payload.category)
  const subcategoryId = resolveCatalogCategoryId(db, payload.subcategory)
  if (!title || !description || !price) {
    return fail(res, 400, 'Validation error', ['title, description, price are required'])
  }
  if (!categoryId) {
    return fail(res, 400, 'Validation error', ['category is required'])
  }
  if (!subcategoryId) {
    return fail(res, 400, 'Validation error', ['subcategory is required'])
  }
  const categoryNode = db.catalog_categories.find((item) => item.id === categoryId)
  const subcategoryNode = db.catalog_categories.find((item) => item.id === subcategoryId)
  if (!categoryNode || categoryNode.parent_id) {
    return fail(res, 400, 'Validation error', ['category must be a root category'])
  }
  if (!subcategoryNode || subcategoryNode.parent_id !== categoryId) {
    return fail(res, 400, 'Validation error', ['subcategory must belong to the selected category'])
  }

  if (title.length > PRODUCT_TITLE_MAX) return fail(res, 400, 'Validation error', [`title must be at most ${PRODUCT_TITLE_MAX} characters`])
  if (description.length > PRODUCT_DESCRIPTION_MAX) return fail(res, 400, 'Validation error', [`description must be at most ${PRODUCT_DESCRIPTION_MAX} characters`])

  const product: Product = {
    id: generateId('prod'),
    title,
    description,
    price,
    stock,
    category: categoryId,
    subcategory: subcategoryId,
    image_url: normalizeText(payload.image_url) || undefined,
    images: Array.isArray(payload.images) ? payload.images.filter(Boolean) : [],
    seller_id: user.id,
    seller_name: user.username,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }

  db.products.unshift(product)
  await saveDb(db)
  clearProductsCache()
  send(res, publicProduct(product, db), 201)
}))

app.put('/products/:id', asyncHandler(async (req, res) => {
  const db = await ensureDb()
  const user = requireAuth(db, req, res)
  if (!user) return

  const product = db.products.find((item) => item.id === req.params.id)
  if (!product) return fail(res, 404, 'Product not found')
  console.log(`PUT /products/${req.params.id} by user=${user.id} role=${user.role} product.seller_id=${product.seller_id}`)
  if (user.role !== 'admin' && product.seller_id !== user.id) {
    console.log(`↩️ Forbidden product update attempt user=${user.id} role=${user.role} product=${product.id}`)
    return fail(res, 403, 'Forbidden')
  }

  const payload = req.body || {}
  const newTitle = typeof payload.title === 'string' ? normalizeText(payload.title) : product.title
  const newDescription = typeof payload.description === 'string' ? normalizeText(payload.description) : product.description
  if (typeof payload.title === 'string' && newTitle.length > PRODUCT_TITLE_MAX) return fail(res, 400, 'Validation error', [`title must be at most ${PRODUCT_TITLE_MAX} characters`])
  if (typeof payload.description === 'string' && newDescription.length > PRODUCT_DESCRIPTION_MAX) return fail(res, 400, 'Validation error', [`description must be at most ${PRODUCT_DESCRIPTION_MAX} characters`])
  const categoryId = resolveCatalogCategoryId(db, payload.category ?? product.category)
  const subcategoryId = resolveCatalogCategoryId(db, payload.subcategory ?? product.subcategory)
  if (!categoryId) return fail(res, 400, 'Validation error', ['category is required'])
  if (!subcategoryId) return fail(res, 400, 'Validation error', ['subcategory is required'])
  const categoryNode = db.catalog_categories.find((item) => item.id === categoryId)
  const subcategoryNode = db.catalog_categories.find((item) => item.id === subcategoryId)
  if (!categoryNode || categoryNode.parent_id) {
    return fail(res, 400, 'Validation error', ['category must be a root category'])
  }
  if (!subcategoryNode || subcategoryNode.parent_id !== categoryId) {
    return fail(res, 400, 'Validation error', ['subcategory must belong to the selected category'])
  }

  product.title = newTitle
  product.description = newDescription
  product.price = asNumber(payload.price ?? product.price)
  product.stock = asNumber(payload.stock ?? payload.quantity ?? product.stock)
  product.category = categoryId
  product.subcategory = subcategoryId
  product.image_url = normalizeText((payload.image_url ?? product.image_url) || '') || undefined
  product.images = Array.isArray(payload.images) ? payload.images.filter(Boolean) : product.images
  product.updated_at = new Date().toISOString()

  await saveDb(db)
  clearProductsCache()
  send(res, publicProduct(product, db))
}))

app.delete('/products/:id', asyncHandler(async (req, res) => {
  const db = await ensureDb()
  const user = requireAuth(db, req, res)
  if (!user) return

  const index = db.products.findIndex((item) => item.id === req.params.id)
  if (index === -1) return fail(res, 404, 'Product not found')
  const target = db.products[index]
  console.log(`DELETE /products/${req.params.id} by user=${user.id} role=${user.role} target.seller_id=${target.seller_id}`)
  if (user.role !== 'admin' && target.seller_id !== user.id) {
    console.log(`↩️ Forbidden product delete attempt user=${user.id} role=${user.role} product=${target.id}`)
    return fail(res, 403, 'Forbidden')
  }

  // Preserve historical orders and reviews, but unlink them from the deleted product
  // so seller stats and history remain intact even if the product is removed.
  db.orders = db.orders.map((order) =>
    order.product_id === target.id
      ? { ...order, product_id: null, product_name: target.title }
      : order
  )

  db.reviews = db.reviews.map((review) =>
    review.product_id === target.id
      ? { ...review, product_id: null, product_title: target.title }
      : review
  )

  db.chats = db.chats.map((chat) =>
    chat.product_id === target.id
      ? { ...chat, product_id: undefined, product_name: undefined, updated_at: new Date().toISOString() }
      : chat
  )
  Object.keys(db.carts).forEach((userId) => {
    db.carts[userId] = (db.carts[userId] || []).filter((item) => item.product_id !== target.id)
    if (!db.carts[userId].length) delete db.carts[userId]
  })

  db.products.splice(index, 1)

  // Recalculate seller stats (reviews_count, rating) after unlinking reviews
  try {
    calculateSellerStats(db, target.seller_id)
  } catch (err) {
    console.warn('Failed to recalculate seller stats after product deletion', err)
  }

  await saveDb(db)
  clearProductsCache()
  send(res, { deleted: true })
}))

app.get('/reviews', asyncHandler(async (req, res) => {
  const db = await ensureDb()
  const productId = normalizeText(req.query.product_id)
  const sellerId = normalizeText(req.query.seller_id)
  const items = db.reviews.filter((review) => {
    const matchesProduct = !productId || review.product_id === productId
    const matchesSeller = !sellerId || review.seller_id === sellerId
    return matchesProduct && matchesSeller
  })
  send(res, items)
}))

app.post('/reviews', asyncHandler(async (req, res) => {
  const db = await ensureDb()
  const user = requireAuth(db, req, res)
  if (!user) return

  const productId = normalizeText(req.body?.product_id)
  const rating = Math.max(1, Math.min(5, asNumber(req.body?.rating, 5)))
  const text = normalizeText(req.body?.text)
  const orderId = normalizeText(req.body?.order_id)
  
  if (text.length > REVIEW_COMMENT_MAX) return fail(res, 400, 'Validation error', [`review comment must be at most ${REVIEW_COMMENT_MAX} characters`])
  
  const product = db.products.find((item) => item.id === productId)
  if (!product) return fail(res, 404, 'Product not found')

  const seller = db.users.find((u) => u.id === product.seller_id)
  const sellerName = seller?.username || product.seller_id

  const review: Review = {
    id: generateId('rev'),
    product_id: product.id,
    seller_id: product.seller_id,
    seller_name: sellerName,
    buyer_id: user.id,
    buyer_name: user.username,
    rating,
    text,
    order_id: orderId || undefined,
    product_title: product.title,
    created_at: new Date().toISOString(),
  }

  db.reviews.unshift(review)
  calculateSellerStats(db, product.seller_id)
  // Add system message to chat thread notifying about new review
  try {
    const thread = getOrCreateChatThread(db, product.seller_id, user.id, product)
    attachSystemMessage(thread, `✍️ ${user.username} залишив(ла) відгук про "${product.title}": ${text ? '"' + text + '"' : ''}`, 'info')
    console.log(`📝 Review message added to chat thread ${thread.id}`)
  } catch (err) {
    console.log('Could not attach review system message to chat:', err)
  }
  await saveDb(db)
  send(res, review, 201)
}))

app.get('/users', asyncHandler(async (req, res) => {
  const db = await ensureDb()
  const user = requireRole(db, req, res, ['admin'])
  if (!user) return
  send(res, db.users.map(publicUser))
}))

app.get('/users/:id', asyncHandler(async (req, res) => {
  const db = await ensureDb()
  const current = requireAuth(db, req, res)
  if (!current) return

  const target = db.users.find((item) => item.id === req.params.id)
  if (!target) return fail(res, 404, 'User not found')
  if (current.role !== 'admin' && current.id !== target.id) return fail(res, 403, 'Forbidden')
  send(res, publicUser(target))
}))

app.put('/users/:id', asyncHandler(async (req, res) => {
  const db = await ensureDb()
  const current = requireAuth(db, req, res)
  if (!current) return

  const target = db.users.find((item) => item.id === req.params.id)
  if (!target) return fail(res, 404, 'User not found')
  if (current.role !== 'admin' && current.id !== target.id) return fail(res, 403, 'Forbidden')

  const payload = req.body || {}
  if (typeof payload.username === 'string') {
    if (payload.username.length > MAX_USERNAME_LENGTH) return fail(res, 400, 'Validation error', [`username must be at most ${MAX_USERNAME_LENGTH} characters`])
    target.username = payload.username
  }
  if (typeof payload.name === 'string') target.name = payload.name
  if (typeof payload.email === 'string') target.email = payload.email
  if (typeof payload.balance !== 'undefined') target.balance = asNumber(payload.balance, target.balance)
  if (current.role === 'admin' && typeof payload.role === 'string') target.role = payload.role as Role
  target.updated_at = new Date().toISOString()

  await saveDb(db)
  send(res, publicUser(target))
}))

app.delete('/users/:id', asyncHandler(async (req, res) => {
  const db = await ensureDb()
  const current = requireAuth(db, req, res)
  if (!current) return

  // Only admins can delete users
  if (current.role !== 'admin') return fail(res, 403, 'Forbidden')

  const targetUserId = req.params.id
  const target = db.users.find((item) => item.id === targetUserId)
  if (!target) return fail(res, 404, 'User not found')

  // Prevent self-deletion
  if (current.id === targetUserId) return fail(res, 400, 'Cannot delete yourself')

  // Delete user's products
  const productsToDelete = db.products.filter((p) => p.seller_id === targetUserId)
  const deletedProductIds = new Set(productsToDelete.map((p) => p.id))
  db.products = db.products.filter((p) => p.seller_id !== targetUserId)

  // Delete user's orders (as buyer or seller)
  db.orders = db.orders.filter((o) => o.buyer_id !== targetUserId && o.seller_id !== targetUserId)

  // Delete user's chats
  db.chats = db.chats.filter((c) => c.buyer_id !== targetUserId && c.seller_id !== targetUserId)

  // Delete user's reviews (written by them or about their products)
  db.reviews = db.reviews.filter((r) => r.buyer_id !== targetUserId && r.seller_id !== targetUserId)

  // Remove user from carts of other users
  Object.keys(db.carts).forEach((userId) => {
    if (db.carts[userId]) {
      db.carts[userId] = db.carts[userId].filter((item) => !deletedProductIds.has(item.product_id))
    }
  })

  // Delete the user
  db.users = db.users.filter((u) => u.id !== targetUserId)

  await saveDb(db)
  send(res, { success: true, message: `User ${targetUserId} and all related data deleted` })
}))

app.get('/cart', asyncHandler(async (req, res) => {
  const db = await ensureDb()
  const user = requireAuth(db, req, res)
  if (!user) return
  send(res, { items: db.carts[user.id] || [] })
}))

app.post('/cart/items', asyncHandler(async (req, res) => {
  const db = await ensureDb()
  const user = requireAuth(db, req, res)
  if (!user) return

  const productId = normalizeText(req.body?.product_id)
  const quantity = Math.max(1, asNumber(req.body?.quantity, 1))
  const product = db.products.find((item) => item.id === productId)
  if (!product) return fail(res, 404, 'Product not found')

  const cart = db.carts[user.id] || []
  const existing = cart.find((item) => item.product_id === productId)
  if (existing) existing.quantity += quantity
  else cart.push({ product_id: productId, quantity })
  db.carts[user.id] = cart
  await saveDb(db)
  send(res, { items: cart })
}))

app.delete('/cart/items/:productId', asyncHandler(async (req, res) => {
  const db = await ensureDb()
  const user = requireAuth(db, req, res)
  if (!user) return

  const cart = db.carts[user.id] || []
  db.carts[user.id] = cart.filter((item) => item.product_id !== req.params.productId)
  await saveDb(db)
  send(res, { items: db.carts[user.id] })
}))

app.post('/cart/checkout', asyncHandler(async (req, res) => {
  const db = await ensureDb()
  console.log(`📨 POST /cart/checkout: incoming request from ${req.ip}`)
  const user = requireAuth(db, req, res)
  if (!user) {
    console.log(`❌ POST /cart/checkout: auth failed`)
    return
  }
  console.log(`✅ POST /cart/checkout: auth OK, user=${user.id} (${user.username})`)

  const cart = db.carts[user.id] || []
  if (!cart.length) return fail(res, 400, 'Cart is empty')

  const createdOrders: Order[] = []
  for (const item of cart) {
    const product = db.products.find((p) => p.id === item.product_id)
    if (!product) continue
    
    // Check if enough stock available
    if ((product.stock || 0) < (item.quantity || 1)) {
      continue
    }
    
    const order: Order = {
      id: generateId('order'),
      product_id: product.id,
      product_name: product.title,
      seller_id: product.seller_id,
      seller_name: product.seller_name,
      buyer_id: user.id,
      buyer_name: user.username,
      price: product.price,
      quantity: item.quantity,
      status: 'pending',
      created_at: new Date().toISOString(),
    }
    db.orders.unshift(order)
    createdOrders.push(order)
    
    // Decrease product stock
    product.stock = Math.max(0, (product.stock || 0) - (item.quantity || 1))
    
    // Escrow: deduct money from buyer (held in system, not given to seller yet)
    user.balance -= order.price
    console.log(`💰 Escrow: deducted ${order.price} from buyer=${user.id}, balance=${user.balance}`)
    
    // Create chat thread and attach system message
    const thread = getOrCreateChatThread(db, product.seller_id, user.id, product)
    attachSystemMessage(thread, `🛍️ ${user.username} оформив покупку "${product.title}" за ${order.price} ₴`)
    console.log(`🛒 Checkout: user=${user.id} created order=${order.id} product=${product.id} seller=${product.seller_id}`)
  }

  db.carts[user.id] = []
  await saveDb(db)
  send(res, { orders: createdOrders, message: 'Checkout completed' })
}))

app.get('/orders', asyncHandler(async (req, res) => {
  // If this request looks like a browser navigation (accepts HTML),
  // serve the SPA entry so client-side routing can handle `/orders`.
  if (req.method === 'GET' && req.headers.accept && String(req.headers.accept).includes('text/html')) {
    return res.sendFile(path.join(distPath, 'index.html'))
  }
  const db = await ensureDb()
  const user = requireAuth(db, req, res)
  if (!user) return
  const items = user.role === 'admin'
    ? db.orders
    : db.orders.filter((order) => order.buyer_id === user.id || order.seller_id === user.id)
  send(res, items)
}))

// Public endpoint: global homepage summary shared by all users
app.get('/public/home-summary', asyncHandler(async (req, res) => {
  const db = await ensureDb()
  send(res, getGlobalHomeSummary(db))
}))

// Backward-compatible endpoint: just the popular products list
app.get('/public/popular-products', asyncHandler(async (req, res) => {
  const db = await ensureDb()
  const summary = getGlobalHomeSummary(db)
  send(res, summary.popularProducts)
}))

app.post('/orders', asyncHandler(async (req, res) => {
  const db = await ensureDb()
  console.log(`📨 POST /orders: incoming request from ${req.ip}`)
  const user = requireAuth(db, req, res)
  if (!user) {
    console.log(`❌ POST /orders: auth failed`)
    return
  }
  console.log(`✅ POST /orders: auth OK, user=${user.id} (${user.username})`)

  const productId = normalizeText(req.body?.product_id)
  const quantity = Math.max(1, asNumber(req.body?.quantity, 1))
  const product = db.products.find((item) => item.id === productId)
  if (!product) return fail(res, 404, 'Product not found')


  const order: Order = {
    id: generateId('order'),
    product_id: product.id,
    product_name: product.title,
    seller_id: product.seller_id,
    seller_name: product.seller_name,
    buyer_id: user.id,
    buyer_name: user.username,
    price: product.price * quantity,
    quantity,
    status: 'pending',
    created_at: new Date().toISOString(),
  }

  db.orders.unshift(order)
  
  // Escrow: deduct money from buyer (held in system, not given to seller yet)
  user.balance -= order.price
  console.log(`💰 Escrow: deducted ${order.price} from buyer=${user.id}, balance=${user.balance}`)
  
  // Create chat thread and attach system message
  const thread = getOrCreateChatThread(db, product.seller_id, user.id, product)
  attachSystemMessage(thread, `🛍️ ${user.username} оформив покупку "${product.title}" за ${order.price} ₴`)

  console.log(`🛒 Order created: user=${user.id} order=${order.id} product=${product.id} seller=${product.seller_id}`)
  await saveDb(db)
  send(res, { order }, 201)
}))

app.get('/orders/:id', asyncHandler(async (req, res) => {
  const db = await ensureDb()
  const user = requireAuth(db, req, res)
  if (!user) return

  const order = db.orders.find((item) => item.id === req.params.id)
  if (!order) return fail(res, 404, 'Order not found')
  if (user.role !== 'admin' && user.id !== order.buyer_id && user.id !== order.seller_id) return fail(res, 403, 'Forbidden')
  send(res, order)
}))

app.put('/orders/:id/status', asyncHandler(async (req, res) => {
  const db = await ensureDb()
  const user = requireAuth(db, req, res)
  if (!user) return

  const order = db.orders.find((item) => item.id === req.params.id)
  if (!order) return fail(res, 404, 'Order not found')
  if (user.role !== 'admin' && user.id !== order.seller_id && user.id !== order.buyer_id) return fail(res, 403, 'Forbidden')

  const status = String(req.body?.status || '').toLowerCase() as Order['status']
  if (!['pending', 'completed', 'disputed', 'refunded'].includes(status)) {
    return fail(res, 400, 'Invalid status')
  }

  // Prevent changing status again if already completed
  if (order.status === 'completed' && status === 'completed') {
    return fail(res, 409, 'Order already completed')
  }

  order.status = status
  if (status === 'completed') {
    order.completed_at = new Date().toISOString()
    
    // Escrow: transfer money from held escrow to seller
    // (money already deducted from buyer when order was created)
    const seller = db.users.find((u) => u.id === order.seller_id)
    
    if (seller) {
      seller.balance += order.price
      console.log(`💰 Order completed: escrow released to seller=${order.seller_id} balance=${seller.balance}`)
    }
    // Add system message about order confirmation
    const product = db.products.find((p) => p.id === order.product_id)
    if (product) {
      const thread = getOrCreateChatThread(db, order.seller_id, order.buyer_id, product)
      attachSystemMessage(thread, `✅ ${user.username} підтвердив(ла) доставку/замовлення "${order.product_name}".`, 'info')
      console.log(`ℹ️ Order completion message added to chat thread ${thread.id}`)
    }
  } else if (status === 'disputed') {
    // Dispute opened by user - money stays held (escrow)
    // Only support/admin can resolve dispute and release/refund money
    
    // Add system message to chat about dispute
    const product = db.products.find((p) => p.id === order.product_id)
    if (product) {
      const thread = getOrCreateChatThread(db, order.seller_id, order.buyer_id, product)
      attachSystemMessage(thread, `🚨 СПІР ВІДКРИТО: ${user.username} відкрив спір щодо замовлення "${order.product_name}". На розгляді...`, 'alert')
      console.log(`⚠️ Dispute message added to chat thread ${thread.id}`)
    }
  }
  
  await saveDb(db)
  send(res, order)
}))

app.get('/admin/disputes', asyncHandler(async (req, res) => {
  const db = await ensureDb()
  const user = requireRole(db, req, res, ['admin', 'support'])
  if (!user) return

  console.log(`🔍 GET /admin/disputes: total threads in DB = ${db.chats.length}`)
  db.chats.slice(0, 5).forEach((t) => {
    console.log(`   thread: ${t.id} seller=${t.seller_id} buyer=${t.buyer_id} messages=${t.messages?.length || 0}`)
  })

  // Return disputed orders enriched with the related chat thread (full history)
  const disputes = db.orders
    .filter((order) => order.status === 'disputed')
    .map((order) => {
      // Find all threads between buyer and seller (check both directions since thread order may vary)
      const threads = db.chats.filter((t) => {
        const isMatch = (t.seller_id === order.seller_id && t.buyer_id === order.buyer_id) ||
                        (t.seller_id === order.buyer_id && t.buyer_id === order.seller_id)
        return isMatch
      })

      console.log(`  📋 order=${order.id} seller=${order.seller_id} buyer=${order.buyer_id} → found=${threads.length} threads`)
      threads.forEach((t, i) => {
        console.log(`      [${i}] thread=${t.id} seller=${t.seller_id} buyer=${t.buyer_id} messages=${t.messages?.length || 0}`)
      })

      // Combine messages from all matching threads and sort by timestamp
      const combinedMessages = threads
        .flatMap((t) => (t.messages || []).map((m) => ({ ...m, _chatId: t.id })))
        .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())

      const combinedThread = threads.length > 0 ? {
        id: threads.map((t) => t.id).join(','),
        seller_id: order.seller_id,
        buyer_id: order.buyer_id,
        seller_name: threads[0]?.seller_name || null,
        buyer_name: threads[0]?.buyer_name || null,
        product_id: order.product_id,
        product_name: order.product_name,
        created_at: threads[threads.length - 1]?.created_at || new Date().toISOString(),
        updated_at: threads[0]?.updated_at || new Date().toISOString(),
        messages: combinedMessages,
      } : null

      return {
        ...order,
        chat: combinedThread,
        chat_threads_count: threads.length,
      }
    })

  send(res, disputes)
}))

app.post('/admin/disputes/:id/messages', asyncHandler(async (req, res) => {
  const db = await ensureDb()
  const resolver = requireRole(db, req, res, ['admin', 'support'])
  if (!resolver) return

  const order = db.orders.find((item) => item.id === req.params.id)
  if (!order) return fail(res, 404, 'Order not found')

  const text = normalizeText(req.body?.text)
  if (!text) return fail(res, 400, 'Message text is required')

  console.log(`📨 POST /admin/disputes/:id/messages: user=${resolver.username} order=${order.id} seller=${order.seller_id} buyer=${order.buyer_id}`)

  const now = new Date().toISOString()
  const threads = db.chats.filter((t) => {
    const isMatch = (t.seller_id === order.seller_id && t.buyer_id === order.buyer_id) ||
                    (t.seller_id === order.buyer_id && t.buyer_id === order.seller_id)
    return isMatch
  })

  console.log(`   Found ${threads.length} threads:`)
  threads.forEach((t, i) => {
    console.log(`   [${i}] thread=${t.id} seller=${t.seller_id} buyer=${t.buyer_id}`)
  })

  const created: any[] = []
  if (threads.length === 0) {
    // If no existing threads, create one between buyer and seller
    console.log(`   No threads found, creating new thread...`)
    const product = db.products.find((p) => p.id === order.product_id)
    const thread = getOrCreateChatThread(db, order.seller_id, order.buyer_id, product)
    console.log(`   Created thread: ${thread.id} seller=${thread.seller_id} buyer=${thread.buyer_id}`)
    const message = {
      id: generateId('msg'),
      sender_id: resolver.id,
      sender_name: resolver.username,
      sender_role: resolver.role,
      text,
      timestamp: now,
      isSystemMessage: false,
    }
    thread.messages.push(message)
    thread.updated_at = now
    created.push({ ...message, _chatId: thread.id })
  } else {
    threads.forEach((thread) => {
      console.log(`   Adding message to thread: ${thread.id}`)
      const message = {
        id: generateId('msg'),
        sender_id: resolver.id,
        sender_name: resolver.username,
        sender_role: resolver.role,
        text,
        timestamp: now,
        isSystemMessage: false,
      }
      thread.messages.push(message)
      thread.updated_at = now
      created.push({ ...message, _chatId: thread.id })
    })
  }

  await saveDb(db)
  send(res, { messages: created })
}))

app.post('/admin/disputes/:id/resolve', asyncHandler(async (req, res) => {
  const db = await ensureDb()
  const resolver = requireRole(db, req, res, ['admin', 'support'])
  if (!resolver) return

  const order = db.orders.find((item) => item.id === req.params.id)
  if (!order) return fail(res, 404, 'Order not found')
  const resolution = String(req.body?.resolution || '').toLowerCase()
  if (!['refund', 'seller'].includes(resolution)) return fail(res, 400, 'Invalid resolution')
  if (order.dispute_resolution) return fail(res, 409, 'Dispute already resolved')

  const buyer = db.users.find((item) => item.id === order.buyer_id)
  const seller = db.users.find((item) => item.id === order.seller_id)
  const amount = order.price
  const now = new Date().toISOString()

  if (resolution === 'refund') {
    if (buyer) buyer.balance += amount
    order.status = 'refunded'
  } else {
    if (seller) seller.balance += amount
    order.status = 'completed'
    order.completed_at = order.completed_at || now
  }

  order.dispute_resolution = resolution as 'refund' | 'seller'
  order.dispute_resolved_by = resolver.username
  order.dispute_resolved_at = now

  const thread = getOrCreateChatThread(db, order.seller_id, order.buyer_id)
  attachSystemMessage(thread, `⚖️ Спір по замовленню ${order.id} вирішено: ${resolution === 'refund' ? 'кошти повернено покупцю' : 'кошти передано продавцю'}.`, 'alert')

  await saveDb(db)
  send(res, { users: db.users.map(publicUser), orders: db.orders, chats: db.chats, order })
}))

app.get('/admin/chat-count', asyncHandler(async (req, res) => {
  const db = await ensureDb()
  const user = requireAuth(db, req, res)
  if (!user) return

  // Only admin/support can see total chat count
  if (user.role !== 'admin' && user.role !== 'support') {
    return fail(res, 403, 'Forbidden', ['Only admin/support can view total chat count'])
  }

  send(res, { count: db.chats.length })
}))

app.get('/chat/threads', asyncHandler(async (req, res) => {
  const db = await ensureDb()
  const user = requireAuth(db, req, res)
  if (!user) return

  // Only return threads where the authenticated user participates.
  // Admin/support should not see all personal chats in the chat list.
  const threads = db.chats.filter((thread) => thread.buyer_id === user.id || thread.seller_id === user.id)
  send(res, threads)
}))

app.post('/chat/threads', asyncHandler(async (req, res) => {
  const db = await ensureDb()
  const user = requireAuth(db, req, res)
  if (!user) return

  const sellerId = normalizeText(req.body?.seller_id)
  const buyerId = normalizeText(req.body?.buyer_id) || user.id
  const productId = normalizeText(req.body?.product_id)
  const product = productId ? db.products.find((item) => item.id === productId) : undefined
  const thread = getOrCreateChatThread(db, sellerId, buyerId, product)
  console.log(`POST /chat/threads: user=${user.id} requested seller=${sellerId} buyer=${buyerId} -> thread=${thread.id}`)
  await saveDb(db)
  send(res, thread, 201)
}))

app.get('/chat/threads/:id/messages', asyncHandler(async (req, res) => {
  const db = await ensureDb()
  const user = requireAuth(db, req, res)
  if (!user) return

  const thread = db.chats.find((item) => item.id === req.params.id)
  if (!thread) return fail(res, 404, 'Thread not found')
  // Only participants may view thread messages. Admin/support do not get blanket access here.
  if (thread.buyer_id !== user.id && thread.seller_id !== user.id) {
    return fail(res, 403, 'Forbidden')
  }
  send(res, thread.messages)
}))

// Admin DB seed: generate test data
app.post('/admin/db-seed/generate', asyncHandler(async (req, res) => {
  const db = await ensureDb()
  const admin = requireRole(db, req, res, ['admin'])
  if (!admin) return

  const payload = req.body || {}
  const entities: string[] = Array.isArray(payload.entities) ? payload.entities : []
  const counts = payload.counts || {}
  const batchName = normalizeText(payload.batchName) || undefined

  const batchId = makeBatchId()
  seedBatchMap[batchId] = { id: batchId, name: batchName, stage: 'pending', progress: 0, message: 'Queued' };

  // Run generation asynchronously but report immediate batchId
  (async () => {
    try {
      updateBatch(batchId, { stage: 'started', progress: 0, message: 'Initializing' })
      const db2 = await ensureDb()

      let totalSteps = 0
      let doneSteps = 0
      const steps: Array<() => Promise<void>> = []

      if (entities.includes('users') || counts.users) {
        const c = Number(counts.users || 0)
        totalSteps += c > 0 ? c : 0
        steps.push(async () => {
          updateBatch(batchId, { stage: 'generating users', message: 'Generating users' })
          const createdUsers = generateUsers(db2, batchId, c)
          rememberBatchIds(batchId, 'userIds', createdUsers.map((user) => user.id))
          doneSteps += c
        })
      }

      if (entities.includes('products') || counts.products) {
        const c = Number(counts.products || 0)
        totalSteps += c > 0 ? c : 0
        steps.push(async () => {
          updateBatch(batchId, { stage: 'generating products', message: 'Generating products' })
          const createdProducts = generateProducts(db2, batchId, c)
          rememberBatchIds(batchId, 'productIds', createdProducts.map((product) => product.id))
          doneSteps += c
        })
      }

      if (entities.includes('orders') || counts.orders) {
        const c = Number(counts.orders || 0)
        totalSteps += c > 0 ? c : 0
        steps.push(async () => {
          updateBatch(batchId, { stage: 'generating orders', message: 'Generating orders' })
          const createdOrders = generateOrders(db2, batchId, c)
          rememberBatchIds(batchId, 'orderIds', createdOrders.map((order) => order.id))
          doneSteps += c
        })
      }

      if (entities.includes('reviews') || counts.reviews) {
        const c = Number(counts.reviews || 0)
        totalSteps += c > 0 ? c : 0
        steps.push(async () => {
          updateBatch(batchId, { stage: 'generating reviews', message: 'Generating reviews' })
          const createdReviews = generateReviews(db2, batchId, c)
          rememberBatchIds(batchId, 'reviewIds', createdReviews.map((review) => review.id))
          doneSteps += c
        })
      }

      // Execute steps sequentially and persist after each step
      for (let i = 0; i < steps.length; i++) {
        await steps[i]()
        const progress = totalSteps > 0 ? Math.round((doneSteps / totalSteps) * 100) : Math.round(((i + 1) / steps.length) * 100)
        updateBatch(batchId, { progress, message: `Step ${i + 1} of ${steps.length} completed` })
        // Persist snapshot in background to avoid blocking generation
        enqueueSaveSnapshot({
          users: db2.users,
          products: db2.products,
          reviews: db2.reviews,
          orders: db2.orders,
          chats: db2.chats,
          carts: db2.carts,
          catalog_categories: db2.catalog_categories,
        })
      }

      updateBatch(batchId, { stage: 'completed', progress: 100, message: 'Generation completed' })
    } catch (err) {
      console.error('DB-seed generation failed', err)
      updateBatch(batchId, { stage: 'failed', message: String(err) })
    }
  })()

  send(res, { batchId })
}))

// Admin DB seed: delete batch
app.post('/admin/db-seed/delete', asyncHandler(async (req, res) => {
  const db = await ensureDb()
  const admin = requireRole(db, req, res, ['admin'])
  if (!admin) return

  const batchId = normalizeText(req.body?.batchId)
  if (!batchId) return fail(res, 400, 'batchId is required')
  // Ensure a batch entry exists so the client can poll status
  if (!seedBatchMap[batchId]) {
    seedBatchMap[batchId] = { id: batchId, name: undefined, stage: 'deleting', progress: 0, message: 'Queued for deletion' }
  } else {
    updateBatch(batchId, { stage: 'deleting', progress: 0, message: 'Deleting records' })
  }

  // Run deletion asynchronously and return immediately so UI can poll
  (async () => {
    try {
      updateBatch(batchId, { stage: 'deleting', progress: 0, message: 'Deleting records' })
      const db2 = await ensureDb()
      const trackedUserIds = getBatchIds(batchId, 'userIds')
      const trackedProductIds = getBatchIds(batchId, 'productIds')
      const trackedOrderIds = getBatchIds(batchId, 'orderIds')
      const trackedReviewIds = getBatchIds(batchId, 'reviewIds')
      const starts = (id: string) => id && id.startsWith(batchId)
      const matchesTracked = (id: string, trackedIds: string[]) => trackedIds.length > 0 ? trackedIds.includes(id) : starts(id)

      // Remove records by type and update progress between steps
      const totalTypes = 5
      let doneTypes = 0

      db2.users = db2.users.filter((u) => !matchesTracked(u.id, trackedUserIds))
      doneTypes += 1
      updateBatch(batchId, { progress: Math.round((doneTypes / totalTypes) * 100), message: 'Users removed' })

      db2.products = db2.products.filter((p) => !matchesTracked(p.id, trackedProductIds))
      doneTypes += 1
      updateBatch(batchId, { progress: Math.round((doneTypes / totalTypes) * 100), message: 'Products removed' })

      db2.orders = db2.orders.filter((o) => !matchesTracked(o.id, trackedOrderIds))
      doneTypes += 1
      updateBatch(batchId, { progress: Math.round((doneTypes / totalTypes) * 100), message: 'Orders removed' })

      db2.reviews = db2.reviews.filter((r) => !matchesTracked(r.id, trackedReviewIds))
      doneTypes += 1
      updateBatch(batchId, { progress: Math.round((doneTypes / totalTypes) * 100), message: 'Reviews removed' })

      // Remove chat threads created by batch
      db2.chats = db2.chats.filter((t) => !starts(t.id))
      doneTypes += 1
      updateBatch(batchId, { progress: 100, message: 'Chats removed' })

      // Unlink product references in orders/reviews if product removed
      db2.reviews = db2.reviews.map((review) => review.product_id && (trackedProductIds.includes(String(review.product_id)) || starts(String(review.product_id))) ? { ...review, product_id: null } : review)
      db2.orders = db2.orders.map((order) => order.product_id && (trackedProductIds.includes(String(order.product_id)) || starts(String(order.product_id))) ? { ...order, product_id: null } : order)

      await saveDb(db2)
      updateBatch(batchId, { stage: 'deleted', progress: 100, message: 'Deletion completed' })
      // Clear products cache now that DB was modified
      clearProductsCache()
    } catch (err) {
      console.error('DB-seed deletion failed', err)
      updateBatch(batchId, { stage: 'failed', message: String(err) })
    }
  })()

  // Return immediately with batchId so client can poll
  send(res, { batchId })
}))

app.get('/admin/db-seed/status/:id', asyncHandler(async (req, res) => {
  const db = await ensureDb()
  const admin = requireRole(db, req, res, ['admin'])
  if (!admin) return
  const id = normalizeText(req.params.id)
  const status = seedBatchMap[id] || null
  send(res, status)
}))

app.post('/chat/threads/:id/messages', asyncHandler(async (req, res) => {
  const db = await ensureDb()
  const user = requireAuth(db, req, res)
  if (!user) return

  const thread = db.chats.find((item) => item.id === req.params.id)
  if (!thread) return fail(res, 404, 'Thread not found')
  // Only participants may post messages to a thread.
  if (thread.buyer_id !== user.id && thread.seller_id !== user.id) {
    return fail(res, 403, 'Forbidden')
  }

  const text = normalizeText(req.body?.text)
  if (!text) return fail(res, 400, 'Message text is required')

  const message: ChatMessage = {
    id: generateId('msg'),
    sender_id: normalizeText(req.body?.sender_id) || user.id,
    sender_name: normalizeText(req.body?.sender_name) || user.username,
    sender_role: (req.body?.sender_role || user.role) as Role,
    text,
    timestamp: new Date().toISOString(),
    isSystemMessage: Boolean(req.body?.isSystemMessage),
  }
  thread.messages.push(message)
  thread.updated_at = message.timestamp
  await saveDb(db)
  send(res, message, 201)
}))

// SPA fallback: serve index.html for all non-API routes
app.use((req, res, next) => {
  // If request doesn't match any API routes and doesn't have a file extension,
  // serve index.html so React Router can handle the route
  if (!req.path.startsWith('/api') && !req.path.includes('.')) {
    return res.sendFile(path.join(distPath, 'index.html'))
  }
  next()
})

const bootstrap = async () => {
  const storedSessions = await loadSessions()
  console.log(`📦 Завантажено ${storedSessions.size} сесій з MySQL`)
  storedSessions.forEach((userId, token) => {
    sessions.set(token, userId)
    console.log(`   - токен: ${token.slice(0, 8)}... → userId: ${userId}`)
  })
  console.log(`✅ Сесії завантажено в пам'ять. Всього в Map: ${sessions.size}`)

  const maxPortRetries = 20

  const startServer = (port: number, attempt = 0) => {
    const server = app.listen(port, '0.0.0.0', () => {
      console.log(`Dropzone backend running on http://0.0.0.0:${port} (listen on all network interfaces)`)
    })

    server.on('error', (error: NodeJS.ErrnoException) => {
      if (error.code === 'EADDRINUSE' && attempt < maxPortRetries) {
        const nextPort = port + 1
        console.warn(`Port ${port} is busy, retrying on ${nextPort}...`)
        startServer(nextPort, attempt + 1)
        return
      }

      console.error('Failed to start backend server:', error)
      process.exit(1)
    })
  }

  startServer(PORT)
}

void bootstrap()
