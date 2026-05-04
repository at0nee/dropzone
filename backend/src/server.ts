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

// Setup CORS and JSON parsing
app.use(cors({ origin: true, credentials: true }))
app.use(express.json())

// Serve frontend static files (React dist) from root
const distPath = path.join(__dirname, '..', 'dist')
app.use(express.static(distPath))

const asyncHandler = (fn: (req: Request, res: Response) => Promise<void>) => {
  return (req: Request, res: Response) => {
    Promise.resolve(fn(req, res)).catch((_error) => {
      res.status(500).json({ success: false, error: 'Internal server error' })
    })
  }
}

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
  const iconById: Record<string, string> = {
    games: '🎮',
    subscriptions: '📱',
    keys: '🔑',
    cs2: '🎯',
    dota2: '🛡️',
    valorant: '⚡',
    pubg: '🔫',
    fortnite: '🧱',
    telegram: '✈️',
    spotify: '🎵',
    discord: '💬',
    youtube: '▶️',
    windows: '🪟',
    office: '📄',
  }
  const iconFor = (id: string, fallback = '📦') => iconById[id] || fallback

  return {
    categories: tree.map((category) => ({
      id: category.id,
      name: category.name,
      parent_id: category.parent_id,
      sort_order: category.sort_order,
      created_at: category.created_at,
      updated_at: category.updated_at,
      icon: iconFor(category.id, '🗂️'),
      children: category.children.map((child) => ({
        id: child.id,
        name: child.name,
        parent_id: child.parent_id,
        sort_order: child.sort_order,
        created_at: child.created_at,
        updated_at: child.updated_at,
        icon: iconFor(child.id),
      })),
    })),
    apps: tree.flatMap((category) => category.children.map((child) => ({
      id: child.id,
      name: child.name,
      category: category.id,
      icon: '📦',
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
  }
  return thread
}

const attachSystemMessage = (thread: NonNullable<ReturnType<typeof getOrCreateChatThread>>, text: string) => {
  const message: ChatMessage = {
    id: generateId('msg'),
    sender_id: 'system',
    sender_name: 'System',
    sender_role: 'system',
    text,
    timestamp: new Date().toISOString(),
    isSystemMessage: true,
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

  if (db.users.some((user) => user.email.toLowerCase() === email.toLowerCase())) {
    return fail(res, 409, 'User already exists')
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
  const page = Math.max(1, asNumber(req.query.page, 1))
  const pageSize = Math.min(100, Math.max(1, asNumber(req.query.pageSize, 12)))

  const items = db.products
    .filter((product) => {
      const matchesSearch = !search || [product.title, product.description, product.seller_name].join(' ').toLowerCase().includes(search)
      const matchesCategory = !category || product.category.toLowerCase() === category || (product.subcategory || '').toLowerCase() === category
      const hasStock = (product.stock || 0) > 0
      return matchesSearch && matchesCategory && hasStock
    })
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

  const sliced = items.slice((page - 1) * pageSize, page * pageSize).map((product) => publicProduct(product, db))
  send(res, { items: sliced, total: items.length, page, pageSize })
}))

// Provide catalog apps/categories for frontend UI
app.get('/catalog/apps', asyncHandler(async (_req, res) => {
  const db = await ensureDb()
  send(res, buildCatalogApiPayload(db.catalog_categories))
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

  const duplicate = db.catalog_categories.some((category) =>
    category.parent_id === parentId && category.name.toLowerCase() === name.toLowerCase()
  )
  if (duplicate) return fail(res, 409, 'Category already exists')

  const category: CatalogCategory = {
    id: createCatalogCategoryId(name),
    name,
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
  const rawParentId = req.body?.parent_id === null ? null : req.body?.parent_id
  const parentId = rawParentId === null ? null : resolveCatalogParentId(db, rawParentId) || category.parent_id
  const sortOrder = typeof req.body?.sort_order !== 'undefined' ? Math.max(0, asNumber(req.body?.sort_order, category.sort_order)) : category.sort_order

  if (!name) return fail(res, 400, 'Validation error', ['name is required'])
  if (parentId === category.id) return fail(res, 400, 'Category cannot be its own parent')
  if (parentId && !db.catalog_categories.some((item) => item.id === parentId)) {
    return fail(res, 404, 'Parent category not found')
  }
  if (wouldCreateCatalogCycle(db, category.id, parentId)) {
    return fail(res, 400, 'Category hierarchy cycle detected')
  }

  const duplicate = db.catalog_categories.some((item) =>
    item.id !== category.id && item.parent_id === parentId && item.name.toLowerCase() === name.toLowerCase()
  )
  if (duplicate) return fail(res, 409, 'Category already exists')

  category.name = name
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
  const category = normalizeText(payload.category || 'games')
  const subcategory = normalizeText(payload.subcategory)
  if (!title || !description || !price) {
    return fail(res, 400, 'Validation error', ['title, description, price are required'])
  }

  const product: Product = {
    id: generateId('prod'),
    title,
    description,
    price,
    stock,
    category,
    subcategory: subcategory || undefined,
    image_url: normalizeText(payload.image_url) || undefined,
    images: Array.isArray(payload.images) ? payload.images.filter(Boolean) : [],
    seller_id: user.id,
    seller_name: user.username,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }

  db.products.unshift(product)
  await saveDb(db)
  send(res, publicProduct(product, db), 201)
}))

app.put('/products/:id', asyncHandler(async (req, res) => {
  const db = await ensureDb()
  const user = requireAuth(db, req, res)
  if (!user) return

  const product = db.products.find((item) => item.id === req.params.id)
  if (!product) return fail(res, 404, 'Product not found')
  if (user.role !== 'admin' && product.seller_id !== user.id) {
    return fail(res, 403, 'Forbidden')
  }

  const payload = req.body || {}
  product.title = normalizeText(payload.title ?? product.title)
  product.description = normalizeText(payload.description ?? product.description)
  product.price = asNumber(payload.price ?? product.price)
  product.stock = asNumber(payload.stock ?? payload.quantity ?? product.stock)
  product.category = normalizeText(payload.category ?? product.category)
  product.subcategory = normalizeText((payload.subcategory ?? product.subcategory) || '') || undefined
  product.image_url = normalizeText((payload.image_url ?? product.image_url) || '') || undefined
  product.images = Array.isArray(payload.images) ? payload.images.filter(Boolean) : product.images
  product.updated_at = new Date().toISOString()

  await saveDb(db)
  send(res, publicProduct(product, db))
}))

app.delete('/products/:id', asyncHandler(async (req, res) => {
  const db = await ensureDb()
  const user = requireAuth(db, req, res)
  if (!user) return

  const index = db.products.findIndex((item) => item.id === req.params.id)
  if (index === -1) return fail(res, 404, 'Product not found')
  const target = db.products[index]
  if (user.role !== 'admin' && target.seller_id !== user.id) {
    return fail(res, 403, 'Forbidden')
  }

  // Remove dependent rows before deleting the product so saveDb() does not hit FK failures.
  db.orders = db.orders.filter((order) => order.product_id !== target.id)
  db.reviews = db.reviews.filter((review) => review.product_id !== target.id)
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
  await saveDb(db)
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
  const text = normalizeText(req.body?.text || req.body?.comment)
  const orderId = normalizeText(req.body?.order_id)
  const product = db.products.find((item) => item.id === productId)
  if (!product) return fail(res, 404, 'Product not found')

  const review: Review = {
    id: generateId('rev'),
    product_id: product.id,
    seller_id: product.seller_id,
    buyer_id: user.id,
    buyer_name: user.username,
    rating,
    text,
    comment: text,
    order_id: orderId || undefined,
    product_title: product.title,
    created_at: new Date().toISOString(),
  }

  db.reviews.unshift(review)
  calculateSellerStats(db, product.seller_id)
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
  if (typeof payload.username === 'string') target.username = payload.username
  if (typeof payload.name === 'string') target.name = payload.name
  if (typeof payload.avatar === 'string') target.avatar = payload.avatar
  if (typeof payload.email === 'string') target.email = payload.email
  if (typeof payload.balance !== 'undefined') target.balance = asNumber(payload.balance, target.balance)
  if (current.role === 'admin' && typeof payload.role === 'string') target.role = payload.role as Role
  target.updated_at = new Date().toISOString()

  await saveDb(db)
  send(res, publicUser(target))
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
  
  const user = requireAuth(db, req, res)
  if (!user) {
    
    return
  }
  

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
    
    // Create chat thread and attach system message
    const thread = getOrCreateChatThread(db, product.seller_id, user.id, product)
    attachSystemMessage(thread, `🛍️ ${user.username} оформив покупку "${product.title}" за ${order.price} ₴`)
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

app.post('/orders', asyncHandler(async (req, res) => {
  const db = await ensureDb()
  
  const user = requireAuth(db, req, res)
  if (!user) {
    
    return
  }
  

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
  
  // Create chat thread and attach system message
  const thread = getOrCreateChatThread(db, product.seller_id, user.id, product)
  attachSystemMessage(thread, `🛍️ ${user.username} оформив покупку "${product.title}" за ${order.price} ₴`)

  
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
    }
  } else if (status === 'disputed') {
    // Dispute opened by user - money stays held (escrow)
    // Only support/admin can resolve dispute and release/refund money
    
    // Add system message to chat about dispute
    const product = db.products.find((p) => p.id === order.product_id)
    if (product) {
      const thread = getOrCreateChatThread(db, order.seller_id, order.buyer_id, product)
      attachSystemMessage(thread, `🚨 СПІР ВІДКРИТО: ${user.username} відкрив спір щодо замовлення "${order.product_name}". На розгляді...`)
    }
  }
  
  await saveDb(db)
  send(res, order)
}))

app.get('/admin/disputes', asyncHandler(async (req, res) => {
  const db = await ensureDb()
  const user = requireRole(db, req, res, ['admin', 'support'])
  if (!user) return

  

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

  

  const now = new Date().toISOString()
  const threads = db.chats.filter((t) => {
    const isMatch = (t.seller_id === order.seller_id && t.buyer_id === order.buyer_id) ||
                    (t.seller_id === order.buyer_id && t.buyer_id === order.seller_id)
    return isMatch
  })

  

  const created: any[] = []
  if (threads.length === 0) {
    // If no existing threads, create one between buyer and seller
    
    const product = db.products.find((p) => p.id === order.product_id)
    const thread = getOrCreateChatThread(db, order.seller_id, order.buyer_id, product)
    
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
  }

  order.dispute_resolution = resolution as 'refund' | 'seller'
  order.dispute_resolved_by = resolver.username
  order.dispute_resolved_at = now

  const thread = getOrCreateChatThread(db, order.seller_id, order.buyer_id)
  const systemMessage = {
    id: generateId('msg'),
    sender_id: resolver.id,
    sender_name: resolver.username,
    sender_role: resolver.role,
    text: `Dispute resolved: ${order.dispute_resolution}`,
    timestamp: now,
    isSystemMessage: true,
  }
  thread.messages.push(systemMessage)
  thread.updated_at = now

  await saveDb(db)
  send(res, { order })
}))

app.post('/chat/threads', asyncHandler(async (req, res) => {
  const db = await ensureDb()
  const user = requireAuth(db, req, res)
  if (!user) return

  const sellerId = normalizeText(req.body?.seller_id)
  const buyerId = normalizeText(req.body?.buyer_id) || user.id
  const productId = normalizeText(req.body?.product_id)
  const product = productId ? db.products.find((p) => p.id === productId) : undefined
  const thread = getOrCreateChatThread(db, sellerId, buyerId, product)
  
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

app.get('/', asyncHandler(async (_req, res) => {
  send(res, { name: 'Dropzone Backend', status: 'ok' })
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
  storedSessions.forEach((userId, token) => {
    sessions.set(token, userId)
  })

  const maxPortRetries = 20

  const startServer = (port: number, attempt = 0) => {
    const server = app.listen(port, '0.0.0.0', () => {
      console.log(`Server listening at http://localhost:${port}`)
    })

    server.on('error', (error: NodeJS.ErrnoException) => {
      if (error.code === 'EADDRINUSE' && attempt < maxPortRetries) {
        const nextPort = port + 1
        startServer(nextPort, attempt + 1)
        return
      }

      process.exit(1)
    })
  }

  startServer(PORT)
}

void bootstrap()
