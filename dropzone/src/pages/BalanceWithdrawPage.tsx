import React from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { AlertTriangle, ArrowLeftRight, CalendarClock, ShieldCheck, Wallet } from 'lucide-react'
import { useAuthStore } from '../stores/authStore'
import { balanceService, type WithdrawalRequest } from '../services/api'
import { useToast } from '../components/Toast'
import './BalanceWithdrawPage.css'

type WithdrawMethod = 'paypal' | 'card' | 'usdt_trc20'

type WithdrawLocationState = {
  amount?: number
}

const METHOD_LABELS: Record<WithdrawMethod, string> = {
  paypal: 'PayPal',
  card: 'Карта',
  usdt_trc20: 'USDT (TRC20)',
}

const FEE_PERCENT = 5
const MIN_WITHDRAWAL_AMOUNT = 300

const BalanceWithdrawPage: React.FC = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const { user, setUser } = useAuthStore()
  const { showToast } = useToast()

  const state = (location.state || {}) as WithdrawLocationState

  const [amount, setAmount] = React.useState<number>(Math.max(0, Number(state.amount || 0) || 0))
  const [method, setMethod] = React.useState<WithdrawMethod>('paypal')
  const [destination, setDestination] = React.useState('')
  const [currentPassword, setCurrentPassword] = React.useState('')
  const [isSubmitting, setIsSubmitting] = React.useState(false)
  const [withdrawalRequests, setWithdrawalRequests] = React.useState<WithdrawalRequest[]>([])
  const [loadingWithdrawals, setLoadingWithdrawals] = React.useState(false)

  React.useEffect(() => {
    if (!user) navigate('/login', { replace: true })
  }, [navigate, user])

  React.useEffect(() => {
    if (!user?.id) return

    let cancelled = false

    const loadWithdrawals = async () => {
      setLoadingWithdrawals(true)
      try {
        const response = await balanceService.getMyWithdrawals()
        if (!cancelled) {
          setWithdrawalRequests(response.data?.data ?? [])
        }
      } catch {
        if (!cancelled) setWithdrawalRequests([])
      } finally {
        if (!cancelled) setLoadingWithdrawals(false)
      }
    }

    void loadWithdrawals()
    return () => {
      cancelled = true
    }
  }, [user?.id])

  const userBalance = Number(user?.balance || 0)

  const formatCardNumber = (value: string) => {
    const digits = value.replace(/\D/g, '').slice(0, 16)
    return digits.replace(/(.{4})/g, '$1 ').trim()
  }

  const sanitizeUsdtAddress = (value: string) => value.replace(/\s/g, '')

  const feeAmount = React.useMemo(() => Number((Math.max(0, amount) * (FEE_PERCENT / 100)).toFixed(2)), [amount])
  const netAmount = React.useMemo(() => Number((Math.max(0, amount) - feeAmount).toFixed(2)), [amount, feeAmount])
  const balanceAfterWithdraw = React.useMemo(() => Number((Math.max(0, userBalance - amount)).toFixed(2)), [userBalance, amount])

  const destinationLabel = React.useMemo(() => {
    if (method === 'paypal') return 'Email PayPal'
    if (method === 'card') return 'Номер картки'
    return 'Адреса гаманця USDT TRC20'
  }, [method])

  const validate = () => {
    if (!user) return false
    if (!Number.isFinite(amount) || amount <= 0) {
      showToast('Вкажіть суму для виводу', 'error')
      return false
    }
    if (amount < MIN_WITHDRAWAL_AMOUNT) {
      showToast(`Мінімальна сума виводу ${MIN_WITHDRAWAL_AMOUNT} ₴`, 'error')
      return false
    }
    if (amount > userBalance) {
      showToast('Недостатньо коштів на балансі', 'error')
      return false
    }
    if (!destination.trim()) {
      showToast('Вкажіть реквізити для виводу', 'error')
      return false
    }
    if (!currentPassword.trim()) {
      showToast('Введіть поточний пароль для підтвердження', 'error')
      return false
    }

    if (method === 'paypal') {
      const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
      if (!emailRe.test(destination.trim())) {
        showToast('Введіть коректний PayPal email', 'error')
        return false
      }
    }

    if (method === 'card') {
      const cardDigits = destination.replace(/\D/g, '')
      if (cardDigits.length !== 16) {
        showToast('Введіть коректний номер картки (16 цифр)', 'error')
        return false
      }
    }

    if (method === 'usdt_trc20') {
      const wallet = destination.trim()
      if (wallet.length < 20) {
        showToast('Введіть коректну адресу USDT TRC20', 'error')
        return false
      }
    }

    return true
  }

  const submitWithdraw = async () => {
    if (isSubmitting || !validate()) return
    setIsSubmitting(true)

    try {
      const response = await balanceService.createWithdrawal({
        amount,
        method,
        destination: destination.trim(),
        current_password: currentPassword,
      })

      const updatedUser = response?.data?.data?.user
      if (updatedUser) setUser(updatedUser)

      try {
        const withdrawalsResponse = await balanceService.getMyWithdrawals()
        setWithdrawalRequests(withdrawalsResponse.data?.data ?? [])
      } catch {
        // ignore list refresh errors, the request itself was created successfully
      }

      showToast('✅ Заявка на вивід створена. Очікуйте обробку до 7 діб.', 'success', 4500)
      navigate('/balance/history')
    } catch (error: any) {
      const apiError = error?.response?.data?.error || 'Не вдалося створити заявку на вивід'
      showToast(String(apiError), 'error')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!user) return null

  return (
    <div className="withdraw-page">
      <div className="withdraw-card withdraw-form-card">
        <div className="withdraw-head">
          <h1><ArrowLeftRight size={22} /> Вивід коштів</h1>
          <p>Виберіть спосіб отримання коштів і підтвердіть заявку паролем.</p>
          <p className="withdraw-min-note">Мінімальна сума виводу: {MIN_WITHDRAWAL_AMOUNT} ₴</p>
        </div>

        <div className="withdraw-grid">
          <label>
            Сума виводу (₴)
            <input
              type="text"
              inputMode="decimal"
              value={amount || ''}
              onChange={(event) => {
                const value = event.target.value.replace(/[^0-9.]/g, '')
                if (value === '') {
                  setAmount(0)
                  return
                }
                const parsed = Number.isNaN(parseFloat(value)) ? 0 : parseFloat(value)
                setAmount(Math.min(userBalance, Math.max(0, parsed)))
              }}
              placeholder="Введіть суму"
              disabled={isSubmitting}
            />
          </label>

          <label>
            Спосіб виводу
            <select value={method} onChange={(event) => setMethod(event.target.value as WithdrawMethod)} disabled={isSubmitting}>
              <option value="paypal">PayPal</option>
              <option value="card">Карта</option>
              <option value="usdt_trc20">USDT (TRC20)</option>
            </select>
          </label>

          <label className="withdraw-grid-span">
            {destinationLabel}
            <input
              type="text"
              value={destination}
              onChange={(event) => {
                const value = event.target.value
                if (method === 'card') {
                  setDestination(formatCardNumber(value))
                  return
                }
                if (method === 'paypal') {
                  setDestination(value.trim().toLowerCase())
                  return
                }
                setDestination(sanitizeUsdtAddress(value))
              }}
              placeholder={method === 'paypal' ? 'user@example.com' : method === 'card' ? '4111 1111 1111 1111' : 'TNm...'}
              inputMode={method === 'card' ? 'numeric' : 'text'}
              maxLength={method === 'card' ? 19 : undefined}
              disabled={isSubmitting}
            />
          </label>

          <label className="withdraw-grid-span">
            Поточний пароль
            <input
              type="password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              placeholder="Введіть пароль для підтвердження"
              disabled={isSubmitting}
            />
          </label>
        </div>

        <div className="withdraw-summary">
          <div>
            <small>Сума списання</small>
            <strong>-{Number(amount || 0).toFixed(2)} ₴</strong>
          </div>
          <div>
            <small>Баланс після виводу</small>
            <strong>{balanceAfterWithdraw.toFixed(2)} ₴</strong>
          </div>
          <div>
            <small>До зарахування</small>
            <strong className="positive">{netAmount.toFixed(2)} ₴</strong>
          </div>
          <div>
            <small>Поточний баланс</small>
            <strong><Wallet size={16} /> {userBalance.toFixed(2)} ₴</strong>
          </div>
        </div>

        <div className="withdraw-warning">
          <AlertTriangle size={18} />
          <p>
            Сайт утримує {FEE_PERCENT}% комісії. Гроші будуть зараховані на вказані реквізити протягом 7 діб після підтвердження заявки адміністратором.
          </p>
        </div>

        <div className="withdraw-actions">
          <button className="btn-ghost" onClick={() => navigate(-1)} disabled={isSubmitting}>Скасувати</button>
          <button className="btn-primary" onClick={submitWithdraw} disabled={isSubmitting}>
            <ShieldCheck size={18} /> {isSubmitting ? 'Відправка...' : `Вивести ${Number(amount || 0).toFixed(2)} ₴`}
          </button>
        </div>

        <div className="withdraw-method-note">Обраний метод: {METHOD_LABELS[method]}</div>
      </div>

      <div className="withdraw-card withdraw-requests-card">
        <div className="withdraw-requests-head">
          <div>
            <h3>Мої заявки на вивід</h3>
            <p>Тут видно всі ваші заявки, їх статуси, дати і суми.</p>
          </div>
        </div>

        {loadingWithdrawals ? (
          <div className="withdraw-requests-empty">Завантаження заявок...</div>
        ) : withdrawalRequests.length === 0 ? (
          <div className="withdraw-requests-empty">Поки що немає заявок на вивід</div>
        ) : (
          <div className="withdraw-requests-list">
            {withdrawalRequests.map((request) => (
              <article key={request.id} className="withdraw-request-card">
                <div className="withdraw-request-main">
                  <div>
                    <strong>{Number(request.amount_gross || 0).toFixed(2)} ₴</strong>
                    <p>{request.method === 'paypal' ? 'PayPal' : request.method === 'card' ? 'Карта' : 'USDT (TRC20)'}</p>
                  </div>
                  <span className={`withdraw-status ${request.status}`}>
                    {request.status === 'pending'
                      ? 'Очікує'
                      : request.status === 'completed'
                        ? 'Підтверджено'
                        : request.status === 'refunded'
                          ? 'Повернуто'
                          : 'Відхилено'}
                  </span>
                </div>

                <div className="withdraw-request-meta">
                  <span><CalendarClock size={14} /> {new Date(request.created_at).toLocaleString('uk-UA')}</span>
                  <span>До виплати: {Number(request.amount_net || 0).toFixed(2)} ₴</span>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default BalanceWithdrawPage
