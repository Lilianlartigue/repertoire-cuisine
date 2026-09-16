'use client'

import { FormEvent, useState } from 'react'

type Saved = { id: string; name: string; version: string; existing: boolean }
type Ingredient = { item: string; quantity: string; unit: string; note: string }

const categories = [
  'Entrées', 'Poissons', 'Viandes', 'Garnitures', 'Sauces', 'Pâtes et appareils',
  'Crèmes', 'Biscuits', 'Pâtisserie', 'Desserts', 'Glaces et sorbets',
  'Boulangerie', 'Bases', 'Autres',
]

export default function ImportPage() {
  const [file, setFile] = useState<File | null>(null)
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [saved, setSaved] = useState<Saved[]>([])

  const [name, setName] = useState('')
  const [category, setCategory] = useState('Autres')
  const [servings, setServings] = useState('')
  const [tags, setTags] = useState('')
  const [equipment, setEquipment] = useState('')
  const [allergens, setAllergens] = useState('')
  const [notes, setNotes] = useState('')
  const [ingredients, setIngredients] = useState<Ingredient[]>([
    { item: '', quantity: '', unit: '', note: '' },
  ])
  const [steps, setSteps] = useState<string[]>([''])

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

  function updateIngredient(index: number, field: keyof Ingredient, value: string) {
    setIngredients((current) => current.map((ingredient, i) => i === index ? { ...ingredient, [field]: value } : ingredient))
  }

  function resetManual() {
    setName('')
    setCategory('Autres')
    setServings('')
    setTags('')
    setEquipment('')
    setAllergens('')
    setNotes('')
    setIngredients([{ item: '', quantity: '', unit: '', note: '' }])
    setSteps([''])
  }

  async function addManualRecipe(e: FormEvent) {
    e.preventDefault()
    const cleanIngredients = ingredients.filter((ingredient) => ingredient.item.trim())
    const cleanSteps = steps.map((step) => step.trim()).filter(Boolean)
    if (!name.trim() || !cleanIngredients.length || !cleanSteps.length) {
      setMessage('Ajoute au minimum un nom, un ingrédient et une étape.')
      return
    }

    setLoading(true); setMessage('Enregistrement de la recette…'); setSaved([])
    try {
      const response = await fetch('/api/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          manual: {
            canonicalName: name.trim(),
            displayName: name.trim(),
            category,
            servings: servings.trim() || null,
            tags: tags.split(',').map((tag) => tag.trim()).filter(Boolean),
            ingredients: cleanIngredients.map((ingredient) => ({
              item: ingredient.item.trim(),
              quantity: ingredient.quantity.trim() || null,
              unit: ingredient.unit.trim() || null,
              note: ingredient.note.trim() || null,
            })),
            equipment: equipment.split(',').map((item) => item.trim()).filter(Boolean),
            steps: cleanSteps.map((instruction, index) => ({ order: index + 1, instruction })),
            times: {},
            temperatures: [],
            allergens: allergens.split(',').map((item) => item.trim()).filter(Boolean),
            notes: notes.trim() || null,
            rawExcerpt: null,
          },
        }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Ajout impossible')
      setSaved(data.saved || [])
      setMessage(data.saved?.[0]?.existing ? 'Recette ajoutée comme nouvelle version.' : 'Recette ajoutée au répertoire.')
      resetManual()
    } catch (error: any) {
      setMessage(`Erreur : ${error.message}`)
    } finally { setLoading(false) }
  }

  return (
    <section>
      <header className="pageHead">
        <div className="eyebrow">Import intelligent</div>
        <h1>Donne-lui la fiche. Il s’occupe du rangement.</h1>
        <p className="muted">Importe une fiche, colle une URL ou saisis directement ta recette à la main.</p>
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

      <form className="card" onSubmit={addManualRecipe} style={{ marginTop: 18 }}>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <div>
            <h2>Ajouter une recette à la main</h2>
            <p className="muted">Pour tes recettes perso, essais, bases et fiches que tu veux saisir toi-même.</p>
          </div>
        </div>

        <div className="grid grid2">
          <div>
            <label>Nom de la recette</label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex. Crème chiboust" />
          </div>
          <div>
            <label>Catégorie</label>
            <select className="select" value={category} onChange={(e) => setCategory(e.target.value)}>
              {categories.map((item) => <option key={item}>{item}</option>)}
            </select>
          </div>
          <div>
            <label>Rendement / portions</label>
            <input className="input" value={servings} onChange={(e) => setServings(e.target.value)} placeholder="Ex. 1 kg, 8 portions…" />
          </div>
          <div>
            <label>Tags</label>
            <input className="input" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="vanille, pâtisserie, base…" />
          </div>
        </div>

        <div style={{ marginTop: 22 }}>
          <h3>Ingrédients</h3>
          <div className="grid" style={{ gap: 10 }}>
            {ingredients.map((ingredient, index) => (
              <div className="row" key={index}>
                <input className="input" style={{ flex: '2 1 220px' }} value={ingredient.item} onChange={(e) => updateIngredient(index, 'item', e.target.value)} placeholder="Ingrédient" />
                <input className="input" style={{ flex: '0 1 110px' }} value={ingredient.quantity} onChange={(e) => updateIngredient(index, 'quantity', e.target.value)} placeholder="Qté" />
                <input className="input" style={{ flex: '0 1 100px' }} value={ingredient.unit} onChange={(e) => updateIngredient(index, 'unit', e.target.value)} placeholder="Unité" />
                <input className="input" style={{ flex: '1 1 180px' }} value={ingredient.note} onChange={(e) => updateIngredient(index, 'note', e.target.value)} placeholder="Note" />
                {ingredients.length > 1 ? <button type="button" className="button secondary" onClick={() => setIngredients((current) => current.filter((_, i) => i !== index))}>Retirer</button> : null}
              </div>
            ))}
          </div>
          <button type="button" className="button secondary" style={{ marginTop: 10 }} onClick={() => setIngredients((current) => [...current, { item: '', quantity: '', unit: '', note: '' }])}>+ Ingrédient</button>
        </div>

        <div style={{ marginTop: 22 }}>
          <h3>Étapes</h3>
          <div className="grid" style={{ gap: 10 }}>
            {steps.map((step, index) => (
              <div className="row" key={index}>
                <span style={{ minWidth: 24, fontWeight: 700 }}>{index + 1}.</span>
                <textarea className="textarea" style={{ flex: '1 1 500px', minHeight: 76 }} value={step} onChange={(e) => setSteps((current) => current.map((item, i) => i === index ? e.target.value : item))} placeholder="Décris l’étape…" />
                {steps.length > 1 ? <button type="button" className="button secondary" onClick={() => setSteps((current) => current.filter((_, i) => i !== index))}>Retirer</button> : null}
              </div>
            ))}
          </div>
          <button type="button" className="button secondary" style={{ marginTop: 10 }} onClick={() => setSteps((current) => [...current, ''])}>+ Étape</button>
        </div>

        <div className="grid grid2" style={{ marginTop: 22 }}>
          <div>
            <label>Matériel</label>
            <input className="input" value={equipment} onChange={(e) => setEquipment(e.target.value)} placeholder="casserole, fouet, maryse…" />
          </div>
          <div>
            <label>Allergènes</label>
            <input className="input" value={allergens} onChange={(e) => setAllergens(e.target.value)} placeholder="lait, œuf, gluten…" />
          </div>
        </div>

        <div style={{ marginTop: 18 }}>
          <label>Notes</label>
          <textarea className="textarea" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Conservation, astuces, dressage, remarques…" />
        </div>

        <button className="button" style={{ marginTop: 18 }} disabled={loading}>Ajouter au répertoire</button>
      </form>

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
