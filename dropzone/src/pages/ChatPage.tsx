import React, { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Send, MessageCircle } from 'lucide-react'
import { useAuthStore } from '../stores/authStore'
import './ChatPage.css'
import facade from '../services/facade'

interface Message {
  id: string
  sender_id: string
  sender_name: string
  text: string
  timestamp: string
  sender_role?: 'user' | 'support' | 'admin' | 'system'
  isSystemMessage?: boolean
}

interface Chat {
  id: string
  seller_id: string
  seller_name: string
  buyer_id?: string
  buyer_name?: string
  product_id?: string
  product_name?: string
  created_at?: string
  updated_at?: string
  messages: Message[]
}

const parseChatTimestamp = (value: unknown): Date => {
  if (value instanceof Date) return value

  if (typeof value === 'number' && Number.isFinite(value)) {
    // Accept both seconds and milliseconds epoch.
    const ms = value < 1e12 ? value * 1000 : value
    return new Date(ms)
  }

  const raw = String(value || '').trim()
  if (!raw) return new Date(0)

  // Numeric timestamp in string form.
  if (/^\d{10,13}$/.test(raw)) {
    const n = Number(raw)
    const ms = raw.length === 10 ? n * 1000 : n
    return new Date(ms)
  }

  // Legacy format support: "YYYY-MM-DD HH:mm:ss" -> local time parse.
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2})?$/.test(raw)) {
    return new Date(raw.replace(' ', 'T') + 'Z')
  }

  // ISO-like string without timezone suffix -> treat as UTC.
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?$/.test(raw)) {
    return new Date(raw + 'Z')
  }

  return new Date(raw)
}

const formatChatTime = (value: unknown): string => {
  const parsed = parseChatTimestamp(value)
  if (Number.isNaN(parsed.getTime())) return '--:--'

  const now = new Date()
  const isSameDay = parsed.toDateString() === now.toDateString()
  const timePart = parsed.toLocaleTimeString('uk-UA', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })

  if (isSameDay) return timePart

  return `${parsed.toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit' })} ${timePart}`
}

const getChatDisplayName = (chat: Chat, currentUserId?: string): string => {
  const cleanName = (name?: string) => String(name || '').replace(/^(Админ|Адмін|Сапорт|Support|Admin)\s+/i, '')
  const sellerName = cleanName(chat.seller_name)
  const buyerName = cleanName(chat.buyer_name)

  if (!currentUserId) return sellerName || buyerName || 'Користувач'

  if (chat.seller_id === currentUserId) {
    return buyerName || chat.buyer_id || 'Користувач'
  }

  if (chat.buyer_id === currentUserId) {
    return sellerName || chat.seller_id || 'Користувач'
  }

  return sellerName || buyerName || 'Користувач'
}

const ChatPage: React.FC = () => {
  const { sellerId } = useParams<{ sellerId?: string }>()
  const navigate = useNavigate()
  const { user, isAuthenticated, isInitialized } = useAuthStore()
  const [chats, setChats] = useState<Chat[]>([])
  const [selectedChat, setSelectedChat] = useState<Chat | null>(null)
  const [messageText, setMessageText] = useState('')
  const [loading, setLoading] = useState(false)
  const messagesAreaRef = useRef<HTMLDivElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const CHAT_READ_STATE_EVENT = 'chat-read-state-changed'
  const stickToBottomRef = useRef(true)

  const getReadStateKey = () => `chat-read-state:${user?.id || 'guest'}`

  const readChatState = (): Record<string, string> => {
    if (typeof window === 'undefined') return {}
    try {
      return JSON.parse(window.localStorage.getItem(getReadStateKey()) || '{}')
    } catch {
      return {}
    }
  }

  const writeReadChatState = (state: Record<string, string>) => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(getReadStateKey(), JSON.stringify(state))
    window.dispatchEvent(new Event(CHAT_READ_STATE_EVENT))
  }

  const markChatAsRead = (chat: Chat) => {
    const latestMessage = [...chat.messages]
      .filter((message) => message.sender_id !== user?.id && message.sender_id !== 'system')
      .at(-1)

    if (!latestMessage) return

    const nextState = readChatState()
    nextState[chat.id] = latestMessage.timestamp
    writeReadChatState(nextState)
  }

  const getUnreadCount = (chat: Chat) => {
    const readState = readChatState()
    const lastReadAt = readState[chat.id]

    return chat.messages.filter((message) => {
      if (message.sender_id === user?.id || message.sender_id === 'system') return false
      if (!lastReadAt) return true
      return parseChatTimestamp(message.timestamp).getTime() > parseChatTimestamp(lastReadAt).getTime()
    }).length
  }

  const sortChats = (items: Chat[]) => {
    return [...items].sort((a: Chat, b: Chat) => {
      const aLastMsg = a.messages[a.messages.length - 1]?.timestamp || a.created_at || new Date(0).toISOString()
      const bLastMsg = b.messages[b.messages.length - 1]?.timestamp || b.created_at || new Date(0).toISOString()
      return parseChatTimestamp(bLastMsg).getTime() - parseChatTimestamp(aLastMsg).getTime()
    })
  }

  const sanitizeDisplayName = (name?: string) => {
    if (!name) return ''
    return String(name).replace(/^(Админ|Адмін|Сапорт|Support|Admin)\s+/i, '')
  }

  const loadChats = async (preferredSellerId?: string) => {
    const savedChats = (await facade.getChats()) as Chat[]
    // debug logs removed

    const sortedChats = sortChats(savedChats || [])

    if (preferredSellerId) {
      let chat = sortedChats.find((c: Chat) => c.seller_id === preferredSellerId)
      if (!chat) {
        const created = (await facade.createOrGetChatForSeller(preferredSellerId)) as Chat
        chat = created
        const mergedChats = sortChats([chat, ...sortedChats.filter((item: Chat) => item.id !== chat!.id)])
        setChats(mergedChats)
        const selected = mergedChats.find((item: Chat) => item.id === chat!.id) || chat
        setSelectedChat(selected)
        markChatAsRead(selected)
        return mergedChats
      }

      setChats(sortedChats)
      setSelectedChat(chat)
      markChatAsRead(chat)
      return sortedChats
    }

    setChats(sortedChats)
    setSelectedChat((current) => {
      if (!current) return current
      const nextCurrent = sortedChats.find((item: Chat) => item.id === current.id) || current
      if (nextCurrent) {
        markChatAsRead(nextCurrent)
      }
      return nextCurrent ?? current
    })
    return sortedChats
  }

  useEffect(() => {
    if (!isInitialized) return
    if (!isAuthenticated) {
      navigate('/login')
      return
    }

    let cancelled = false

    const refreshChats = async () => {
      if (cancelled) return
      setLoading(true)
      try {
        await loadChats(sellerId)
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    refreshChats()

    const intervalId = window.setInterval(refreshChats, 3000)
    const handleStorageChange = () => {
      refreshChats()
    }
    const handleFocus = () => {
      refreshChats()
    }
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        refreshChats()
      }
    }

    window.addEventListener('storage', handleStorageChange)
    window.addEventListener('focus', handleFocus)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      cancelled = true
      window.clearInterval(intervalId)
      window.removeEventListener('storage', handleStorageChange)
      window.removeEventListener('focus', handleFocus)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [isAuthenticated, isInitialized, navigate, sellerId])

  useEffect(() => {
    const messagesArea = messagesAreaRef.current
    if (!messagesArea || !selectedChat) return

    const lastMessage = selectedChat.messages[selectedChat.messages.length - 1]
    if (!lastMessage) return

    const nearBottom = messagesArea.scrollHeight - messagesArea.scrollTop - messagesArea.clientHeight < 120
    const shouldStickToBottom = stickToBottomRef.current || nearBottom

    if (shouldStickToBottom) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
      stickToBottomRef.current = true
    }
  }, [selectedChat?.id, selectedChat?.messages.length, selectedChat?.messages[selectedChat.messages.length - 1]?.id])

  const handleSendMessage = async () => {
    if (!messageText.trim() || !selectedChat || !user) return

    const newMessage: Message = {
      id: 'msg-' + Date.now(),
      sender_id: user.id,
      sender_name: user.username,
      text: messageText,
      timestamp: new Date().toISOString(),
    }

    const updatedChats = (await facade.sendMessageToSeller(selectedChat.seller_id, newMessage)) as Chat[]
    const sorted = sortChats(updatedChats || [])

    setChats(sorted)
    const updatedChat = sorted.find(c => c.id === selectedChat?.id) || null
    setSelectedChat(updatedChat)
    setMessageText('')
  }

  const handleCreateChat = (sellerId: string) => {
    navigate(`/chat/${sellerId}`)
  }

  if (!isAuthenticated) {
    return <div className="chat-loading">Завантаження...</div>
  }

  return (
    <div className="chat-page">
      <div className="chat-container">
        {/* Список чатів */}
        <div className="chats-list">
          <div className="chats-header">
            <h2>Чати</h2>
            <MessageCircle size={24} />
          </div>

          {chats.length === 0 ? (
            <div className="no-chats">
              <MessageCircle size={48} />
              <p>Немає активних чатів</p>
              <small>Писатимуть вам після покупки</small>
            </div>
          ) : (
            chats.map((chat) => {
              const lastMessage = chat.messages[chat.messages.length - 1]
              const isActive = selectedChat?.id === chat.id
              const unreadCount = getUnreadCount(chat)
              const chatDisplayName = getChatDisplayName(chat, user?.id)
              return (
                <button
                  key={chat.id}
                  className={`chat-item ${isActive ? 'active' : ''} ${unreadCount > 0 ? 'has-unread' : ''}`}
                  onClick={() => {
                    setSelectedChat(chat)
                    markChatAsRead(chat)
                  }}
                >
                  <div className="chat-item-header">
                    <div className="chat-item-title">
                      <h4>{chatDisplayName}</h4>
                      {unreadCount > 0 && (
                        <span className="unread-badge">{unreadCount}</span>
                      )}
                    </div>
                  </div>
                  {lastMessage && (
                    <>
                      <p className="last-message">
                        <strong>{lastMessage.sender_id === user?.id ? 'Ви' : sanitizeDisplayName(lastMessage.sender_name)}:</strong> {lastMessage.text}
                      </p>
                      <small className="message-time">
                        {formatChatTime(lastMessage.timestamp)}
                      </small>
                    </>
                  )}
                </button>
              )
            })
          )}
        </div>

        {/* Область чату */}
        <div className="chat-area">
          {selectedChat ? (
            <>
              <div className="chat-header">
                <div>
                  <h3>{getChatDisplayName(selectedChat, user?.id)}</h3>
                </div>
              </div>

              <div
                className="messages-area"
                ref={messagesAreaRef}
                onScroll={() => {
                  const messagesArea = messagesAreaRef.current
                  if (!messagesArea) return
                  stickToBottomRef.current = messagesArea.scrollHeight - messagesArea.scrollTop - messagesArea.clientHeight < 120
                }}
              >
                {selectedChat.messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`message ${msg.sender_id === user?.id ? 'sent' : 'received'} ${msg.isSystemMessage ? 'system-message' : ''} ${msg.sender_role === 'support' || msg.sender_role === 'admin' ? 'staff-message' : ''}`}
                  >
                    {msg.isSystemMessage && (
                      <div className="system-badge">
                        <span>🔒 СИСТЕМНЕ</span>
                      </div>
                    )}
                    {!msg.isSystemMessage && (msg.sender_role === 'support' || msg.sender_role === 'admin') && (
                      <div className={`staff-badge ${msg.sender_role}`}>
                        <span>{msg.sender_role === 'admin' ? 'Адмін' : 'Сапорт'}</span>
                      </div>
                    )}
                    <div className="message-content">
                      <p>{msg.text}</p>
                      <small>
                        {formatChatTime(msg.timestamp)}
                      </small>
                    </div>
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>

              <div className="message-input">
                <input
                  type="text"
                  placeholder="Напишіть повідомлення..."
                  value={messageText}
                  onChange={(e) => setMessageText(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                />
                <button onClick={handleSendMessage} className="send-btn">
                  <Send size={20} />
                </button>
              </div>
            </>
          ) : (
            <div className="empty-state">
              <MessageCircle size={64} />
              <h2>Виберіть чат</h2>
              <p>Оберіть чат зі списку щоб почати спілкуватись</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default ChatPage
