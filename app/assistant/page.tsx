'use client'

import { FormEvent, useEffect, useRef, useState } from 'react'

type Message = { role: 'user' | 'ai'; text: string }

export default function AssistantPage() {
  const [messages, setMessages] = useState<Message[]>([
    { role: 'ai', text: 'Bonjour ! Demande-moi une idée, une association, une technique ou une recette.' },
  ])
  const [value, setValue] = useState('')
  const [loading, setLoading] = useState(false)
  const bottom = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: loading ? 'instant' : 'smooth', block: 'end' })
  }, [messages, loading])

  async function send(e: FormEvent) {
    e.preventDefault()
    const question = value.trim()
    if (!question || loading) return
    const history = messages.slice(-6)
    setMessages((list) => [...list, { role: 'user', text: question }, { role: 'ai', text: '' }])
    setValue('')
    setLoading(true)

    function updateAnswer(text: string) {
      setMessages((list) => list.map((message, index) =>
        index === list.length - 1 ? { role: 'ai', text } : message
      ))
    }

    try {
      const response = await fetch('/api/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, history }),
      })
      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data.error || 'Le service IA est momentanément indisponible.')
      }
      const contentType = response.headers.get('content-type') || ''
      if (contentType.includes('application/json')) {
        const data = await response.json()
        updateAnswer(data.answer || 'Aucune réponse.')
      } else if (response.body) {
        const reader = response.body.getReader()
        const decoder = new TextDecoder()
        let answer = ''
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          answer += decoder.decode(value, { stream: true })
          updateAnswer(answer)
        }
        answer += decoder.decode()
        updateAnswer(answer || 'La réponse est vide. Réessaie.')
      } else {
        updateAnswer(await response.text())
      }
    } catch (error: any) {
      updateAnswer('Impossible de répondre : ' + (error?.message || 'Erreur réseau.') + '\nTu peux réessayer.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <section>
      <header className="pageHead">
        <div className="eyebrow">Assistant cuisine</div>
        <h1>Une idée, une association, une recette.</h1>
        <p className="muted">Réponses affichées au fil de la génération, sans attendre la fin.</p>
      </header>

      <div className="chat" aria-live="polite">
        {messages.map((message, index) => (
          <div key={index} className={'bubble ' + message.role}>
            {message.text || (loading && index === messages.length - 1 ? 'Je réfléchis…' : '')}
          </div>
        ))}
        <div ref={bottom} />
      </div>

      <form className="card" onSubmit={send}>
        <textarea
          className="textarea"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
              e.preventDefault()
              e.currentTarget.form?.requestSubmit()
            }
          }}
          placeholder="Ex. Avec quoi associer la feuille de figuier dans un dessert ?"
          maxLength={1500}
          aria-label="Question à l’assistant"
        />
        <div className="row" style={{ marginTop: 12, justifyContent: 'flex-end' }}>
          <button className="button" disabled={loading || !value.trim()}>
            {loading ? 'Réponse en cours…' : 'Envoyer'}
          </button>
        </div>
      </form>
    </section>
  )
}
