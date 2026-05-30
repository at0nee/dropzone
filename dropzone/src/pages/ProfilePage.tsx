import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Edit2, LogOut, Trash2, Lock } from 'lucide-react'
import { useAuthStore } from '../stores/authStore'
import { useToast } from '../components/Toast'
import { DEFAULT_PROFILE_AVATAR } from '../utils/defaultAvatar'
import facade from '../services/facade'
import './ProfilePage.css'

const ProfilePage: React.FC = () => {
  const { user, logout, isAuthenticated, isInitialized } = useAuthStore()
  const navigate = useNavigate()
  const { showToast } = useToast()

  const [selectedTab, setSelectedTab] = useState<'products' | 'reviews' | 'seller-reviews'>('products')
  const [myReviews, setMyReviews] = useState<any[]>([])
  const [visibleMyReviews, setVisibleMyReviews] = useState(12)
  const [myProducts, setMyProducts] = useState<any[]>([])
  const [sellerReviews, setSellerReviews] = useState<any[]>([])
  const [visibleSellerReviews, setVisibleSellerReviews] = useState(12)
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const [productToDelete, setProductToDelete] = useState<string | null>(null)
  const [isCredentialsModalOpen, setIsCredentialsModalOpen] = useState(false)
  const [newEmail, setNewEmail] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [currentPassword, setCurrentPassword] = useState('')

  useEffect(() => {
    if (!isInitialized) return

    if (!isAuthenticated) {
      navigate('/login')
      return
    }

    if (!user) return

    const loadUserData = async () => {
      const currentUser = await facade.getUser(user.id)
      if (currentUser) {
        useAuthStore.setState({ user: currentUser })
      }

      const products = (await facade.fetchProducts({ page: 1, pageSize: 500 })) as any[]
      setMyProducts((products || []).filter((p: any) => p.seller_id === user.id))

      const reviews = (await facade.getAllReviews()) as any[]
      setMyReviews((reviews || []).filter((review: any) => review.buyer_id === user.id))
      setVisibleMyReviews(12)

      setSellerReviews((reviews || []).filter((review: any) => review.seller_id === user.id))
      setVisibleSellerReviews(12)
    }

    loadUserData()

    window.addEventListener('storage', loadUserData)
    return () => window.removeEventListener('storage', loadUserData)
  }, [isAuthenticated, isInitialized, navigate, user])

  if (!user) {
    return <div className="loading">Завантаження...</div>
  }

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  const handleDeleteAccount = () => {
    logout()
    navigate('/login')
  }

  const handleOpenCredentialsModal = () => {
    setNewEmail(user.email)
    setNewPassword('')
    setConfirmPassword('')
    setCurrentPassword('')
    setIsCredentialsModalOpen(true)
  }

  const handleCloseCredentialsModal = () => {
    setIsCredentialsModalOpen(false)
    setNewEmail('')
    setNewPassword('')
    setConfirmPassword('')
    setCurrentPassword('')
  }

  const handleEditProduct = (productId: string) => {
    navigate(`/create-product/${productId}`)
  }

  const handleDeleteProduct = (productId: string) => {
    try {
      ;(async () => {
        await facade.deleteProduct(productId)
        const products = await facade.fetchProducts()
        setMyProducts((products || []).filter((p: any) => p.seller_id === user.id))
        setProductToDelete(null)
      })()
    } catch (error) {
      console.error('Помилка при видаленні товару:', error)
    }
  }

  const handleSaveCredentials = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const nextEmail = newEmail.trim()
      const nextPassword = newPassword.trim()
      const nextPasswordConfirm = confirmPassword.trim()
      const currentPasswordValue = currentPassword.trim()
      const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
      const emailChanged = nextEmail.length > 0 && nextEmail.toLowerCase() !== user.email.toLowerCase()
      const wantsCredentialChange = emailChanged || nextPassword.length > 0

      if (!wantsCredentialChange) {
        showToast('ℹ️ Вкажіть нову пошту або новий пароль', 'info')
        return
      }

      if (emailChanged && !emailPattern.test(nextEmail)) {
        showToast('❌ Введіть коректну електронну адресу (наприклад name@domain.tld)', 'error')
        return
      }

      if (!currentPasswordValue) {
        showToast('❌ Для зміни пошти або пароля потрібно ввести поточний пароль', 'error')
        return
      }

      if (nextPassword && nextPassword !== nextPasswordConfirm) {
        showToast('❌ Нові паролі не збігаються', 'error')
        return
      }

      if (nextPassword && nextPassword.length < 6) {
        showToast('❌ Новий пароль має містити щонайменше 6 символів', 'error')
        return
      }

      const updated = await facade.updateUser(user.id, {
        email: emailChanged ? nextEmail : undefined,
        current_password: currentPasswordValue,
        new_password: nextPassword || undefined,
      })

      if (updated) {
        useAuthStore.setState({ user: updated })
        setNewEmail('')
        setNewPassword('')
        setConfirmPassword('')
        setCurrentPassword('')
        setIsCredentialsModalOpen(false)
        showToast('✅ Дані профілю оновлено', 'success')
      } else {
        showToast('❌ Помилка збереження', 'error')
      }
    } catch (error) {
      console.error('Помилка збереження профілю', error)
      showToast('❌ Помилка збереження', 'error')
    }
  }

  return (
    <div className="profile-page">
      <button className="back-btn" onClick={() => navigate(-1)}>
        ← Назад
      </button>

      <div className="profile-header">
        <div className="profile-avatar">
          <img src={DEFAULT_PROFILE_AVATAR} alt={user.username} />
        </div>
        <div className="profile-info">
          <h1>{user.username}</h1>
          <p className="user-email">{user.email}</p>
          <div className="profile-stats">
            <div className="stat">
              <span className="stat-value">⭐ {sellerReviews.length ? (sellerReviews.reduce((s, r) => s + (r.rating || 0), 0) / sellerReviews.length).toFixed(2) : (user.rating || 0)}</span>
              <span className="stat-label">Рейтинг</span>
            </div>
            <div className="stat">
              <span className="stat-value">📝 {sellerReviews.length || user.reviews_count}</span>
              <span className="stat-label">Відгуків</span>
            </div>
            <div className="stat">
              <span className="stat-value">💰 {user.balance?.toFixed(2) || '0.00'} ₴</span>
              <span className="stat-label">Баланс</span>
            </div>
          </div>
        </div>
      </div>

      <div className="profile-content">
        <div className="profile-section">
          <div className="section-header">
            <h2>Особисті дані</h2>
            <button className="btn-edit" onClick={handleOpenCredentialsModal}>
              <Edit2 size={16} />
              Редагувати
            </button>
          </div>

          <div className="info-display">
            <div className="info-row">
              <label>Ім'я користувача</label>
              <span>{user.username}</span>
            </div>
            <div className="info-row">
              <label>Email</label>
              <span>{user.email}</span>
            </div>
            <div className="info-row">
              <label>Приєднався</label>
              <span>{new Date(user.created_at).toLocaleDateString('uk-UA')}</span>
            </div>
          </div>
        </div>

        {/* Tabs for Products and Reviews */}
        <div className="profile-tabs">
          <button 
            className={`tab-btn ${selectedTab === 'products' ? 'active' : ''}`}
            onClick={() => setSelectedTab('products')}
          >
            📦 Мої товари ({myProducts.length})
          </button>
          <button 
            className={`tab-btn ${selectedTab === 'reviews' ? 'active' : ''}`}
            onClick={() => setSelectedTab('reviews')}
          >
            🌟 Мої відгуки ({myReviews.length})
          </button>
          <button 
            className={`tab-btn ${selectedTab === 'seller-reviews' ? 'active' : ''}`}
            onClick={() => setSelectedTab('seller-reviews')}
          >
            ⭐ Відгуки про мене ({sellerReviews.length})
          </button>
        </div>

        {/* My Products Section */}
        {selectedTab === 'products' && (
          <div className="profile-section">
            <h2>📦 Мої товари</h2>
            {myProducts.length === 0 ? (
              <div className="empty-state">
                <p>Ви ще не створили жодного товару</p>
                <button className="btn-browse" onClick={() => navigate('/create-product')}>
                  Створити товар →
                </button>
              </div>
            ) : (
              <div className="my-products-grid">
                {myProducts.map((product) => (
                  <div key={product.id} className="product-card-profile">
                    <div className="product-image">
                      <img src={product.image_url} alt={product.title} />
                    </div>
                    <div className="product-info">
                      <h3>{product.title}</h3>
                      <p className="product-price">{product.price.toFixed(2)} ₴</p>
                      <p className="product-stock">
                        {product.stock > 0 ? `✅ ${product.stock} шт.` : '❌ Немає'}
                      </p>
                    </div>
                    <div className="product-actions">
                      <button 
                        className="btn-edit-product"
                        onClick={() => handleEditProduct(product.id)}
                        title="Редагувати товар"
                      >
                        <Edit2 size={14} />
                      </button>
                      <button 
                        className="btn-delete-product"
                        onClick={() => setProductToDelete(product.id)}
                        title="Видалити товар"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* My Reviews Section */}
        {selectedTab === 'reviews' && (
          <div className="profile-section">
            <h2>🌟 Мої відгуки</h2>
            {myReviews.length === 0 ? (
              <div className="empty-state">
                <p>Ви ще не залишили жодного відгуку</p>
                <button className="btn-browse" onClick={() => navigate('/orders')}>
                  Перейти до замовлень →
                </button>
              </div>
            ) : (
              <div className="reviews-container">
                {myReviews.slice(0, visibleMyReviews).map((review) => (
                  <div key={review.id} className="review-card">
                    <div className="review-header">
                      <div>
                        <div className="review-rating">{'⭐'.repeat(review.rating)}</div>
                        <p className="review-comment">{review.text}</p>
                      </div>
                      <small className="review-date">
                        {new Date(review.created_at).toLocaleDateString('uk-UA')}
                      </small>
                    </div>
                    <div className="review-product">
                      <small>Про товар: <strong>{review.product_title}</strong></small>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {visibleMyReviews < myReviews.length ? (
              <button className="btn-load-more-reviews" onClick={() => setVisibleMyReviews((count) => count + 12)}>
                Показати ще 12
              </button>
            ) : null}
          </div>
        )}

        {/* Seller Reviews Section - Reviews about user */}
        {selectedTab === 'seller-reviews' && (
          <div className="profile-section">
            <h2>⭐ Відгуки про мене</h2>
            {sellerReviews.length === 0 ? (
              <div className="empty-state">
                <p>Ви ще не отримали жодного відгуку</p>
                <button className="btn-browse" onClick={() => navigate('/catalog')}>
                  Переглянути каталог →
                </button>
              </div>
            ) : (
              <div className="reviews-container">
                {sellerReviews.slice(0, visibleSellerReviews).map((review) => (
                  <div key={review.id} className="review-card">
                    <div className="review-header">
                      <div>
                        <div className="review-rating">{'⭐'.repeat(review.rating)}</div>
                        <p className="review-comment">{review.text}</p>
                        <small className="review-buyer">Від: <strong>{review.buyer_name}</strong></small>
                      </div>
                      <small className="review-date">
                        {new Date(review.created_at).toLocaleDateString('uk-UA')}
                      </small>
                    </div>
                    <div className="review-product">
                      <small>Про товар: <strong>{review.product_title}</strong></small>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {visibleSellerReviews < sellerReviews.length ? (
              <button className="btn-load-more-reviews" onClick={() => setVisibleSellerReviews((count) => count + 12)}>
                Показати ще 12
              </button>
            ) : null}
          </div>
        )}
      </div>

      {isCredentialsModalOpen && (
        <div className="modal-overlay" onClick={handleCloseCredentialsModal}>
          <div className="modal-content credentials-modal" onClick={(e) => e.stopPropagation()}>
            <div className="credentials-modal-header">
              <div className="credentials-modal-title-block">
                <h2>
                  <Lock size={18} />
                  Редагування особистих даних
                </h2>
                <p>Щоб змінити пошту або пароль, введіть поточний пароль.</p>
              </div>

              <div className="credentials-meta-card credentials-meta-card--wide">
                <span className="credentials-meta-label">Поточна пошта</span>
                <strong>{user.email}</strong>
              </div>
            </div>

            <form className="credentials-modal-form" onSubmit={handleSaveCredentials}>
              <div className="form-group">
                <label htmlFor="profile-email">Нова пошта</label>
                <input
                  id="profile-email"
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder={user.email}
                  autoComplete="email"
                />
              </div>

              <div className="form-group">
                <label htmlFor="profile-current-password">Поточний пароль</label>
                <input
                  id="profile-current-password"
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="Потрібен для підтвердження змін"
                  autoComplete="current-password"
                />
              </div>

              <div className="form-group">
                <label htmlFor="profile-password">Новий пароль</label>
                <input
                  id="profile-password"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Залиште порожнім, якщо не змінюєте"
                  autoComplete="new-password"
                />
              </div>

              <div className="form-group">
                <label htmlFor="profile-password-confirm">Підтвердження нового пароля</label>
                <input
                  id="profile-password-confirm"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Повторіть новий пароль"
                  autoComplete="new-password"
                />
              </div>

              <p className="credentials-modal-note">
                Поля нової пошти та нового пароля використовують різні підтвердження, але обов’язково перевіряються поточним паролем.
              </p>

              <div className="modal-actions credentials-modal-actions">
                <button type="button" className="modal-btn-cancel" onClick={handleCloseCredentialsModal}>
                  Скасувати
                </button>
                <button type="submit" className="btn-save">
                  Зберегти зміни
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="profile-actions">
        <button className="btn-logout" onClick={handleLogout}>
          <LogOut size={20} />
          Вийти
        </button>
        <button className="btn-delete" onClick={() => setDeleteConfirm(true)}>
          <Trash2 size={20} />
          Видалити аккаунт
        </button>
      </div>

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <div className="modal-overlay" onClick={() => setDeleteConfirm(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2>Видалити аккаунт?</h2>
            <p>Це дію неможливо скасувати. Всі ваші дані будуть видалені назавжди.</p>
            <div className="modal-actions">
              <button className="modal-btn-cancel" onClick={() => setDeleteConfirm(false)}>
                Скасувати
              </button>
              <button className="modal-btn-confirm" onClick={handleDeleteAccount}>
                Видалити
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
            <p>Ви впевнені, що хочете видалити цей товар?</p>
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

export default ProfilePage
