import React from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { CheckCircle2, CreditCard, Loader2, ShieldCheck, Wallet } from 'lucide-react'
import { useAuthStore } from '../stores/authStore'
import { userService } from '../services/api'
import { useToast } from '../components/Toast'
import './BalanceTopUpPage.css'

type PaymentMethod = 'card' | 'paypal' | 'crypto'

type TopUpLocationState = {
  amount?: number
  paymentMethod?: PaymentMethod
}

const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  card: 'Карта',
  paypal: 'PayPal',
  crypto: 'Крипто',
}

const BalanceTopUpPage: React.FC = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const { user, setUser } = useAuthStore()
  const { showToast } = useToast()

  const state = (location.state || {}) as TopUpLocationState

  const [amount, setAmount] = React.useState<number>(Math.max(10, Number(state.amount || 0) || 100))
  const [paymentMethod, setPaymentMethod] = React.useState<PaymentMethod>(state.paymentMethod || 'card')

  const [cardNumber, setCardNumber] = React.useState('')
  const [expiry, setExpiry] = React.useState('')
  const [cvv, setCvv] = React.useState('')
  const [cardHolder, setCardHolder] = React.useState('')

  const [paypalEmail, setPaypalEmail] = React.useState('')
  const [cryptoWallet, setCryptoWallet] = React.useState('')

  const [isProcessing, setIsProcessing] = React.useState(false)
  const [progress, setProgress] = React.useState(0)
  const [isSuccess, setIsSuccess] = React.useState(false)

  React.useEffect(() => {
    if (!user) {
      navigate('/login', { replace: true })
    }
  }, [user, navigate])

  const maskCardNumber = (value: string) => {
    const digits = value.replace(/\D/g, '').slice(0, 16)
    return digits.replace(/(.{4})/g, '$1 ').trim()
  }

  const normalizeExpiry = (value: string) => {
    const digits = value.replace(/\D/g, '').slice(0, 4)
    if (digits.length <= 2) return digits
    return `${digits.slice(0, 2)}/${digits.slice(2)}`
  }

  const validate = () => {
    if (!Number.isFinite(amount) || amount < 10) {
      showToast('Мінімальна сума поповнення 10 ₴', 'error')
      return false
    }

    if (paymentMethod === 'card') {
      if (cardNumber.replace(/\s/g, '').length < 16) {
        showToast('Введіть коректний номер картки', 'error')
        return false
      }
      if (expiry.length < 5) {
        showToast('Введіть термін дії картки', 'error')
        return false
      }
      if (cvv.replace(/\D/g, '').length < 3) {
        showToast('Введіть CVV код', 'error')
        return false
      }
      if (!cardHolder.trim()) {
        showToast('Введіть імʼя власника картки', 'error')
        return false
      }
    }

    if (paymentMethod === 'paypal' && !paypalEmail.trim()) {
      showToast('Введіть email для PayPal', 'error')
      return false
    }

    if (paymentMethod === 'crypto' && !cryptoWallet.trim()) {
      showToast('Введіть адресу крипто-гаманця', 'error')
      return false
    }

    return true
  }

  const completeTopUp = async () => {
    if (!user) return

    const nextBalance = Number(user.balance || 0) + amount

    try {
      const response = await userService.update(user.id, { balance: nextBalance })
      const updatedUser = response?.data?.data || { ...user, balance: nextBalance }
      setUser(updatedUser)
    } catch {
      // Fallback for offline/demo mode.
      setUser({ ...user, balance: nextBalance })
    }

    setIsSuccess(true)
    showToast(`✅ Баланс поповнено на ${amount} ₴`, 'success', 4000)
  }

  const startPayment = async () => {
    if (isProcessing || isSuccess) return
    if (!validate()) return

    setIsProcessing(true)
    setProgress(0)

    const startedAt = Date.now()
    const durationMs = 2800

    const timer = window.setInterval(() => {
      const elapsed = Date.now() - startedAt
      const pct = Math.min(100, Math.round((elapsed / durationMs) * 100))
      setProgress(pct)
    }, 120)

    window.setTimeout(async () => {
      window.clearInterval(timer)
      setProgress(100)
      await completeTopUp()
      setIsProcessing(false)
    }, durationMs)
  }

  if (!user) return null

  return (
    <div className="topup-page">
      <div className="topup-card">
        <div className="topup-header">
          <h1><Wallet size={24} /> Поповнення балансу</h1>
          <p>Імітація платіжного процесу для тестового середовища</p>
        </div>

        {!isSuccess ? (
          <>
            <div className="topup-grid">
              <label>
                Сума поповнення (₴)
                <input
                  type="text"
                  inputMode="decimal"
                  value={amount || ''}
                  onChange={(e) => {
                    const val = e.target.value.replace(/[^0-9.]/g, '')
                    setAmount(val === '' ? 0 : Math.max(0, parseFloat(val)))
                  }}
                  placeholder="100"
                  disabled={isProcessing}
                />
              </label>

              <label>
                Спосіб оплати
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
                  disabled={isProcessing}
                >
                  <option value="card">Карта</option>
                  <option value="paypal">PayPal</option>
                  <option value="crypto">Крипто</option>
                </select>
              </label>
            </div>

            {paymentMethod === 'card' && (
              <div className="payment-section">
                <h3><CreditCard size={18} /> Дані картки</h3>
                <div className="topup-grid">
                  <label>
                    Номер картки
                    <input
                      type="text"
                      inputMode="numeric"
                      placeholder="1234 5678 9012 3456"
                      value={cardNumber}
                      onChange={(e) => setCardNumber(maskCardNumber(e.target.value))}
                      disabled={isProcessing}
                    />
                  </label>

                  <label>
                    Власник картки
                    <input
                      type="text"
                      placeholder="IVAN IVANOV"
                      value={cardHolder}
                      onChange={(e) => setCardHolder(e.target.value)}
                      disabled={isProcessing}
                    />
                  </label>

                  <label>
                    Термін дії
                    <input
                      type="text"
                      inputMode="numeric"
                      placeholder="MM/YY"
                      value={expiry}
                      onChange={(e) => setExpiry(normalizeExpiry(e.target.value))}
                      disabled={isProcessing}
                    />
                  </label>

                  <label>
                    CVV
                    <input
                      type="password"
                      inputMode="numeric"
                      placeholder="***"
                      value={cvv}
                      onChange={(e) => setCvv(e.target.value.replace(/\D/g, '').slice(0, 4))}
                      disabled={isProcessing}
                    />
                  </label>
                </div>
              </div>
            )}

            {paymentMethod === 'paypal' && (
              <div className="payment-section">
                <h3>🔵 Дані PayPal</h3>
                <label>
                  Email PayPal
                  <input
                    type="email"
                    placeholder="name@example.com"
                    value={paypalEmail}
                    onChange={(e) => setPaypalEmail(e.target.value)}
                    disabled={isProcessing}
                  />
                </label>
              </div>
            )}

            {paymentMethod === 'crypto' && (
              <div className="payment-section">
                <h3>₿ Дані крипто-платежу</h3>
                <label>
                  Адреса гаманця
                  <input
                    type="text"
                    placeholder="0x..."
                    value={cryptoWallet}
                    onChange={(e) => setCryptoWallet(e.target.value)}
                    disabled={isProcessing}
                  />
                </label>
              </div>
            )}

            <div className="process-box">
              <div className="process-row">
                <span>Статус платежу</span>
                <strong>{isProcessing ? 'Обробка...' : 'Готово до оплати'}</strong>
              </div>

              <div className="progress-track">
                <div className="progress-fill" style={{ width: `${progress}%` }} />
              </div>

              <small>
                {isProcessing
                  ? `Виконується імітація платежу (${progress}%)`
                  : `Буде поповнено: ${amount} ₴ через ${PAYMENT_LABELS[paymentMethod]}`}
              </small>
            </div>

            <div className="topup-actions">
              <button className="btn-ghost" onClick={() => navigate(-1)} disabled={isProcessing}>
                Скасувати
              </button>
              <button className="btn-primary" onClick={startPayment} disabled={isProcessing}>
                {isProcessing ? <><Loader2 size={18} className="spin" /> Обробка</> : 'Поповнити баланс'}
              </button>
            </div>
          </>
        ) : (
          <div className="success-box">
            <CheckCircle2 size={56} />
            <h2>Баланс успішно поповнено</h2>
            <p>Зараховано <strong>{amount} ₴</strong> через {PAYMENT_LABELS[paymentMethod]}</p>
            <div className="success-balance">Поточний баланс: <strong>{Number(user.balance || 0)} ₴</strong></div>
            <div className="success-note"><ShieldCheck size={16} /> Платіж оброблено в тестовому режимі</div>
            <div className="topup-actions">
              <button className="btn-primary" onClick={() => navigate('/profile')}>До профілю</button>
              <button className="btn-ghost" onClick={() => navigate('/')}>На головну</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default BalanceTopUpPage
