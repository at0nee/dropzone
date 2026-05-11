import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, MessageCircle, AlertCircle, CheckCircle } from 'lucide-react'
import { useAuthStore } from '../stores/authStore'
import { getStoredUsers, saveStoredUsers, getStoredReviews, saveStoredReviews } from '../utils/adminData'
import facade from '../services/facade'
import { ordersService, reviewService } from '../services/api'
import { useToast } from '../components/Toast'
import './OrdersPage.css'

interface Order {
  id: string
  product_id: string
  product_name: string
  seller_id: string
  seller_name: string
  buyer_id: string
  price: number
  status: 'pending' | 'completed' | 'disputed'
  created_at: string
  completed_at?: string
}

const OrdersPage: React.FC = () => {
  const navigate = useNavigate()
  const { user, isAuthenticated, isInitialized } = useAuthStore()
  const { showToast } = useToast()
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)

  const [tab, setTab] = useState<'purchases' | 'sales'>('purchases')
  const [reviewModal, setReviewModal] = useState<{ show: boolean; order?: Order }>({ show: false })
  const [rating, setRating] = useState(5)
  const [reviewComment, setReviewComment] = useState('')
  const [submittingReview, setSubmittingReview] = useState(false)
  const REVIEW_COMMENT_MAX = 100

  const handleBack = () => {
    if (window.history.length > 1) {
      navigate(-1)
      return
    }
    navigate('/profile')
  }

  useEffect(() => {
    // Wait for auth initialization before checking authentication
      console.log(`[OrdersPage] useEffect fired: isInitialized=${isInitialized}, isAuthenticated=${isAuthenticated}`)
      if (!isInitialized) {
        console.log(`[OrdersPage] ⏳ Waiting for isInitialized...`)
        return
      }

      if (!isAuthenticated) {
        console.log(`[OrdersPage] ✗ Not authenticated, redirecting to /login`)
        navigate('/login')
        return
      }

      console.log(`[OrdersPage] ✓ isInitialized=true and isAuthenticated=true, loading orders...`)
    const load = async () => {
        console.log(`[OrdersPage] ⏳ Calling facade.getOrders()...`)
      const savedOrders = await facade.getOrders()
        console.log(`[OrdersPage] ✓ Orders loaded:`, savedOrders?.length || 0, 'items')
      setOrders(savedOrders || [])
      setLoading(false)
    }

    load()
  }, [isAuthenticated, isInitialized, navigate])



  const handleContactSeller = (sellerId: string) => {
    navigate(`/chat/${sellerId}`)
  }

  const handleCompleteOrder = (orderId: string) => {
    ;(async () => {
      try {
        // Make API call to backend to update order status
        const response = await ordersService.updateStatus(orderId, 'completed')
        console.log('✅ Order status updated on backend:', response.data)
        
        if (!response.data.success) {
          showToast('❌ Помилка при підтвердженні замовлення', 'error')
          return
        }

        // Update local orders with the confirmed order from backend
        const confirmedOrder = response.data.data
        const updatedOrders = orders.map(order =>
          order.id === orderId
            ? { ...order, status: confirmedOrder.status, completed_at: confirmedOrder.completed_at }
            : order
        )
        setOrders(updatedOrders)
        
        // Update balance if current user is the seller (they receive money from escrow)
        const { user } = useAuthStore.getState()
        if (user && user.id === confirmedOrder.seller_id) {
          const updatedUser = { ...user, balance: user.balance + confirmedOrder.price }
          useAuthStore.setState({ user: updatedUser })
          
          const users = getStoredUsers()
          const userIndex = users.findIndex((u: any) => u.id === user.id)
          if (userIndex !== -1) {
            users[userIndex].balance = updatedUser.balance
            saveStoredUsers(users)
          }
          
          showToast(`✅ Замовлення доставлено! Ви отримали ${confirmedOrder.price}₴`, 'success')
        } else if (user && user.id === confirmedOrder.buyer_id) {
          // Buyer: money already deducted at purchase, just confirm
          showToast(`✅ Замовлення доставлено! Дякуємо за покупку.`, 'success')
        }
      } catch (error) {
        console.error('❌ Error completing order:', error)
        showToast('❌ Помилка: ' + (error as any).message, 'error')
      }
    })()
  }

  const handleOpenDispute = (orderId: string) => {
    ;(async () => {
      try {
        // Make API call to backend to update order status
        const response = await ordersService.updateStatus(orderId, 'disputed')
        console.log('✅ Dispute opened:', response.data)
        
        if (!response.data.success) {
          showToast('❌ Помилка при відкритті спору', 'error')
          return
        }

        const disputedOrder = response.data.data
        const updatedOrders = orders.map(order =>
          order.id === orderId
            ? { ...order, status: disputedOrder.status }
            : order
        )
        setOrders(updatedOrders)
        
        // If buyer opened dispute, they get money refunded
        const { user } = useAuthStore.getState()
        if (user && user.id === disputedOrder.buyer_id) {
          const updatedUser = { ...user, balance: user.balance + disputedOrder.price }
          useAuthStore.setState({ user: updatedUser })
          
          const users = getStoredUsers()
          const userIndex = users.findIndex((u: any) => u.id === user.id)
          if (userIndex !== -1) {
            users[userIndex].balance = updatedUser.balance
            saveStoredUsers(users)
          }
          
          showToast(`✅ Спір відкрито. Гарантія повернена (${disputedOrder.price}₴)`, 'success')
        } else {
          showToast('✅ Спір відкрито. Очікуємо рішення адміністратора.', 'success')
        }
      } catch (error) {
        console.error('❌ Error opening dispute:', error)
        showToast('❌ Помилка: ' + (error as any).message, 'error')
      }
    })()
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending':
        return 'status-pending'
      case 'completed':
        return 'status-completed'
      case 'disputed':
        return 'status-disputed'
      case 'refunded':
        return 'status-refunded'
      default:
        return ''
    }
  }

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'pending':
        return '⏳ Чекає товар'
      case 'completed':
        return '✅ Завершено'
      case 'disputed':
        return '⚠️ СПІР'
      case 'refunded':
        return '↩️ Повернено'
      default:
        return status
    }
  }

  const handleOpenReviewModal = (order: Order) => {
    // Перевіримо чи вже написав відгук про ЦЕ ЗАМОВЛЕННЯ
    const savedReviews = getStoredReviews()
    const hasReviewForThisOrder = savedReviews.some((r: any) => 
      r.order_id === order.id
    )

    if (hasReviewForThisOrder) {
      showToast('ℹ️ Ви вже залишили відгук про це замовлення', 'info')
      return
    }

    setReviewModal({ show: true, order })
    setRating(5)
    setReviewComment('')
  }

  const hasAlreadyReviewed = (order: Order) => {
    // Не можна залишити відгук про себе
    if (order.seller_id === user?.id) {
      return true
    }
    
    // Перевіримо чи вже залишив відгук про ЦЕ ЗАМОВЛЕННЯ
    const savedReviews = getStoredReviews()
    return savedReviews.some((r: any) => r.order_id === order.id)
  }

  const handleSubmitReview = async () => {
    const order = reviewModal.order
    if (!order || !user) return

    setSubmittingReview(true)

    try {
      // Send review to backend API
      console.log('📝 Submitting review to backend:', { product_id: order.product_id, rating, text: reviewComment })
      const response = await reviewService.create(order.product_id, rating, reviewComment)
      console.log('✅ Review created on backend:', response.data)
      
      if (!response.data.success) {
        showToast('❌ Помилка при додаванні відгуку', 'error')
        return
      }

      // Also save to localStorage for offline fallback
      const savedReviews = getStoredReviews()
      const newReview = {
        id: response.data.data?.id || Date.now().toString(),
        order_id: order.id,
        seller_id: order.seller_id,
        product_id: order.product_id,
        product_title: order.product_name,
        buyer_id: user.id,
        buyer_name: user.username,
        rating,
        comment: reviewComment,
        created_at: new Date().toISOString()
      }

      saveStoredReviews([newReview, ...savedReviews])

      // Update seller rating
      const users = getStoredUsers()
      const sellerIndex = users.findIndex((candidate) => candidate.id === order.seller_id)
      if (sellerIndex !== -1) {
        const sellerReviews = savedReviews.filter((r: any) => r.seller_id === order.seller_id)
        const avgRating = sellerReviews.reduce((sum: number, r: any) => sum + r.rating, 0) / sellerReviews.length
        users[sellerIndex].rating = Math.round(avgRating * 10) / 10
        users[sellerIndex].reviews_count = sellerReviews.length
        saveStoredUsers(users)
      }

      setReviewModal({ show: false })
      setReviewComment('')
      setRating(5)
      showToast('✅ Відгук успішно додано!', 'success')
    } catch (error) {
      console.error('❌ Error submitting review:', error)
      showToast('❌ Помилка при додаванні відгуку: ' + (error as any).message, 'error')
    } finally {
      setSubmittingReview(false)
    }
  }

  if (loading) {
    return <div className="orders-loading">Завантаження...</div>
  }

  return (
    <div className="orders-page">
      <div className="orders-header">
        <button className="back-btn" onClick={handleBack}>
          <ArrowLeft size={24} /> Назад
        </button>
        <h1>Замовлення</h1>
      </div>

      <div className="orders-tabs">
        <button
          className={`tab ${tab === 'purchases' ? 'active' : ''}`}
          onClick={() => setTab('purchases')}
        >
          Мої покупки
        </button>
        <button
          className={`tab ${tab === 'sales' ? 'active' : ''}`}
          onClick={() => setTab('sales')}
        >
          Мої продажі
        </button>
      </div>

      <div className="orders-container">
        {tab === 'purchases' ? (
          // Замовлення де юзер - покупець
          (() => {
            const purchaseOrders = orders
              .filter(o => o.buyer_id === user?.id)
              .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
            return purchaseOrders.length === 0 ? (
              <div className="empty-orders">
                <div className="empty-icon">📦</div>
                <h2>Замовлень немає</h2>
                <p>Поки ви не купили жодного товару</p>
                <button
                  className="browse-btn"
                  onClick={() => navigate('/catalog')}
                >
                  Переглянути каталог
                </button>
              </div>
            ) : (
              <div className="orders-list">
                {purchaseOrders.map((order) => (
                  <div key={order.id} className="order-card">
                    <div className="order-info">
                      <div className="order-header">
                        <h3>{order.product_name}</h3>
                        <span className={`status ${getStatusColor(order.status)}`}>
                          {getStatusLabel(order.status)}
                        </span>
                      </div>

                      <div className="order-details">
                        <div className="detail-item">
                          <span className="label">ID:</span>
                          <span className="value code">{order.id}</span>
                        </div>
                        <div className="detail-item">
                          <span className="label">Продавець:</span>
                          <span className="value">{order.seller_name}</span>
                        </div>
                        <div className="detail-item">
                          <span className="label">Ціна:</span>
                          <span className="value price">{order.price.toFixed(2)}₴</span>
                        </div>
                        <div className="detail-item">
                          <span className="label">Дата:</span>
                          <span className="value">
                            {new Date(order.created_at).toLocaleDateString('uk-UA')}
                          </span>
                        </div>
                      </div>

                      {order.status === 'pending' && (
                        <div className="order-actions">
                          <button
                            className="btn-complete"
                            onClick={() => handleCompleteOrder(order.id)}
                          >
                            <CheckCircle size={18} />
                            Товар отримано ✓
                          </button>
                          <button
                            className="btn-dispute"
                            onClick={() => handleOpenDispute(order.id)}
                          >
                            <AlertCircle size={18} />
                            Відкрити спір
                          </button>
                        </div>
                      )}

                      {order.status === 'completed' && (
                        <div className="order-actions">
                          {hasAlreadyReviewed(order) ? (
                            <button
                              className="btn-review-done"
                              disabled
                              title={order.seller_id === user?.id ? 'Не можна залишити відгук про себе' : 'Ви вже залишили відгук'}
                            >
                              ✅ {order.seller_id === user?.id ? 'Це ваш товар' : 'Відгук залишено'}
                            </button>
                          ) : (
                            <button
                              className="btn-review"
                              onClick={() => handleOpenReviewModal(order)}
                            >
                              ⭐ Залишити відгук
                            </button>
                          )}
                        </div>
                      )}

                      {order.status === 'disputed' && (
                        <div className="dispute-warning">
                          <AlertCircle size={18} />
                          <span>Спір відкритий. Зв'яжіться з продавцем щоб вирішити проблему</span>
                        </div>
                      )}
                    </div>

                    <button
                      className="contact-btn"
                      onClick={() => handleContactSeller(order.seller_id)}
                    >
                      <MessageCircle size={18} />
                      Чат
                    </button>
                  </div>
                ))}
              </div>
            )
          })()
        ) : (
          // Замовлення де юзер - продавець
          (() => {
            const saleOrders = orders
              .filter(o => o.seller_id === user?.id)
              .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
            return saleOrders.length === 0 ? (
              <div className="empty-orders">
                <div className="empty-icon">🏪</div>
                <h2>Продаж немає</h2>
                <p>Поки ніхто не купив ваші товари</p>
              </div>
            ) : (
              <div className="orders-list">
                {saleOrders.map((order) => (
                  <div key={order.id} className="order-card seller-order">
                    <div className="order-info">
                      <div className="order-header">
                        <h3>{order.product_name}</h3>
                        <span className={`status ${getStatusColor(order.status)}`}>
                          {getStatusLabel(order.status)}
                        </span>
                      </div>

                      <div className="order-details">
                        <div className="detail-item">
                          <span className="label">ID:</span>
                          <span className="value code">{order.id}</span>
                        </div>
                        <div className="detail-item">
                          <span className="label">Покупець:</span>
                          <span className="value">{order.buyer_id || 'Невідомо'}</span>
                        </div>
                        <div className="detail-item">
                          <span className="label">Ціна:</span>
                          <span className="value price">{order.price.toFixed(2)}₴</span>
                        </div>
                        <div className="detail-item">
                          <span className="label">Дата:</span>
                          <span className="value">
                            {new Date(order.created_at).toLocaleDateString('uk-UA')}
                          </span>
                        </div>
                      </div>

                      {order.status === 'disputed' && (
                        <div className="dispute-warning">
                          <AlertCircle size={18} />
                          <span>Спір відкритий. Гроші утримані на рахунку</span>
                        </div>
                      )}
                    </div>

                    <button
                      className="contact-btn"
                      onClick={() => navigate(`/chat/${order.buyer_id || order.seller_id}`)}
                    >
                      <MessageCircle size={18} />
                      Чат
                    </button>
                  </div>
                ))}
              </div>
            )
          })()
        )}
      </div>

      {/* Review Modal */}
      {reviewModal.show && reviewModal.order && (
        <div className="review-modal-overlay" onClick={() => setReviewModal({ show: false })}>
          <div className="review-modal" onClick={(e) => e.stopPropagation()}>
            <h2>Залишити відгук про продавця</h2>
            <p className="modal-product-name">Товар: {reviewModal.order.product_name}</p>
            
            <div className="review-form">
              <div className="rating-input">
                <label>Оцінка:</label>
                <div className="rating-stars">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      className={`star-btn ${star <= rating ? 'filled' : ''}`}
                      onClick={() => setRating(star)}
                    >
                      ⭐
                    </button>
                  ))}
                </div>
                <span className="rating-value">{rating}/5</span>
              </div>

              <div className="comment-input">
                <label>Коментар: <span className="char-counter">{reviewComment.length}/{REVIEW_COMMENT_MAX}</span></label>
                <textarea
                  value={reviewComment}
                  onChange={(e) => setReviewComment(e.target.value.slice(0, REVIEW_COMMENT_MAX))}
                  placeholder="Поділіться своїм враженням про цей товар та продавця..."
                  rows={4}
                  maxLength={REVIEW_COMMENT_MAX}
                />
              </div>

              <div className="modal-actions">
                <button
                  className="btn-cancel"
                  onClick={() => setReviewModal({ show: false })}
                  disabled={submittingReview}
                >
                  Скасувати
                </button>
                <button
                  className="btn-submit-review"
                  onClick={handleSubmitReview}
                  disabled={submittingReview || !reviewComment.trim() || reviewComment.length > REVIEW_COMMENT_MAX}
                >
                  {submittingReview ? 'Додавання...' : 'Додати відгук'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default OrdersPage
