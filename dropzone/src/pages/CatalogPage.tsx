import React, { useEffect, useMemo, useState, useRef } from 'react'
import VirtualList from '../components/VirtualList/VirtualList'
import { useSearchParams } from 'react-router-dom'
import { Filter, Search } from 'lucide-react'
import ProductCard from '../components/ProductCard/ProductCard'
import { Product, CatalogCategory } from '../types'
import api, { catalogService, productService } from '../services/api'
import facade from '../services/facade'
import { getStoredProducts, getStoredCatalogCategories, saveStoredCatalogCategories } from '../utils/adminData'
import './CatalogPage.css'

interface AppItem {
  id: string
  name: string
  category: string
  icon: string
  productTypes: string[]
}

const DEFAULT_CATEGORIES: CatalogCategory[] = [
  { id: 'games', name: 'Ігри', parent_id: null, sort_order: 1, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), children: [] },
  { id: 'subscriptions', name: 'Підписки', parent_id: null, sort_order: 2, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), children: [] },
  { id: 'keys', name: 'Ключі і Коди', parent_id: null, sort_order: 3, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), children: [] },
]

const DEFAULT_APPS: AppItem[] = [
  { id: 'cs2', name: 'CS2', category: 'games', icon: '🎯', productTypes: [] },
  { id: 'dota2', name: 'Dota 2', category: 'games', icon: '🛡️', productTypes: [] },
  { id: 'valorant', name: 'Valorant', category: 'games', icon: '⚡', productTypes: [] },
  { id: 'pubg', name: 'PUBG', category: 'games', icon: '🔫', productTypes: [] },
  { id: 'fortnite', name: 'Fortnite', category: 'games', icon: '🧱', productTypes: [] },
  { id: 'telegram', name: 'Telegram', category: 'subscriptions', icon: '✈️', productTypes: [] },
  { id: 'spotify', name: 'Spotify', category: 'subscriptions', icon: '🎵', productTypes: [] },
  { id: 'discord', name: 'Discord', category: 'subscriptions', icon: '💬', productTypes: [] },
  { id: 'youtube', name: 'YouTube', category: 'subscriptions', icon: '▶️', productTypes: [] },
  { id: 'windows', name: 'Windows', category: 'keys', icon: '🪟', productTypes: [] },
  { id: 'office', name: 'Office', category: 'keys', icon: '📄', productTypes: [] },
]

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

const CatalogPage: React.FC = () => {
  const [searchParams] = useSearchParams()
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [page, setPage] = useState(1)
  const [totalProducts, setTotalProducts] = useState<number | null>(null)
  
  const [categories, setCategories] = useState<CatalogCategory[]>(DEFAULT_CATEGORIES)
  const [apps, setApps] = useState<AppItem[]>(DEFAULT_APPS)
  const [filteredApps, setFilteredApps] = useState<AppItem[]>([])
  
  const [selectedCategory, setSelectedCategory] = useState('')
  const [selectedApp, setSelectedApp] = useState('')
  const [selectedProductType, setSelectedProductType] = useState('')
  const [appSearchQuery, setAppSearchQuery] = useState('')
  const [priceRange, setPriceRange] = useState([0, 10000])
  const [visibleCount, setVisibleCount] = useState(24)
  const pageSize = 24
  const rootCategories = useMemo(() => categories.filter((category) => !category.parent_id), [categories])

  // Завантажити дані з JSON
  useEffect(() => {
    const loadAppsData = async () => {
      try {
        const response = await catalogService.getTaxonomy()
        const payload = response.data?.data || response.data
        const loadedCategories = (payload?.categories && payload.categories.length > 0)
          ? flattenCatalogCategories(payload.categories)
          : flattenCatalogCategories(DEFAULT_CATEGORIES)
        const loadedApps = (payload?.apps && payload.apps.length > 0) ? payload.apps : DEFAULT_APPS
        setCategories(loadedCategories)
        setApps(loadedApps)
        saveStoredCatalogCategories(loadedCategories)
      } catch (error) {
        console.error('Failed to load apps data from backend:', error)
        const stored = getStoredCatalogCategories()
        setCategories(stored.length > 0 ? stored : flattenCatalogCategories(DEFAULT_CATEGORIES))
        setApps(DEFAULT_APPS)
      }
    }
    loadAppsData()
  }, [])

  // Фільтрувати застосунки
  useEffect(() => {
    let filtered = apps
    
    if (selectedCategory) {
      filtered = filtered.filter(app => app.category === selectedCategory)
    }
    
    if (appSearchQuery) {
      filtered = filtered.filter(app =>
        app.name.toLowerCase().includes(appSearchQuery.toLowerCase())
      )
    }
    
    setFilteredApps(filtered)
  }, [selectedCategory, appSearchQuery, apps])

  

  useEffect(() => {
    // Reset paging when filters change
    setProducts([])
    setPage(1)
    setTotalProducts(null)
    const controller = new AbortController()

    const loadPage = async (pageToLoad: number) => {
      try {
        setLoading(true)
        const searchQuery = (searchParams.get('search') || '').trim().toLowerCase()
        const params: Record<string, any> = { page: pageToLoad, pageSize, search: searchQuery }
        if (selectedCategory) params.category = selectedCategory
        const res = await productService.getAll(params)
        const payload = res.data?.data || res.data || {}
        const items = payload.items || payload || []
        const total = payload.total ?? (Array.isArray(items) ? items.length : null)

        // Merge new items and dedupe by id to avoid duplicates after multiple page loads
        setProducts((current) => {
          const map = new Map<string, typeof items[0]>()
          for (const p of current) map.set(p.id, p)
          for (const p of (items || [])) map.set(p.id, p)
          return Array.from(map.values())
        })
        // Prefer server-provided total, otherwise use deduped length
        setTotalProducts(total)
      } catch (err) {
        console.error('Failed to fetch products page:', err)
        // fallback to facade for local data
        const all = (await facade.fetchProducts()) || []
        setProducts(all.filter((p: any) => Number(p.stock || 0) > 0))
        setTotalProducts(all.length)
      } finally {
        setLoading(false)
      }
    }

    void loadPage(1)

    return () => controller.abort()
  }, [searchParams, selectedCategory, selectedApp, selectedProductType, priceRange, apps])

  useEffect(() => {
    setVisibleCount(pageSize)
    setLoadingMore(false)
  }, [selectedCategory, selectedApp, selectedProductType, appSearchQuery, priceRange])

  const visibleProducts = useMemo(() => products.slice(0, visibleCount), [products, visibleCount])
  const hasMoreProducts = visibleCount < products.length

  const listRef = useRef<any>(null)
  const itemsPerRow = 3
  const rowCount = Math.max(1, Math.ceil(products.length / itemsPerRow))
  const rowHeight = 340

  const handleShowMore = () => {
    if (loadingMore) return
    if (!hasMoreProducts && totalProducts && products.length < totalProducts) {
      // need to load next server page
      const nextPage = page + 1
      setLoadingMore(true)
      productService.getAll({ page: nextPage, pageSize, category: selectedCategory, search: (searchParams.get('search') || '').trim().toLowerCase() })
        .then((res) => {
          const payload = res.data?.data || res.data || {}
          const items = payload.items || []
          setProducts((current) => {
            const map = new Map<string, typeof items[0]>()
            for (const p of current) map.set(p.id, p)
            for (const p of items) map.set(p.id, p)
            return Array.from(map.values())
          })
          setPage(nextPage)
          setVisibleCount((c) => c + (Array.isArray(items) ? items.length : 0))
        })
        .catch((err) => {
          console.error('Failed to load more products:', err)
        })
        .finally(() => {
          setLoadingMore(false)
        })
      return
    }

    if (!hasMoreProducts) return
    setLoadingMore(true)
    window.setTimeout(() => {
      setVisibleCount((current) => Math.min(current + pageSize, products.length))
      setLoadingMore(false)
    }, 180)
  }

  const currentApp = apps.find(app => app.id === selectedApp)
  const productTypes = currentApp?.productTypes || []

  const handleCategorySelect = (catId: string) => {
    setSelectedCategory(selectedCategory === catId ? '' : catId)
    setSelectedApp('')
    setSelectedProductType('')
    setAppSearchQuery('')
  }

  return (
    <div className="catalog-page">
      <div className="catalog-header">
        <h1>Каталог товарів</h1>
        <p>Знайдіть все, що вам потрібно</p>
      </div>

      {loading && (
        <div className="catalog-loader-overlay" role="status" aria-live="polite" aria-busy="true">
          <div className="catalog-loader-card">
            <div className="catalog-loader-spinner" />
            <h2>Завантажуємо каталог</h2>
            <p>Підготовка фільтрів і товарів...</p>
          </div>
        </div>
      )}

      <div className={`catalog-container ${loading ? 'is-loading' : ''}`}>
        {/* Sidebar Filters */}
        <aside className="sidebar-filters">
          <div className="filter-section-header">
            <Filter size={20} />
            <h3>Фільтри</h3>
          </div>

          {/* Categories */}
          <div className="filter-group">
            <label className="filter-group-label">Категорія</label>
            <div className="categories-list">
              {rootCategories.map((cat) => (
                <button
                  key={cat.id}
                  className={`category-btn ${selectedCategory === cat.id ? 'active' : ''}`}
                  onClick={() => handleCategorySelect(cat.id)}
                >
                  <span className="cat-icon">{cat.icon}</span>
                  <span>{cat.name}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Apps Search & Select */}
          {selectedCategory && (
            <div className="filter-group">
              <label className="filter-group-label">Застосунок</label>
              <div className="app-search">
                <Search size={18} />
                <input
                  type="text"
                  placeholder="Пошук застосунку..."
                  value={appSearchQuery}
                  onChange={(e) => setAppSearchQuery(e.target.value)}
                  className="app-search-input"
                />
              </div>
              <div className="apps-list">
                {filteredApps.map((app) => (
                  <button
                    key={app.id}
                    className={`app-btn ${selectedApp === app.id ? 'active' : ''}`}
                    onClick={() => {
                      setSelectedApp(selectedApp === app.id ? '' : app.id)
                      setSelectedProductType('')
                    }}
                  >
                    <span className="app-icon">{app.icon}</span>
                    <span>{app.name}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Product Types */}
          {selectedApp && productTypes.length > 0 && (
            <div className="filter-group">
              <label className="filter-group-label">Тип товару</label>
              <div className="product-types-list">
                {productTypes.map((type) => (
                  <button
                    key={type}
                    className={`type-btn ${selectedProductType === type ? 'active' : ''}`}
                    onClick={() => setSelectedProductType(selectedProductType === type ? '' : type)}
                  >
                    {type}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Price Filter */}
          <div className="filter-group">
            <label className="filter-group-label">Ціна</label>
            <div className="price-inputs">
              <input
                type="text"
                inputMode="numeric"
                placeholder="Від"
                value={priceRange[0] || ''}
                onChange={(e) => {
                  const val = e.target.value.replace(/[^0-9]/g, '')
                  setPriceRange([val === '' ? 0 : Number(val), priceRange[1]])
                }}
              />
              <span className="price-separator">-</span>
              <input
                type="text"
                inputMode="numeric"
                placeholder="До"
                value={priceRange[1] || ''}
                onChange={(e) => {
                  const val = e.target.value.replace(/[^0-9]/g, '')
                  setPriceRange([priceRange[0], val === '' ? 100000 : Number(val)])
                }}
              />
            </div>
          </div>

          {/* Clear Filters */}
          {(selectedCategory || selectedApp || selectedProductType) && (
            <button 
              className="clear-filters-btn"
              onClick={() => {
                setSelectedCategory('')
                setSelectedApp('')
                setSelectedProductType('')
                setAppSearchQuery('')
              }}
            >
              Очистити фільтри
            </button>
          )}
        </aside>

        {/* Main Content */}
        <main className="catalog-content">
          {loading ? (
            <div className="loading-state">Завантаження...</div>
          ) : products.length > 0 ? (
            <>
                  <div className="results-info">
                    <p>Знайдено {totalProducts !== null ? totalProducts : products.length} товарів, показано {visibleProducts.length}</p>
                  </div>
              <div className="products-grid-virtual">
                {products.length > 80 ? (
                  <VirtualList
                    ref={listRef}
                    height={Math.min(840, rowCount * rowHeight)}
                    itemCount={rowCount}
                    itemSize={rowHeight}
                    width={'100%'}
                  >
                    {({ index, style }) => {
                      const start = index * itemsPerRow
                      const rowItems = products.slice(start, start + itemsPerRow)
                      return (
                        <div className="product-row" style={style} key={index}>
                          {rowItems.map((product) => (
                            <div className="product-cell" key={product.id}>
                              <ProductCard product={product} />
                            </div>
                          ))}
                        </div>
                      )
                    }}
                  </VirtualList>
                ) : (
                  <div className="products-grid">
                    {visibleProducts.map((product) => (
                      <ProductCard key={product.id} product={product} />
                    ))}
                  </div>
                )}
              </div>
              {(hasMoreProducts || (totalProducts !== null && products.length < totalProducts)) && (
                <div className="catalog-show-more-wrap">
                  <button
                    className="catalog-show-more-btn"
                    onClick={handleShowMore}
                    disabled={loadingMore}
                    type="button"
                  >
                    {loadingMore ? <span className="catalog-loading-more-spinner" /> : 'Показати ще'}
                  </button>
                </div>
              )}
            </>
          ) : (
            <div className="empty-state">
              <h2>Товари не знайдені</h2>
              <p>
                {selectedCategory 
                  ? selectedApp 
                    ? 'Нема товарів для цього застосунку' 
                    : 'Виберіть застосунок'
                  : 'Виберіть категорію для початку'}
              </p>
            </div>
          )}
        </main>
      </div>
    </div>
  )
}

export default CatalogPage
