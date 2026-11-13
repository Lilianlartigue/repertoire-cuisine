'use client'

import { ChangeEvent, useEffect, useMemo, useState } from 'react'
import './ideas.css'

type IdeaType = 'photo' | 'association'
type Idea = {
  id: string
  type: IdeaType
  title: string
  description: string
  flavors: string
  tags: string[]
  image_data: string | null
  created_at: string
  updated_at: string
}
type IdeaForm = {
  id?: string
  type: IdeaType
  title: string
  description: string
  flavors: string
  tags: string
  image_data: string | null
}

const emptyIdea = (): IdeaForm => ({
  type: 'association',
  title: '',
  description: '',
  flavors: '',
  tags: '',
  image_data: null,
})

function asForm(idea: Idea): IdeaForm {
  return {
    id: idea.id,
    type: idea.type,
    title: idea.title,
    description: idea.description,
    flavors: idea.flavors,
    tags: (idea.tags || []).join(', '),
    image_data: idea.image_data,
  }
}

async function compressPhoto(file: File): Promise<string> {
  if (file.size > 15 * 1024 * 1024) throw new Error('Choisis une photo de moins de 15 Mo.')
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => {
      URL.revokeObjectURL(url)
      try {
        if (!image.naturalWidth || !image.naturalHeight) throw new Error('Image illisible.')
        const canvas = document.createElement('canvas')
        const ratio = Math.min(1, 1600 / Math.max(image.naturalWidth, image.naturalHeight))
        canvas.width = Math.max(1, Math.round(image.naturalWidth * ratio))
        canvas.height = Math.max(1, Math.round(image.naturalHeight * ratio))
        const ctx = canvas.getContext('2d')
        if (!ctx) throw new Error('Impossible de préparer la photo.')
        ctx.drawImage(image, 0, 0, canvas.width, canvas.height)
        for (const quality of [0.82, 0.68, 0.5]) {
          const data = canvas.toDataURL('image/jpeg', quality)
          if (data.length < 1500000) return resolve(data)
        }
        throw new Error('Cette photo est trop lourde, même après compression.')
      } catch (error) {
        reject(error)
      }
    }
    image.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Impossible de lire cette image. Utilise JPEG, PNG ou une photo classique.'))
    }
    image.src = url
  })
}

export default function IdeasPage() {
  const [ideas, setIdeas] = useState<Idea[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<'toutes' | IdeaType>('toutes')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [editing, setEditing] = useState<IdeaForm | null>(null)
  const [saving, setSaving] = useState(false)
  const [processingPhoto, setProcessingPhoto] = useState(false)
  const [status, setStatus] = useState('')

  async function loadIdeas() {
    const response = await fetch('/api/ideas', { cache: 'no-store' })
    const data = await response.json()
    if (!response.ok) throw new Error(data.error || 'Impossible de charger les idées.')
    setIdeas(data.ideas || [])
  }

  useEffect(() => {
    loadIdeas().catch((error) => setStatus(error.message)).finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !saving) {
        setEditing(null)
        setSelectedId(null)
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [saving])

  const visible = useMemo(() => {
    const q = search.trim().toLocaleLowerCase('fr')
    return ideas.filter((idea) =>
      (filter === 'toutes' || idea.type === filter) &&
      (!q || [idea.title, idea.description, idea.flavors, ...(idea.tags || [])]
        .join(' ').toLocaleLowerCase('fr').includes(q))
    )
  }, [ideas, search, filter])
  const selected = ideas.find((idea) => idea.id === selectedId) || null

  function addIdea(type: IdeaType = 'association') {
    setStatus('')
    setSelectedId(null)
    setEditing({ ...emptyIdea(), type })
  }

  async function uploadPhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    setProcessingPhoto(true)
    setStatus('')
    try {
      const image = await compressPhoto(file)
      setEditing((current) => current ? { ...current, image_data: image } : current)
    } catch (error: any) {
      setStatus(error.message || 'Impossible de charger cette photo.')
    } finally {
      setProcessingPhoto(false)
      event.target.value = ''
    }
  }

  async function saveIdea() {
    if (!editing?.title.trim() || saving || processingPhoto) return
    setSaving(true)
    setStatus('')
    try {
      const response = await fetch('/api/ideas', {
        method: editing.id ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(editing.id ? { id: editing.id } : {}),
          type: editing.type,
          title: editing.title.trim(),
          description: editing.description.trim(),
          flavors: editing.flavors.trim(),
          tags: editing.tags.split(',').map((tag) => tag.trim()).filter(Boolean),
          image_data: editing.image_data,
        }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Impossible d’enregistrer cette idée.')
      const saved = data.idea as Idea
      setIdeas((current) => [saved, ...current.filter((idea) => idea.id !== saved.id)])
      setEditing(null)
      setSelectedId(saved.id)
      setStatus('Idée enregistrée.')
    } catch (error: any) {
      setStatus(error.message || 'Erreur pendant l’enregistrement.')
    } finally {
      setSaving(false)
    }
  }

  async function deleteIdea(idea: Idea) {
    if (!window.confirm('Supprimer définitivement « ' + idea.title + ' » ?')) return
    setSaving(true)
    setStatus('')
    try {
      const response = await fetch('/api/ideas', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: idea.id }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Suppression impossible.')
      setIdeas((current) => current.filter((item) => item.id !== idea.id))
      setSelectedId(null)
      setStatus('Idée supprimée.')
    } catch (error: any) {
      setStatus(error.message || 'Erreur pendant la suppression.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="ideasPage">
      <header className="pageHead ideasHeader">
        <div>
          <div className="eyebrow">Carnet d’inspiration</div>
          <h1>Mes idées</h1>
          <p className="muted">Photos, associations de saveurs et inspirations à garder pour plus tard.</p>
        </div>
        <button className="button" type="button" onClick={() => addIdea()}>+ Ajouter une idée</button>
      </header>

      <div className="ideaToolbar">
        <input
          className="input"
          aria-label="Rechercher dans les idées"
          placeholder="Rechercher une saveur, une idée, un mot-clé…"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <select className="select" aria-label="Filtrer les idées" value={filter}
          onChange={(event) => setFilter(event.target.value as typeof filter)}>
          <option value="toutes">Toutes les idées</option>
          <option value="association">Associations</option>
          <option value="photo">Photos</option>
        </select>
      </div>

      {status && !editing ? <div className="status" role="status">{status}</div> : null}
      {loading ? <p className="muted">Chargement des idées…</p> : null}
      {!loading && !visible.length ? (
        <div className="card ideaEmpty">
          <h2>{ideas.length ? 'Aucun résultat' : 'Ton carnet d’idées est prêt.'}</h2>
          <p className="muted">{ideas.length ? 'Essaie un autre mot-clé.' : 'Ajoute une photo, une association ou une inspiration.'}</p>
          {!ideas.length ? <button className="button secondary" onClick={() => addIdea()} type="button">Créer ma première idée</button> : null}
        </div>
      ) : null}

      <div className="ideaGrid">
        {visible.map((idea) => (
          <button className="ideaCard" key={idea.id} type="button" onClick={() => { setSelectedId(idea.id); setStatus('') }}
            aria-label={'Ouvrir ' + idea.title}>
            {idea.image_data ? (
              <img className="ideaCardPhoto" src={idea.image_data} alt={idea.title} loading="lazy" />
            ) : (
              <div className="ideaCardBlank">{idea.type === 'association' ? 'Saveurs & accords' : 'Inspiration photo'}</div>
            )}
            <div className="ideaCardBody">
              <span className="badge">{idea.type === 'association' ? 'Association' : 'Photo'}</span>
              <h3>{idea.title}</h3>
              {idea.flavors ? <p className="ideaFlavors">{idea.flavors}</p> : null}
              {idea.description ? <p className="muted ideaExcerpt">{idea.description}</p> : null}
            </div>
          </button>
        ))}
      </div>

      {(selected || editing) ? (
        <div className="recipeDrawerBackdrop ideaOverlay" onMouseDown={(event) => {
          if (event.target === event.currentTarget && !saving) {
            setSelectedId(null)
            setEditing(null)
          }
        }}>
          <aside className="recipeDrawer ideaDrawer" role="dialog" aria-modal="true"
            aria-label={editing ? 'Modifier une idée' : 'Détail de l’idée'}>
            {editing ? (
              <>
                <div className="drawerTop">
                  <div>
                    <div className="eyebrow">{editing.id ? 'Modifier une idée' : 'Nouvelle inspiration'}</div>
                    <h2>{editing.id ? 'Modifier la fiche' : 'Ajouter une idée'}</h2>
                  </div>
                  <button className="button secondary" type="button" disabled={saving}
                    onClick={() => setEditing(null)}>Fermer</button>
                </div>
                <form className="ideaForm" onSubmit={(event) => { event.preventDefault(); saveIdea() }}>
                  <label>Type d’idée
                    <select className="select" value={editing.type} onChange={(event) => setEditing({ ...editing, type: event.target.value as IdeaType })}>
                      <option value="association">Association de saveurs</option>
                      <option value="photo">Photo / inspiration</option>
                    </select>
                  </label>
                  <label>Titre *
                    <input className="input" maxLength={140} required value={editing.title}
                      placeholder="Ex. Pomme, sarrasin et caramel"
                      onChange={(event) => setEditing({ ...editing, title: event.target.value })} />
                  </label>
                  <label>Photo (facultative)
                    <input className="input" type="file" accept="image/*" onChange={uploadPhoto} disabled={processingPhoto || saving} />
                  </label>
                  {processingPhoto ? <p className="muted">Préparation de la photo…</p> : null}
                  {editing.image_data ? (
                    <div>
                      <img className="ideaEditPreview" src={editing.image_data} alt="Aperçu de la photo" />
                      <button className="button secondary" type="button" onClick={() => setEditing({ ...editing, image_data: null })}>Retirer la photo</button>
                    </div>
                  ) : null}
                  <label>Saveurs / ingrédients associés
                    <input className="input" maxLength={500} value={editing.flavors}
                      placeholder="Ex. Poire · Verveine · Vanille"
                      onChange={(event) => setEditing({ ...editing, flavors: event.target.value })} />
                  </label>
                  <label>Détails et notes
                    <textarea className="textarea" rows={7} maxLength={10000} value={editing.description}
                      placeholder="Idée de dressage, textures, points à essayer, provenance…"
                      onChange={(event) => setEditing({ ...editing, description: event.target.value })} />
                  </label>
                  <label>Mots-clés (séparés par des virgules)
                    <input className="input" value={editing.tags} placeholder="Dessert, automne, dressage"
                      onChange={(event) => setEditing({ ...editing, tags: event.target.value })} />
                  </label>
                  {status ? <div className="status" role="alert">{status}</div> : null}
                  <div className="row ideaFormActions">
                    <button className="button" type="submit" disabled={saving || processingPhoto || !editing.title.trim()}>
                      {saving ? 'Enregistrement…' : 'Enregistrer l’idée'}
                    </button>
                  </div>
                </form>
              </>
            ) : selected ? (
              <>
                <div className="drawerTop">
                  <div>
                    <span className="badge">{selected.type === 'association' ? 'Association' : 'Photo'}</span>
                    <h2>{selected.title}</h2>
                  </div>
                  <button className="button secondary" type="button" onClick={() => setSelectedId(null)}>Fermer</button>
                </div>
                {selected.image_data ? <img className="ideaHero" src={selected.image_data} alt={selected.title} /> : null}
                {selected.flavors ? (
                  <div className="ideaDetailSection">
                    <h3>Associations</h3>
                    <p className="ideaFlavorDetail">{selected.flavors}</p>
                  </div>
                ) : null}
                {selected.description ? (
                  <div className="ideaDetailSection">
                    <h3>Notes et détails</h3>
                    <p className="ideaLongText">{selected.description}</p>
                  </div>
                ) : null}
                {selected.tags?.length ? (
                  <div className="row ideaTags">
                    {selected.tags.map((tag, index) => <span className="badge" key={index}>{tag}</span>)}
                  </div>
                ) : null}
                <div className="row ideaDetailActions">
                  <button className="button" type="button" onClick={() => setEditing(asForm(selected))}>Modifier</button>
                  <button className="button danger" type="button" disabled={saving} onClick={() => deleteIdea(selected)}>Supprimer</button>
                </div>
              </>
            ) : null}
          </aside>
        </div>
      ) : null}
    </section>
  )
}
