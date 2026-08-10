import { useEffect, useState } from 'react'
import LoginPage from './components/LoginPage'
import AdminPanel from './components/AdminPanel'
import TraderApp from './TraderApp'
import { fetchMe, logout, type CurrentUser } from './api'
import './App.css'

function App() {
  const [user, setUser] = useState<CurrentUser | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchMe()
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setLoading(false))
  }, [])

  async function handleLogout() {
    await logout().catch(() => {})
    setUser(null)
  }

  if (loading) {
    return <div className="placeholder">Carregando...</div>
  }

  if (!user) {
    return <LoginPage onLoggedIn={setUser} />
  }

  if (user.role === 'admin') {
    return <AdminPanel onLogout={handleLogout} />
  }

  return <TraderApp user={user} onLogout={handleLogout} />
}

export default App
