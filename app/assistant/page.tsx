'use client'

import { FormEvent, useState } from 'react'

type Message = { role: 'user' | 'ai'; text: string }

export default function AssistantPage() {
  const [messages, setMessages] = useState<Message[]>([
    { role: 'ai', text: 'Bonjour. Demande-moi une idée, une association, une technique ou une recette.' },
  ])
  const [value, setValue] = useState('')
  const [loading, setLoading] = useState(false)

  async function send(e: FormEvent) {
    e.preventDefault()
    const question = value.trim()
    if (!question || loading) return
    setMessages((m) => [...m, { role: 'user', text: question }])
    setValue('')
    setLoading(true)
    try {
      const res = await fetch('/api/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erreur inconnue')
      setMessages((m) => [...m, { role: 'ai', text: data.answer }])
    } catch (error: any) {
      setMessages((m) => [...m, { role: 'ai', text: `Erreur : ${error.message}` }])
    } finally {
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

      <div className="chat">
        {messages.map((message, index) => (
          <div key={index} className={`bubble ${message.role === 'user' ? 'user' : 'ai'}`}>
            {message.text}
          </div>
        ))}
      </div>

      <form className="card" onSubmit={send}>
        <textarea
          className="textarea"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Ex. Avec quoi associer la feuille de figuier dans un dessert ?"
        />
        <div className="row" style={{ marginTop: 12, justifyContent: 'flex-end' }}>
          <button className="button" disabled={loading}>{loading ? 'Je cherche…' : 'Envoyer'}</button>
        </div>
      </form>
    </section>
  )
}
