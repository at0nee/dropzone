import React, { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Star, ArrowLeft, MessageCircle } from 'lucide-react'
import { useAuthStore } from '../stores/authStore'
import { getReviewMetricsForSeller } from '../utils/reviewMetrics'
import facade from '../services/facade'
import { DEFAULT_PROFILE_AVATAR } from '../utils/defaultAvatar'
import './SellerProfilePage.css'

interface Review {
  id: string
  product_id: string
  product_title: string
  seller_id: string
  seller_name: string
  buyer_id: string
  buyer_name: string
  rating: number
  comment: string
  created_at: string
}

interface Product {
  id: string
  title: string
  price: number
  rating: number
}

const SellerProfilePage: React.FC = () => {
  const { sellerId } = useParams<{ sellerId: string }>()
  const navigate = useNavigate()
  const { isAuthenticated } = useAuthStore()
  const [sellerInfo, setSellerInfo] = useState<any>(null)
  const [reviews, setReviews] = useState<Review[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [visibleReviewCount, setVisibleReviewCount] = useState(10)
  const [loading, setLoading] = useState(true)
  const reviewLoadMoreRef = React.useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const loadSellerData = async () => {
      try {
        // Load seller info
        const sellerFromUsers = await facade.getUser(sellerId!)
        if (sellerFromUsers) {
          setSellerInfo(sellerFromUsers)
        } else {
          // Fallback: create basic seller info if not found
          setSellerInfo({ id: sellerId, username: 'Unknown Seller', rating: 0, reviews_count: 0, avatar: 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22120%22 height=%22120%22%3E%3Ccircle cx=%2260%22 cy=%2260%22 r=%2260%22 fill=%22%23e0e0e0%22/%3E%3Ctext x=%2260%22 y=%2265%22 font-family=%22Arial%22 font-size=%2212%22 fill=%22%23999%22 text-anchor=%22middle%22%3EUser%3C/text%3E%3C/svg%3E' })
        }

        // Always load seller's products (limit page size to avoid huge fetches)
        const products = await facade.fetchProducts({ page: 1, pageSize: 200 })
        const sellerProducts = (products || []).filter((p: any) => p.seller_id === sellerId)
        setProducts(sellerProducts.slice(0, 10))

        // Load reviews
        const sellerReviews = await facade.getReviewsBySeller(sellerId!)
        setReviews(sellerReviews || [])
      } catch (error) {
        console.error('Failed to load seller data:', error)
      } finally {
        setLoading(false)
      }
    }

    loadSellerData()
  }, [sellerId])

  useEffect(() => {
    setVisibleReviewCount(10)
  }, [sellerId])

  useEffect(() => {
    const target = reviewLoadMoreRef.current
    if (!target) return

    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries
        if (entry.isIntersecting) {
          setVisibleReviewCount((count) => Math.min(count + 10, reviews.length))
        }
      },
      { rootMargin: '200px' }
    )

    observer.observe(target)
    return () => observer.disconnect()
  }, [reviews.length])

  const handleContactSeller = () => {
    if (!isAuthenticated) {
      navigate('/login')
      return
    }
    navigate(`/chat/${sellerId}`)
  }

  if (loading) {
    return <div className="seller-profile-page">Завантаження...</div>
  }

  if (!sellerInfo) {
    return (
      <div className="seller-profile-page error">
        <button className="back-btn" onClick={() => navigate(-1)}>
          <ArrowLeft size={20} /> Назад
        </button>
        <h2>Продавець не знайден</h2>
      </div>
    )
  }

  const reviewMetrics = getReviewMetricsForSeller(
    sellerId,
    reviews,
    Number(sellerInfo.rating) || 0,
    Number(sellerInfo.reviews_count) || 0
  )

  return (
    <div className="seller-profile-page">
      <button className="back-btn" onClick={() => navigate(-1)}>
        <ArrowLeft size={20} /> Назад
      </button>

      {/* Header Section */}
      <div className="seller-header">
          <div className="seller-avatar">
          <img loading="lazy" decoding="async" src={DEFAULT_PROFILE_AVATAR} alt={sellerInfo.username} />
        </div>
        <div className="seller-info-main">
          <h1>{sellerInfo.username}</h1>
          <div className="seller-stats">
            <div className="stat">
              <span className="stat-label">Рейтинг:</span>
              <div className="stars">
                {[...Array(5)].map((_, i) => (
                  <Star
                    key={i}
                    size={18}
                    className={i < Math.floor(reviewMetrics.rating) ? 'filled' : 'empty'}
                  />
                ))}
              </div>
              <span className="stat-value">{reviewMetrics.rating.toFixed(1)}</span>
            </div>
            <div className="stat">
              <span className="stat-label">Відгуки:</span>
              <span className="stat-value">{reviewMetrics.reviewsCount}</span>
            </div>
            <div className="stat">
              <span className="stat-label">Товарів:</span>
              <span className="stat-value">{products.length}</span>
            </div>
          </div>
        </div>

        {isAuthenticated && (
          <button className="contact-btn" onClick={handleContactSeller}>
            <MessageCircle size={20} />
            Написати
          </button>
        )}
      </div>

      {/* Products Section */}
      {products.length > 0 && (
          <div className="seller-products-section">
          <h2>Товари цього продавця ({products.length})</h2>
          <div className="products-list">
            {products.map((product) => (
              <a
                key={product.id}
                href={`/product/${product.id}`}
                className="product-link"
              >
                <div className="product-item">
                  <h4>{product.title}</h4>
                  <div className="product-footer">
                    <span className="price">{product.price.toFixed(2)} ₴</span>
                    <div className="rating">
                      <Star size={14} className="filled" />
                      {product.rating.toFixed(1)}
                    </div>
                  </div>
                </div>
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Reviews Section */}
      <div className="reviews-section">
        <h2>Відгуки ({reviews.length})</h2>

        {reviews.length > 0 ? (
          <div className="reviews-list">
            {reviews.slice(0, visibleReviewCount).map((review) => (
              <div key={review.id} className="review-item">
                <div className="review-header">
                  <div className="reviewer-info">
                    <h4>{review.buyer_name}</h4>
                    <p className="product-ref">Товар: {review.product_title}</p>
                  </div>
                  <div className="review-rating">
                    {'⭐'.repeat(review.rating)}
                  </div>
                </div>
                <p className="review-text">{review.comment}</p>
                <span className="review-date">
                  {new Date(review.created_at).toLocaleDateString('uk-UA')}
                </span>
              </div>
            ))}
            {visibleReviewCount < reviews.length && <div ref={reviewLoadMoreRef} className="reviews-sentinel" />}
          </div>
        ) : (
          <p className="no-reviews">Немає відгуків</p>
        )}
      </div>
    </div>
  )
}

export default SellerProfilePage
