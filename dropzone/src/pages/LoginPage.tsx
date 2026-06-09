import React, { useEffect, useState } from 'react'
import { useNavigate, Link, useLocation } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'
import './LoginPage.css'

const LoginPage: React.FC = () => {
  const [isLogin, setIsLogin] = useState(true)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [username, setUsername] = useState('')
  const [localError, setLocalError] = useState<string | null>(null)
  const [emailError, setEmailError] = useState<string | null>(null)
  const MAX_USERNAME = 18
  const [usernameError, setUsernameError] = useState<string | null>(null)
  const [acceptedRules, setAcceptedRules] = useState(false)
  const [rulesError, setRulesError] = useState<string | null>(null)
  const { login, register, error, isLoading, clearError } = useAuthStore()
  const navigate = useNavigate()
  const location = useLocation()

  useEffect(() => {
    const params = new URLSearchParams(location.search)
    const mode = params.get('mode')
    if (mode === 'register') {
      setIsLogin(false)
    } else if (mode === 'login') {
      setIsLogin(true)
    }
  }, [location.search])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    clearError()
    setLocalError(null)
    setRulesError(null)

    try {
      if (!isLogin && username.length > MAX_USERNAME) {
        const msg = `Ім'я користувача має бути не довше ${MAX_USERNAME} символів`
        setLocalError(msg)
        setUsernameError(msg)
        return
      }

      if (!isLogin) {
        const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
        if (!emailPattern.test(email)) {
          const msg = 'Введіть коректну електронну адресу (наприклад name@domain.tld)'
          setLocalError(msg)
          setEmailError(msg)
          return
        }

        if (!acceptedRules) {
          const msg = 'Потрібно прийняти правила сайту'
          setLocalError(msg)
          setRulesError(msg)
          return
        }
      }

      const success = isLogin ? await login({ email, password }) : await register(email, password, username, acceptedRules)
      if (success) {
        navigate('/')
      } else {
        // Force staying on login page when auth fails (protect against external redirects)
        navigate('/login', { replace: true })
        const emailInput = document.querySelector('input[type="email"]') as HTMLInputElement | null
        if (emailInput) emailInput.focus()
      }
    } catch (_err) {
    }
  }

  return (
    <div className="auth-container">
      <div className="auth-box">
        <div className="auth-header">
          <h1>Dropzone</h1>
          <p>{isLogin ? 'Вхід в аккаунт' : 'Реєстрація'}</p>
        </div>

        {(error || localError) && <div className="error-message">{localError || error}</div>}

        <form onSubmit={handleSubmit} className="auth-form">
          {!isLogin && (
            <div className="form-group">
              <label>Ім'я користувача</label>
              <input
                type="text"
                value={username}
                onChange={(e) => {
                  const v = e.target.value
                  setUsername(v)
                  if (v.length > MAX_USERNAME) setUsernameError(`Ім'я користувача має бути не довше ${MAX_USERNAME} символів`)
                  else setUsernameError(null)
                }}
                maxLength={MAX_USERNAME}
                required
                disabled={isLoading}
              />
              {usernameError && <div className="field-error">{usernameError}</div>}
            </div>
          )}

          <div className="form-group">
            <label>Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => { setEmail(e.target.value); setEmailError(null); setLocalError(null); clearError(); }}
              required
              disabled={isLoading}
            />
          </div>

          <div className="form-group">
            <label>Пароль</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              disabled={isLoading}
              minLength={6}
            />
          </div>

          {!isLogin && (
            <div className="rules-consent">
              <label className="rules-checkbox">
                <input
                  type="checkbox"
                  checked={acceptedRules}
                  onChange={(e) => {
                    setAcceptedRules(e.target.checked)
                    if (e.target.checked) setRulesError(null)
                  }}
                  disabled={isLoading}
                />
                <span className="rules-checkmark" aria-hidden="true" />
                <span>
                  Я прочитав та погоджуюсь з <Link to="/rules">правилами сайту</Link>
                </span>
              </label>
              {rulesError && <div className="field-error">{rulesError}</div>}
            </div>
          )}

          <button type="submit" className="auth-submit-btn" disabled={isLoading || (!isLogin && (!!usernameError || !!emailError || !acceptedRules))}>
            {isLoading ? 'Завантаження...' : isLogin ? 'Увійти' : 'Зареєструватися'}
          </button>
        </form>

        <div className="auth-footer">
          <div className="auth-switch-row">
            <span>{isLogin ? 'Немає аккаунту?' : 'Вже маєте аккаунт?'}</span>
            <button
              type="button"
              className="toggle-btn"
              onClick={() => {
                setIsLogin(!isLogin)
                clearError()
              }}
            >
              {isLogin ? 'Зареєструватися' : 'Увійти'}
            </button>
          </div>
        </div>

        
      </div>
    </div>
  )
}

export default LoginPage
