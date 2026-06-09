import React, { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Send, MessageCircle, Paperclip, X } from 'lucide-react'
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
  system_type?: 'info' | 'alert'
  attachment_data?: string
  attachment_name?: string
  attachment_mime?: string
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

const readFileAsDataUrl = (file: File) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader()
  reader.onload = () => resolve(String(reader.result || ''))
  reader.onerror = () => reject(new Error('Не вдалося прочитати файл'))
  reader.readAsDataURL(file)
})

const loadImage = (src: string) => new Promise<HTMLImageElement>((resolve, reject) => {
  const image = new Image()
  image.onload = () => resolve(image)
  image.onerror = () => reject(new Error('Не вдалося завантажити зображення'))
  image.src = src
})

const makeImageAttachment = async (file: File) => {
  const sourceDataUrl = await readFileAsDataUrl(file)
  const shouldPreserveOriginal = file.size <= 6 * 1024 * 1024

  if (shouldPreserveOriginal) {
    return {
      dataUrl: sourceDataUrl,
      mime: file.type || 'image/*',
      name: file.name,
    }
  }

  const image = await loadImage(sourceDataUrl)
  const maxSide = 1600
  const scale = Math.min(1, maxSide / Math.max(image.width, image.height))
  const width = Math.max(1, Math.round(image.width * scale))
  const height = Math.max(1, Math.round(image.height * scale))

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')

  if (!context) {
    return {
      dataUrl: sourceDataUrl,
      mime: file.type || 'image/*',
      name: file.name,
    }
  }

  context.drawImage(image, 0, 0, width, height)
  const dataUrl = canvas.toDataURL(file.type === 'image/png' ? 'image/png' : 'image/jpeg', 0.9)

  return {
    dataUrl,
    mime: file.type === 'image/png' ? 'image/png' : 'image/jpeg',
    name: file.name,
  }
}

type ImageViewerState = {
  src: string
  name: string
  zoom: number
  offsetX: number
  offsetY: number
}

const ChatPage: React.FC = () => {
  const { sellerId } = useParams<{ sellerId?: string }>()
  const navigate = useNavigate()
  const { user, isAuthenticated, isInitialized } = useAuthStore()
  const [chats, setChats] = useState<Chat[]>([])
  const [selectedChat, setSelectedChat] = useState<Chat | null>(null)
  const [messageText, setMessageText] = useState('')
  const [pendingAttachment, setPendingAttachment] = useState<{ dataUrl: string; name: string; mime: string } | null>(null)
  const [imageViewer, setImageViewer] = useState<ImageViewerState | null>(null)
  const [isDragOver, setIsDragOver] = useState(false)
  const [loading, setLoading] = useState(false)
  const messagesAreaRef = useRef<HTMLDivElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const attachmentInputRef = useRef<HTMLInputElement>(null)
  const imagePanRef = useRef<{ dragging: boolean; startX: number; startY: number; startOffsetX: number; startOffsetY: number; pointerId: number | null }>(
    {
    dragging: false,
    startX: 0,
    startY: 0,
    startOffsetX: 0,
    startOffsetY: 0,
    pointerId: null,
  })
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
    const visibleMessages = [...chat.messages]
      .filter((message) => message.sender_id !== user?.id && message.sender_id !== 'system')
    const latestMessage = visibleMessages[visibleMessages.length - 1]

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

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(true)
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    try { e.dataTransfer.dropEffect = 'copy' } catch {}
    setIsDragOver(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
  }

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
    const files = Array.from(e.dataTransfer.files || [])
    const file = files.find((f) => f.type && f.type.startsWith('image/'))
    if (!file) return
    try {
      const attachment = await makeImageAttachment(file)
      setPendingAttachment(attachment)
    } catch {
      // ignore
    }
  }

  const handleSendMessage = async () => {
    if (!selectedChat || !user) return
    if (!messageText.trim() && !pendingAttachment) return

    const newMessage: Message = {
      id: 'msg-' + Date.now(),
      sender_id: user.id,
      sender_name: user.username,
      text: messageText,
      timestamp: new Date().toISOString(),
      attachment_data: pendingAttachment?.dataUrl,
      attachment_name: pendingAttachment?.name,
      attachment_mime: pendingAttachment?.mime,
    }

    const updatedChats = (await facade.sendMessageToSeller(selectedChat.seller_id, newMessage)) as Chat[]
    const sorted = sortChats(updatedChats || [])

    setChats(sorted)
    const updatedChat = sorted.find(c => c.id === selectedChat?.id) || null
    setSelectedChat(updatedChat)
    setMessageText('')
    setPendingAttachment(null)
    if (attachmentInputRef.current) {
      attachmentInputRef.current.value = ''
    }
  }

  const handleAttachmentChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setPendingAttachment(null)
      event.target.value = ''
      return
    }

    try {
      const attachment = await makeImageAttachment(file)
      setPendingAttachment(attachment)
    } catch {
      setPendingAttachment(null)
    }
  }

  const handlePasteMessage = async (event: React.ClipboardEvent<HTMLInputElement>) => {
    const items = Array.from(event.clipboardData.items || [])
    const imageItem = items.find((item) => item.kind === 'file' && item.type.startsWith('image/'))
    const file = imageItem?.getAsFile() || event.clipboardData.files?.[0]

    if (!file || !file.type.startsWith('image/')) return

    event.preventDefault()

    try {
      const attachment = await makeImageAttachment(file)
      setPendingAttachment(attachment)
    } catch {
      setPendingAttachment(null)
    }
  }

  const openImageViewer = (src: string, name: string) => {
    setImageViewer({ src, name, zoom: 1, offsetX: 0, offsetY: 0 })
  }

  const openOriginalImage = () => {
    if (!imageViewer) return
    try { window.open(imageViewer.src, '_blank') } catch {}
  }

  const closeImageViewer = () => {
    setImageViewer(null)
  }

  const changeViewerZoom = (delta: number) => {
    setImageViewer((current) => {
      if (!current) return current
      const nextZoom = Math.min(4, Math.max(0.5, Number((current.zoom + delta).toFixed(2))))
      return { ...current, zoom: nextZoom }
    })
  }

  const startPan = (event: React.PointerEvent<HTMLImageElement>) => {
    if (!imageViewer) return
    imagePanRef.current = {
      dragging: true,
      startX: event.clientX,
      startY: event.clientY,
      startOffsetX: imageViewer.offsetX,
      startOffsetY: imageViewer.offsetY,
      pointerId: event.pointerId,
    }
    try { event.currentTarget.setPointerCapture(event.pointerId) } catch {}
    event.preventDefault()
  }

  const movePan = (event: React.PointerEvent<HTMLImageElement>) => {
    if (!imageViewer || !imagePanRef.current.dragging) return
    if (imagePanRef.current.pointerId !== null && event.pointerId !== imagePanRef.current.pointerId) return
    const dx = event.clientX - imagePanRef.current.startX
    const dy = event.clientY - imagePanRef.current.startY
    setImageViewer((current) => {
      if (!current) return current
      return {
        ...current,
        offsetX: imagePanRef.current.startOffsetX + dx,
        offsetY: imagePanRef.current.startOffsetY + dy,
      }
    })
  }

  const endPan = (event: React.PointerEvent<HTMLImageElement>) => {
    if (imagePanRef.current.dragging) {
      imagePanRef.current.dragging = false
      const pid = imagePanRef.current.pointerId
      imagePanRef.current.pointerId = null
      try { if (pid !== null) event.currentTarget.releasePointerCapture(pid) } catch {}
    }
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
                        <strong>{lastMessage.sender_id === user?.id ? 'Ви' : sanitizeDisplayName(lastMessage.sender_name)}:</strong>{' '}
                        {lastMessage.text || (lastMessage.attachment_data ? '🖼️ Фото' : '')}
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
        <div className="chat-area" onDragEnter={handleDragEnter} onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}>
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
                {selectedChat.messages.map((msg) => {
                  const text = String(msg.text || '')
                  const explicitType = (msg as any).system_type
                  const isAlert = msg.isSystemMessage && (explicitType === 'alert' || /спір|СПІР|🚨/.test(text))
                  const systemClass = msg.isSystemMessage ? (isAlert ? 'system-alert' : 'system-info') : ''
                  return (
                  <div
                    key={msg.id}
                    className={`message ${msg.sender_id === user?.id ? 'sent' : 'received'} ${msg.isSystemMessage ? 'system-message' : ''} ${systemClass} ${msg.sender_role === 'support' || msg.sender_role === 'admin' ? 'staff-message' : ''}`}
                  >
                    {msg.isSystemMessage && (
                      <div className={`system-badge ${isAlert ? 'alert' : 'info'}`}>
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
                      {msg.attachment_data && (
                        <div className="message-attachment">
                          <img
                            src={msg.attachment_data}
                            alt={msg.attachment_name || 'Фото у чаті'}
                            role="button"
                            tabIndex={0}
                            onClick={() => openImageViewer(msg.attachment_data!, msg.attachment_name || 'Фото у чаті')}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault()
                                openImageViewer(msg.attachment_data!, msg.attachment_name || 'Фото у чаті')
                              }
                            }}
                          />
                          {msg.attachment_name && <span>{msg.attachment_name}</span>}
                        </div>
                      )}
                      <small>
                        {formatChatTime(msg.timestamp)}
                      </small>
                    </div>
                  </div>
                  )
                })}
                <div ref={messagesEndRef} />
              </div>

              <div className="message-input-wrap">
                {pendingAttachment && (
                  <div className="chat-attachment-preview">
                    <img src={pendingAttachment.dataUrl} alt={pendingAttachment.name} />
                    <div>
                      <strong>{pendingAttachment.name}</strong>
                      <p>Фото буде відправлене разом із повідомленням</p>
                    </div>
                    <button type="button" className="chat-attachment-remove" onClick={() => { setPendingAttachment(null); if (attachmentInputRef.current) attachmentInputRef.current.value = '' }}>
                      <X size={16} />
                    </button>
                  </div>
                )}

                <div className="message-input">
                  <input
                    type="text"
                    placeholder="Напишіть повідомлення..."
                    value={messageText}
                    onChange={(e) => setMessageText(e.target.value)}
                    onPaste={handlePasteMessage}
                    onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                  />
                  <button type="button" className="attach-btn" onClick={() => attachmentInputRef.current?.click()} title="Додати фото">
                    <Paperclip size={18} />
                  </button>
                  <button onClick={handleSendMessage} className="send-btn">
                    <Send size={20} />
                  </button>
                  <input
                    ref={attachmentInputRef}
                    type="file"
                    accept="image/*"
                    className="chat-attachment-input"
                    onChange={handleAttachmentChange}
                  />
                </div>
              </div>

              {imageViewer && (
                <div className="image-viewer-overlay" onClick={closeImageViewer} role="dialog" aria-modal="true" aria-label="Перегляд фото">
                  <div className="image-viewer" onClick={(e) => e.stopPropagation()}>
                    <div className="image-viewer-header">
                      <div>
                        <strong>{imageViewer.name}</strong>
                        <span>{Math.round(imageViewer.zoom * 100)}%</span>
                      </div>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <button type="button" className="image-viewer-open" onClick={openOriginalImage} title="Відкрити оригінал">
                          {"Відкрити оригінал"}
                        </button>
                        <button type="button" className="image-viewer-close" onClick={closeImageViewer} aria-label="Закрити">
                          <X size={18} />
                        </button>
                      </div>
                    </div>
                    <div className="image-viewer-controls">
                      <button type="button" onClick={() => changeViewerZoom(-0.25)}>-</button>
                      <button type="button" onClick={() => setImageViewer((current) => current ? { ...current, zoom: 1 } : current)}>100%</button>
                      <button type="button" onClick={() => changeViewerZoom(0.25)}>+</button>
                    </div>
                    <div className="image-viewer-stage" onWheel={(e) => {
                      if (e.ctrlKey) return
                      e.preventDefault()
                      changeViewerZoom(e.deltaY < 0 ? 0.1 : -0.1)
                    }}>
                      <img
                        src={imageViewer.src}
                        alt={imageViewer.name}
                        style={{
                          transform: `translate(${imageViewer.offsetX}px, ${imageViewer.offsetY}px) scale(${imageViewer.zoom})`,
                          transition: imagePanRef.current.dragging ? 'none' : 'transform 0.12s ease-out',
                          cursor: imagePanRef.current.dragging ? 'grabbing' : 'grab',
                        }}
                        onPointerDown={startPan}
                        onPointerMove={movePan}
                        onPointerUp={endPan}
                        onPointerLeave={endPan}
                        onPointerCancel={endPan}
                      />
                    </div>
                    <p className="image-viewer-hint">Можна клікати `+` / `-` або крутити колесо миші над фото.</p>
                  </div>
                </div>
              )}
              {isDragOver && (
                <div className="drop-overlay" onDragEnter={(e) => e.preventDefault()} onClick={() => setIsDragOver(false)}>
                  <div className="drop-overlay-inner">Киньте фото сюди, щоб додати в чат</div>
                </div>
              )}
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
