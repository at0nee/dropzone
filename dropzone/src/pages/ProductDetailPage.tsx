import React, { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Star, MessageCircle, ArrowLeft } from 'lucide-react'
import { getReviewMetricsForSeller } from '../utils/reviewMetrics'
import { Product } from '../types'
import { useAuthStore } from '../stores/authStore'
import { useToast } from '../components/Toast'
import facade from '../services/facade'
import { getStoredChats, getStoredOrders, getStoredUsers, saveStoredChats, saveStoredOrders, saveStoredUsers } from '../utils/adminData'
import './ProductDetailPage.css'

const ProductDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user, isAuthenticated } = useAuthStore()
  const { showToast } = useToast()
  const [product, setProduct] = useState<Product | null>(null)
  const [sellerReviews, setSellerReviews] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [purchasing, setPurchasing] = useState(false)

  useEffect(() => {
    const fetchData = async () => {
      if (!id) return
      try {
        setLoading(true)
        
        const foundProduct = await facade.fetchProductById(id)
        setProduct(foundProduct)
      } catch (error) {
        console.error('Failed to load product:', error)
        setProduct(null)
        setSellerReviews([])
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [id])

  const handleBuy = async () => {
    if (!user || !product) return

    if (product.seller_id === user.id) {
      showToast('ℹ️ Не можна купувати власний товар', 'info')
      return
    }

    // Перевіряємо наявність товару
    if ((product.stock || 0) <= 0) {
      showToast('❌ Товар недоступний - закінчився на складі', 'error')
      return
    }
    
    // Перевіряємо достатність коштів
    if (user.balance < product.price) {
      showToast('❌ Недостатньо коштів на балансі', 'error')
      return
    }
    
    setPurchasing(true)
    try {
      // Відправляємо замовлення на бекенд
      console.log('🛒 Відправляємо замовлення на бекенд:', product.id)
      const checkoutResult = await facade.createOrder(product.id, 1)
      console.log('✅ Checkout result:', checkoutResult)
      
      // Escrow: гроші одразу списуються на фронтенді
      const updatedUser = {
        ...user,
        balance: user.balance - product.price
      }
      
      // Оновлюємо authStore
      useAuthStore.setState({ user: updatedUser })
      
      // Сохраняємо обновлений баланс в localStorage
      const users = getStoredUsers()
      const userIndex = users.findIndex((u: any) => u.id === user.id)
      if (userIndex !== -1) {
        users[userIndex].balance = updatedUser.balance
        saveStoredUsers(users)
      }
      
      showToast(`✅ Замовлення створено! Гроші утримані в системі (${updatedUser.balance}₴). Очікуємо на доставку...`, 'success')
      navigate(`/chat/${product.seller_id}`)
    } catch (error) {
      console.error('❌ Помилка при покупці:', error)
      showToast('❌ Помилка при покупці: ' + (error as any).message, 'error')
    } finally {
      setPurchasing(false)
    }
  }

  const handleContactSeller = () => {
    if (!isAuthenticated) {
      navigate('/login')
      return
    }
    navigate(`/chat/${product?.seller_id}`)
  }

  if (loading) {
    return <div className="loading">Завантаження...</div>
  }

  if (!product) {
    return (
      <div className="error-page">
        <div className="error-content">
          <h2>Товар не знайдений</h2>
          <button onClick={() => navigate('/catalog')}>Повернутися до каталогу</button>
        </div>
      </div>
    )
  }

  return (
    <div className="product-detail">
      <button className="back-link" onClick={() => navigate('/catalog')}>
        <ArrowLeft size={24} /> Повернутися
      </button>

      <div className="product-container">
        {/* Gallery */}
        <div className="product-gallery">
          <div className="main-image">
            <img loading="lazy" decoding="async" src={product.image_url || 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22500%22 height=%22350%22%3E%3Crect fill=%22%23e0e0e0%22 width=%22500%22 height=%22350%22/%3E%3Ctext x=%2250%25%22 y=%2250%25%22 font-family=%22Arial%22 font-size=%2220%22 fill=%22%23999%22 text-anchor=%22middle%22 dy=%22.3em%22%3EProduct Detail%3C/text%3E%3C/svg%3E'} alt={product.title} />
          </div>
        </div>

        {/* Details */}
        <div className="product-details">
          <h1>{product.title}</h1>

          {/* Seller Info */}
          <div className="seller-section">
            <h3>Про продавця</h3>
            <div className="seller-card">
              <div className="seller-header">
                <div className="seller-info">
                  <button 
                    className="seller-name-btn"
                    onClick={() => navigate(`/seller/${product.seller_id}`)}
                  >
                    {product.seller.username}
                  </button>
                    <div className="seller-stats">
                      {(() => {
                        const metrics = getReviewMetricsForSeller(
                          product.seller_id,
                          sellerReviews,
                          product.seller.rating || 0,
                          product.seller.reviews_count || 0
                        )
                        return (
                          <>
                            <span className="rating">⭐ {metrics.rating}</span>
                            <span className="reviews">{metrics.reviewsCount} відгуків</span>
                          </>
                        )
                      })()}
                    </div>
                </div>
              </div>

              <div className="seller-actions">
                {isAuthenticated ? (
                  <button className="contact-seller-btn" onClick={handleContactSeller}>
                    <MessageCircle size={18} />
                    Написати
                  </button>
                ) : (
                  <button className="contact-seller-btn" onClick={() => navigate('/login')}>
                    <MessageCircle size={18} />
                    Вхід
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Price and Stock */}
          <div className="price-section">
            <div className="price">{product.price.toFixed(2)}₴</div>
            <div className="stock-info">
              {product.stock > 0 ? (
                <span className="in-stock">✅ В наявності ({product.stock})</span>
              ) : (
                <span className="out-of-stock">❌ Немає в наявності</span>
              )}
            </div>
          </div>

          {/* Description */}
          <div className="description-section">
            <h3>Опис</h3>
            <p>{product.description}</p>
          </div>

          {/* Buy Button */}
          {isAuthenticated ? (
            <button
              className="buy-btn"
              onClick={handleBuy}
              disabled={product.stock === 0 || purchasing}
            >
              {purchasing ? 'Обробка...' : '🛍️ Купити товар'}
            </button>
          ) : (
            <button className="buy-btn" onClick={() => navigate('/login')}>
              Увійти щоб купити
            </button>
          )}
        </div>
      </div>

      {/* Reviews Section - Full Width Below */}
      <ReviewsSection 
        sellerId={product.seller_id} 
        productId={product.id}
      />
    </div>
  )
}

interface ReviewsSectionProps {
  sellerId: string
  productId: string
}

const ReviewsSection: React.FC<ReviewsSectionProps> = ({ sellerId, productId }) => {
  const [reviews, setReviews] = useState<any[]>([])
  const [visibleCount, setVisibleCount] = useState(12)

  useEffect(() => {
    const loadReviews = async () => {
      const sellerReviews = await facade.getReviewsBySeller(sellerId)
      setReviews(sellerReviews || [])
      setVisibleCount(12)
    }

    void loadReviews()
  }, [productId])

  // Show all reviews for this seller (may be about different products)
  const productReviews = reviews || []
  const visibleReviews = productReviews.slice(0, visibleCount)
  const hasMoreReviews = visibleCount < productReviews.length

  return (
    <div className="reviews-section">
      <div className="container">
        <h2>Відгуки про продавця</h2>

        {/* Reviews List - only display, no form */}
        <div className="reviews-list">
          {visibleReviews.length === 0 ? (
            <p className="no-reviews">Немає відгуків про цього продавця</p>
          ) : (
            visibleReviews.map((review) => (
              <div key={review.id} className="review-card">
                <div className="review-header">
                  <div className="reviewer-info">
                    <strong>{review.buyer_name}</strong>
                    <span className="review-rating">{'⭐'.repeat(review.rating)}</span>
                  </div>
                  <small>{new Date(review.created_at).toLocaleDateString('uk-UA')}</small>
                </div>
                {review.product_title && review.product_id ? (
                  <div className="review-product-info">
                    Товар: <span className="product-title-ref">{review.product_title}</span>
                  </div>
                ) : null}
                <p className="review-comment">{review.comment}</p>
              </div>
            ))
          )}
        </div>

        {hasMoreReviews ? (
          <button className="btn-load-more-reviews" onClick={() => setVisibleCount((count) => count + 12)}>
            Показати ще 12
          </button>
        ) : null}
      </div>
    </div>
  )
}

export default ProductDetailPage
