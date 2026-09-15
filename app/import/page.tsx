'use client'

import { FormEvent, useState } from 'react'

type Saved = { id: string; name: string; version: string; existing: boolean }

export default function ImportPage() {
  const [file, setFile] = useState<File | null>(null)
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [saved, setSaved] = useState<Saved[]>([])

  async function importFile(e: FormEvent) {
    e.preventDefault()
    if (!file) return
    setLoading(true); setMessage('Analyse de la feuille…'); setSaved([])
    try {
      const form = new FormData()
      form.append('file', file)
      const response = await fetch('/api/import', { method: 'POST', body: form })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Import impossible')
      setSaved(data.saved || [])
      setMessage(`${data.detected} préparation${data.detected > 1 ? 's' : ''} détectée${data.detected > 1 ? 's' : ''} et rangée${data.detected > 1 ? 's' : ''}.`)
    } catch (error: any) {
      setMessage(`Erreur : ${error.message}`)
    } finally { setLoading(false) }
  }

  async function importUrl(e: FormEvent) {
    e.preventDefault()
    if (!url.trim()) return
    setLoading(true); setMessage('Lecture du site…'); setSaved([])
    try {
      const response = await fetch('/api/import', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Import impossible')
      setSaved(data.saved || [])
      setMessage(`${data.detected} préparation${data.detected > 1 ? 's' : ''} détectée${data.detected > 1 ? 's' : ''} et rangée${data.detected > 1 ? 's' : ''}.`)
    } catch (error: any) {
      setMessage(`Erreur : ${error.message}`)
    } finally { setLoading(false) }
  }

  return (
    <section>
      <header className="pageHead">
        <div className="eyebrow">Import intelligent</div>
        <h1>Donne-lui la fiche. Il s’occupe du rangement.</h1>
        <p className="muted">Une seule feuille peut contenir plusieurs préparations : elles seront détectées et enregistrées séparément.</p>
      </header>

      <div className="grid grid2">
        <form className="card" onSubmit={importFile}>
          <h2>PDF ou image</h2>
          <div className="dropzone">
            <p><strong>Photo, scan ou fiche technique</strong></p>
            <p className="muted">PDF, JPG, PNG, WEBP</p>
            <input type="file" accept="application/pdf,image/jpeg,image/png,image/webp" onChange={(e) => setFile(e.target.files?.[0] || null)} />
            {file ? <p>{file.name}</p> : null}
          </div>
          <button className="button" style={{ marginTop: 14 }} disabled={!file || loading}>Analyser et ajouter</button>
        </form>

        <form className="card" onSubmit={importUrl}>
          <h2>Depuis un site</h2>
          <p className="muted">Colle le lien d’une recette. L’IA la remettra dans le même format que les autres.</p>
          <input className="input" type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" />
          <button className="button" style={{ marginTop: 14 }} disabled={!url.trim() || loading}>Lire et ajouter</button>
        </form>
      </div>

      {message ? <div className="status">{message}</div> : null}
      {saved.length ? (
        <div className="detected">
          {saved.map((item, index) => (
            <div className="detectedItem" key={`${item.id}-${index}`}>
              <strong>{item.name}</strong> · {item.version}
              <div className="muted">{item.existing ? 'Ajoutée à une fiche déjà existante.' : 'Nouvelle fiche créée.'}</div>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  )
}
