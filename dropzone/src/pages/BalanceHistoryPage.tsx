import React, { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, ArrowDownCircle, ArrowUpCircle, BarChart3, Calendar, Wallet } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'
import { balanceService, type BalanceChartPoint, type BalanceTransaction } from '../services/api'
import './BalanceHistoryPage.css'

const PAGE_SIZE = 50

const TYPE_LABELS: Record<BalanceTransaction['type'], string> = {
  topup: 'Поповнення',
  purchase_hold: 'Списання за товар',
  order_payout: 'Виплата за замовлення',
  dispute_refund: 'Повернення по спору',
  dispute_seller_payout: 'Виплата продавцю по спору',
  withdrawal_request: 'Заявка на вивід',
  admin_adjustment: 'Ручна корекція',
}

const WEEKDAY_LABELS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Нд']
const MONTH_LABELS = [
  'Січень',
  'Лютий',
  'Березень',
  'Квітень',
  'Травень',
  'Червень',
  'Липень',
  'Серпень',
  'Вересень',
  'Жовтень',
  'Листопад',
  'Грудень',
]

const TODAY = new Date()
TODAY.setHours(0, 0, 0, 0)
const CURRENT_YEAR = TODAY.getFullYear()
const CURRENT_MONTH = TODAY.getMonth()

const pad2 = (value: number) => String(value).padStart(2, '0')

const toDateValue = (date: Date) => `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`

const parseDateValue = (value: string) => {
  if (!value) return null
  const [year, month, day] = value.split('-').map(Number)
  if (!year || !month || !day) return null
  return new Date(year, month - 1, day)
}

const startOfMonth = (date: Date) => new Date(date.getFullYear(), date.getMonth(), 1)

const addMonths = (date: Date, delta: number) => new Date(date.getFullYear(), date.getMonth() + delta, 1)

const addYears = (date: Date, delta: number) => new Date(date.getFullYear() + delta, 0, 1)

const isSameDay = (left: Date, right: Date) =>
  left.getFullYear() === right.getFullYear() &&
  left.getMonth() === right.getMonth() &&
  left.getDate() === right.getDate()

const formatMonthLabel = (date: Date) =>
  date.toLocaleDateString('uk-UA', { month: 'long', year: 'numeric' })

const buildMonthDays = (month: Date) => {
  const firstDay = startOfMonth(month)
  const startOffset = (firstDay.getDay() + 6) % 7
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate()
  const cells: Array<Date | null> = []

  for (let index = 0; index < startOffset; index += 1) cells.push(null)
  for (let day = 1; day <= daysInMonth; day += 1) cells.push(new Date(month.getFullYear(), month.getMonth(), day))
  while (cells.length % 7 !== 0) cells.push(null)

  return cells
}

const buildYearRange = (anchorYear: number) => {
  const startYear = Math.floor(anchorYear / 12) * 12
  return Array.from({ length: 12 }, (_, index) => startYear + index)
}

const formatChartDate = (value: string) => {
  const date = new Date(`${value}T00:00:00Z`)
  return date.toLocaleDateString('uk-UA', { day: '2-digit', month: 'short' })
}

const formatChartFullDate = (value: string) => {
  const date = new Date(`${value}T00:00:00Z`)
  return date.toLocaleDateString('uk-UA', { day: '2-digit', month: 'long', year: 'numeric' })
}

type DatePickerFieldProps = {
  label: string
  value: string
  onChange: (value: string) => void
  active: boolean
  onOpen: () => void
  onClose: () => void
  limitToToday?: boolean
  month: Date
  yearAnchor: number
  view: 'day' | 'month' | 'year'
  setMonth: (date: Date) => void
  setYearAnchor: (year: number) => void
  setView: (view: 'day' | 'month' | 'year') => void
}

const DatePickerField: React.FC<DatePickerFieldProps> = ({
  label,
  value,
  onChange,
  active,
  onOpen,
  onClose,
  limitToToday = false,
  month,
  yearAnchor,
  view,
  setMonth,
  setYearAnchor,
  setView,
}) => {
  const selectedDate = parseDateValue(value)
  const fieldRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!active) return

    const handlePointerDown = (event: MouseEvent) => {
      if (fieldRef.current && !fieldRef.current.contains(event.target as Node)) onClose()
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }

    window.addEventListener('mousedown', handlePointerDown)
    window.addEventListener('keydown', handleKeyDown)

    return () => {
      window.removeEventListener('mousedown', handlePointerDown)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [active, onClose])

  const calendarDays = useMemo(() => buildMonthDays(month), [month])
  const yearRange = useMemo(() => buildYearRange(yearAnchor), [yearAnchor])
  const isFutureMonth = (candidateYear: number, candidateMonth: number) =>
    limitToToday && (candidateYear > CURRENT_YEAR || (candidateYear === CURRENT_YEAR && candidateMonth > CURRENT_MONTH))
  const isFutureYear = (candidateYear: number) => limitToToday && candidateYear > CURRENT_YEAR
  const isFutureDay = (candidateDate: Date) => limitToToday && candidateDate.getTime() > TODAY.getTime()

  const handleClear = () => {
    onChange('')
    setView('day')
    setMonth(startOfMonth(new Date()))
    setYearAnchor(new Date().getFullYear())
  }

  const handleHeaderClick = () => {
    if (view === 'year') return
    setView('year')
    setYearAnchor(month.getFullYear())
  }

  return (
    <div className={`balance-date-picker ${active ? 'open' : ''}`} ref={fieldRef}>
      <button type="button" className="balance-date-picker-trigger" onClick={active ? onClose : onOpen}>
        <Calendar size={16} />
        <span className="balance-date-picker-text">
          <small>{label}</small>
          <strong>{selectedDate ? selectedDate.toLocaleDateString('uk-UA') : 'Оберіть дату'}</strong>
        </span>
      </button>

      {active && (
        <div className="balance-date-picker-panel">
          <div className="balance-date-picker-head">
            {view === 'day' && (
              <>
                <button type="button" className="balance-date-nav" onClick={() => setMonth((current) => addMonths(current, -1))}>
                  ‹
                </button>
                <button type="button" className="balance-date-picker-title" onClick={handleHeaderClick}>
                  {formatMonthLabel(month)}
                </button>
                <button type="button" className="balance-date-nav" onClick={() => setMonth((current) => addMonths(current, 1))}>
                  ›
                </button>
              </>
            )}

            {view === 'month' && (
              <>
                <button type="button" className="balance-date-nav" onClick={() => setMonth((current) => addYears(current, -1))}>
                  ‹
                </button>
                <button type="button" className="balance-date-picker-title" onClick={() => setView('year')}>
                  {month.getFullYear()}
                </button>
                <button type="button" className="balance-date-nav" onClick={() => setMonth((current) => addYears(current, 1))}>
                  ›
                </button>
              </>
            )}

            {view === 'year' && (
              <>
                <button type="button" className="balance-date-nav" onClick={() => setYearAnchor((current) => current - 12)}>
                  ‹
                </button>
                <strong>{yearRange[0]} - {yearRange[yearRange.length - 1]}</strong>
                <button type="button" className="balance-date-nav" onClick={() => setYearAnchor((current) => current + 12)}>
                  ›
                </button>
              </>
            )}
          </div>

          {view === 'day' && (
            <>
              <div className="balance-date-weekdays">
                {WEEKDAY_LABELS.map((weekday) => (
                  <span key={weekday}>{weekday}</span>
                ))}
              </div>

              <div className="balance-date-grid">
                {calendarDays.map((day, index) =>
                  day ? (
                    <button
                      key={`${day.toISOString()}-${index}`}
                      type="button"
                      className={`balance-date-cell ${selectedDate && isSameDay(day, selectedDate) ? 'selected' : ''}`}
                      onClick={() => {
                        if (isFutureDay(day)) return
                        onChange(toDateValue(day))
                        onClose()
                      }}
                      disabled={isFutureDay(day)}
                    >
                      {day.getDate()}
                    </button>
                  ) : (
                    <span key={`empty-${index}`} className="balance-date-cell empty" />
                  )
                )}
              </div>
            </>
          )}

          {view === 'month' && (
            <div className="balance-month-grid">
              {MONTH_LABELS.map((monthLabel, index) => {
                const disabled = isFutureMonth(month.getFullYear(), index)
                return (
                  <button
                    key={monthLabel}
                    type="button"
                    className={`balance-month-cell ${month.getMonth() === index ? 'selected' : ''}`}
                    onClick={() => {
                      if (disabled) return
                      setMonth(new Date(month.getFullYear(), index, 1))
                      setView('day')
                    }}
                    disabled={disabled}
                  >
                    {monthLabel}
                  </button>
                )
              })}
            </div>
          )}

          {view === 'year' && (
            <div className="balance-year-grid">
              {yearRange.map((year) => {
                const disabled = isFutureYear(year)
                return (
                  <button
                    key={year}
                    type="button"
                    className={`balance-year-cell ${year === month.getFullYear() ? 'selected' : ''}`}
                    onClick={() => {
                      if (disabled) return
                      setYearAnchor(year)
                      setMonth(new Date(year, month.getMonth(), 1))
                      setView('month')
                    }}
                    disabled={disabled}
                  >
                    {year}
                  </button>
                )
              })}
            </div>
          )}

          <div className="balance-date-actions">
            <button
              type="button"
              className="balance-date-clear"
              onClick={handleClear}
            >
              Очистити
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

const BalanceHistoryPage: React.FC = () => {
  const navigate = useNavigate()
  const { user, isAuthenticated, isInitialized } = useAuthStore()
  const [items, setItems] = useState<BalanceTransaction[]>([])
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [activePicker, setActivePicker] = useState<'from' | 'to' | null>(null)
  const [fromPickerMonth, setFromPickerMonth] = useState(() => startOfMonth(new Date()))
  const [fromPickerYearAnchor, setFromPickerYearAnchor] = useState(() => new Date().getFullYear())
  const [fromPickerView, setFromPickerView] = useState<'day' | 'month' | 'year'>('day')
  const [toPickerMonth, setToPickerMonth] = useState(() => startOfMonth(new Date()))
  const [toPickerYearAnchor, setToPickerYearAnchor] = useState(() => new Date().getFullYear())
  const [toPickerView, setToPickerView] = useState<'day' | 'month' | 'year'>('day')
  const [showChart, setShowChart] = useState(false)
  const [chartLoading, setChartLoading] = useState(false)
  const [chartError, setChartError] = useState('')
  const [chartPoints, setChartPoints] = useState<BalanceChartPoint[]>([])
  const [summary, setSummary] = useState<{ totalIn: number; totalOut: number; net: number; currentBalance: number }>({
    totalIn: 0,
    totalOut: 0,
    net: 0,
    currentBalance: 0,
  })

  useEffect(() => {
    if (!isInitialized) return
    if (!isAuthenticated || !user) {
      navigate('/login')
      return
    }

    const load = async () => {
      setLoading(true)
      setChartLoading(true)
      setChartError('')
      try {
        const defaultChartFrom = !fromDate && !toDate ? (() => {
          const date = new Date()
          date.setDate(date.getDate() - 29)
          return toDateValue(date)
        })() : undefined

        const [transactionsRes, chartRes] = await Promise.all([
          balanceService.getTransactions({ page: 1, pageSize: PAGE_SIZE, from: fromDate || undefined, to: toDate || undefined }),
          balanceService.getChart({ from: fromDate || defaultChartFrom, to: toDate || undefined }),
        ])

        const payload = transactionsRes.data?.data
        setItems(payload?.items || [])
        setTotal(Number(payload?.total || 0))
        setPage(1)
        setSummary(payload?.summary || { totalIn: 0, totalOut: 0, net: 0, currentBalance: Number(user.balance || 0) })
        setChartPoints(chartRes.data?.data?.items || [])
      } catch (err) {
        setItems([])
        setTotal(0)
        setChartPoints([])
        setChartError('Не вдалося завантажити графік')
      } finally {
        setLoading(false)
        setChartLoading(false)
      }
    }

    void load()
  }, [fromDate, isAuthenticated, isInitialized, navigate, toDate, user?.id])

  useEffect(() => {
    if (!showChart) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setShowChart(false)
    }

    window.addEventListener('keydown', handleKeyDown)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [showChart])

  const handleLoadMore = async () => {
    if (loadingMore) return
    const nextPage = page + 1
    setLoadingMore(true)
    try {
      const res = await balanceService.getTransactions({ page: nextPage, pageSize: PAGE_SIZE, from: fromDate || undefined, to: toDate || undefined })
      const payload = res.data?.data
      const nextItems = payload?.items || []
      setItems((current) => [...current, ...nextItems])
      setPage(nextPage)
      setTotal(Number(payload?.total || total))
      if (payload?.summary) setSummary(payload.summary)
    } finally {
      setLoadingMore(false)
    }
  }

  const hasMore = items.length < total

  const chartData = useMemo(() => {
    const points = chartPoints.length ? chartPoints : []
    const width = 860
    const height = 280
    const padding = { top: 18, right: 24, bottom: 44, left: 56 }
    const innerWidth = width - padding.left - padding.right
    const innerHeight = height - padding.top - padding.bottom

    const allValues = points.flatMap((point) => [point.totalIn, point.totalOut])
    const maxValue = Math.max(...allValues, 1)
    const stepY = maxValue / 4
    const yTicks = Array.from({ length: 5 }, (_, index) => Number((stepY * index).toFixed(2)))
    const totalIn = points.reduce((sum, point) => sum + point.totalIn, 0)
    const totalOut = points.reduce((sum, point) => sum + point.totalOut, 0)

    const lineFromPoints = (selector: (point: BalanceChartPoint) => number) =>
      points
        .map((point, index) => {
          const x = points.length > 1 ? padding.left + (index / (points.length - 1)) * innerWidth : padding.left + innerWidth / 2
          const y = padding.top + innerHeight - (selector(point) / maxValue) * innerHeight
          return `${x.toFixed(2)},${y.toFixed(2)}`
        })
        .join(' ')

    const pointCircles = (selector: (point: BalanceChartPoint) => number, color: string) =>
      points.map((point, index) => {
        const x = points.length > 1 ? padding.left + (index / (points.length - 1)) * innerWidth : padding.left + innerWidth / 2
        const y = padding.top + innerHeight - (selector(point) / maxValue) * innerHeight
        return <circle key={`${color}-${point.date}-${index}`} cx={x} cy={y} r="3.8" className={`chart-point ${color}`} />
      })

    return {
      width,
      height,
      padding,
      innerWidth,
      innerHeight,
      points,
      maxValue,
      yTicks,
      totalIn,
      totalOut,
      incomeLine: lineFromPoints((point) => point.totalIn),
      expenseLine: lineFromPoints((point) => point.totalOut),
      pointCircles,
    }
  }, [chartPoints])

  const handleApplyRange = () => {
    setPage(1)
    setItems([])
  }

  const handleClearRange = () => {
    setFromDate('')
    setToDate('')
    setPage(1)
    setItems([])
    setFromPickerMonth(startOfMonth(new Date()))
    setFromPickerYearAnchor(new Date().getFullYear())
    setFromPickerView('day')
    setToPickerMonth(startOfMonth(new Date()))
    setToPickerYearAnchor(new Date().getFullYear())
    setToPickerView('day')
  }

  if (!isAuthenticated || !user) return null

  return (
    <div className="balance-history-page">
      <div className="balance-history-shell">
        <div className="balance-history-head">
          <button className="back-btn" onClick={() => navigate(-1)}>
            <ArrowLeft size={18} /> Назад
          </button>
          <h1><Wallet size={24} /> Історія балансу</h1>
        </div>

        <div className="balance-filter-bar">
          <DatePickerField
            label="З дати"
            value={fromDate}
            onChange={(value) => setFromDate(value)}
            active={activePicker === 'from'}
            onOpen={() => setActivePicker('from')}
            onClose={() => setActivePicker((current) => (current === 'from' ? null : current))}
            limitToToday
            month={fromPickerMonth}
            yearAnchor={fromPickerYearAnchor}
            view={fromPickerView}
            setMonth={setFromPickerMonth}
            setYearAnchor={setFromPickerYearAnchor}
            setView={setFromPickerView}
          />
          <DatePickerField
            label="По дату"
            value={toDate}
            onChange={(value) => setToDate(value)}
            active={activePicker === 'to'}
            onOpen={() => setActivePicker('to')}
            onClose={() => setActivePicker((current) => (current === 'to' ? null : current))}
            limitToToday
            month={toPickerMonth}
            yearAnchor={toPickerYearAnchor}
            view={toPickerView}
            setMonth={setToPickerMonth}
            setYearAnchor={setToPickerYearAnchor}
            setView={setToPickerView}
          />
          <button type="button" className={`balance-chart-toggle ${showChart ? 'active' : ''}`} onClick={() => setShowChart((current) => !current)}>
            <BarChart3 size={18} />
            {showChart ? 'Сховати графік' : 'Переглянути графік'}
          </button>
        </div>

        {showChart && (
          <div className="balance-chart-modal" onClick={() => setShowChart(false)} role="presentation">
            <div className="balance-chart-modal-panel" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-label="Графік надходжень і витрат">
              <div className="balance-chart-modal-head">
                <div>
                  <small>Візуальний баланс</small>
                  <h2>Надходження та витрати по датах</h2>
                </div>
                <div className="balance-chart-modal-actions">
                  <span>{fromDate || toDate ? 'За вибраний період' : 'За останні 30 днів'}</span>
                  <button type="button" className="balance-chart-close" onClick={() => setShowChart(false)} aria-label="Закрити графік">
                    ×
                  </button>
                </div>
              </div>

              {chartLoading ? (
                <div className="balance-chart-empty">Завантаження графіка...</div>
              ) : chartError ? (
                <div className="balance-chart-empty">{chartError}</div>
              ) : chartData.points.length === 0 ? (
                <div className="balance-chart-empty">Немає даних для графіка</div>
              ) : (
                <>
                  <div className="balance-chart-legend">
                    <div><span className="chart-dot income" /> Прибуток</div>
                    <div><span className="chart-dot expense" /> Витрати</div>
                  </div>

                  <div className="balance-chart-wrap">
                    <svg viewBox={`0 0 ${chartData.width} ${chartData.height}`} className="balance-chart-svg" role="img" aria-label="Графік надходжень і витрат по датах">
                      {chartData.yTicks.map((tick) => {
                        const y = chartData.padding.top + chartData.innerHeight - (tick / chartData.maxValue) * chartData.innerHeight
                        return (
                          <g key={`grid-${tick}`}>
                            <line x1={chartData.padding.left} y1={y} x2={chartData.width - chartData.padding.right} y2={y} className="chart-grid-line" />
                            <text x={chartData.padding.left - 10} y={y + 4} textAnchor="end" className="chart-axis-label">{tick.toFixed(0)}</text>
                          </g>
                        )
                      })}

                      <line x1={chartData.padding.left} y1={chartData.padding.top} x2={chartData.padding.left} y2={chartData.height - chartData.padding.bottom} className="chart-axis" />
                      <line x1={chartData.padding.left} y1={chartData.height - chartData.padding.bottom} x2={chartData.width - chartData.padding.right} y2={chartData.height - chartData.padding.bottom} className="chart-axis" />

                      <polyline points={chartData.incomeLine} className="chart-line income" />
                      <polyline points={chartData.expenseLine} className="chart-line expense" />

                      {chartData.pointCircles((point) => point.totalIn, 'income')}
                      {chartData.pointCircles((point) => point.totalOut, 'expense')}

                      {chartData.points.map((point, index) => {
                        const x = chartData.points.length > 1 ? chartData.padding.left + (index / (chartData.points.length - 1)) * chartData.innerWidth : chartData.padding.left + chartData.innerWidth / 2
                        const label = index % 2 === 0 || index === chartData.points.length - 1
                        return label ? (
                          <text key={`x-${point.date}`} x={x} y={chartData.height - 18} textAnchor="middle" className="chart-axis-label x-label">
                            {formatChartDate(point.date)}
                          </text>
                        ) : null
                      })}

                      {chartData.points.map((point, index) => {
                        const x = chartData.points.length > 1 ? chartData.padding.left + (index / (chartData.points.length - 1)) * chartData.innerWidth : chartData.padding.left + chartData.innerWidth / 2
                        const yIncome = chartData.padding.top + chartData.innerHeight - (point.totalIn / chartData.maxValue) * chartData.innerHeight
                        const yExpense = chartData.padding.top + chartData.innerHeight - (point.totalOut / chartData.maxValue) * chartData.innerHeight
                        return (
                          <g key={`labels-${point.date}`}>
                            {point.totalIn > 0 ? (
                              <text x={x} y={yIncome - 10} textAnchor="middle" className="chart-point-label income">{point.totalIn.toFixed(0)}</text>
                            ) : null}
                            {point.totalOut > 0 ? (
                              <text x={x} y={yExpense + 22} textAnchor="middle" className="chart-point-label expense">{point.totalOut.toFixed(0)}</text>
                            ) : null}
                          </g>
                        )
                      })}
                    </svg>
                  </div>

                  <div className="balance-chart-footer">
                    <div>
                      <small>Період</small>
                      <strong>{chartData.points[0] ? formatChartFullDate(chartData.points[0].date) : '—'} → {chartData.points[chartData.points.length - 1] ? formatChartFullDate(chartData.points[chartData.points.length - 1].date) : '—'}</strong>
                    </div>
                    <div>
                      <small>Сума по графіку</small>
                      <strong className="plus">+{chartData.totalIn.toFixed(2)} ₴</strong>
                    </div>
                    <div>
                      <small>Сума витрат</small>
                      <strong className="minus">-{chartData.totalOut.toFixed(2)} ₴</strong>
                    </div>
                    <div>
                      <small>Чистий результат</small>
                      <strong className={summary.net >= 0 ? 'plus' : 'minus'}>{summary.net >= 0 ? '+' : ''}{Number(summary.net || 0).toFixed(2)} ₴</strong>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        <div className="balance-summary-grid">
          <div className="balance-summary-card">
            <small>Поточний баланс</small>
            <strong>{Number(summary.currentBalance || user.balance || 0).toFixed(2)} ₴</strong>
          </div>
          <div className="balance-summary-card positive">
            <small>Всього нараховано</small>
            <strong>+{Number(summary.totalIn || 0).toFixed(2)} ₴</strong>
          </div>
          <div className="balance-summary-card negative">
            <small>Всього списано</small>
            <strong>-{Number(summary.totalOut || 0).toFixed(2)} ₴</strong>
          </div>
          <div className="balance-summary-card">
            <small>Чистий результат</small>
            <strong>{Number(summary.net || 0) >= 0 ? '+' : ''}{Number(summary.net || 0).toFixed(2)} ₴</strong>
          </div>
        </div>

        {loading ? (
          <div className="balance-empty">Завантаження історії...</div>
        ) : items.length === 0 ? (
          <div className="balance-empty">Транзакцій поки немає</div>
        ) : (
          <>
            <div className="balance-transactions-list">
              {items.map((tx) => {
                const isIncome = Number(tx.amount || 0) > 0
                return (
                  <div key={tx.id} className={`balance-transaction-card ${isIncome ? 'income' : 'expense'}`}>
                    <div className="balance-transaction-left">
                      <div className="balance-transaction-icon">
                        {isIncome ? <ArrowDownCircle size={18} /> : <ArrowUpCircle size={18} />}
                      </div>
                      <div>
                        <strong>{TYPE_LABELS[tx.type] || tx.type}</strong>
                        <p>{tx.reason || 'Операція з балансом'}</p>
                        <small>{new Date(tx.created_at).toLocaleString('uk-UA')}</small>
                      </div>
                    </div>

                    <div className="balance-transaction-right">
                      <div className={`balance-amount ${isIncome ? 'plus' : 'minus'}`}>
                        {isIncome ? '+' : ''}{Number(tx.amount || 0).toFixed(2)} ₴
                      </div>
                      <small>{Number(tx.balance_before || 0).toFixed(2)} → {Number(tx.balance_after || 0).toFixed(2)} ₴</small>
                    </div>
                  </div>
                )
              })}
            </div>

            {hasMore && (
              <div className="balance-load-more-wrap">
                <button className="btn-load-more-balance" onClick={handleLoadMore} disabled={loadingMore}>
                  {loadingMore ? 'Завантаження...' : 'Показати ще 50'}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

export default BalanceHistoryPage
