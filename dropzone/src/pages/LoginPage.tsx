import React, { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'
import './LoginPage.css'

const LoginPage: React.FC = () => {
  const [isLogin, setIsLogin] = useState(true)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [username, setUsername] = useState('')
  const [localError, setLocalError] = useState<string | null>(null)
  const MAX_USERNAME = 18
  const [usernameError, setUsernameError] = useState<string | null>(null)
  const { login, register, error, isLoading, clearError } = useAuthStore()
  const navigate = useNavigate()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    clearError()
    setLocalError(null)

    try {
      if (!isLogin && username.length > MAX_USERNAME) {
        const msg = `Ім'я користувача має бути не довше ${MAX_USERNAME} символів`
        setLocalError(msg)
        setUsernameError(msg)
        return
      }

      const success = isLogin ? await login({ email, password }) : await register(email, password, username)
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
              onChange={(e) => setEmail(e.target.value)}
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

          <button type="submit" className="auth-submit-btn" disabled={isLoading || (!isLogin && !!usernameError)}>
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
