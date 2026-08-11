import { useEffect, useState } from 'react'
import { FaSignOutAlt, FaTimes, FaTrash } from 'react-icons/fa'
import logo from '../assets/logo.png'
import {
  addAllowedIp,
  createUser,
  deleteUser,
  fetchAllowedIps,
  fetchUsers,
  removeAllowedIp,
  renewUser,
  updateUser,
  type AllowedIp,
  type CurrentUser,
  type Role,
} from '../api'
import ConfirmDialog from './ConfirmDialog'

interface Props {
  onLogout: () => void
}

export default function AdminPanel({ onLogout }: Props) {
  const [users, setUsers] = useState<CurrentUser[]>([])
  const [error, setError] = useState<string | null>(null)

  const [newEmail, setNewEmail] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [newRole, setNewRole] = useState<Role>('user')
  const [newBillingDays, setNewBillingDays] = useState('30')

  const [managingUserId, setManagingUserId] = useState<number | null>(null)
  const [ips, setIps] = useState<AllowedIp[]>([])
  const [newIp, setNewIp] = useState('')

  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null)

  function loadUsers() {
    fetchUsers()
      .then(setUsers)
      .catch((e) => setError(e instanceof Error ? e.message : 'Erro ao carregar usuários'))
  }

  useEffect(loadUsers, [])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    try {
      const billingDays = newBillingDays.trim() ? Number(newBillingDays) : null
      await createUser(newEmail, newPassword, newRole, billingDays)
      setNewEmail('')
      setNewPassword('')
      setNewRole('user')
      setNewBillingDays('30')
      loadUsers()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao criar usuário')
    }
  }

  async function handleRenew(user: CurrentUser) {
    let period = user.billing_period_days
    if (!period) {
      const input = window.prompt(`Periodicidade em dias pra ${user.email} (ex.: 30):`)
      if (!input) return
      period = Number(input)
      if (!period || period <= 0) {
        setError('Periodicidade inválida.')
        return
      }
    }
    try {
      await renewUser(user.id, period)
      loadUsers()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao renovar assinatura')
    }
  }

  function billingStatus(user: CurrentUser): { label: string; className: string } {
    if (!user.next_due_date) return { label: 'Sem cobrança', className: 'result-empate' }
    const due = new Date(`${user.next_due_date}T00:00:00`)
    const dueLabel = due.toLocaleDateString('pt-BR')
    const overdue = due.getTime() < new Date().setHours(0, 0, 0, 0)
    return overdue
      ? { label: `Venceu em ${dueLabel}`, className: 'result-loss' }
      : { label: `Vence em ${dueLabel}`, className: 'result-win' }
  }

  async function handleToggleActive(user: CurrentUser) {
    await updateUser(user.id, { is_active: !user.is_active })
    loadUsers()
  }

  async function handleResetPassword(user: CurrentUser) {
    const newPass = window.prompt(`Nova senha para ${user.email}:`)
    if (!newPass) return
    await updateUser(user.id, { password: newPass })
  }

  async function handleDelete(id: number) {
    setConfirmDeleteId(null)
    await deleteUser(id)
    if (managingUserId === id) setManagingUserId(null)
    loadUsers()
  }

  function openIpManager(userId: number) {
    setManagingUserId(userId)
    fetchAllowedIps(userId).then(setIps).catch(() => setIps([]))
  }

  async function handleAddIp(e: React.FormEvent) {
    e.preventDefault()
    if (managingUserId == null || !newIp.trim()) return
    const ip = await addAllowedIp(managingUserId, newIp.trim())
    setIps((prev) => [...prev, ip])
    setNewIp('')
  }

  async function handleRemoveIp(ipId: number) {
    if (managingUserId == null) return
    await removeAllowedIp(managingUserId, ipId)
    setIps((prev) => prev.filter((i) => i.id !== ipId))
  }

  const managingUser = users.find((u) => u.id === managingUserId) ?? null

  return (
    <div className="app-shell">
      <header className="app-header">
        <img src={logo} className="app-logo" alt="BinAI" />
        <div className="app-header-text">
          <h1>BinAI — Administração</h1>
          <p>Cadastro de usuários e liberação de IPs</p>
        </div>
        <div className="header-actions">
          <button type="button" className="history-trigger-button" onClick={onLogout}>
            <FaSignOutAlt /> Sair
          </button>
        </div>
      </header>

      <main className="app-main admin-main">
        <div className="column-left">
          <form className="analyzer-form" onSubmit={handleCreate}>
            <div className="field">
              <label>Novo usuário — e-mail</label>
              <input type="email" required value={newEmail} onChange={(e) => setNewEmail(e.target.value)} />
            </div>
            <div className="field">
              <label>Senha inicial</label>
              <input type="text" required value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
            </div>
            <div className="field">
              <label>Papel</label>
              <div className="risk-toggle">
                <button type="button" className={newRole === 'user' ? 'active' : ''} onClick={() => setNewRole('user')}>
                  Usuário
                </button>
                <button type="button" className={newRole === 'admin' ? 'active' : ''} onClick={() => setNewRole('admin')}>
                  Admin
                </button>
              </div>
            </div>
            <div className="field">
              <label>Periodicidade de cobrança (dias)</label>
              <div className="min-confidence-field">
                <input
                  type="number"
                  min={0}
                  placeholder="em branco = sem cobrança"
                  value={newBillingDays}
                  onChange={(e) => setNewBillingDays(e.target.value)}
                />
              </div>
            </div>
            <button type="submit" className="analyze-button">
              Criar usuário
            </button>
          </form>
        </div>

        <div className="column-center">
          {error && <div className="error-banner">{error}</div>}

          <div className="history-panel">
            <div className="history-header">
              <span>Usuários ({users.length})</span>
            </div>
            <div className="history-table-wrap">
              <table className="history-table">
                <thead>
                  <tr>
                    <th>E-mail</th>
                    <th>Papel</th>
                    <th>Status</th>
                    <th>Cobrança</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => {
                    const billing = billingStatus(u)
                    return (
                      <tr key={u.id}>
                        <td>{u.email}</td>
                        <td>{u.role === 'admin' ? 'Admin' : 'Usuário'}</td>
                        <td>
                          <span className={`result-tag ${u.is_active ? 'result-win' : 'result-loss'}`}>
                            {u.is_active ? 'Ativo' : 'Desativado'}
                          </span>
                        </td>
                        <td>
                          {u.role === 'user' && <span className={`result-tag ${billing.className}`}>{billing.label}</span>}
                        </td>
                        <td className="admin-user-actions">
                          {u.role === 'user' && (
                            <>
                              <button type="button" className="secondary-detail" onClick={() => openIpManager(u.id)}>
                                IPs
                              </button>
                              <button type="button" className="secondary-detail" onClick={() => handleRenew(u)}>
                                Registrar pagamento
                              </button>
                            </>
                          )}
                          <button type="button" className="secondary-detail" onClick={() => handleToggleActive(u)}>
                            {u.is_active ? 'Desativar' : 'Ativar'}
                          </button>
                          <button type="button" className="secondary-detail" onClick={() => handleResetPassword(u)}>
                            Trocar senha
                          </button>
                          <button type="button" className="secondary-remove" onClick={() => setConfirmDeleteId(u.id)} title="Excluir">
                            <FaTrash />
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {managingUser && (
            <div className="history-panel">
              <div className="history-header">
                <span>IPs liberados — {managingUser.email}</span>
                <button type="button" className="secondary-remove" onClick={() => setManagingUserId(null)} title="Fechar">
                  <FaTimes />
                </button>
              </div>

              {ips.length === 0 ? (
                <div className="history-empty">
                  Nenhum IP liberado ainda — esse usuário não consegue logar até você adicionar pelo menos um.
                </div>
              ) : (
                <ul className="model-info-list">
                  {ips.map((ip) => (
                    <li key={ip.id}>
                      <span className="model-info-name">{ip.ip_or_cidr}</span>
                      <button type="button" className="secondary-remove" onClick={() => handleRemoveIp(ip.id)} title="Remover">
                        <FaTrash />
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              <form className="ip-add-form" onSubmit={handleAddIp}>
                <input
                  type="text"
                  placeholder="Ex.: 200.150.10.5 ou 200.150.10.0/24"
                  value={newIp}
                  onChange={(e) => setNewIp(e.target.value)}
                />
                <button type="submit" className="ip-add-button">
                  Adicionar
                </button>
              </form>
            </div>
          )}
        </div>
      </main>

      {confirmDeleteId != null && (
        <ConfirmDialog
          title="Excluir usuário"
          message="Excluir esse usuário e todo o histórico dele? Isso não pode ser desfeito."
          confirmLabel="Excluir"
          danger
          onConfirm={() => handleDelete(confirmDeleteId)}
          onCancel={() => setConfirmDeleteId(null)}
        />
      )}
    </div>
  )
}
