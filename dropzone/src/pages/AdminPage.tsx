import React, { useEffect, useMemo, useState, useRef } from 'react'
import VirtualList from '../components/VirtualList/VirtualList'
import { ArrowLeft, CheckCircle2, MessageCircle, Shield, Users, AlertTriangle, RefreshCw, Search, BadgeInfo, Trash2, Coins, X, Eye } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'
import { User, UserRole, CatalogCategory } from '../types'
import { appendChatMessageToSellerThread, findStoredUserById, getStoredChats, getStoredOrders, getStoredUsers, getStoredReviews, resolveDispute, updateStoredUserRole, getStoredProducts, saveStoredProducts, saveStoredUsers, saveStoredReviews, getAdminLogs, appendAdminLog, clearAdminLogs } from '../utils/adminData'
import api, { balanceService, catalogService, type WithdrawalRequest } from '../services/api'
import CustomSelect from '../components/CustomSelect/CustomSelect'
import { CATEGORY_ICON_FALLBACK, CATEGORY_ICON_OPTIONS, CatalogIconBadge, getCatalogIconOption } from '../utils/catalogIcons'
import { useToast } from '../components/Toast'
import './AdminPage.css'

type AdminTab = 'overview' | 'users' | 'disputes' | 'withdrawals' | 'products' | 'catalog' | 'reviews' | 'dbtools'
type WithdrawalAction = 'complete' | 'refund'

const roleOptions: Array<{ value: UserRole; label: string }> = [
  { value: 'user', label: 'Користувач' },
  { value: 'support', label: 'Сапорт' },
  { value: 'admin', label: 'Адмін' },
]

const roleLabel: Record<UserRole, string> = {
  user: 'Користувач',
  support: 'Сапорт',
  admin: 'Адмін',
}

const batchStageLabel: Record<string, string> = {
  queued: 'Очікує запуску',
  started: 'Підготовка',
  'generating users': 'Генерація користувачів',
  'generating products': 'Генерація товарів',
  'generating orders': 'Генерація замовлень',
  'generating reviews': 'Генерація відгуків',
  completed: 'Завершено',
  deleting: 'Видалення',
  deleted: 'Видалено',
  failed: 'Помилка',
}

type ImageViewerState = {
  src: string
  name: string
  zoom: number
  offsetX: number
  offsetY: number
}

const flattenCatalogCategories = (categories: CatalogCategory[]) => {
  const flat: CatalogCategory[] = []
  const walk = (items: CatalogCategory[]) => {
    items.forEach((item) => {
      flat.push({ ...item, children: item.children || [] })
      if (item.children?.length) walk(item.children)
    })
  }
  walk(categories)
  return flat
}

const buildCategoryOptionLabel = (category: CatalogCategory, categories: CatalogCategory[]) => {
  const depthOf = (current: CatalogCategory): number => {
    let depth = 0
    let cursor: CatalogCategory | undefined = current
    const visited = new Set<string>()

    while (cursor?.parent_id) {
      const parent = categories.find((item) => item.id === cursor?.parent_id)
      if (!parent) break
      if (visited.has(parent.id)) break
      visited.add(parent.id)
      depth += 1
      cursor = parent
      if (depth > 20) break
    }

    return depth
  }

  return `${'— '.repeat(depthOf(category))}${category.name}`
}

const AdminPage: React.FC = () => {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const { showToast } = useToast()
  const role = user?.role ?? 'user'
  const isAdmin = role === 'admin'

  const defaultTab: AdminTab = isAdmin ? 'overview' : role === 'support' ? 'disputes' : 'overview'
  const [activeTab, setActiveTab] = useState<AdminTab>(defaultTab)
  const [users, setUsers] = useState<User[]>([])
  const [orders, setOrders] = useState<any[]>([])
  const [chats, setChats] = useState<any[]>([])
  const [chatCount, setChatCount] = useState(0)
  const [products, setProducts] = useState<any[]>([])
  const [reviews, setReviews] = useState<any[]>([])
  const [withdrawals, setWithdrawals] = useState<WithdrawalRequest[]>([])
  const [selectedWithdrawal, setSelectedWithdrawal] = useState<WithdrawalRequest | null>(null)
  const [pendingWithdrawalAction, setPendingWithdrawalAction] = useState<{ request: WithdrawalRequest; action: WithdrawalAction } | null>(null)
  const [withdrawalProcessing, setWithdrawalProcessing] = useState<Record<string, boolean>>({})
  const [productsTotal, setProductsTotal] = useState<number | null>(null)
  const [catalogCategories, setCatalogCategories] = useState<CatalogCategory[]>([])
  const [selectedDisputeId, setSelectedDisputeId] = useState('')
  const [productSearch, setProductSearch] = useState('')
  const [reviewSearch, setReviewSearch] = useState('')
  const [visibleReviewsCount, setVisibleReviewsCount] = useState(50)
  const [productToDelete, setProductToDelete] = useState<string | null>(null)
  const [debugLogs, setDebugLogs] = useState<any[]>([])
  const [connectionStatus, setConnectionStatus] = useState<'unknown' | 'connected' | 'disconnected' | 'mock'>('unknown')
  const [lastCheckedAt, setLastCheckedAt] = useState<string | null>(null)
  const [showLogsPanel, setShowLogsPanel] = useState(false)
  const [userSearch, setUserSearch] = useState('')
  const [supportMessage, setSupportMessage] = useState('')
  const [pendingResolution, setPendingResolution] = useState<'refund' | 'seller' | null>(null)
  const [loading, setLoading] = useState(true)
  const [editingBalance, setEditingBalance] = useState<Record<string, number>>({})
  const [openRoleMenu, setOpenRoleMenu] = useState<string | null>(null)
  const [categoryName, setCategoryName] = useState('')
  const [categoryIcon, setCategoryIcon] = useState(CATEGORY_ICON_FALLBACK)
  const [categoryParentId, setCategoryParentId] = useState('')
  const [categorySortOrder, setCategorySortOrder] = useState(0)
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null)
  const [deleteConfirmModal, setDeleteConfirmModal] = useState<{ userId: string; username: string } | null>(null)
  // DB tools (admin) state
  const [dbEntities, setDbEntities] = useState<{ users: boolean; products: boolean; orders: boolean; reviews: boolean }>({ users: false, products: false, orders: false, reviews: false })
  const [batchDeleteConfirm, setBatchDeleteConfirm] = useState(false)
  const [batchDeleteTarget, setBatchDeleteTarget] = useState<string | null>(null)
  const [showGeneratedDeleteModal, setShowGeneratedDeleteModal] = useState(false)
  const [lastRequestedEntities, setLastRequestedEntities] = useState<string[] | null>(null)
  // UI behavior: require users to be selected when generating products/orders/reviews
  const [dbCounts, setDbCounts] = useState<{ users?: number; products?: number; orders?: number; reviews?: number }>({})
  const [currentBatchId, setCurrentBatchId] = useState<string | null>(null)
  const [batchStatus, setBatchStatus] = useState<any | null>(null)
  const [polling, setPolling] = useState(false)
  const [imageViewer, setImageViewer] = useState<ImageViewerState | null>(null)
  const imagePanRef = useRef<{ dragging: boolean; startX: number; startY: number; startOffsetX: number; startOffsetY: number; pointerId: number | null }>(
    {
    dragging: false,
    startX: 0,
    startY: 0,
    startOffsetX: 0,
    startOffsetY: 0,
    pointerId: null,
  })
  const [visibleUsersCount, setVisibleUsersCount] = useState(70)
  const [adminProductsPage, setAdminProductsPage] = useState(1)
  const [adminProductsPageSize] = useState(200)
  const [adminProductsLoadingMore, setAdminProductsLoadingMore] = useState(false)
  const backendBaseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000'
  // Backend is enabled if explicitly set OR if we have localStorage auth (means backend worked before)
  const backendEnabled = Boolean(backendBaseUrl) || Boolean(localStorage.getItem('auth_token'))

  const loadData = async () => {
    const storedLogs = getAdminLogs()

    if (!backendEnabled) {
      const storedUsers = getStoredUsers()
      const storedOrders = getStoredOrders()
      const storedChats = getStoredChats()
      const storedProducts = getStoredProducts()
      const storedReviews = getStoredReviews()

      setUsers(storedUsers)
      setOrders(storedOrders)
      setChats(storedChats)
      setChatCount(storedChats.length)
      setProducts(storedProducts)
      setReviews(storedReviews)
      setDebugLogs(storedLogs)

      const firstDispute = storedOrders.find((order) => order.status === 'disputed')
      setSelectedDisputeId((current) => current || firstDispute?.id || '')
      setLoading(false)
      return
    }

    try {
      if (role === 'support' && !isAdmin) {
        const [disputesRes, reviewsRes] = await Promise.all([
          api.get('/admin/disputes').catch(() => ({ data: { data: [] } })),
          api.get('/reviews').catch(() => ({ data: { data: [] } })),
        ])

        const nextDisputes = disputesRes.data?.data ?? []
        const nextReviews = reviewsRes.data?.data ?? []

        setUsers(getStoredUsers())
        setOrders(nextDisputes)
        setChats([])
        setChatCount(0)
        setProducts(getStoredProducts())
        setReviews(nextReviews)
        setWithdrawals([])
        setCatalogCategories([])
        setDebugLogs(storedLogs)

        const firstDispute = nextDisputes.find((order: any) => order.status === 'disputed')
        setSelectedDisputeId((current) => current || firstDispute?.id || '')
        return
      }

      const [usersRes, ordersRes, chatsRes, productsRes, catalogRes, disputesRes, reviewsRes, withdrawalsRes] = await Promise.all([
        api.get('/users'),
        api.get('/orders'),
        isAdmin ? api.get('/admin/chat-count') : api.get('/chat/threads'),
        api.get('/products', { params: { page: 1, pageSize: adminProductsPageSize, includeOutOfStock: true } }),
        catalogService.getAdminCategories(),
        api.get('/admin/disputes').catch(() => ({ data: { data: [] } })), // Disputes endpoint might not exist
        api.get('/reviews').catch(() => ({ data: { data: [] } })),
        isAdmin ? balanceService.getAdminWithdrawals().catch(() => ({ data: { data: [] } })) : Promise.resolve({ data: { data: [] } }),
      ])

      const nextUsers = usersRes.data?.data ?? []
      const nextOrders = ordersRes.data?.data ?? []
      // For admin, chatsRes contains { count: number }, for regular users it's array of threads
      const nextChats = isAdmin ? [] : (chatsRes.data?.data ?? [])
      const nextChatCount = isAdmin ? (chatsRes.data?.data?.count ?? 0) : nextChats.length
      const nextDisputes = disputesRes.data?.data ?? []
      const nextReviews = reviewsRes.data?.data ?? []
      const nextWithdrawals = withdrawalsRes.data?.data ?? []
      
      // If we got disputes with chat data, merge them with orders
      if (nextDisputes.length > 0) {
        // Replace orders with disputed data if available
        const disputeIds = new Set(nextDisputes.map((d: any) => d.id))
        const nonDisputedOrders = nextOrders.filter((o: any) => !disputeIds.has(o.id))
        setOrders([...nextDisputes, ...nonDisputedOrders])
      } else {
        setOrders(nextOrders)
      }
      
      const rawProducts = productsRes.data?.data?.items ?? productsRes.data?.data ?? []
      // Dedupe products by id in case of backend/client mismatch
      const prodMap = new Map<string, any>()
      for (const p of rawProducts) prodMap.set(p.id, p)
      const nextProducts = Array.from(prodMap.values())
      const nextProductsTotal = productsRes.data?.data?.total ?? nextProducts.length
      const nextCatalog = flattenCatalogCategories(catalogRes.data?.data?.categories ?? [])

      setUsers(nextUsers)
      setChats(nextChats)
      setChatCount(nextChatCount)
      setProducts(nextProducts)
      setReviews(nextReviews)
      setWithdrawals(nextWithdrawals)
      setProductsTotal(nextProductsTotal)
      setAdminProductsPage(1)
      setCatalogCategories(nextCatalog)
      setDebugLogs(storedLogs)

      const firstDispute = nextOrders.find((order: any) => order.status === 'disputed')
      setSelectedDisputeId((current) => current || firstDispute?.id || '')
    } catch (error) {
      console.error('Failed to load backend admin data, falling back to local storage:', error)
      const storedUsers = getStoredUsers()
      const storedOrders = getStoredOrders()
      const storedChats = getStoredChats()
      const storedProducts = getStoredProducts()
      const storedReviews = getStoredReviews()

      setUsers(storedUsers)
      setOrders(storedOrders)
      setChats(storedChats)
      setChatCount(storedChats.length)
      setProducts(storedProducts)
      setReviews(storedReviews)
      setWithdrawals([])
      setProductsTotal(storedProducts.length)
      setCatalogCategories([])
      setDebugLogs(storedLogs)

      const firstDispute = storedOrders.find((order) => order.status === 'disputed')
      setSelectedDisputeId((current) => current || firstDispute?.id || '')
    } finally {
      setLoading(false)
    }
  }

  const loadMoreAdminProducts = async () => {
    if (adminProductsLoadingMore) return
    if (productsTotal !== null && products.length >= productsTotal) return
    const nextPage = adminProductsPage + 1
    setAdminProductsLoadingMore(true)
    try {
      const res = await api.get('/products', { params: { page: nextPage, pageSize: adminProductsPageSize, includeOutOfStock: true } })
      const raw = res.data?.data?.items ?? res.data?.data ?? []
      setProducts((current) => {
        const map = new Map<string, any>()
        for (const p of current) map.set(p.id, p)
        for (const p of raw) map.set(p.id, p)
        return Array.from(map.values())
      })
      const total = res.data?.data?.total ?? (Array.isArray(raw) ? raw.length + products.length : products.length)
      setProductsTotal(total)
      setAdminProductsPage(nextPage)
    } catch (err) {
      console.error('Failed to load more admin products', err)
    } finally {
      setAdminProductsLoadingMore(false)
    }
  }

  useEffect(() => {
    void loadData()

    const handleStorage = () => void loadData()
    window.addEventListener('storage', handleStorage)
    return () => window.removeEventListener('storage', handleStorage)
  }, [])

  // Load last known batchId from localStorage so Delete works after navigation/reload
  useEffect(() => {
    const stored = localStorage.getItem('admin_last_batchId')
    if (stored) setCurrentBatchId(stored)
  }, [])

  // When a batchId is present (e.g. after navigation), fetch its status once
  useEffect(() => {
    if (!currentBatchId) return
    let mounted = true
    ;(async () => {
      try {
        const res = await api.get(`/admin/db-seed/status/${currentBatchId}`)
        const status = res.data?.data || null
        if (!mounted) return
        setBatchStatus(status)
        // If batch still in progress, enable polling so UI updates
        if (status && !['completed', 'failed', 'deleted'].includes(status.stage)) {
          setPolling(true)
        } else {
          setPolling(false)
        }
      } catch (err) {
        console.error('Failed fetching batch status on load', err)
        setPolling(false)
      }
    })()

    return () => { mounted = false }
  }, [currentBatchId])

  useEffect(() => {
    // If role changes under us, ensure active tab is valid for the role
    // Include 'dbtools' for admins so new tab remains selectable
    const tabsForRole = isAdmin ? ['overview', 'users', 'disputes', 'withdrawals', 'products', 'catalog', 'reviews', 'dbtools'] : role === 'support' ? ['disputes', 'reviews'] : ['overview']
    if (!tabsForRole.includes(activeTab)) {
      setActiveTab(tabsForRole[0] as AdminTab)
    }
  }, [activeTab, isAdmin, role])

  useEffect(() => {
    // periodic health check for backend connectivity (uses performHealthCheck)
    let mounted = true
    const id = setInterval(() => {
      if (!mounted) return
      performHealthCheck()
    }, 15000)
    // first check
    performHealthCheck()
    return () => {
      mounted = false
      clearInterval(id)
    }
  }, [])

  // Poll batch status when polling is enabled
  useEffect(() => {
    if (!polling || !currentBatchId) return
    let mounted = true
    const id = setInterval(async () => {
      try {
        const res = await api.get(`/admin/db-seed/status/${currentBatchId}`)
        const status = res.data?.data || null
        if (!mounted) return
        setBatchStatus(status)
        if (!status || status.stage === 'completed' || status.stage === 'failed' || status.stage === 'deleted') {
          setPolling(false)
        }
      } catch (err) {
        console.error('Failed polling batch status', err)
        setPolling(false)
      }
    }, 2000);


    // immediate fetch
    (async () => {
      try {
        const res = await api.get(`/admin/db-seed/status/${currentBatchId}`)
        const status = res.data?.data || null
        if (mounted) setBatchStatus(status)
      } catch (err) {
        console.error('Failed fetching batch status', err)
      }
    })()

    return () => { mounted = false; clearInterval(id) }
  }, [polling, currentBatchId])

  // When server reports batch deleted, clear stored batchId and stop polling
  useEffect(() => {
    if (!batchStatus) return
    if (batchStatus.stage === 'deleted') {
      try { localStorage.removeItem('admin_last_batchId') } catch {}
      setCurrentBatchId(null)
      setPolling(false)
    }
  }, [batchStatus])

  const disputedOrders = useMemo(
    () => orders.filter((order) => order.status === 'disputed'),
    [orders]
  )

  const activeDispute =
    disputedOrders.find((order) => order.id === selectedDisputeId) || disputedOrders[0] || null

  const activeChat = activeDispute?.chat || null

  const visibleUsers = useMemo(() => {
    const query = userSearch.trim().toLowerCase()
    if (!query) return users
    return users.filter((candidate) => {
      const username = (candidate.username || '').toLowerCase()
      const email = (candidate.email || '').toLowerCase()
      const id = (candidate.id || '').toLowerCase()
      const roleValue = (candidate.role || 'user').toLowerCase()

      return (
        username.includes(query) ||
        email.includes(query) ||
        id.includes(query) ||
        roleValue.includes(query)
      )
    })
  }, [userSearch, users])

  const visibleProducts = useMemo(() => {
    const q = productSearch.trim().toLowerCase()
    if (!q) return products
    return products.filter((p: any) => {
      const title = (p.title || '').toLowerCase()
      const id = (p.id || '').toLowerCase()
      const seller = (p.seller_id || '').toLowerCase()
      const category = (p.category || '').toLowerCase()
      return title.includes(q) || id.includes(q) || seller.includes(q) || category.includes(q)
    })
  }, [productSearch, products])

  const usersById = useMemo(() => {
    const map = new Map<string, string>()
    users.forEach((candidate) => {
      if (!candidate.id) return
      map.set(candidate.id, candidate.username || candidate.email || candidate.id)
    })
    return map
  }, [users])

  const formatPersonLabel = (id?: string, name?: string) => {
    const cleanId = String(id || '').trim()
    const cleanName = String(name || '').trim()
    const resolvedName = usersById.get(cleanId) || cleanName

    if (resolvedName && cleanId && resolvedName !== cleanId) {
      return `${resolvedName} (${cleanId})`
    }

    return resolvedName || cleanId || '—'
  }

  const visibleReviews = useMemo(() => {
    const query = reviewSearch.trim().toLowerCase()
    if (!query) return reviews
    return reviews.filter((review: any) => {
      const text = (review.text || '').toLowerCase()
      const sellerName = (review.seller_name || '').toLowerCase()
      const buyerName = (review.buyer_name || '').toLowerCase()
      const productTitle = (review.product_title || '').toLowerCase()
      const id = (review.id || '').toLowerCase()
      return text.includes(query) || sellerName.includes(query) || buyerName.includes(query) || productTitle.includes(query) || id.includes(query)
    })
  }, [reviewSearch, reviews])

  const paginatedReviews = useMemo(() => visibleReviews.slice(0, visibleReviewsCount), [visibleReviews, visibleReviewsCount])

  useEffect(() => {
    setVisibleReviewsCount(50)
  }, [reviewSearch, activeTab])

  const handleEditProduct = (productId: string) => {
    navigate(`/create-product/${productId}`)
  }

  const rootCategories = useMemo(() => catalogCategories.filter((category) => !category.parent_id), [catalogCategories])
  const resetCategoryForm = () => {
    setCategoryName('')
    setCategoryIcon(CATEGORY_ICON_FALLBACK)
    setCategoryParentId('')
    setCategorySortOrder(0)
    setEditingCategoryId(null)
  }

  const handleEditCategory = (category: CatalogCategory) => {
    setEditingCategoryId(category.id)
    setCategoryName(category.name)
    setCategoryIcon(getCatalogIconOption(category.emoji || category.icon)?.value || CATEGORY_ICON_FALLBACK)
    setCategoryParentId(category.parent_id || '')
    setCategorySortOrder(Number(category.sort_order || 0))
  }

  const handleSaveCategory = () => {
    if (!categoryName.trim()) {
      showToast('ℹ️ Вкажіть назву категорії', 'info')
      return
    }

    void (async () => {
      try {
        const payload = {
          name: categoryName.trim(),
          emoji: categoryIcon,
          parent_id: categoryParentId || null,
          sort_order: categorySortOrder,
        }

        const response = editingCategoryId
          ? await catalogService.updateCategory(editingCategoryId, payload)
          : await catalogService.createCategory(payload)

        const nextCategory = response.data?.data
        if (nextCategory) {
          await loadData()
          resetCategoryForm()
          showToast(editingCategoryId ? '✅ Категорію оновлено' : '✅ Категорію додано', 'success')
          return
        }
      } catch (error) {
        console.error('Failed to save category via backend:', error)
        showToast('❌ Не вдалося зберегти категорію', 'error')
        return
      }
    })()
  }

  const handleDeleteCategory = (categoryId: string) => {
    void (async () => {
      try {
        await catalogService.deleteCategory(categoryId)
        await loadData()
        if (editingCategoryId === categoryId) resetCategoryForm()
        showToast('✅ Категорію видалено', 'success')
        return
      } catch (error) {
        console.error('Failed to delete category via backend:', error)
        showToast('❌ Не вдалося видалити категорію', 'error')
        return
      }
    })()
  }

  const openImageViewer = (src: string, name: string) => {
    setImageViewer({ src, name, zoom: 1, offsetX: 0, offsetY: 0 })
  }

  const closeImageViewer = () => {
    setImageViewer(null)
  }

  const changeViewerZoom = (delta: number) => {
    setImageViewer((current) => {
      if (!current) return current
      const nextZoom = Math.min(4, Math.max(0.5, Number((current.zoom + delta).toFixed(2))))
      return { ...current, zoom: nextZoom }
    })
  }

  const startPan = (event: React.PointerEvent<HTMLImageElement>) => {
    if (!imageViewer) return
    imagePanRef.current = {
      dragging: true,
      startX: event.clientX,
      startY: event.clientY,
      startOffsetX: imageViewer.offsetX,
      startOffsetY: imageViewer.offsetY,
      pointerId: event.pointerId,
    }
    try { event.currentTarget.setPointerCapture(event.pointerId) } catch {}
    event.preventDefault()
  }

  const movePan = (event: React.PointerEvent<HTMLImageElement>) => {
    if (!imageViewer || !imagePanRef.current.dragging) return
    if (imagePanRef.current.pointerId !== null && event.pointerId !== imagePanRef.current.pointerId) return
    const dx = event.clientX - imagePanRef.current.startX
    const dy = event.clientY - imagePanRef.current.startY
    setImageViewer((current) => {
      if (!current) return current
      return {
        ...current,
        offsetX: imagePanRef.current.startOffsetX + dx,
        offsetY: imagePanRef.current.startOffsetY + dy,
      }
    })
  }

  const endPan = (event: React.PointerEvent<HTMLImageElement>) => {
    if (imagePanRef.current.dragging) {
      imagePanRef.current.dragging = false
      const pid = imagePanRef.current.pointerId
      imagePanRef.current.pointerId = null
      try { if (pid !== null) event.currentTarget.releasePointerCapture(pid) } catch {}
    }
  }

  const handleDeleteProduct = (productId: string) => {
    void (async () => {
      try {
        await api.delete(`/products/${productId}`)
        setProducts((current) => current.filter((p: any) => p.id !== productId))
        setProductsTotal((current) => (current === null ? current : Math.max(current - 1, 0)))
        setProductToDelete(null)
        showToast('✅ Товар видалено', 'success')
        return
      } catch (err) {
        console.error('Помилка видалення товару через backend, fallback на локальне сховище', err)
      }

      const updated = products.filter((p: any) => p.id !== productId)
      saveStoredProducts(updated)
      setProducts(updated)
      setProductsTotal((current) => (current === null ? current : Math.max(current - 1, 0)))
      setProductToDelete(null)
      showToast('✅ Товар видалено', 'success')
    })()
  }

  const handleDeleteReview = (reviewId: string) => {
    void (async () => {
      try {
        await api.delete(`/reviews/${reviewId}`)
        setReviews((current) => current.filter((review: any) => review.id !== reviewId))
        showToast('✅ Відгук видалено', 'success')
        return
      } catch (err) {
        console.error('Failed to delete review via backend, fallback to local storage', err)
      }

      const next = getStoredReviews().filter((review: any) => review.id !== reviewId)
      saveStoredReviews(next)
      setReviews(next)
      showToast('✅ Відгук видалено (локально)', 'success')
    })()
  }

  const metrics = useMemo(() => {
    const withdrawalRevenue = withdrawals.reduce((sum, request) => {
      if (request.status !== 'completed') return sum
      return sum + Number(request.fee_amount || 0)
    }, 0)

    return {
      users: users.length,
      admins: users.filter((candidate) => candidate.role === 'admin').length,
      supports: users.filter((candidate) => candidate.role === 'support').length,
      disputes: disputedOrders.length,
      completedOrders: orders.filter((order) => order.status === 'completed').length,
      revenue: withdrawalRevenue,
      chats: chatCount,
    }
  }, [chatCount, disputedOrders.length, orders, users, withdrawals])

  const handleRoleChange = (targetUserId: string, nextRole: UserRole) => {
    if (!isAdmin) return

    if (targetUserId === user?.id) {
      showToast('ℹ️ Власну роль змінювати не можна', 'info')
      return
    }

    void (async () => {
      try {
        const response = await api.put(`/users/${targetUserId}`, { role: nextRole })
        const updatedUser = response.data?.data ?? null
        if (updatedUser) {
          setUsers((current) => current.map((candidate) => (candidate.id === targetUserId ? updatedUser : candidate)))
          showToast(`✅ Роль користувача оновлено на ${roleLabel[nextRole]}`, 'success')
          setOpenRoleMenu(null)
          return
        }
      } catch (error) {
        console.error('Failed to update user role via backend, using local fallback:', error)
      }

      const updatedUsers = updateStoredUserRole(targetUserId, nextRole)
      setUsers(updatedUsers)
      showToast(`✅ Роль користувача оновлено на ${roleLabel[nextRole]}`, 'success')
      setOpenRoleMenu(null)
    })()
  }

  const handleBalanceChange = (targetUserId: string, newBalance: number) => {
    if (!isAdmin) return

    void (async () => {
      try {
        const response = await api.put(`/users/${targetUserId}`, { balance: newBalance })
        const updatedUser = response.data?.data ?? null
        if (updatedUser) {
          setUsers((current) => current.map((candidate) => (candidate.id === targetUserId ? updatedUser : candidate)))
          setEditingBalance((current) => {
            const next = { ...current }
            delete next[targetUserId]
            return next
          })
          showToast('✅ Баланс оновлено', 'success')
          return
        }
      } catch (error) {
        console.error('Failed to update user balance via backend, using local fallback:', error)
      }

      const updatedUsers = users.map((u) => u.id === targetUserId ? { ...u, balance: newBalance } : u)
      setUsers(updatedUsers)
      setEditingBalance((current) => {
        const next = { ...current }
        delete next[targetUserId]
        return next
      })
      showToast('✅ Баланс оновлено', 'success')
    })()
  }

  const handleDeleteUser = (targetUserId: string) => {
    if (!isAdmin) return

    if (targetUserId === user?.id) {
      showToast('ℹ️ Не можна видалити себе', 'info')
      return
    }

    const targetUser = users.find((u) => u.id === targetUserId)
    setDeleteConfirmModal({ userId: targetUserId, username: targetUser?.username || 'Unknown User' })
  }

  const handleConfirmDelete = () => {
    if (!deleteConfirmModal) return

    const targetUserId = deleteConfirmModal.userId

    const removeUserFromCurrentState = () => {
      setUsers((current) => current.filter((user) => user.id !== targetUserId))
    }

    void (async () => {
      try {
        await api.delete(`/users/${targetUserId}`)
        removeUserFromCurrentState()
        showToast(`✅ Користувача видалено`, 'success')
        setDeleteConfirmModal(null)
        return
      } catch (error) {
        console.error('Failed to delete user via backend, using local fallback:', error)
      }

      setUsers((current) => {
        const nextUsers = current.filter((user) => user.id !== targetUserId)
        saveStoredUsers(nextUsers)
        return nextUsers
      })
      removeUserFromCurrentState()
      showToast(`✅ Користувача видалено`, 'success')
      setDeleteConfirmModal(null)
    })()
  }

  const handleSendSupportMessage = () => {
    if (!activeDispute || !supportMessage.trim() || !user) return

    const payloadMessage = {
      sender_id: user.id,
      sender_name: user.username,
      text: supportMessage.trim(),
      sender_role: role,
    }

    ;(async () => {
      if (backendEnabled) {
        try {
          await api.post(`/admin/disputes/${activeDispute.id}/messages`, { text: supportMessage.trim() })
          await loadData()
          setSupportMessage('')
          showToast('✅ Повідомлення саппорта відправлене (backend)', 'success')
          return
        } catch (err) {
          console.error('Failed to send support message via backend, falling back to local:', err)
        }
      }

      // fallback to local storage
      const updatedChats = appendChatMessageToSellerThread(activeDispute.seller_id, {
        ...payloadMessage,
      })
      setChats(updatedChats)
      setSupportMessage('')
      showToast('✅ Повідомлення саппорта додано до чату (локально)', 'success')
    })()
  }

  const handleClearLogs = () => {
    clearAdminLogs()
    setDebugLogs([])
    showToast('✅ Логи очищені', 'success')
  }

  const performHealthCheck = async () => {
    const startedAt = performance.now()
    const checkedAt = new Date().toISOString()

    if (!backendEnabled) {
      setConnectionStatus('mock')
      setLastCheckedAt(checkedAt)
      appendAdminLog({
        level: 'warn',
        message: 'Backend health check skipped: app runs in local mock mode',
        meta: {
          mode: 'mock',
          reason: 'No real backend feature flag is enabled',
          checkedAt,
          baseUrl: backendBaseUrl,
        },
      })
      setDebugLogs(getAdminLogs())
      return
    }

    try {
      const res = await api.get('/health', { timeout: 3000 })
      setConnectionStatus('connected')
      const durationMs = Math.round(performance.now() - startedAt)
      setLastCheckedAt(checkedAt)
      appendAdminLog({
        level: 'info',
        message: 'Backend health check succeeded',
        meta: {
          mode: 'real',
          endpoint: `${backendBaseUrl}/health`,
          status: res?.status,
          durationMs,
          checkedAt,
        },
      })
      setDebugLogs(getAdminLogs())
    } catch (err: any) {
      setConnectionStatus('disconnected')
      const durationMs = Math.round(performance.now() - startedAt)
      setLastCheckedAt(checkedAt)
      appendAdminLog({
        level: 'error',
        message: 'Backend health check failed',
        meta: {
          mode: 'real',
          endpoint: `${backendBaseUrl}/health`,
          durationMs,
          checkedAt,
          errorName: err?.name || 'Error',
          errorMessage: err?.message || String(err),
          status: err?.response?.status ?? null,
          responseData: err?.response?.data ?? null,
        },
      })
      setDebugLogs(getAdminLogs())
    }
  }

  const handleResolve = (resolution: 'refund' | 'seller') => {
    if (!activeDispute) return
    void (async () => {
      try {
        const response = await api.post(`/admin/disputes/${activeDispute.id}/resolve`, { resolution })
        const payload = response.data?.data
        if (payload) {
          setUsers(payload.users || users)
          setOrders(payload.orders || orders)
          setChats(payload.chats || chats)

          const currentAuthUser = useAuthStore.getState().user
          if (currentAuthUser && (currentAuthUser.id === activeDispute.buyer_id || currentAuthUser.id === activeDispute.seller_id)) {
            const refreshedUser = findStoredUserById(currentAuthUser.id)
            if (refreshedUser) {
              useAuthStore.setState({ user: refreshedUser, balance: refreshedUser.balance })
            }
          }

          const nextDispute = (payload.orders || []).find((order: any) => order.status === 'disputed')
          setSelectedDisputeId(nextDispute?.id || '')

          showToast(
            resolution === 'refund'
              ? '✅ Спір вирішено: кошти повернено покупцю'
              : '✅ Спір вирішено: кошти передано продавцю',
            'success'
          )
          return
        }
      } catch (error) {
        console.error('Failed to resolve dispute via backend, falling back to local storage:', error)
      }

      const result = resolveDispute(activeDispute.id, resolution, user?.username || 'Support')
      if (!result) {
        showToast('ℹ️ Цей спір уже вирішено або не знайдено', 'info')
        return
      }

      setUsers(result.users)
      setOrders(result.orders)
      setChats(result.chats)

      const currentAuthUser = useAuthStore.getState().user
      if (currentAuthUser && (currentAuthUser.id === activeDispute.buyer_id || currentAuthUser.id === activeDispute.seller_id)) {
        const refreshedUser = findStoredUserById(currentAuthUser.id)
        if (refreshedUser) {
          useAuthStore.setState({ user: refreshedUser, balance: refreshedUser.balance })
        }
      }

      const nextDispute = result.orders.find((order) => order.status === 'disputed')
      setSelectedDisputeId(nextDispute?.id || '')

      showToast(
        resolution === 'refund'
          ? '✅ Спір вирішено: кошти повернено покупцю'
          : '✅ Спір вирішено: кошти передано продавцю',
        'success'
      )
    })()
  }

  const requestResolveConfirmation = (resolution: 'refund' | 'seller') => {
    if (!activeDispute) return
    setPendingResolution(resolution)
  }

  const confirmResolveAction = () => {
    if (!pendingResolution) return
    handleResolve(pendingResolution)
    setPendingResolution(null)
  }

  const openWithdrawalDetails = (request: WithdrawalRequest) => {
    setSelectedWithdrawal(request)
  }

  const requestWithdrawalAction = (request: WithdrawalRequest, action: WithdrawalAction) => {
    setPendingWithdrawalAction({ request, action })
  }

  const confirmWithdrawalAction = async () => {
    if (!pendingWithdrawalAction) return
    const { request, action } = pendingWithdrawalAction
    if (withdrawalProcessing[request.id]) return

    setWithdrawalProcessing((prev) => ({ ...prev, [request.id]: true }))
    try {
      if (action === 'complete') {
        const response = await balanceService.completeWithdrawal(request.id)
        const updatedRequest = response.data?.data?.request || null
        if (updatedRequest) {
          setSelectedWithdrawal(updatedRequest)
          setWithdrawals((current) => current.map((item) => (item.id === updatedRequest.id ? updatedRequest : item)))
        }
        showToast('✅ Переказ підтверджено', 'success')
      } else {
        const response = await balanceService.refundWithdrawal(request.id)
        const updatedRequest = response.data?.data?.request || null
        if (updatedRequest) {
          setSelectedWithdrawal(updatedRequest)
          setWithdrawals((current) => current.map((item) => (item.id === updatedRequest.id ? updatedRequest : item)))
        }
        showToast('✅ Кошти повернуто користувачу', 'success')
      }
      await loadData()
    } catch (error) {
      console.error('Failed to process withdrawal action', error)
      showToast(action === 'complete' ? 'Не вдалося підтвердити переказ' : 'Не вдалося повернути кошти', 'error')
    } finally {
      setWithdrawalProcessing((prev) => ({ ...prev, [request.id]: false }))
      setPendingWithdrawalAction(null)
    }
  }

  if (loading) {
    return <div className="admin-page loading">Завантаження...</div>
  }

  const adminTabs: AdminTab[] = isAdmin ? ['overview', 'users', 'disputes', 'withdrawals', 'products', 'catalog', 'reviews', 'dbtools'] : role === 'support' ? ['disputes', 'reviews'] : ['overview']

  return (
    <div className="admin-page">
      <div className="admin-shell">
        <div className="admin-topbar">
          <button className="admin-back-btn" onClick={() => navigate('/')}>
            <ArrowLeft size={18} /> Назад на сайт
          </button>
          <div className="admin-title-block">
            <div className="admin-title">
              <Shield size={28} />
              <div>
                <h1>{isAdmin ? 'Адмін-панель' : 'Панель саппорту'}</h1>
                <p>Поточна роль: {roleLabel[role]}</p>
              </div>
            </div>
            
            
            <div className={`role-pill role-${role}`}>{roleLabel[role]}</div>
          </div>
        </div>

        <div className="admin-tabs">
          {adminTabs.map((tab) => (
            <button
              key={tab}
              className={`admin-tab ${activeTab === tab ? 'active' : ''}`}
              onClick={() => setActiveTab(tab)}
            >
              {tab === 'overview' && 'Панель'}
              {tab === 'users' && 'Користувачі'}
              {tab === 'disputes' && 'Спори'}
              {tab === 'withdrawals' && 'Виводи'}
              {tab === 'products' && 'Товари'}
              {tab === 'catalog' && 'Категорії'}
              {tab === 'reviews' && 'Відгуки'}
              {tab === 'dbtools' && 'DB Tools'}
            </button>
          ))}
        </div>

        {activeTab === 'overview' && (
          <section className="admin-section">
            <div className="section-head">
              <div>
                <h2>Огляд</h2>
                <p>Швидка статистика по системі та поточних спорах.</p>
              </div>
              <button className="ghost-btn" onClick={loadData}>
                <RefreshCw size={16} /> Оновити
              </button>
            </div>

            <div className="stats-grid">
              <div className="stat-card">
                <div className="stat-icon"><Users size={20} /></div>
                <h3>Користувачі</h3>
                <p className="stat-value">{metrics.users}</p>
              </div>
              <div className="stat-card">
                <div className="stat-icon"><Shield size={20} /></div>
                <h3>Support / Admin</h3>
                <p className="stat-value">{metrics.supports + metrics.admins}</p>
              </div>
              <div className="stat-card">
                <div className="stat-icon"><AlertTriangle size={20} /></div>
                <h3>Відкриті спори</h3>
                <p className="stat-value">{metrics.disputes}</p>
              </div>
              <div className="stat-card">
                <div className="stat-icon"><CheckCircle2 size={20} /></div>
                <h3>Завершені замовлення</h3>
                <p className="stat-value">{metrics.completedOrders}</p>
              </div>
              <div className="stat-card">
                <div className="stat-icon"><MessageCircle size={20} /></div>
                <h3>Чати</h3>
                <p className="stat-value">{metrics.chats}</p>
              </div>
              <div className="stat-card">
                <div className="stat-icon"><BadgeInfo size={20} /></div>
                <h3>Виручка</h3>
                <p className="stat-value">{metrics.revenue.toFixed(2)} ₴</p>
              </div>
            </div>
            <div className="connect-grid">
              <div className="connect-card">
                <h4>Backend connection</h4>
                <p className={`conn-status conn-${connectionStatus}`}>
                  {connectionStatus === 'connected'
                    ? 'Підключено'
                    : connectionStatus === 'disconnected'
                      ? 'Відсутнє підключення'
                      : connectionStatus === 'mock'
                        ? 'Локальний макет'
                        : 'Невідомо'}
                </p>
                <p className="conn-meta">
                  {backendEnabled
                    ? 'Режим: реальний бекенд'
                    : 'Режим: локальний макет, бекенд не підключений'}
                </p>
                <p className="conn-meta">Остання перевірка: {lastCheckedAt ? new Date(lastCheckedAt).toLocaleString('uk-UA') : 'не перевірено'}</p>
                <div className="connect-actions">
                  <button className="ghost-btn" onClick={performHealthCheck}><RefreshCw size={14} /> Перевірити стан</button>
                  <button className="ghost-btn" onClick={() => setShowLogsPanel((s) => !s)}>{showLogsPanel ? 'Сховати логи' : 'Показати логи'}</button>
                </div>
              </div>

              {showLogsPanel && (
                <div className="log-panel">
                  <div className="log-panel-head">
                    <h4>Інтеграційні логи</h4>
                    <div className="log-actions">
                      <button className="ghost-btn" onClick={handleClearLogs}>Очистити логи</button>
                    </div>
                  </div>
                  <div className="log-list">
                    {debugLogs.length === 0 ? (
                      <div className="empty-state compact">Логів ще немає</div>
                    ) : (
                      debugLogs.slice(0, 100).map((log) => (
                        <div key={log.id} className={`log-entry log-${log.level}`}>
                          <div className="log-entry-top">
                            <strong>{log.level.toUpperCase()}</strong>
                            <span>{new Date(log.timestamp).toLocaleString('uk-UA')}</span>
                          </div>
                          <div className="log-msg">{log.message}</div>
                          {log.meta && (
                            <pre className="log-meta">{JSON.stringify(log.meta, null, 2)}</pre>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          </section>
        )}

        {activeTab === 'reviews' && (
          <section className="admin-section">
            <div className="section-head">
              <div>
                <h2>Модерація відгуків</h2>
                <p>Тут можна переглядати всі відгуки та видаляти неприйнятний контент.</p>
              </div>
              <div className="search-wrap">
                <Search size={16} />
                <input
                  type="text"
                  placeholder="Пошук за текстом, продавцем, покупцем, товаром або ID"
                  value={reviewSearch}
                  onChange={(e) => setReviewSearch(e.target.value)}
                />
              </div>
            </div>

            {visibleReviews.length === 0 ? (
              <div className="empty-state">Відгуків не знайдено</div>
            ) : (
              <div className="reviews-moderation-list">
                {paginatedReviews.map((review: any) => (
                  <div key={review.id} className="review-moderation-card">
                    <div className="review-moderation-head">
                      <div>
                        <strong>{review.product_title || 'Без назви товару'}</strong>
                        <small>ID: {review.id}</small>
                      </div>
                      <button className="btn-delete-user" onClick={() => handleDeleteReview(review.id)} title="Видалити відгук">
                        <Trash2 size={18} />
                      </button>
                    </div>
                    <div className="review-moderation-meta">
                      <span>⭐ {Number(review.rating || 0).toFixed(1)}</span>
                      <span>Покупець: {formatPersonLabel(review.buyer_id, review.buyer_name)}</span>
                      <span>Продавець: {formatPersonLabel(review.seller_id, review.seller_name)}</span>
                      <span>{review.created_at ? new Date(review.created_at).toLocaleString('uk-UA') : '—'}</span>
                    </div>
                    <p className="review-moderation-text">{review.text || 'Без тексту'}</p>
                  </div>
                ))}
                {visibleReviewsCount < visibleReviews.length ? (
                  <div style={{ width: '100%', textAlign: 'center', marginTop: 10 }}>
                    <button className="btn-load-more-reviews" onClick={() => setVisibleReviewsCount((count) => count + 50)}>
                      Показати ще 50
                    </button>
                  </div>
                ) : null}
              </div>
            )}
          </section>
        )}

        {/* DB Tools compact panel (DB Tools tab) */}
        {activeTab === 'dbtools' && isAdmin && (
          <div className="dbtools-simple">
          <div className="entity-row">
            {[
              { key: 'users', label: 'Користувачі' },
              { key: 'products', label: 'Товари' },
              { key: 'orders', label: 'Замовлення' },
              { key: 'reviews', label: 'Відгуки' },
            ].map((item) => (
              <div
                key={item.key}
                className={`entity-card-compact ${dbEntities[item.key as keyof typeof dbEntities] ? 'selected' : ''} ${(!dbEntities.users && item.key !== 'users') ? 'disabled' : ''}`}
                onClick={() => {
                  if (item.key !== 'users' && !dbEntities.users) {
                    showToast('Спочатку виберіть Користувачів', 'info')
                    return
                  }
                  setDbEntities((s) => ({ ...s, [item.key]: !s[item.key as keyof typeof s] }))
                }}
              >
                <div className="entity-compact-head">
                  <span className="entity-check">{dbEntities[item.key as keyof typeof dbEntities] ? '✓' : ''}</span>
                  <span className="entity-name">{item.label}</span>
                </div>
                <input
                  type="number"
                  min={0}
                  placeholder="Кількість"
                  value={(dbCounts as any)[item.key] ?? ''}
                  onChange={(e) => setDbCounts((s) => ({ ...s, [item.key]: Number(e.target.value || 0) }))}
                  onClick={(e) => e.stopPropagation()}
                  disabled={!dbEntities[item.key as keyof typeof dbEntities]}
                  className="entity-count-input"
                />
              </div>
            ))}
          </div>

          <div className="dbtools-actions">
            <button className="generate-cta" disabled={polling} onClick={async () => {
              try {
                const entities = Object.entries(dbEntities).filter(([,v]) => v).map(([k]) => k)
                if (entities.length === 0) { showToast('ℹ️ Виберіть принаймні одну сутність', 'info'); return }
                if (!dbEntities.users && entities.some((e) => e !== 'users')) {
                  showToast('Спочатку виберіть Користувачів', 'info')
                  return
                }
                const countsPayload: Record<string, number> = {}
                for (const key of entities) {
                  const raw = (dbCounts as any)[key]
                  const parsed = Number(raw || 0)
                  if (!parsed || parsed <= 0) {
                    showToast(`Вкажіть кількість для ${key}`, 'info')
                    return
                  }
                  countsPayload[key] = Math.floor(parsed)
                }
                const resp = await api.post('/admin/db-seed/generate', { entities, counts: countsPayload, batchName: `ui-${Date.now()}` })
                const batchId = resp.data?.data?.batchId || resp.data?.data
                setLastRequestedEntities(entities)
                setCurrentBatchId(batchId)
                try { localStorage.setItem('admin_last_batchId', batchId) } catch {}
                setBatchStatus({ id: batchId, stage: 'queued', progress: 0, entities })
                setPolling(true)
                showToast('✅ Генерація запущена', 'success')
              } catch (err) {
                console.error('Failed to start generation', err)
                showToast('Помилка запуску генерації', 'error')
              }
            }}>Generate</button>

            <button className="delete-btn-compact" disabled={polling} onClick={() => {
              const stored = localStorage.getItem('admin_last_batchId')
              const batchToDelete = currentBatchId || batchStatus?.id || stored || null
              if (!batchToDelete) { showToast('ℹ️ Немає активного batchId', 'info'); return }
              setBatchDeleteTarget(batchToDelete)
              setBatchDeleteConfirm(true)
            }}>Delete All</button>
            
            <button className="delete-all-generated" disabled={polling} onClick={() => setShowGeneratedDeleteModal(true)}>Delete Generated (all)</button>
          </div>

          {batchStatus && (
            <div className="progress-panel">
              <div className="progress-info">
                <span><strong>Зараз:</strong> {batchStageLabel[batchStatus.stage] || batchStatus.stage}</span>
                <span style={{ marginLeft: 'auto' }}>{batchStatus.progress ?? 0}%</span>
              </div>
              <div className="progress-bar">
                <div className="progress-fill" style={{ width: `${batchStatus.progress ?? 0}%` }}></div>
              </div>
              <div className="progress-message">{batchStatus.message || batchStageLabel[batchStatus.stage] || ''}</div>
            </div>
          )}
          </div>
        )}

        {activeTab === 'users' && isAdmin && (
          <section className="admin-section">
            <div className="section-head">
              <div>
                <h2>Керування користувачами</h2>
                <p>Підвищення та пониження ролей доступне тільки адмінові.</p>
              </div>
              <div className="search-wrap">
                <Search size={16} />
                <input
                  type="text"
                  placeholder="Пошук користувача"
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                />
              </div>
            </div>

            <div className="users-table">
              <div className="users-table-head">
                <span>Користувач</span>
                <span>Email</span>
                <span>Роль</span>
                <span>Баланс</span>
                <span>Дія</span>
              </div>

              {visibleUsers.length === 0 ? (
                <div className="empty-state">Користувачів не знайдено</div>
              ) : (
                visibleUsers.length > 300 ? (
                  <VirtualList
                    height={600}
                    itemCount={Math.min(visibleUsers.length, visibleUsersCount)}
                    itemSize={72}
                    width={'100%'}
                  >
                    {({ index, style }) => {
                      const candidate = visibleUsers[index]
                      return (
                        <div key={candidate.id || candidate.email} className="users-table-row" style={style}>
                          <div className="user-cell name-cell">
                            <strong>{candidate.username || candidate.email}</strong>
                            <div className="muted">{candidate.id}</div>
                          </div>
                          <div className="user-cell email-cell">{candidate.email}</div>
                          <div className="user-cell role-selector-cell">
                            <button className="role-selector-btn" onClick={() => setOpenRoleMenu(openRoleMenu === candidate.id ? null : candidate.id)}>
                              {roleLabel[candidate.role || 'user']}
                            </button>
                            {openRoleMenu === candidate.id && candidate.id !== user?.id && (
                              <div className="role-selector-menu">
                                {roleOptions.map((option) => (
                                  <button
                                    key={option.value}
                                    className={`role-option ${candidate.role === option.value ? 'active' : ''}`}
                                    onClick={() => handleRoleChange(candidate.id, option.value)}
                                  >
                                    {option.label}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                          <div className="user-cell balance-cell">
                            {editingBalance[candidate.id] !== undefined ? (
                              <div className="balance-input-group">
                                <input
                                  type="text"
                                  inputMode="decimal"
                                  value={editingBalance[candidate.id]}
                                  onChange={(e) => {
                                    const val = e.target.value.replace(/[^0-9.]/g, '')
                                    if (val === '' || !isNaN(parseFloat(val))) {
                                      setEditingBalance({ ...editingBalance, [candidate.id]: val === '' ? 0 : parseFloat(val) })
                                    }
                                  }}
                                  className="balance-input"
                                  placeholder="0"
                                />
                                <button className="balance-save-btn" onClick={() => handleBalanceChange(candidate.id, editingBalance[candidate.id])} title="Зберегти">✓</button>
                                <button className="balance-cancel-btn" onClick={() => setEditingBalance(({ [candidate.id]: _, ...rest }) => rest)} title="Скасувати">✕</button>
                              </div>
                            ) : (
                              <div className="balance-display">
                                <span>{Number(candidate.balance || 0).toFixed(2)} ₴</span>
                                <button className="balance-edit-btn" onClick={() => setEditingBalance({ ...editingBalance, [candidate.id]: Number(candidate.balance || 0) })} title="Редагувати баланс">
                                  <Coins size={18} />
                                </button>
                              </div>
                            )}
                          </div>
                          <div className="user-cell actions-cell">
                            <button className="btn-delete-user" onClick={() => handleDeleteUser(candidate.id)} disabled={candidate.id === user?.id} title={candidate.id === user?.id ? 'Не можна видалити себе' : 'Видалити користувача'}>
                              <Trash2 size={18} />
                            </button>
                          </div>
                        </div>
                      )
                    }}
                  </VirtualList>
                ) : (
                  visibleUsers.slice(0, visibleUsersCount).map((candidate, index) => (
                    <div key={candidate.id || candidate.email || `user-${index}`} className="users-table-row">
                      <div className="user-cell name-cell">
                        <strong>{candidate.username || candidate.email}</strong>
                        <div className="muted">{candidate.id}</div>
                      </div>
                      <div className="user-cell email-cell">{candidate.email}</div>
                      <div className="user-cell role-selector-cell">
                        <button className="role-selector-btn" onClick={() => setOpenRoleMenu(openRoleMenu === candidate.id ? null : candidate.id)}>
                          {roleLabel[candidate.role || 'user']}
                        </button>
                        {openRoleMenu === candidate.id && candidate.id !== user?.id && (
                          <div className="role-selector-menu">
                            {roleOptions.map((option) => (
                              <button
                                key={option.value}
                                className={`role-option ${candidate.role === option.value ? 'active' : ''}`}
                                onClick={() => handleRoleChange(candidate.id, option.value)}
                              >
                                {option.label}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="user-cell balance-cell">
                        {editingBalance[candidate.id] !== undefined ? (
                          <div className="balance-input-group">
                            <input
                              type="text"
                              inputMode="decimal"
                              value={editingBalance[candidate.id]}
                              onChange={(e) => {
                                const val = e.target.value.replace(/[^0-9.]/g, '')
                                if (val === '' || !isNaN(parseFloat(val))) {
                                  setEditingBalance({ ...editingBalance, [candidate.id]: val === '' ? 0 : parseFloat(val) })
                                }
                              }}
                              className="balance-input"
                              placeholder="0"
                            />
                            <button className="balance-save-btn" onClick={() => handleBalanceChange(candidate.id, editingBalance[candidate.id])} title="Зберегти">✓</button>
                            <button className="balance-cancel-btn" onClick={() => setEditingBalance(({ [candidate.id]: _, ...rest }) => rest)} title="Скасувати">✕</button>
                          </div>
                        ) : (
                          <div className="balance-display">
                            <span>{Number(candidate.balance || 0).toFixed(2)} ₴</span>
                            <button className="balance-edit-btn" onClick={() => setEditingBalance({ ...editingBalance, [candidate.id]: Number(candidate.balance || 0) })} title="Редагувати баланс">
                              <Coins size={18} />
                            </button>
                          </div>
                        )}
                      </div>
                      <div className="user-cell actions-cell">
                        <button className="btn-delete-user" onClick={() => handleDeleteUser(candidate.id)} disabled={candidate.id === user?.id} title={candidate.id === user?.id ? 'Не можна видалити себе' : 'Видалити користувача'}>
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </div>
                  ))
                )
              )}

              {visibleUsersCount < visibleUsers.length ? (
                <div style={{ width: '100%', textAlign: 'center', marginTop: 12 }}>
                  <button className="btn-load-more-reviews" onClick={() => setVisibleUsersCount((c) => c + 70)}>Показати ще 70</button>
                </div>
              ) : null}
            </div>
          </section>
        )}

        {activeTab === 'withdrawals' && isAdmin && (
          <section className="admin-section">
            <div className="section-head">
              <div>
                <h2>Заявки на вивід</h2>
                <p>Підтверджуйте переказ після фактичного відправлення коштів користувачу.</p>
              </div>
              <button className="ghost-btn" onClick={loadData}>
                <RefreshCw size={16} /> Оновити
              </button>
            </div>

            {withdrawals.length === 0 ? (
              <div className="empty-state">Немає заявок на вивід</div>
            ) : (
              <div className="withdrawals-list">
                {withdrawals.map((request) => {
                  const methodLabel =
                    request.method === 'paypal'
                      ? 'PayPal'
                      : request.method === 'card'
                        ? 'Карта'
                        : 'USDT (TRC20)'
                  const statusLabel =
                    request.status === 'pending'
                      ? 'Очікує'
                      : request.status === 'completed'
                        ? 'Підтверджено'
                        : request.status === 'refunded'
                          ? 'Повернуто'
                          : 'Відхилено'

                  return (
                    <article key={request.id} className="withdrawal-card">
                      <div className="withdrawal-card-head">
                        <div>
                          <strong>{request.user?.username || request.user_id}</strong>
                          <div className="muted">{request.user?.email || request.user_id}</div>
                        </div>
                        <span className={`withdraw-status ${request.status}`}>{statusLabel}</span>
                      </div>

                      <div className="withdrawal-card-grid">
                        <div>
                          <small>Сума</small>
                          <strong>{Number(request.amount_gross || 0).toFixed(2)} ₴</strong>
                        </div>
                        <div>
                          <small>До виплати</small>
                          <strong>{Number(request.amount_net || 0).toFixed(2)} ₴</strong>
                        </div>
                        <div>
                          <small>Метод</small>
                          <strong>{methodLabel}</strong>
                        </div>
                        <div>
                          <small>Дата</small>
                          <strong>{new Date(request.created_at).toLocaleString('uk-UA')}</strong>
                        </div>
                      </div>

                      <div className="withdrawal-card-actions">
                        <button className="ghost-btn" onClick={() => openWithdrawalDetails(request)}>
                          <Eye size={16} /> Переглянути
                        </button>
                      </div>
                    </article>
                  )
                })}
              </div>
            )}
          </section>
        )}

        {activeTab === 'products' && isAdmin && (
          <section className="admin-section">
            <div className="section-head">
              <div>
                <h2>Товари</h2>
                    <p>Перегляд, пошук та управління товарами в системі.</p>
                    <p className="muted">Всього товарів: {productsTotal !== null ? productsTotal : products.length}</p>
              </div>
              <div className="search-wrap">
                <Search size={16} />
                <input
                  type="text"
                  placeholder="Пошук товарів за назвою, id, продавцем або категорією"
                  value={productSearch}
                  onChange={(e) => setProductSearch(e.target.value)}
                />
              </div>
            </div>

            {products.length === 0 ? (
              <div className="empty-state">Товарів не знайдено</div>
            ) : (
              <div className="products-table">
                <div className="products-table-head">
                  <span>Зображення</span>
                  <span>Назва</span>
                  <span>Продавець</span>
                  <span>Ціна</span>
                  <span>Запас</span>
                  <span>Дія</span>
                </div>

                {visibleProducts.length === 0 ? (
                  <div className="empty-state">За запитом нічого не знайдено</div>
                ) : (
                  visibleProducts.length > 300 ? (
                    <VirtualList
                      height={600}
                      itemCount={visibleProducts.length}
                      itemSize={88}
                      width={'100%'}
                    >
                      {({ index, style }) => {
                        const p = visibleProducts[index]
                        return (
                          <div key={p.id} className="products-table-row" style={style}>
                            <div className="prod-img"><img loading="lazy" decoding="async" src={p.image_url} alt={p.title} /></div>
                            <div className="prod-title"><strong>{p.title}</strong><div className="prod-id">{p.id}</div></div>
                            <div className="prod-seller">{p.seller_id}</div>
                            <div className="prod-price">{Number(p.price || 0).toFixed(2)} ₴</div>
                            <div className="prod-stock">{p.stock > 0 ? `${p.stock} шт.` : 'Немає'}</div>
                            <div className="prod-actions">
                              <button className="btn-edit-product" onClick={() => handleEditProduct(p.id)}>Редагувати</button>
                              <button className="btn-delete-product" onClick={() => setProductToDelete(p.id)}>Видалити</button>
                            </div>
                          </div>
                        )
                      }}
                    </VirtualList>
                  ) : (
                    visibleProducts.map((p: any, idx: number) => (
                      <div key={p.id || `prod-${idx}`} className="products-table-row">
                        <div className="prod-img"><img src={p.image_url} alt={p.title} /></div>
                        <div className="prod-title"><strong>{p.title}</strong><div className="prod-id">{p.id}</div></div>
                        <div className="prod-seller">{p.seller_id}</div>
                        <div className="prod-price">{Number(p.price || 0).toFixed(2)} ₴</div>
                        <div className="prod-stock">{p.stock > 0 ? `${p.stock} шт.` : 'Немає'}</div>
                        <div className="prod-actions">
                          <button className="btn-edit-product" onClick={() => handleEditProduct(p.id)}>Редагувати</button>
                          <button className="btn-delete-product" onClick={() => setProductToDelete(p.id)}>Видалити</button>
                        </div>
                      </div>
                    ))
                  )
                )}
                  {(productsTotal !== null && products.length < productsTotal) && (
                    <div style={{ width: '100%', textAlign: 'center', marginTop: 12 }}>
                      <button className="btn-load-more-reviews" onClick={loadMoreAdminProducts} disabled={adminProductsLoadingMore}>
                        {adminProductsLoadingMore ? 'Завантаження...' : `Завантажити ще (${products.length}/${productsTotal})`}
                      </button>
                    </div>
                  )}
              </div>
            )}
          </section>
        )}

        {activeTab === 'catalog' && isAdmin && (
          <section className="admin-section">
            <div className="section-head">
              <div>
                <h2>Категорії товарів</h2>
                <p>Додавайте, редагуйте та видаляйте категорії і підкатегорії. Зміни одразу підхоплюють фільтри та форму створення товару.</p>
              </div>
              <button className="ghost-btn" onClick={loadData}>
                <RefreshCw size={16} /> Оновити
              </button>
            </div>

            <div className="catalog-admin-grid">
              <div className="catalog-admin-tree">
                {rootCategories.length === 0 ? (
                  <div className="empty-state">Категорій ще немає</div>
                ) : (
                  rootCategories.map((category) => (
                    <div key={category.id} className="catalog-node">
                      <div className="catalog-node-head">
                        <div>
                          <CatalogIconBadge value={category.emoji || category.icon} className="catalog-node-emoji" />
                          <strong>{category.name}</strong>
                          <p>{category.id}</p>
                        </div>
                        <div className="catalog-node-actions">
                          <button className="ghost-btn compact" onClick={() => handleEditCategory(category)}>Редагувати</button>
                          <button className="ghost-btn compact danger" onClick={() => handleDeleteCategory(category.id)}>Видалити</button>
                        </div>
                      </div>
                      <div className="catalog-children">
                        {(catalogCategories.filter((item) => item.parent_id === category.id)).length === 0 ? (
                          <div className="empty-state compact">Підкатегорій немає</div>
                        ) : (
                          catalogCategories.filter((item) => item.parent_id === category.id).map((child) => (
                            <div key={child.id} className="catalog-child-row">
                              <div>
                                <CatalogIconBadge value={child.emoji || child.icon} className="catalog-node-emoji" />
                                <strong>{child.name}</strong>
                                <p>{child.id}</p>
                              </div>
                              <div className="catalog-node-actions">
                                <button className="ghost-btn compact" onClick={() => handleEditCategory(child)}>Редагувати</button>
                                <button className="ghost-btn compact danger" onClick={() => handleDeleteCategory(child.id)}>Видалити</button>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div className="catalog-admin-form">
                <h3>{editingCategoryId ? 'Редагувати категорію' : 'Додати категорію'}</h3>
                <label>
                  Назва
                  <input
                    type="text"
                    value={categoryName}
                    onChange={(e) => setCategoryName(e.target.value)}
                    placeholder="Наприклад: Steam"
                  />
                </label>
                <div className="emoji-picker-field">
                  <span className="emoji-picker-label">Іконка категорії</span>
                  <div className="emoji-picker-grid" role="radiogroup" aria-label="Вибір іконки для категорії">
                    {CATEGORY_ICON_OPTIONS.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        className={`emoji-picker-option ${categoryIcon === option.value ? 'active' : ''}`}
                        aria-pressed={categoryIcon === option.value}
                        onClick={() => setCategoryIcon(option.value)}
                        title={option.label}
                      >
                        <option.Icon size={18} strokeWidth={2.25} />
                      </button>
                    ))}
                  </div>
                </div>
                <label>
                  Батьківська категорія
                  <CustomSelect
                    id="admin-category-parent"
                    value={categoryParentId}
                    placeholder="Без батьківської (верхній рівень)"
                    onChange={setCategoryParentId}
                    options={[
                      { value: '', label: 'Без батьківської (верхній рівень)' },
                      ...rootCategories
                        .slice()
                        .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.name.localeCompare(b.name))
                        .map((category) => ({
                          value: category.id,
                          label: buildCategoryOptionLabel(category, catalogCategories),
                        })),
                    ]}
                  />
                </label>
                <label>
                  Порядок сортування
                  <input
                    type="text"
                    inputMode="numeric"
                    value={categorySortOrder || ''}
                    onChange={(e) => {
                      const val = e.target.value.replace(/[^0-9]/g, '')
                      setCategorySortOrder(val === '' ? 0 : Number(val))
                    }}
                    placeholder="0"
                  />
                </label>

                <div className="catalog-form-actions">
                  <button className="decision-btn seller" type="button" onClick={handleSaveCategory}>
                    {editingCategoryId ? 'Зберегти зміни' : 'Додати категорію'}
                  </button>
                  <button className="ghost-btn" type="button" onClick={resetCategoryForm}>
                    Очистити
                  </button>
                </div>

                <div className="catalog-hint">
                  <strong>Порада:</strong> нові категорії та підкатегорії одразу з’являться у фільтрах каталогу і формі створення товару після оновлення даних.
                </div>
              </div>
            </div>
          </section>
        )}

        {activeTab === 'disputes' && (
          <section className="admin-section">
            <div className="section-head">
              <div>
                <h2>Спори</h2>
                <p>Перегляд чату продавця та покупця, рішення: повернення коштів або передача продавцю.</p>
              </div>
              <button className="ghost-btn" onClick={loadData}>
                <RefreshCw size={16} /> Оновити
              </button>
            </div>

            {disputedOrders.length === 0 ? (
              <div className="empty-state">Зараз немає відкритих спорів</div>
            ) : (
              <div className="disputes-grid">
                <div className="disputes-list">
                  {disputedOrders.map((order) => (
                    <button
                      key={order.id}
                      className={`dispute-card ${selectedDisputeId === order.id ? 'active' : ''}`}
                      onClick={() => setSelectedDisputeId(order.id)}
                    >
                      <div className="dispute-card-top">
                        <strong>{order.product_name}</strong>
                        <span>{Number(order.price || 0).toFixed(2)} ₴</span>
                      </div>
                      <p>Покупець: {order.buyer_id}</p>
                      <p>Продавець: {order.seller_id}</p>
                      <small>{new Date(order.created_at).toLocaleDateString('uk-UA')}</small>
                    </button>
                  ))}
                </div>

                <div className="dispute-detail">
                  {activeDispute ? (
                    <>
                      <div className="dispute-detail-head">
                        <div>
                          <h3>{activeDispute.product_name}</h3>
                          <p>
                            {activeDispute.buyer_id} → {activeDispute.seller_id}
                          </p>
                        </div>
                      </div>

                      <div className="dispute-meta">
                        <span>Статус: {activeDispute.status}</span>
                        <span>Сума: {Number(activeDispute.price || 0).toFixed(2)} ₴</span>
                      </div>

                      <div className="chat-history">
                        <h4>Історія чату</h4>
                        <div className="chat-history-window">
                          {activeChat?.messages?.length ? (
                            activeChat.messages.map((message: any) => (
                              <div
                                key={message.id}
                                className={`chat-message ${message.isSystemMessage ? 'system' : ''}`}
                              >
                                <div className="chat-message-head">
                                  <strong>
                                    {message.sender_name}
                                    {message.sender_role === 'admin' && (
                                      <small className="role-badge admin"> Адмін</small>
                                    )}
                                    {message.sender_role === 'support' && (
                                      <small className="role-badge support"> Сапорт</small>
                                    )}
                                  </strong>
                                  <small>
                                    {new Date(message.timestamp).toLocaleString('uk-UA', {
                                      day: '2-digit',
                                      month: '2-digit',
                                      hour: '2-digit',
                                      minute: '2-digit',
                                    })}
                                  </small>
                                </div>
                                <p>{message.text}</p>
                                {message.attachment_data && (
                                  <div className="chat-message-attachment">
                                    <img
                                      src={message.attachment_data}
                                      alt={message.attachment_name || 'Фото у чаті'}
                                      role="button"
                                      tabIndex={0}
                                      onClick={() => openImageViewer(message.attachment_data, message.attachment_name || 'Фото у чаті')}
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter' || e.key === ' ') {
                                          e.preventDefault()
                                          openImageViewer(message.attachment_data, message.attachment_name || 'Фото у чаті')
                                        }
                                      }}
                                    />
                                    {message.attachment_name && <small>{message.attachment_name}</small>}
                                  </div>
                                )}
                              </div>
                            ))
                          ) : (
                            <div className="empty-state compact">Для цього спору ще немає історії чату</div>
                          )}
                        </div>
                      </div>

                      <div className="decision-box">
                        <h4>Рішення</h4>
                        <div className="decision-actions">
                          <button className="decision-btn refund" onClick={() => requestResolveConfirmation('refund')}>
                            Повернути кошти покупцю
                          </button>
                          <button className="decision-btn seller" onClick={() => requestResolveConfirmation('seller')}>
                            Передати кошти продавцю
                          </button>
                        </div>
                      </div>

                      <div className="support-reply-box">
                        <h4>Повідомлення саппорта</h4>
                        <textarea
                          value={supportMessage}
                          onChange={(e) => setSupportMessage(e.target.value)}
                          placeholder="Напишіть коментар у чат від імені саппорта..."
                          rows={4}
                        />
                        <div className="support-reply-actions">
                          <button className="ghost-btn" onClick={() => setSupportMessage('')}>
                            Очистити
                          </button>
                          <button
                            className="decision-btn seller"
                            onClick={handleSendSupportMessage}
                            disabled={!supportMessage.trim()}
                          >
                            Надіслати в чат
                          </button>
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="empty-state">Виберіть спір зі списку</div>
                  )}
                </div>
              </div>
            )}
          </section>
        )}
      </div>

      {pendingResolution && activeDispute && (
        <div className="confirm-modal-overlay" role="dialog" aria-modal="true" aria-label="Підтвердження рішення спору">
          <div className="confirm-modal">
            <h3>Підтвердьте дію</h3>
            <p>
              {pendingResolution === 'refund'
                ? 'Ви дійсно хочете повернути кошти покупцю?'
                : 'Ви дійсно хочете передати кошти продавцю?'}
            </p>
            <p className="confirm-modal-meta">
              Замовлення: <strong>{activeDispute.product_name}</strong> • Сума: <strong>{Number(activeDispute.price || 0).toFixed(2)} ₴</strong>
            </p>
            <div className="confirm-modal-actions">
              <button className="ghost-btn" onClick={() => setPendingResolution(null)}>
                Скасувати
              </button>
              <button
                className={`decision-btn ${pendingResolution === 'refund' ? 'refund' : 'seller'}`}
                onClick={confirmResolveAction}
              >
                Підтвердити
              </button>
            </div>
          </div>
        </div>
      )}
      {imageViewer && (
        <div className="image-viewer-overlay" onClick={closeImageViewer} role="dialog" aria-modal="true" aria-label="Перегляд фото">
          <div className="image-viewer" onClick={(e) => e.stopPropagation()}>
            <div className="image-viewer-header">
              <div>
                <strong>{imageViewer.name}</strong>
                <span>{Math.round(imageViewer.zoom * 100)}%</span>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <button type="button" className="image-viewer-open" onClick={() => { try { window.open(imageViewer.src, '_blank') } catch {} }} title="Відкрити оригінал">Відкрити оригінал</button>
                <button type="button" className="image-viewer-close" onClick={closeImageViewer} aria-label="Закрити">
                  <X size={18} />
                </button>
              </div>
            </div>
            <div className="image-viewer-controls">
              <button type="button" onClick={() => changeViewerZoom(-0.25)}>-</button>
              <button type="button" onClick={() => setImageViewer((current) => current ? { ...current, zoom: 1 } : current)}>100%</button>
              <button type="button" onClick={() => changeViewerZoom(0.25)}>+</button>
            </div>
            <div className="image-viewer-stage" onWheel={(e) => {
              e.preventDefault()
              changeViewerZoom(e.deltaY < 0 ? 0.1 : -0.1)
            }}>
              <img
                src={imageViewer.src}
                alt={imageViewer.name}
                style={{
                  transform: `translate(${imageViewer.offsetX}px, ${imageViewer.offsetY}px) scale(${imageViewer.zoom})`,
                  transition: imagePanRef.current.dragging ? 'none' : 'transform 0.12s ease-out',
                  cursor: imagePanRef.current.dragging ? 'grabbing' : 'grab',
                }}
                onPointerDown={startPan}
                onPointerMove={movePan}
                onPointerUp={endPan}
                onPointerLeave={endPan}
                onPointerCancel={endPan}
              />
            </div>
            <p className="image-viewer-hint">Можна крутити колесо миші або натискати `+` / `-`.</p>
          </div>
        </div>
      )}
      {selectedWithdrawal && (
        <div className="modal-overlay" onClick={() => setSelectedWithdrawal(null)}>
          <div className="modal-content withdrawal-modal" onClick={(e) => e.stopPropagation()}>
            <h2>Заявка на вивід</h2>
            <p className="withdrawal-modal-user">
              <strong>{selectedWithdrawal.user?.username || selectedWithdrawal.user_id}</strong>
              <span>{selectedWithdrawal.user?.email || selectedWithdrawal.user_id}</span>
            </p>

            <div className="withdrawal-modal-grid">
              <div>
                <small>Сума</small>
                <strong>{Number(selectedWithdrawal.amount_gross || 0).toFixed(2)} ₴</strong>
              </div>
              <div>
                <small>До виплати</small>
                <strong>{Number(selectedWithdrawal.amount_net || 0).toFixed(2)} ₴</strong>
              </div>
              <div>
                <small>Метод</small>
                <strong>{selectedWithdrawal.method === 'paypal' ? 'PayPal' : selectedWithdrawal.method === 'card' ? 'Карта' : 'USDT (TRC20)'}</strong>
              </div>
              <div>
                <small>Баланс після виводу</small>
                <strong>{Number(selectedWithdrawal.current_balance_after || 0).toFixed(2)} ₴</strong>
              </div>
            </div>

            <div className="withdrawal-modal-details">
              <div>
                <small>Реквізити</small>
                <p>{selectedWithdrawal.destination}</p>
              </div>
              <div>
                <small>Статус</small>
                <span className={`withdraw-status ${selectedWithdrawal.status}`}>
                  {selectedWithdrawal.status === 'pending'
                    ? 'Очікує'
                    : selectedWithdrawal.status === 'completed'
                      ? 'Підтверджено'
                      : selectedWithdrawal.status === 'refunded'
                        ? 'Повернуто'
                        : 'Відхилено'}
                </span>
              </div>
              <div>
                <small>Створено</small>
                <p>{new Date(selectedWithdrawal.created_at).toLocaleString('uk-UA')}</p>
              </div>
              {selectedWithdrawal.processed_at && (
                <div>
                  <small>Остання дія</small>
                  <p>{new Date(selectedWithdrawal.processed_at).toLocaleString('uk-UA')}</p>
                </div>
              )}
            </div>

            <div className="withdrawal-modal-actions">
              <button className="ghost-btn" onClick={() => setSelectedWithdrawal(null)}>Закрити</button>
              {selectedWithdrawal.status === 'pending' && (
                <button className="decision-btn seller" onClick={() => requestWithdrawalAction(selectedWithdrawal, 'complete')}>
                  Переказано
                </button>
              )}
              {selectedWithdrawal.status === 'pending' && (
                <button
                  className="decision-btn refund"
                  onClick={() => requestWithdrawalAction(selectedWithdrawal, 'refund')}
                  title="Повернути гроші користувачу"
                >
                  Повернути гроші
                </button>
              )}
            </div>
          </div>
        </div>
      )}
      {pendingWithdrawalAction && (
        <div className="confirm-modal-overlay" role="dialog" aria-modal="true" aria-label="Підтвердження операції з виводом">
          <div className="confirm-modal">
            <h3>Підтвердіть дію</h3>
            <p>
              {pendingWithdrawalAction.action === 'complete'
                ? 'Ви впевнені, що переказ уже відправлено користувачу?'
                : 'Ви дійсно хочете повернути кошти назад користувачу?'}
            </p>
            <p className="confirm-modal-meta">
              Заявка: <strong>{pendingWithdrawalAction.request.user?.username || pendingWithdrawalAction.request.user_id}</strong> • Сума: <strong>{Number(pendingWithdrawalAction.request.amount_gross || 0).toFixed(2)} ₴</strong>
            </p>
            <div className="confirm-modal-actions">
              <button className="ghost-btn" onClick={() => setPendingWithdrawalAction(null)}>
                Скасувати
              </button>
              <button
                className={`decision-btn ${pendingWithdrawalAction.action === 'complete' ? 'seller' : 'refund'}`}
                onClick={confirmWithdrawalAction}
                disabled={Boolean(withdrawalProcessing[pendingWithdrawalAction.request.id])}
              >
                {withdrawalProcessing[pendingWithdrawalAction.request.id]
                  ? 'Обробка...'
                  : pendingWithdrawalAction.action === 'complete'
                    ? 'Підтвердити'
                    : 'Повернути'}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Delete Product Confirmation Modal */}
      {productToDelete && (
        <div className="modal-overlay" onClick={() => setProductToDelete(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2>🗑️ Видалити товар?</h2>
            <p>Ви впевнені, що хочете видалити цей товар? Ця дія незворотна.</p>
            <div className="modal-actions">
              <button className="modal-btn-cancel" onClick={() => setProductToDelete(null)}>
                Скасувати
              </button>
              <button className="modal-btn-confirm" onClick={() => handleDeleteProduct(productToDelete)}>
                Видалити
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Delete User Confirmation Modal */}
      {deleteConfirmModal && (
        <div className="modal-overlay" onClick={() => setDeleteConfirmModal(null)}>
          <div className="modal-content delete-user-modal" onClick={(e) => e.stopPropagation()}>
            <h2>🗑️ Видалити користувача?</h2>
            <p className="modal-username">
              <strong>{deleteConfirmModal.username}</strong>
            </p>
            <p className="modal-warning">
              ⚠️ Будуть видалені:
            </p>
            <ul className="modal-list">
              <li>Усі його товари</li>
              <li>Усі його замовлення</li>
              <li>Усі його чати</li>
              <li>Усі його відгуки</li>
              <li>Інші дані користувача</li>
            </ul>
            <p className="modal-danger">
              Ця дія <strong>незворотна</strong>!
            </p>
            <div className="modal-actions">
              <button className="modal-btn-cancel" onClick={() => setDeleteConfirmModal(null)}>
                Скасувати
              </button>
              <button className="modal-btn-confirm danger" onClick={handleConfirmDelete}>
                Видалити користувача
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Delete Batch Confirmation Modal */}
      {batchDeleteConfirm && (
        <div className="confirm-modal-overlay" role="dialog" aria-modal="true" aria-label="Підтвердження видалення батчу">
          <div className="confirm-modal">
            <h3>Підтвердьте видалення батчу</h3>
            <p>Ви дійсно хочете видалити всі записи, згенеровані в батчі <strong>{batchDeleteTarget}</strong>?</p>
            <div className="confirm-modal-actions">
              <button className="ghost-btn" onClick={() => { setBatchDeleteConfirm(false); setBatchDeleteTarget(null); }}>
                Скасувати
              </button>
              <button className="decision-btn seller" onClick={async () => {
                try {
                  const batchToDelete = batchDeleteTarget || currentBatchId || localStorage.getItem('admin_last_batchId')
                  if (!batchToDelete) { showToast('ℹ️ Немає active batch', 'info'); return }
                  await api.post('/admin/db-seed/delete', { batchId: batchToDelete })
                  setPolling(true)
                  showToast('✅ Видалення запущено', 'success')
                } catch (err) {
                  console.error('Failed to start batch deletion', err)
                  showToast('Помилка видалення', 'error')
                } finally {
                  setBatchDeleteConfirm(false)
                  setBatchDeleteTarget(null)
                }
              }}>
                Підтвердити
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Delete All Generated Confirmation Modal */}
      {showGeneratedDeleteModal && (
        <div className="modal-overlay" onClick={() => setShowGeneratedDeleteModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2>🗑️ Видалити ВСІ згенеровані дані?</h2>
            <p>Ця дія назавжди видалить усі записи, створені генератором (id починаються на <strong>gen-</strong>). Резервна копія категорично рекомендована.</p>
            <div className="modal-actions">
              <button className="modal-btn-cancel" onClick={() => setShowGeneratedDeleteModal(false)}>Скасувати</button>
              <button className="modal-btn-confirm danger" onClick={async () => {
                try {
                  setShowGeneratedDeleteModal(false)
                  setPolling(true)
                  await api.delete('/admin/generated')
                  showToast('✅ Згенеровані дані видалено', 'success')
                  await loadData()
                } catch (err) {
                  console.error('Failed to delete generated data', err)
                  showToast('Помилка при видаленні згенерованих даних', 'error')
                } finally {
                  setPolling(false)
                }
              }}>Видалити ВСЕ</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default AdminPage
