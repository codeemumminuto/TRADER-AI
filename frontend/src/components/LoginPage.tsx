import { useState } from 'react'
import logo from '../assets/logo.png'
import { login, type CurrentUser } from '../api'

interface Props {
  onLoggedIn: (user: CurrentUser) => void
}

export default function LoginPage({ onLoggedIn }: Props) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const user = await login(email, password)
      onLoggedIn(user)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao entrar')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-shell">
      <form className="login-card" onSubmit={handleSubmit}>
        <img src={logo} className="login-logo" alt="BinAI" />
        <h1>BinAI</h1>
        <p className="login-subtitle">Entre com sua conta</p>

        <div className="field">
          <label>E-mail</label>
          <input
            type="email"
            required
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>

        <div className="field">
          <label>Senha</label>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        <p className="login-help">
          Ainda não tem um acesso? Solicite{' '}
          <a href="https://wa.me/554891988246" target="_blank" rel="noreferrer">
            aqui
          </a>{' '}
          pelo WhatsApp.
        </p>

        {error && <div className="error-banner">{error}</div>}

        <button type="submit" className="analyze-button" disabled={loading}>
          {loading ? 'Entrando...' : 'Entrar'}
        </button>
      </form>
    </div>
  )
}
