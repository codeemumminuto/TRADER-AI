import { useState } from 'react'
import logo from '../assets/logo.png'
import { checkEmailExists, login, register, type CurrentUser } from '../api'
import ConfirmDialog from './ConfirmDialog'

interface Props {
  onLoggedIn: (user: CurrentUser) => void
}

export default function LoginPage({ onLoggedIn }: Props) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [offerRegister, setOfferRegister] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setInfo(null)
    setLoading(true)
    try {
      const user = await login(email, password)
      onLoggedIn(user)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao entrar'
      // Mensagem genérica cobre tanto "senha errada" quanto "e-mail não existe" (de propósito,
      // pra não vazar quais e-mails têm conta) — só aqui, sob demanda, checamos qual dos dois é
      // pra oferecer o autocadastro quando fizer sentido.
      if (message === 'E-mail ou senha inválidos.') {
        const exists = await checkEmailExists(email).catch(() => true)
        if (!exists) {
          setOfferRegister(true)
          setLoading(false)
          return
        }
      }
      setError(message)
    } finally {
      setLoading(false)
    }
  }

  async function handleRegisterConfirm() {
    setOfferRegister(false)
    setLoading(true)
    try {
      await register(email, password)
      setInfo('Cadastro enviado! Aguarde a aprovação do administrador pra poder entrar.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao cadastrar')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-shell">
      <form className="login-card" onSubmit={handleSubmit}>
        <img src={logo} className="login-logo" alt="BinAI" />
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

        {info && <div className="pending-banner">{info}</div>}
        {error && (
          <div className={error.includes('pendente de aprovação') ? 'pending-banner' : 'error-banner'}>{error}</div>
        )}

        <button type="submit" className="analyze-button" disabled={loading}>
          {loading ? 'Entrando...' : 'Entrar'}
        </button>
      </form>

      {offerRegister && (
        <ConfirmDialog
          title="Criar uma conta nova?"
          message={`Não existe cadastro para ${email}. Deseja realizar um novo cadastro com essa senha? Sua conta ficará pendente até o administrador aprovar.`}
          confirmLabel="Cadastrar"
          onConfirm={handleRegisterConfirm}
          onCancel={() => setOfferRegister(false)}
        />
      )}
    </div>
  )
}
