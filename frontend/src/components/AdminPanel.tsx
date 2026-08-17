import { useEffect, useState } from 'react'
import { FaKey, FaSignOutAlt, FaTrash } from 'react-icons/fa'
import logo from '../assets/logo.png'
import {
  approveUser,
  createUser,
  deleteUser,
  fetchUsers,
  renewUser,
  updateUser,
  type CurrentUser,
  type Role,
} from '../api'
import ChangePasswordModal from './ChangePasswordModal'
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
  const [newBillingDays, setNewBillingDays] = useState('365')
  const [newNotes, setNewNotes] = useState('')
  const [newValor, setNewValor] = useState('')
  const [newLicenseCount, setNewLicenseCount] = useState('1')

  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null)
  const [changePasswordOpen, setChangePasswordOpen] = useState(false)

  // savingId: linha com uma alteração em andamento (desabilita os controles dela). justSavedId:
  // pisca um "Salvo!" por 2s depois que a alteração é confirmada pelo servidor — sem isso, editar
  // um campo inline parecia não fazer nada.
  const [savingId, setSavingId] = useState<number | null>(null)
  const [justSavedId, setJustSavedId] = useState<number | null>(null)

  async function loadUsers() {
    try {
      setUsers(await fetchUsers())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao carregar usuários')
    }
  }

  useEffect(() => {
    loadUsers()
    // Poll pra pegar autocadastros novos sem precisar recarregar a página manualmente.
    const timer = window.setInterval(loadUsers, 10_000)
    return () => window.clearInterval(timer)
  }, [])

  function flashSaved(id: number) {
    setJustSavedId(id)
    window.setTimeout(() => setJustSavedId((cur) => (cur === id ? null : cur)), 2000)
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    try {
      const billingDays = newBillingDays.trim() ? Number(newBillingDays) : null
      const valor = newValor.trim() ? Number(newValor) : null
      const licenseCount = Math.max(1, Number(newLicenseCount) || 1)
      await createUser(newEmail, newPassword, newRole, billingDays, newNotes.trim() || null, valor, licenseCount)
      setNewEmail('')
      setNewPassword('')
      setNewRole('user')
      setNewBillingDays('365')
      setNewNotes('')
      setNewValor('')
      setNewLicenseCount('1')
      loadUsers()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao criar usuário')
    }
  }

  async function handleApproveAccount(user: CurrentUser) {
    setError(null)
    setSavingId(user.id)
    try {
      await approveUser(user.id)
      await loadUsers()
      flashSaved(user.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao aprovar conta')
    } finally {
      setSavingId(null)
    }
  }

  async function handleRejectAccount(user: CurrentUser) {
    setError(null)
    try {
      await deleteUser(user.id)
      await loadUsers()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao rejeitar conta')
    }
  }

  async function handleRenew(user: CurrentUser) {
    let period = user.billing_period_days
    if (!period) {
      const input = window.prompt(`Periodicidade em dias pra ${user.email} (ex.: 365):`)
      if (!input) return
      period = Number(input)
      if (!period || period <= 0) {
        setError('Periodicidade inválida.')
        return
      }
    }
    setError(null)
    setSavingId(user.id)
    try {
      await renewUser(user.id, period)
      await loadUsers()
      flashSaved(user.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao renovar assinatura')
    } finally {
      setSavingId(null)
    }
  }

  async function handleNotesBlur(user: CurrentUser, value: string) {
    if (value === (user.notes ?? '')) return
    setError(null)
    setSavingId(user.id)
    try {
      await updateUser(user.id, { notes: value })
      await loadUsers()
      flashSaved(user.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar observação')
    } finally {
      setSavingId(null)
    }
  }

  async function handleValorBlur(user: CurrentUser, value: string) {
    const parsed = value.trim() ? Number(value) : null
    if (parsed === (user.valor ?? null)) return
    setError(null)
    setSavingId(user.id)
    try {
      await updateUser(user.id, { valor: parsed })
      await loadUsers()
      flashSaved(user.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar valor')
    } finally {
      setSavingId(null)
    }
  }

  async function handleLicenseBlur(user: CurrentUser, value: string) {
    const parsed = Math.max(1, Number(value) || 1)
    if (parsed === user.license_count) return
    setError(null)
    setSavingId(user.id)
    try {
      await updateUser(user.id, { license_count: parsed })
      await loadUsers()
      flashSaved(user.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar licenças')
    } finally {
      setSavingId(null)
    }
  }

  async function handleDueDateChange(user: CurrentUser, value: string) {
    setError(null)
    setSavingId(user.id)
    try {
      if (value) {
        await updateUser(user.id, { next_due_date: value })
      } else {
        await updateUser(user.id, { clear_due_date: true })
      }
      await loadUsers()
      flashSaved(user.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao atualizar vencimento')
    } finally {
      setSavingId(null)
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
    loadUsers()
  }

  const pendingAccounts = users.filter((u) => u.pending_approval)

  return (
    <div className="app-shell">
      <header className="app-header">
        <img src={logo} className="app-logo" alt="BinAI" />
        <div className="app-header-text">
          <h1>BinAI — Administração</h1>
          <p>Cadastro de usuários e aprovação de contas</p>
        </div>
        <div className="header-actions">
          <button type="button" className="history-trigger-button" onClick={() => setChangePasswordOpen(true)}>
            <FaKey /> Trocar senha
          </button>
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
            <div className="field">
              <label>Valor (R$)</label>
              <div className="min-confidence-field">
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  placeholder="0"
                  value={newValor}
                  onChange={(e) => setNewValor(e.target.value)}
                />
              </div>
            </div>
            <div className="field">
              <label>Licenças (sessões simultâneas)</label>
              <div className="min-confidence-field">
                <input
                  type="number"
                  min={1}
                  value={newLicenseCount}
                  onChange={(e) => setNewLicenseCount(e.target.value)}
                />
              </div>
            </div>
            <div className="field">
              <label>Observação</label>
              <input
                type="text"
                placeholder="opcional — anotação interna sobre esse usuário"
                value={newNotes}
                onChange={(e) => setNewNotes(e.target.value)}
              />
            </div>
            <button type="submit" className="analyze-button">
              Criar usuário
            </button>
          </form>
        </div>

        <div className="column-center">
          {error && <div className="error-banner">{error}</div>}

          {pendingAccounts.length > 0 && (
            <div className="history-panel pending-ips-panel">
              <div className="history-header">
                <span>Contas pendentes de aprovação ({pendingAccounts.length})</span>
              </div>
              <ul className="model-info-list">
                {pendingAccounts.map((u) => (
                  <li key={u.id}>
                    <span className="model-info-name">
                      {u.email}
                      {u.signup_ip && <span className="pending-ip-address"> — cadastrado de {u.signup_ip}</span>}
                    </span>
                    <div className="admin-user-actions">
                      <button
                        type="button"
                        className="secondary-detail"
                        disabled={savingId === u.id}
                        onClick={() => handleApproveAccount(u)}
                      >
                        Aprovar
                      </button>
                      <button type="button" className="secondary-remove" onClick={() => handleRejectAccount(u)} title="Rejeitar">
                        <FaTrash />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

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
                    <th>Valor</th>
                    <th>Licenças</th>
                    <th>Observação</th>
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
                            {u.pending_approval ? 'Pendente' : u.is_active ? 'Ativo' : 'Desativado'}
                          </span>
                        </td>
                        <td>
                          {u.role === 'user' && (
                            <div className="billing-cell">
                              <span className={`result-tag ${billing.className}`}>{billing.label}</span>
                              <input
                                type="date"
                                className="billing-date-input"
                                value={u.next_due_date ?? ''}
                                disabled={savingId === u.id}
                                onChange={(e) => handleDueDateChange(u, e.target.value)}
                                title="Editar vencimento diretamente"
                              />
                            </div>
                          )}
                        </td>
                        <td>
                          {u.role === 'user' && (
                            <input
                              type="number"
                              min={0}
                              step="0.01"
                              className="notes-input"
                              defaultValue={u.valor ?? ''}
                              key={`valor-${u.id}-${u.valor ?? ''}`}
                              disabled={savingId === u.id}
                              placeholder="0"
                              onBlur={(e) => handleValorBlur(u, e.target.value)}
                            />
                          )}
                        </td>
                        <td>
                          {u.role === 'user' && (
                            <input
                              type="number"
                              min={1}
                              className="license-input"
                              defaultValue={u.license_count}
                              key={`license-${u.id}-${u.license_count}`}
                              disabled={savingId === u.id}
                              onBlur={(e) => handleLicenseBlur(u, e.target.value)}
                            />
                          )}
                        </td>
                        <td>
                          <div className="billing-cell">
                            <input
                              type="text"
                              className="notes-input"
                              defaultValue={u.notes ?? ''}
                              key={u.notes ?? ''}
                              disabled={savingId === u.id}
                              placeholder="—"
                              onBlur={(e) => handleNotesBlur(u, e.target.value)}
                            />
                            {savingId === u.id && <span className="billing-feedback saving">Salvando...</span>}
                            {justSavedId === u.id && <span className="billing-feedback saved">Salvo!</span>}
                          </div>
                        </td>
                        <td className="admin-user-actions">
                          {u.role === 'user' && (
                            <button
                              type="button"
                              className="secondary-detail"
                              disabled={savingId === u.id}
                              onClick={() => handleRenew(u)}
                            >
                              Registrar pagamento
                            </button>
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

      {changePasswordOpen && <ChangePasswordModal onClose={() => setChangePasswordOpen(false)} />}
    </div>
  )
}
