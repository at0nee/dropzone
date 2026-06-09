import React, { useState, useEffect, useRef } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Menu, LogOut, MessageCircle, Search, X, Home, Package, Settings, Wallet, Plus, User, Shield } from 'lucide-react'
import { useAuthStore } from '../../stores/authStore'
import { canAccessAdminPanel } from '../../utils/adminData'
import facade from '../../services/facade'
import { userService } from '../../services/api'
import './Header.css'

interface HeaderProps {
  onMenuClick: () => void
}

const Header: React.FC<HeaderProps> = ({ onMenuClick }) => {
  const { user, logout, isAuthenticated } = useAuthStore()
  const navigate = useNavigate()
  const location = useLocation()
  const [searchQuery, setSearchQuery] = React.useState('')
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [balanceMenuOpen, setBalanceMenuOpen] = useState(false)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const [topUpAmount, setTopUpAmount] = useState('')
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState('card')
  const [chatUnreadCount, setChatUnreadCount] = useState(0)
  const balanceMenuRef = useRef<HTMLDivElement>(null)
  const userMenuRef = useRef<HTMLDivElement>(null)
  const CHAT_READ_STATE_EVENT = 'chat-read-state-changed'

  const paymentMethods = [
    { id: 'card', name: '💳 Карта' },
    { id: 'paypal', name: '🔵 PayPal' },
    { id: 'crypto', name: '₿ Крипто' },
  ]

  // Закриваємо меню при кліку поза ним
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (balanceMenuRef.current && !balanceMenuRef.current.contains(e.target as Node)) {
        setBalanceMenuOpen(false)
      }
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleLogout = () => {
    logout()
    navigate('/')
    setMobileMenuOpen(false)
    setUserMenuOpen(false)
  }

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    const query = searchQuery.trim()
    if (query) {
      navigate(`/catalog?search=${encodeURIComponent(query)}`)
      return
    }

    if (location.pathname === '/catalog') {
      navigate('/catalog', { replace: true })
    }
  }

  const handleSearchChange = (value: string) => {
    setSearchQuery(value)
    const query = value.trim()
    if (location.pathname === '/catalog') {
      navigate(query ? `/catalog?search=${encodeURIComponent(query)}` : '/catalog', { replace: true })
    }
  }

  useEffect(() => {
    if (location.pathname !== '/catalog') return

    const query = new URLSearchParams(location.search).get('search') || ''
    setSearchQuery(query)
  }, [location.pathname, location.search])

  const handleNavClick = (path: string) => {
    navigate(path)
    setMobileMenuOpen(false)
  }

  const handleTopUp = () => {
    const amount = Number(topUpAmount)
    if (!Number.isFinite(amount) || amount <= 0 || !selectedPaymentMethod) return

    setBalanceMenuOpen(false)
    navigate('/balance/topup', {
      state: {
        amount,
        paymentMethod: selectedPaymentMethod,
      },
    })
  }

  const handleWithdraw = () => {
    const amount = Number(topUpAmount)
    setBalanceMenuOpen(false)
    navigate('/balance/withdraw', {
      state: {
        amount: Number.isFinite(amount) && amount > 0 ? amount : undefined,
      },
    })
  }

  const getReadStateKey = () => `chat-read-state:${user?.id || 'guest'}`

  const readChatState = (): Record<string, string> => {
    if (typeof window === 'undefined') return {}
    try {
      return JSON.parse(window.localStorage.getItem(getReadStateKey()) || '{}')
    } catch {
      return {}
    }
  }

  const refreshChatUnreadCount = async () => {
    if (!isAuthenticated || !user) {
      setChatUnreadCount(0)
      return
    }

    try {
      const chats = await facade.getChats()
      const readState = readChatState()

        const totalUnread = ((Array.isArray(chats) ? chats : chats?.data || []) || []).reduce((count: number, chat: any) => {
        const lastReadAt = readState[chat.id]
        const unreadInChat = (chat.messages || []).filter((message: any) => {
          if (message.sender_id === user.id || message.sender_id === 'system') return false
          if (!lastReadAt) return true
          return new Date(message.timestamp).getTime() > new Date(lastReadAt).getTime()
        }).length
        return count + unreadInChat
      }, 0)

      setChatUnreadCount(totalUnread)
    } catch {
      setChatUnreadCount(0)
    }
  }

  useEffect(() => {
    let cancelled = false

    const syncUnreadCount = async () => {
      if (cancelled) return
      await refreshChatUnreadCount()
    }

    syncUnreadCount()

    const intervalId = window.setInterval(syncUnreadCount, 3000)
    const handleChatStateChange = () => {
      syncUnreadCount()
    }
    const handleStorageChange = () => {
      syncUnreadCount()
    }
    const handleFocus = () => {
      syncUnreadCount()
    }
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        syncUnreadCount()
      }
    }

    window.addEventListener(CHAT_READ_STATE_EVENT, handleChatStateChange)
    window.addEventListener('storage', handleStorageChange)
    window.addEventListener('focus', handleFocus)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      cancelled = true
      window.clearInterval(intervalId)
      window.removeEventListener(CHAT_READ_STATE_EVENT, handleChatStateChange)
      window.removeEventListener('storage', handleStorageChange)
      window.removeEventListener('focus', handleFocus)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [isAuthenticated, user?.id])

  // Sync user data (balance, roles, etc) every 5 seconds
  useEffect(() => {
    if (!isAuthenticated || !user) return

    let cancelled = false

    const syncUserData = async () => {
      if (cancelled) return
      try {
        const response = await userService.getById(user.id)
        const updatedUser = response.data?.data ?? null
        if (updatedUser && !cancelled) {
          useAuthStore.setState({ user: updatedUser })
        }
      } catch (error) {
        // silently fail, user data will be synced on next interval
      }
    }

    syncUserData()
    const intervalId = window.setInterval(syncUserData, 5000)

    const handleStorageChange = () => {
      syncUserData()
    }
    const handleFocus = () => {
      syncUserData()
    }

    window.addEventListener('storage', handleStorageChange)
    window.addEventListener('focus', handleFocus)

    return () => {
      cancelled = true
      window.clearInterval(intervalId)
      window.removeEventListener('storage', handleStorageChange)
      window.removeEventListener('focus', handleFocus)
    }
  }, [isAuthenticated, user?.id])

  const userBalance = user?.balance || 0

  return (
    <>
      <header className="header">
        <div className="header-content">
          <Link to="/" className="logo">
            <div className="logo-icon">⚡</div>
            <div className="logo-text">Dropzone</div>
          </Link>

          <form className="search-form" onSubmit={handleSearch}>
            <input
              type="text"
              placeholder="Пошук товарів..."
              value={searchQuery}
              onChange={(e) => handleSearchChange(e.target.value)}
            />
            <button type="submit" title="Пошук">
              <Search size={20} />
            </button>
          </form>

          <div className="desktop-nav">
            <Link to="/catalog" className="nav-link">
              Каталог
            </Link>
            {isAuthenticated && (
              <Link to="/create-product" className="nav-link create-btn">
                <Plus size={18} /> Створити товар
              </Link>
            )}
          </div>

          <div className="header-actions">
            {isAuthenticated && (
              <Link to="/chat" className={`chat-btn ${chatUnreadCount > 0 ? 'has-unread' : ''}`} title={chatUnreadCount > 0 ? `Нове повідомлення: ${chatUnreadCount}` : 'Чати'}>
                <MessageCircle size={24} />
                {chatUnreadCount > 0 && (
                  <span className="chat-unread-badge">{chatUnreadCount > 99 ? '99+' : chatUnreadCount}</span>
                )}
              </Link>
            )}

            {isAuthenticated && user ? (
              <>
                {/* Balance Button */}
                <div className="balance-container" ref={balanceMenuRef}>
                  <button 
                    className="balance-btn"
                    onClick={() => setBalanceMenuOpen(!balanceMenuOpen)}
                    title="Баланс"
                  >
                    <Wallet size={20} />
                    <span className="balance-amount">{userBalance}₴</span>
                  </button>

                  {balanceMenuOpen && (
                    <div className="balance-menu">
                      <div className="balance-menu-header">
                        <h4>Поповнити баланс</h4>
                        <button className="close-btn" onClick={() => setBalanceMenuOpen(false)}>
                          <X size={18} />
                        </button>
                      </div>

                      <div className="topup-form">
                        <div className="form-group">
                          <label>Сума (₴)</label>
                          <input
                            type="text"
                            inputMode="decimal"
                            placeholder="Введіть суму"
                            value={topUpAmount}
                            onChange={(e) => {
                              const val = e.target.value.replace(/[^0-9.]/g, '')
                              setTopUpAmount(val)
                            }}
                          />
                        </div>

                        <div className="form-group">
                          <label>Метод оплати</label>
                          <div className="payment-methods">
                            {paymentMethods.map((method) => (
                              <button
                                key={method.id}
                                className={`payment-method ${selectedPaymentMethod === method.id ? 'active' : ''}`}
                                onClick={() => setSelectedPaymentMethod(method.id)}
                              >
                                {method.name}
                              </button>
                            ))}
                          </div>
                        </div>

                        <button className="topup-btn" onClick={handleTopUp}>
                          Поповнити баланс
                        </button>
                        <button className="topup-btn" onClick={handleWithdraw}>
                          Вивести з балансу
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* User Menu */}
                <div className="user-container" ref={userMenuRef}>
                  <button 
                    className="user-btn"
                    onClick={() => setUserMenuOpen(!userMenuOpen)}
                    title={user.username}
                  >
                    <User size={20} />
                    <span>{user.username}</span>
                  </button>

                  {userMenuOpen && (
                    <div className="user-menu">
                      <Link to="/profile" className="user-menu-item">
                        <Settings size={18} /> Профіль
                      </Link>
                      <Link to="/balance/history" className="user-menu-item">
                        <Wallet size={18} /> Історія балансу
                      </Link>
                      {canAccessAdminPanel(user?.role) && (
                        <Link to="/admin" className="user-menu-item">
                          <Shield size={18} /> Панель
                        </Link>
                      )}
                      <Link to="/orders" className="user-menu-item">
                        <MessageCircle size={18} /> Замовлення
                      </Link>
                      <button className="user-menu-item logout" onClick={handleLogout}>
                        <LogOut size={18} /> Вийти
                      </button>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <Link to="/login" className="login-btn">
                Вхід
              </Link>
            )}

            <button 
              className="mobile-menu-btn" 
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              title="Меню"
            >
              {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
          </div>
        </div>
      </header>

      {mobileMenuOpen && (
        <div className="mobile-menu">
          <nav className="mobile-nav">
            <button onClick={() => handleNavClick('/')} className="mobile-nav-item">
              <Home size={20} /> Головна
            </button>
            <button onClick={() => handleNavClick('/catalog')} className="mobile-nav-item">
              <Package size={20} /> Каталог
            </button>

            {isAuthenticated && user ? (
              <>
                <button onClick={() => handleNavClick('/profile')} className="mobile-nav-item">
                  <User size={20} /> Профіль
                </button>
                <button onClick={() => handleNavClick('/balance/history')} className="mobile-nav-item">
                  <Wallet size={20} /> Історія балансу
                </button>
                <button onClick={handleLogout} className="mobile-nav-item logout">
                  <LogOut size={20} /> Вийти ({userBalance}₴)
                </button>
              </>
            ) : (
              <button onClick={() => handleNavClick('/login')} className="mobile-nav-item login">
                Вхід
              </button>
            )}
          </nav>
        </div>
      )}
    </>
  )
}

export default Header
