'use client'

import { FormEvent, useRef, useState } from 'react'

type Message = { role: 'user' | 'ai'; text: string }

export default function AssistantPage() {
  const [messages, setMessages] = useState<Message[]>([
    { role: 'ai', text: 'Bonjour. Demande-moi une idée, une association, une technique ou une recette.' },
  ])
  const [value, setValue] = useState('')
  const [loading, setLoading] = useState(false)
  const sending = useRef(false)
  const [failedQuestion, setFailedQuestion] = useState('')

  async function send(e: FormEvent) {
    e.preventDefault()
    const question = value.trim()
    if (!question || sending.current) return
    sending.current = true
    setFailedQuestion('')
    setMessages((m) => [...m, { role: 'user', text: question }])
    setValue('')
    setLoading(true)
    try {
      const res = await fetch('/api/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question }),
        signal: AbortSignal.timeout(55000),
      })
      if (res.redirected && new URL(res.url).pathname === '/login') throw new Error('Ta session a expiré. Reconnecte-toi puis renvoie ta question.')
      const data = await res.json().catch(() => null)
      if (!res.ok || !data || typeof data.answer !== 'string' || !data.answer.trim()) {
        throw new Error(data?.error || (res.status === 504 ? 'Le serveur met trop de temps à répondre. Réessaie dans un instant.' : 'Le serveur est temporairement indisponible. Réessaie dans un instant.'))
      }
      setMessages((m) => [...m, { role: 'ai', text: [data.warning, data.answer].filter(Boolean).join('\n\n') }])
    } catch (error: any) {
      const text = error?.name === 'TimeoutError' || error?.name === 'AbortError'
        ? 'L’IA met trop de temps à répondre. Tu peux renvoyer ta question.'
        : error instanceof TypeError ? 'Connexion interrompue. Vérifie ta connexion puis réessaie.'
          : error.message || 'L’assistant est temporairement indisponible.'
      setMessages((m) => [...m, { role: 'ai', text }])
      setFailedQuestion(question)
    } finally {
      sending.current = false
      setLoading(false)
    }
  }

  return (
    <section>
      <header className="pageHead">
        <div className="eyebrow">Assistant cuisine</div>
        <h1>Une idée, une association, une recette.</h1>
        <p className="muted">L’assistant répond brièvement, sauf lorsqu’une recette détaillée est utile.</p>
      </header>

      <div className="chat" role="log" aria-live="polite" aria-busy={loading}>
        {messages.map((message, index) => (
          <div key={index} className={`bubble ${message.role === 'user' ? 'user' : 'ai'}`}>
            {message.text}
          </div>
        ))}
      </div>

      <form className="card" onSubmit={send}>
        <textarea
          className="textarea"
          aria-label="Ta question à l’assistant"
          maxLength={4000}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Ex. Avec quoi associer la feuille de figuier dans un dessert ?"
        />
        <div className="row" style={{ marginTop: 12, justifyContent: 'flex-end' }}>
          {failedQuestion && <button type="button" className="button" disabled={loading} onClick={() => { setValue(failedQuestion); setFailedQuestion('') }}>Reprendre ma question</button>}
          <button className="button" disabled={loading}>{loading ? 'Je cherche…' : 'Envoyer'}</button>
        </div>
      </form>
    </section>
  )
}
