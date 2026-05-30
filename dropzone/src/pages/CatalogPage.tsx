import React, { useEffect, useMemo, useState, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Filter, Search } from 'lucide-react'
import ProductCard from '../components/ProductCard/ProductCard'
import { Product, CatalogCategory } from '../types'
import api, { catalogService, productService } from '../services/api'
import facade from '../services/facade'
import { getStoredProducts } from '../utils/adminData'
import { CatalogIconBadge } from '../utils/catalogIcons'
import './CatalogPage.css'

interface AppItem {
  id: string
  name: string
  category: string
  icon: string
  productTypes: string[]
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

const matchesCatalogFilters = (
  product: Product,
  filters: { search: string; category: string; subcategory: string; minPrice: number; maxPrice: number }
) => {
  const searchHaystack = [product.title, product.description, product.seller?.username || product.seller_name || ''].join(' ').toLowerCase()
  const matchesSearch = !filters.search || searchHaystack.includes(filters.search)
  const matchesCategory = !filters.category || (product.category || '').toLowerCase() === filters.category
  const matchesSubcategory = !filters.subcategory || (product.subcategory || '').toLowerCase() === filters.subcategory
  const matchesMinPrice = Number(product.price || 0) >= filters.minPrice
  const matchesMaxPrice = Number(product.price || 0) <= filters.maxPrice
  const hasStock = Number(product.stock || 0) > 0

  return matchesSearch && matchesCategory && matchesSubcategory && matchesMinPrice && matchesMaxPrice && hasStock
}

const CatalogPage: React.FC = () => {
  const [searchParams] = useSearchParams()
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [page, setPage] = useState(1)
  const [totalProducts, setTotalProducts] = useState<number | null>(null)
  
  const [categories, setCategories] = useState<CatalogCategory[]>([])
  const [apps, setApps] = useState<AppItem[]>([])
  const [filteredApps, setFilteredApps] = useState<AppItem[]>([])
  
  const [selectedCategory, setSelectedCategory] = useState('')
  const [selectedApp, setSelectedApp] = useState('')
  const [selectedProductType, setSelectedProductType] = useState('')
  const [appSearchQuery, setAppSearchQuery] = useState('')
  const [priceRange, setPriceRange] = useState([0, 10000])
  const [visibleCount, setVisibleCount] = useState(24)
  const [sortOption, setSortOption] = useState<'newest' | 'price_asc' | 'price_desc' | 'popular' | 'least_popular'>('newest')
  const pageSize = 24
  const rootCategories = useMemo(() => categories.filter((category) => !category.parent_id), [categories])
  const activeSubcategory = selectedProductType || selectedApp
  const normalizedSearch = (searchParams.get('search') || '').trim().toLowerCase()

  // Завантажити дані з JSON
  useEffect(() => {
    const loadAppsData = async () => {
      try {
        const response = await catalogService.getTaxonomy()
        const payload = response.data?.data || {}
        const loadedCategories = flattenCatalogCategories((payload as any).categories || [])
        const loadedApps = (payload as any).apps || []
        setCategories(loadedCategories)
        setApps(loadedApps)
      } catch (error) {
        console.error('Failed to load apps data from backend:', error)
        setCategories([])
        setApps([])
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
        const params: Record<string, any> = {
          page: pageToLoad,
          pageSize,
          search: normalizedSearch,
          minPrice: priceRange[0],
          maxPrice: priceRange[1],
        }
        if (selectedCategory) params.category = selectedCategory
        if (activeSubcategory) params.subcategory = activeSubcategory
        const res = await productService.getAll(params)
        const payload = res.data?.data || {}
        const items = (payload as any).items || []
        const total = (payload as any).total ?? (Array.isArray(items) ? items.length : null)

        // Merge new items and dedupe by id to avoid duplicates after multiple page loads
        setProducts((current) => {
          const map = new Map<string, typeof items[0]>()
          for (const p of current) map.set(p.id, p)
          for (const p of (items || [])) {
            if (matchesCatalogFilters(p, { search: normalizedSearch, category: selectedCategory, subcategory: activeSubcategory, minPrice: priceRange[0], maxPrice: priceRange[1] })) {
              map.set(p.id, p)
            }
          }
          return Array.from(map.values())
        })
        // Prefer server-provided total, otherwise use deduped length
        setTotalProducts(total)
      } catch (err) {
        console.error('Failed to fetch products page:', err)
        // fallback to facade for local data
        const all = (await facade.fetchProducts()) || []
        const filtered = all.filter((p: any) => matchesCatalogFilters(p, { search: normalizedSearch, category: selectedCategory, subcategory: activeSubcategory, minPrice: priceRange[0], maxPrice: priceRange[1] }))
        setProducts(filtered)
        setTotalProducts(filtered.length)
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
  }, [selectedCategory, selectedApp, selectedProductType, appSearchQuery, priceRange, sortOption])

  const sortedProducts = useMemo(() => {
    const list = [...products]
    if (sortOption === 'newest') {
      return list.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    }
    if (sortOption === 'price_asc') {
      return list.sort((a, b) => Number(a.price || 0) - Number(b.price || 0))
    }
    if (sortOption === 'price_desc') {
      return list.sort((a, b) => Number(b.price || 0) - Number(a.price || 0))
    }
    if (sortOption === 'popular') {
      return list.sort((a, b) => (Number(b.reviews_count || 0) - Number(a.reviews_count || 0)))
    }
    if (sortOption === 'least_popular') {
      return list.sort((a, b) => (Number(a.reviews_count || 0) - Number(b.reviews_count || 0)))
    }
    return list
  }, [products, sortOption])

  const visibleProducts = useMemo(() => sortedProducts.slice(0, visibleCount), [sortedProducts, visibleCount])
  const hasMoreProducts = visibleCount < sortedProducts.length
  const visualsRef = useRef<HTMLDivElement | null>(null)

  const handleShowMore = () => {
    if (loadingMore) return
    if (!hasMoreProducts && totalProducts && products.length < totalProducts) {
      // need to load next server page
      const nextPage = page + 1
      setLoadingMore(true)
      productService.getAll({
        page: nextPage,
        pageSize,
        category: selectedCategory,
        subcategory: activeSubcategory,
        search: normalizedSearch,
        minPrice: priceRange[0],
        maxPrice: priceRange[1],
      })
        .then((res) => {
          const payload = res.data?.data || res.data || {}
          const items = (payload as any).items || []
          setProducts((current) => {
          const map = new Map<string, any>()
            for (const p of current) map.set(p.id, p)
            for (const p of items) {
              if (matchesCatalogFilters(p, { search: normalizedSearch, category: selectedCategory, subcategory: activeSubcategory, minPrice: priceRange[0], maxPrice: priceRange[1] })) {
                map.set(p.id, p)
              }
            }
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

  const selectedCategoryExists = categories.some((c) => c.id === selectedCategory)
  const selectedAppExists = apps.some((a) => a.id === selectedApp)
  const selectedProductTypeExists = selectedProductType ? productTypes.includes(selectedProductType) : true

  const handleCategorySelect = (catId: string) => {
    setSelectedCategory(selectedCategory === catId ? '' : catId)
    setSelectedApp('')
    setSelectedProductType('')
    setAppSearchQuery('')
  }

  useEffect(() => {
    let raf = 0 as number | null
    let lastX = 0
    let lastY = 0
    const onMove = (e: MouseEvent) => {
      const w = window.innerWidth || 1
      const h = window.innerHeight || 1
      const x = (e.clientX / w - 0.5) * 40 // -20..20
      const y = (e.clientY / h - 0.5) * 40
      lastX = x
      lastY = y
      if (!raf) {
        raf = requestAnimationFrame(() => {
          if (visualsRef.current) {
            visualsRef.current.style.setProperty('--mx', String(lastX))
            visualsRef.current.style.setProperty('--my', String(lastY))
          }
          raf = 0
        }) as unknown as number
      }
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('touchmove', (ev) => {
      if (ev.touches && ev.touches[0]) onMove(ev.touches[0] as unknown as MouseEvent)
    }, { passive: true })
    return () => {
      window.removeEventListener('mousemove', onMove)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [])

  return (
    <div className="catalog-page">
      <div className="catalog-visuals" aria-hidden="true" ref={visualsRef}>
        <span className="catalog-visuals-grid" />
        <span className="catalog-visuals-orb catalog-visuals-orb-a" />
        <span className="catalog-visuals-orb catalog-visuals-orb-b" />
        <span className="catalog-visuals-orb catalog-visuals-orb-c" />
        <span className="catalog-visuals-orb catalog-visuals-orb-d" />
        <span className="catalog-visuals-orb catalog-visuals-orb-e" />
        <span className="catalog-visuals-edge catalog-visuals-edge-left" />
        <span className="catalog-visuals-edge catalog-visuals-edge-right" />
        <span className="catalog-visuals-scan" />
        <span className="catalog-visuals-particles">
          <i />
          <i />
          <i />
          <i />
          <i />
          <i />
          <i />
          <i />
          <i />
          <i />
          <i />
          <i />
        </span>
        <span className="catalog-visuals-lines" aria-hidden="true">
          <span className="catalog-visuals-ring" />
          <span className="catalog-visuals-ring small" />
          <span className="catalog-visuals-swoosh spin-slow"><span className="dot" /></span>
          <span className="catalog-visuals-swoosh spin-fast"><span className="dot" /></span>
        </span>
        {/* SVG path animations removed temporarily (caused large fills) */}
      </div>
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
                  <CatalogIconBadge value={cat.icon || cat.emoji} className="cat-icon" />
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
                {filteredApps.length === 0 ? (
                  <div className="empty-state compact">{appSearchQuery ? 'Такого застосунку не знайдено' : 'Застосунків немає'}</div>
                ) : (
                  filteredApps.map((app) => (
                    <button
                      key={app.id}
                      className={`app-btn ${selectedApp === app.id ? 'active' : ''}`}
                      onClick={() => {
                        setSelectedApp(selectedApp === app.id ? '' : app.id)
                        setSelectedProductType('')
                      }}
                    >
                      <CatalogIconBadge value={app.icon} className="app-icon" />
                      <span>{app.name}</span>
                    </button>
                  ))
                )}
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
                    <div className="sort-control">
                      <label htmlFor="catalog-sort">Сортування:</label>
                      <select
                        id="catalog-sort"
                        value={sortOption}
                        onChange={(e) => setSortOption(e.target.value as any)}
                      >
                        <option value="newest">Нові</option>
                        <option value="popular">Популярні</option>
                        <option value="least_popular">Менш популярні</option>
                        <option value="price_asc">Зростання ціни</option>
                        <option value="price_desc">Зменшення ціни</option>
                      </select>
                    </div>
                  </div>
              <div className="products-grid-virtual">
                <div className="products-grid">
                  {visibleProducts.map((product) => (
                    <ProductCard key={product.id} product={product} />
                  ))}
                </div>
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
                { !selectedCategoryExists ? (
                    'Обрана категорія не знайдена'
                  ) : !selectedAppExists && selectedApp ? (
                    'Обраний застосунок не знайдено'
                  ) : selectedApp && !selectedProductTypeExists ? (
                    'Обрана підкатегорія не знайдена'
                  ) : selectedCategory ? (
                    selectedApp ? 'Нема товарів для цього застосунку' : 'Виберіть застосунок'
                  ) : (
                    'Виберіть категорію для початку'
                  )}
              </p>
            </div>
          )}
        </main>
      </div>
    </div>
  )
}

export default CatalogPage
