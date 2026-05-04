import React, { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, CheckCircle2, MessageCircle, Shield, Users, AlertTriangle, RefreshCw, Search, BadgeInfo } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'
import { User, UserRole, CatalogCategory } from '../types'
import { appendChatMessageToSellerThread, findStoredUserById, getStoredChats, getStoredOrders, getStoredUsers, resolveDispute, updateStoredUserRole, getStoredProducts, saveStoredProducts, getAdminLogs, appendAdminLog, clearAdminLogs, getStoredCatalogCategories, saveStoredCatalogCategories } from '../utils/adminData'
import api, { catalogService } from '../services/api'
import CustomSelect from '../components/CustomSelect/CustomSelect'
import { useToast } from '../components/Toast'
import './AdminPage.css'

type AdminTab = 'overview' | 'users' | 'disputes' | 'products' | 'catalog'

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
  const [products, setProducts] = useState<any[]>([])
  const [catalogCategories, setCatalogCategories] = useState<CatalogCategory[]>([])
  const [selectedDisputeId, setSelectedDisputeId] = useState('')
  const [productSearch, setProductSearch] = useState('')
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
  const [categoryParentId, setCategoryParentId] = useState('')
  const [categorySortOrder, setCategorySortOrder] = useState(0)
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null)
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

      setUsers(storedUsers)
      setOrders(storedOrders)
      setChats(storedChats)
      setProducts(storedProducts)
      setDebugLogs(storedLogs)

      const firstDispute = storedOrders.find((order) => order.status === 'disputed')
      setSelectedDisputeId((current) => current || firstDispute?.id || '')
      setLoading(false)
      return
    }

    try {
      const [usersRes, ordersRes, chatsRes, productsRes, catalogRes, disputesRes] = await Promise.all([
        api.get('/users'),
        api.get('/orders'),
        api.get('/chat/threads'),
        api.get('/products', { params: { pageSize: 100 } }),
        catalogService.getAdminCategories(),
        api.get('/admin/disputes').catch(() => ({ data: { data: [] } })), // Disputes endpoint might not exist
      ])

      const nextUsers = usersRes.data?.data ?? []
      const nextOrders = ordersRes.data?.data ?? []
      const nextChats = chatsRes.data?.data ?? []
      const nextDisputes = disputesRes.data?.data ?? []
      
      // If we got disputes with chat data, merge them with orders
      if (nextDisputes.length > 0) {
        // Replace orders with disputed data if available
        const disputeIds = new Set(nextDisputes.map((d: any) => d.id))
        const nonDisputedOrders = nextOrders.filter((o: any) => !disputeIds.has(o.id))
        setOrders([...nextDisputes, ...nonDisputedOrders])
      } else {
        setOrders(nextOrders)
      }
      
      const nextProducts = productsRes.data?.data?.items ?? productsRes.data?.data ?? []
      const nextCatalog = flattenCatalogCategories(catalogRes.data?.data?.categories ?? [])

      setUsers(nextUsers)
      setChats(nextChats)
      setProducts(nextProducts)
      setCatalogCategories(nextCatalog)
      saveStoredCatalogCategories(nextCatalog)
      setDebugLogs(storedLogs)

      const firstDispute = nextOrders.find((order: any) => order.status === 'disputed')
      setSelectedDisputeId((current) => current || firstDispute?.id || '')
    } catch (_error) {
      const storedUsers = getStoredUsers()
      const storedOrders = getStoredOrders()
      const storedChats = getStoredChats()
      const storedProducts = getStoredProducts()
      const storedCatalog = getStoredCatalogCategories()

      setUsers(storedUsers)
      setOrders(storedOrders)
      setChats(storedChats)
      setProducts(storedProducts)
      setCatalogCategories(storedCatalog)
      if (storedCatalog.length === 0) {
        saveStoredCatalogCategories([])
      }
      setDebugLogs(storedLogs)

      const firstDispute = storedOrders.find((order) => order.status === 'disputed')
      setSelectedDisputeId((current) => current || firstDispute?.id || '')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadData()

    const handleStorage = () => void loadData()
    window.addEventListener('storage', handleStorage)
    return () => window.removeEventListener('storage', handleStorage)
  }, [])

  useEffect(() => {
    // If role changes under us, ensure active tab is valid for the role
    const tabsForRole = isAdmin ? ['overview', 'users', 'disputes', 'products', 'catalog'] : role === 'support' ? ['disputes'] : ['overview']
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

  const handleEditProduct = (productId: string) => {
    navigate(`/create-product/${productId}`)
  }

  const rootCategories = useMemo(() => catalogCategories.filter((category) => !category.parent_id), [catalogCategories])
  const resetCategoryForm = () => {
    setCategoryName('')
    setCategoryParentId('')
    setCategorySortOrder(0)
    setEditingCategoryId(null)
  }

  const handleEditCategory = (category: CatalogCategory) => {
    setEditingCategoryId(category.id)
    setCategoryName(category.name)
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
      } catch (_error) {
      }

      const fallback = getStoredCatalogCategories()
      const now = new Date().toISOString()
      if (editingCategoryId) {
        const index = fallback.findIndex((item) => item.id === editingCategoryId)
        if (index !== -1) {
          fallback[index] = {
            ...fallback[index],
            name: categoryName.trim(),
            parent_id: categoryParentId || null,
            sort_order: categorySortOrder,
            updated_at: now,
          }
        }
      } else {
        fallback.unshift({
          id: `cat-${Date.now()}`,
          name: categoryName.trim(),
          parent_id: categoryParentId || null,
          sort_order: categorySortOrder,
          created_at: now,
          updated_at: now,
        })
      }
      saveStoredCatalogCategories(fallback)
      setCatalogCategories(fallback)
      resetCategoryForm()
      showToast(editingCategoryId ? '✅ Категорію оновлено' : '✅ Категорію додано', 'success')
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
      } catch (_error) {
      }

      const fallback = getStoredCatalogCategories()
      const idsToDelete = new Set<string>()
      const collect = (id: string) => {
        idsToDelete.add(id)
        fallback.filter((item) => item.parent_id === id).forEach((child) => collect(child.id))
      }
      collect(categoryId)
      const next = fallback.filter((item) => !idsToDelete.has(item.id))
      saveStoredCatalogCategories(next)
      setCatalogCategories(next)
      if (editingCategoryId === categoryId) resetCategoryForm()
      showToast('✅ Категорію видалено', 'success')
    })()
  }

  const handleDeleteProduct = (productId: string) => {
    void (async () => {
      try {
        await api.delete(`/products/${productId}`)
        const updated = products.filter((p: any) => p.id !== productId)
        setProducts(updated)
        setProductToDelete(null)
        showToast('✅ Товар видалено', 'success')
        return
      } catch (_err) {
      }

      const updated = products.filter((p: any) => p.id !== productId)
      saveStoredProducts(updated)
      setProducts(updated)
      setProductToDelete(null)
      showToast('✅ Товар видалено', 'success')
    })()
  }

  const metrics = useMemo(() => {
    const completedRevenue = orders
      .filter((order) => order.status === 'completed')
      .reduce((sum, order) => sum + Number(order.price || 0), 0)

    return {
      users: users.length,
      admins: users.filter((candidate) => candidate.role === 'admin').length,
      supports: users.filter((candidate) => candidate.role === 'support').length,
      disputes: disputedOrders.length,
      completedOrders: orders.filter((order) => order.status === 'completed').length,
      revenue: completedRevenue,
      chats: chats.length,
    }
  }, [chats.length, disputedOrders.length, orders, users])

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
      } catch (_error) {
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
      } catch (_error) {
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
        } catch (_err) {
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
      } catch (_error) {
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

  if (loading) {
    return <div className="admin-page loading">Завантаження...</div>
  }

  const adminTabs: AdminTab[] = isAdmin ? ['overview', 'users', 'disputes', 'products', 'catalog'] : role === 'support' ? ['disputes'] : ['overview']

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
              {tab === 'products' && 'Товари'}
              {tab === 'catalog' && 'Категорії'}
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
                visibleUsers.map((candidate, index) => (
                  <div key={candidate.id || candidate.email || `user-${index}`} className="users-table-row">
                    <div>
                      <strong>{candidate.username || 'Unknown User'}</strong>
                      <p>{candidate.id || 'unknown-id'}</p>
                    </div>
                    <span>{candidate.email || 'unknown@example.com'}</span>
                    <div className="role-selector-cell">
                      <button
                        className={`role-selector-btn role-${candidate.role || 'user'}`}
                        onClick={() => setOpenRoleMenu(openRoleMenu === candidate.id ? null : candidate.id)}
                        disabled={candidate.id === user?.id}
                        title={candidate.id === user?.id ? "Власну роль змінювати не можна" : ""}
                      >
                        {roleLabel[candidate.role || 'user']}
                      </button>
                      {openRoleMenu === candidate.id && candidate.id !== user?.id && (
                        <div className="role-selector-menu">
                          {roleOptions.map((option) => (
                            <button
                              key={option.value}
                              className={`role-option ${candidate.role === option.value ? 'active' : ''}`}
                              onClick={() => {
                                handleRoleChange(candidate.id, option.value)
                              }}
                            >
                              {option.label}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="balance-cell">
                      {editingBalance[candidate.id] !== undefined ? (
                        <div className="balance-input-group">
                          <input
                            type="number"
                            value={editingBalance[candidate.id]}
                            onChange={(e) => setEditingBalance({ ...editingBalance, [candidate.id]: Number(e.target.value) })}
                            className="balance-input"
                            min="0"
                            step="0.01"
                          />
                          <button
                            className="balance-save-btn"
                            onClick={() => handleBalanceChange(candidate.id, editingBalance[candidate.id])}
                            title="Зберегти"
                          >
                            ✓
                          </button>
                          <button
                            className="balance-cancel-btn"
                            onClick={() => setEditingBalance(({ [candidate.id]: _, ...rest }) => rest)}
                            title="Скасувати"
                          >
                            ✕
                          </button>
                        </div>
                      ) : (
                        <div className="balance-display">
                          <span>{Number(candidate.balance || 0).toFixed(2)} ₴</span>
                          <button
                            className="balance-edit-btn"
                            onClick={() => setEditingBalance({ ...editingBalance, [candidate.id]: Number(candidate.balance || 0) })}
                            title="Редагувати баланс"
                          >
                            ✎
                          </button>
                        </div>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem' }} />
                  </div>
                ))
              )}
            </div>
          </section>
        )}

        {activeTab === 'products' && isAdmin && (
          <section className="admin-section">
            <div className="section-head">
              <div>
                <h2>Товари</h2>
                <p>Перегляд, пошук та управління товарами в системі.</p>
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
                <label>
                  Батьківська категорія
                  <CustomSelect
                    id="admin-category-parent"
                    value={categoryParentId}
                    placeholder="Без батьківської (верхній рівень)"
                    onChange={setCategoryParentId}
                    options={[
                      { value: '', label: 'Без батьківської (верхній рівень)' },
                      ...catalogCategories
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
                    type="number"
                    min="0"
                    value={categorySortOrder}
                    onChange={(e) => setCategorySortOrder(Number(e.target.value))}
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
    </div>
  )
}

export default AdminPage
