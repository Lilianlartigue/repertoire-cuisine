'use client'

import { FormEvent, useState } from 'react'

export default function LoginPage() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setLoading(true)
    setError('')

    try {
      const params = new URLSearchParams(window.location.search)
      const next = params.get('next') || '/'

      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, next }),
      })
      const data = await response.json()

      if (!response.ok) throw new Error(data.error || 'Connexion impossible.')
      window.location.href = data.next || '/'
    } catch (err: any) {
      setError(err.message || 'Connexion impossible.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <section style={{ maxWidth: 520, margin: '60px auto' }}>
      <div className="card">
        <div className="eyebrow">Accès privé</div>
        <h1 style={{ fontSize: 36 }}>Répertoire Cuisine</h1>
        <p className="muted">Connecte-toi une fois sur cet appareil. La session restera enregistrée pendant 30 jours.</p>

        <form className="grid" onSubmit={submit}>
          <label>
            Identifiant
            <input
              className="input"
              autoComplete="username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              required
            />
          </label>

          <label>
            Mot de passe
            <input
              className="input"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </label>

          {error ? <div className="status">{error}</div> : null}

          <button className="button" type="submit" disabled={loading}>
            {loading ? 'Connexion…' : 'Se connecter'}
          </button>
        </form>
      </div>
    </section>
  )
}
