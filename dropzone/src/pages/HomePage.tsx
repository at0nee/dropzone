import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, Package, Rocket, ShieldCheck, ShoppingBag, Star, TrendingUp, Users } from 'lucide-react'
import ProductCard from '../components/ProductCard/ProductCard'
import { Product } from '../types'
import { getAllReviews, getHomeSummary } from '../services/facade'
import { getReviewMetricsForSeller, ReviewLike } from '../utils/reviewMetrics'
import './HomePage.css'

interface SellerLeaderboardItem {
  sellerId: string
  username: string
  rating: number
  reviewsCount: number
  salesCount: number
}

const HomePage: React.FC = () => {
  const navigate = useNavigate()
  const popularCarouselRef = useRef<HTMLDivElement>(null)
  const [reviews, setReviews] = useState<ReviewLike[]>([])
  const [popularFromServer, setPopularFromServer] = useState<Product[]>([])
  const [completedPurchasesCount, setCompletedPurchasesCount] = useState(0)
  const [salesCountBySellerSummary, setSalesCountBySellerSummary] = useState<Record<string, number>>({})
  const [sellerNamesById, setSellerNamesById] = useState<Record<string, string>>({})
  const [productsCount, setProductsCount] = useState(0)
  const [activeSellersCount, setActiveSellersCount] = useState(0)
  const [categoriesCount, setCategoriesCount] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchData = async () => {
      try {
        const savedReviews = await getAllReviews()
        const summary = await getHomeSummary()

        setReviews((Array.isArray(savedReviews) ? savedReviews : savedReviews?.data) || [])
        setCompletedPurchasesCount(summary.completedPurchasesCount || 0)
        setProductsCount(summary.productsCount || 0)
        setActiveSellersCount(summary.activeSellersCount || 0)
        setCategoriesCount(summary.categoriesCount || 0)
        setSalesCountBySellerSummary(summary.salesCountBySeller || {})
        setSellerNamesById(summary.sellerNamesById || {})
        setPopularFromServer((summary.popularProducts || []) as Product[])
      } catch (error) {
        console.error('Failed to fetch products:', error)
        setReviews([])
        setPopularFromServer([])
        setCompletedPurchasesCount(0)
        setSalesCountBySellerSummary({})
        setSellerNamesById({})
        setProductsCount(0)
        setActiveSellersCount(0)
        setCategoriesCount(0)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [])

  const popularProducts = useMemo(() => {
    return popularFromServer
  }, [popularFromServer])

  const sellerLeaderboards = useMemo(() => {
    const sellerMeta = new Map<string, { username: string; rating: number; reviewsCount: number }>()
    const salesCountBySeller = new Map<string, number>()
    const resolveSellerName = (sellerId: string, fallbackName?: string) => sellerNamesById[sellerId] || fallbackName || sellerId

    // Add all sellers with sales
    Object.entries(salesCountBySellerSummary).forEach(([sellerId, sales]) => {
      salesCountBySeller.set(sellerId, Number(sales) || 0)
      if (!sellerMeta.has(sellerId)) {
        sellerMeta.set(sellerId, {
          username: resolveSellerName(sellerId),
          rating: 0,
          reviewsCount: 0,
        })
      }
    })

    // Add all sellers with reviews
    reviews.forEach((review) => {
      const current = sellerMeta.get(review.seller_id)
      if (!current) {
        sellerMeta.set(review.seller_id, {
          username: resolveSellerName(review.seller_id, review.seller_name),
          rating: 0,
          reviewsCount: 0,
        })
      } else if (current.username === review.seller_id) {
        const resolvedUsername = resolveSellerName(review.seller_id, review.seller_name)
        if (resolvedUsername) {
          current.username = resolvedUsername
        }
      }
    })

    const sellers: SellerLeaderboardItem[] = Array.from(sellerMeta.entries()).map(([sellerId, meta]) => {
      // Get accurate metrics from reviews
      const sellerReviews = reviews.filter((r) => r.seller_id === sellerId)
      const avgRating = sellerReviews.length > 0 
        ? Math.round((sellerReviews.reduce((sum, r) => sum + r.rating, 0) / sellerReviews.length) * 10) / 10
        : 0

      return {
        rating: avgRating,
        reviewsCount: sellerReviews.length,
        sellerId,
        username: meta.username || sellerId,
        salesCount: salesCountBySeller.get(sellerId) || 0,
      }
    })

    const bySales = [...sellers]
      .filter((s) => s.salesCount > 0 || s.reviewsCount > 0)
      .sort((a, b) => {
        if (b.salesCount !== a.salesCount) return b.salesCount - a.salesCount
        if (b.rating !== a.rating) return b.rating - a.rating
        return b.reviewsCount - a.reviewsCount
      })
      .slice(0, 5)

    const byReviews = [...sellers]
      .filter((s) => s.reviewsCount > 0) // Only sellers with reviews
      .sort((a, b) => {
        if (b.reviewsCount !== a.reviewsCount) return b.reviewsCount - a.reviewsCount
        if (b.rating !== a.rating) return b.rating - a.rating
        return b.salesCount - a.salesCount
      })
      .slice(0, 5)

    return { bySales, byReviews }
  }, [salesCountBySellerSummary, reviews, sellerNamesById])

  const homepageStats = useMemo(() => {
    return [
      { label: 'Товарів у каталозі', value: productsCount, icon: <Package size={18} /> },
      { label: 'Завершених покупок', value: completedPurchasesCount, icon: <ShoppingBag size={18} /> },
      { label: 'Активних продавців', value: activeSellersCount, icon: <Users size={18} /> },
      { label: 'Категорій', value: categoriesCount, icon: <Star size={18} /> },
    ]
  }, [productsCount, completedPurchasesCount, activeSellersCount, categoriesCount])

  const scrollPopular = (direction: 'left' | 'right') => {
    const container = popularCarouselRef.current
    if (!container) return

    const amount = direction === 'left' ? -420 : 420
    container.scrollBy({ left: amount, behavior: 'smooth' })
  }

  return (
    <div className="home-page">
      <section className="hero-section">
        <div className="hero-content">
          <h1>Ласкаво просимо на Dropzone</h1>
          <p>Вашa торгова площадка для всього, що вам потрібно</p>
          <button className="cta-btn" onClick={() => navigate('/catalog')}>
            Перейти до каталогу <ArrowRight size={20} />
          </button>
        </div>
      </section>

      <div className="container">
        <section className="products-section">
          <div className="section-header">
            <h2>
              <TrendingUp size={24} /> Популярні товари
            </h2>
            <div className="section-actions">
              <button className="carousel-arrow" onClick={() => scrollPopular('left')} aria-label="Прокрутити вліво">
                ‹
              </button>
              <button className="carousel-arrow" onClick={() => scrollPopular('right')} aria-label="Прокрутити вправо">
                ›
              </button>
              <button onClick={() => navigate('/catalog')} className="view-all-btn">
                Переглянути всі <ArrowRight size={18} />
              </button>
            </div>
          </div>
          {loading ? (
            <div className="loading">Завантаження...</div>
          ) : (popularFromServer.length > 0 ? (
            <div className="popular-carousel" ref={popularCarouselRef}>
              {popularFromServer.map((product) => (
                <div className="popular-card" key={product.id}>
                  <ProductCard product={product} />
                </div>
              ))}
            </div>
          ) : popularProducts.length > 0 ? (
            <div className="popular-carousel" ref={popularCarouselRef}>
              {popularProducts.map((product) => (
                <div className="popular-card" key={product.id}>
                  <ProductCard product={product} />
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <p>Поки немає завершених покупок, щоб показати популярні товари.</p>
            </div>
          ))}
        </section>

        <section className="stats-section">
          <div className="section-header compact">
            <h2>
              <Rocket size={24} /> Dropzone зараз
            </h2>
          </div>
          <div className="stats-grid">
            {homepageStats.map((stat) => (
              <div key={stat.label} className="stat-card">
                <div className="stat-icon">{stat.icon}</div>
                <div className="stat-value">{stat.value}</div>
                <div className="stat-label">{stat.label}</div>
              </div>
            ))}
          </div>
        </section>

        <section className="leaderboards-section">
          <div className="section-header">
            <h2>
              <Users size={24} /> Топ продавці
            </h2>
            <button onClick={() => navigate('/catalog')} className="view-all-btn">
              Переглянути каталог <ArrowRight size={18} />
            </button>
          </div>

          <div className="leaderboards-grid">
            <div className="leaderboard-card">
              <h3>Топ за продажами</h3>
              {sellerLeaderboards.bySales.length > 0 ? (
                <div className="leaderboard-list">
                  {sellerLeaderboards.bySales.map((seller, index) => (
                    <div key={`sales-${seller.sellerId}`} className="leaderboard-item">
                      <div className="leaderboard-rank">#{index + 1}</div>
                      <div className="leaderboard-main">
                        <div className="leaderboard-name">{seller.username}</div>
                        <div className="leaderboard-meta">Продажів: {seller.salesCount}</div>
                      </div>
                      <div className="leaderboard-rating">⭐ {seller.rating} ({seller.reviewsCount})</div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="empty-state small">
                  <p>Ще немає даних про завершені продажі.</p>
                </div>
              )}
            </div>

            <div className="leaderboard-card">
              <h3>Топ за відгуками</h3>
              {sellerLeaderboards.byReviews.length > 0 ? (
                <div className="leaderboard-list">
                  {sellerLeaderboards.byReviews.map((seller, index) => (
                    <div key={`reviews-${seller.sellerId}`} className="leaderboard-item">
                      <div className="leaderboard-rank">#{index + 1}</div>
                      <div className="leaderboard-main">
                        <div className="leaderboard-name">{seller.username}</div>
                        <div className="leaderboard-meta">Відгуків: {seller.reviewsCount}</div>
                      </div>
                      <div className="leaderboard-rating">⭐ {seller.rating} ({seller.reviewsCount})</div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="empty-state small">
                  <p>Ще немає відгуків для рейтингу.</p>
                </div>
              )}
            </div>
          </div>
        </section>

        <section className="info-section">
          <div className="info-card">
            <ShieldCheck size={28} />
            <h3>Безпечна покупка</h3>
            <p>Спори, підтримка і захист платежів працюють в одному місці.</p>
          </div>
          <div className="info-card">
            <ShoppingBag size={28} />
            <h3>Миттєва доставка</h3>
            <p>Цифрові товари доступні одразу після покупки.</p>
          </div>
          <div className="info-card">
            <Star size={28} />
            <h3>Рейтинг продавців</h3>
            <p>Популярні товари піднімаються вгору за реальними продажами.</p>
          </div>
        </section>
      </div>
    </div>
  )
}

export default HomePage
