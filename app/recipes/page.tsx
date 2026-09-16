'use client'

import { useEffect, useMemo, useState } from 'react'

type Ingredient = { item: string; quantity?: string | null; unit?: string | null; note?: string | null }
type Step = { order: number; instruction: string }

type Version = {
  id: string
  version_label: string
  source_type: string
  source_name?: string | null
  source_url?: string | null
  source_file_name?: string | null
  servings?: string | null
  ingredients: Ingredient[]
  equipment: string[]
  steps: Step[]
  times: Record<string, string | null>
  temperatures: string[]
  allergens: string[]
  notes?: string | null
  dressage?: string | null
}

type Recipe = {
  id: string
  canonical_name: string
  category: string
  tags: string[]
  preferred_version_id?: string | null
  recipe_versions: Version[]
}

type EditState = {
  recipeId: string
  versionId: string
  canonicalName: string
  category: string
  tags: string
  servings: string
  ingredients: Ingredient[]
  equipment: string
  steps: Step[]
  preparation: string
  cooking: string
  resting: string
  total: string
  temperatures: string
  allergens: string
  notes: string
  dressage: string
}

function splitList(value: string) {
  return value.split(',').map((item) => item.trim()).filter(Boolean)
}

function firstNumber(value?: string | null): number | null {
  if (!value) return null
  const match = value.match(/\d+(?:[.,]\d+)?/)
  if (!match) return null
  const number = Number(match[0].replace(',', '.'))
  return Number.isFinite(number) && number > 0 ? number : null
}

function quantityNumber(value?: string | null): number | null {
  if (!value) return null
  const text = value.trim().replace(',', '.')
  const mixed = text.match(/^(\d+)\s+(\d+)\/(\d+)$/)
  if (mixed) return Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3])
  const fraction = text.match(/^(\d+)\/(\d+)$/)
  if (fraction) return Number(fraction[1]) / Number(fraction[2])
  if (!/^\d+(?:\.\d+)?$/.test(text)) return null
  const number = Number(text)
  return Number.isFinite(number) ? number : null
}

function scaledQuantity(value: string | null | undefined, factor: number) {
  const number = quantityNumber(value)
  if (number === null || factor === 1) return value || ''
  return new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 }).format(number * factor)
}

export default function RecipesPage() {
  const [recipes, setRecipes] = useState<Recipe[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('Toutes')
  const [open, setOpen] = useState<string | null>(null)
  const [editing, setEditing] = useState<EditState | null>(null)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [targets, setTargets] = useState<Record<string, string>>({})

  async function loadRecipes() {
    const response = await fetch('/api/recipes', { cache: 'no-store' })
    const data = await response.json()
    setRecipes(data.recipes || [])
  }

  useEffect(() => {
    loadRecipes().finally(() => setLoading(false))
  }, [])

  const categories = useMemo(() => ['Toutes', ...Array.from(new Set(recipes.map((r) => r.category))).sort()], [recipes])
  const filtered = recipes.filter((r) => {
    const versionText = (r.recipe_versions || []).flatMap((v) => [
      ...(v.ingredients || []).map((i) => `${i.item} ${i.quantity || ''} ${i.unit || ''} ${i.note || ''}`),
      ...(v.equipment || []),
      ...(v.allergens || []),
      ...(v.steps || []).map((s) => s.instruction),
      v.notes || '',
      v.dressage || '',
    ]).join(' ')
    const haystack = `${r.canonical_name} ${r.category} ${(r.tags || []).join(' ')} ${versionText}`.toLowerCase()
    return haystack.includes(search.toLowerCase()) && (category === 'Toutes' || r.category === category)
  })
  const openRecipe = recipes.find((recipe) => recipe.id === open) || null

  function startEdit(recipe: Recipe, version: Version) {
    setMessage('')
    setEditing({
      recipeId: recipe.id,
      versionId: version.id,
      canonicalName: recipe.canonical_name,
      category: recipe.category,
      tags: (recipe.tags || []).join(', '),
      servings: version.servings || '',
      ingredients: (version.ingredients || []).map((i) => ({ ...i })),
      equipment: (version.equipment || []).join(', '),
      steps: [...(version.steps || [])].sort((a, b) => a.order - b.order).map((s, index) => ({ order: index + 1, instruction: s.instruction })),
      preparation: version.times?.preparation || '',
      cooking: version.times?.cooking || '',
      resting: version.times?.resting || '',
      total: version.times?.total || '',
      temperatures: (version.temperatures || []).join(', '),
      allergens: (version.allergens || []).join(', '),
      notes: version.notes || '',
      dressage: version.dressage || '',
    })
  }

  function updateIngredient(index: number, field: keyof Ingredient, value: string) {
    if (!editing) return
    const ingredients = [...editing.ingredients]
    ingredients[index] = { ...ingredients[index], [field]: value }
    setEditing({ ...editing, ingredients })
  }

  function updateStep(index: number, value: string) {
    if (!editing) return
    const steps = [...editing.steps]
    steps[index] = { order: index + 1, instruction: value }
    setEditing({ ...editing, steps })
  }

  function printVersion(versionId: string) {
    const target = document.getElementById(`recipe-version-${versionId}`)
    if (!target) return
    document.body.classList.add('printingRecipe')
    target.classList.add('printTarget')
    window.print()
    target.classList.remove('printTarget')
    document.body.classList.remove('printingRecipe')
  }

  async function saveEdit() {
    if (!editing) return
    setSaving(true)
    setMessage('')

    const payload = {
      recipeId: editing.recipeId,
      versionId: editing.versionId,
      canonicalName: editing.canonicalName.trim(),
      category: editing.category.trim() || 'Autres',
      tags: splitList(editing.tags),
      servings: editing.servings.trim() || null,
      ingredients: editing.ingredients
        .map((i) => ({ item: i.item.trim(), quantity: i.quantity?.trim() || null, unit: i.unit?.trim() || null, note: i.note?.trim() || null }))
        .filter((i) => i.item),
      equipment: splitList(editing.equipment),
      steps: editing.steps.map((s, index) => ({ order: index + 1, instruction: s.instruction.trim() })).filter((s) => s.instruction),
      times: {
        preparation: editing.preparation.trim() || null,
        cooking: editing.cooking.trim() || null,
        resting: editing.resting.trim() || null,
        total: editing.total.trim() || null,
      },
      temperatures: splitList(editing.temperatures),
      allergens: splitList(editing.allergens),
      notes: editing.notes.trim() || null,
      dressage: editing.dressage.trim() || null,
    }

    try {
      const response = await fetch('/api/recipes', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Impossible d’enregistrer')
      await loadRecipes()
      setEditing(null)
      setMessage('Recette modifiée avec succès.')
    } catch (error: any) {
      setMessage(error.message || 'Erreur pendant la modification')
    } finally {
      setSaving(false)
    }
  }

  async function setPreferredVersion(recipe: Recipe, version: Version) {
    const isPreferred = recipe.preferred_version_id === version.id
    setMessage(isPreferred ? 'Retrait du favori…' : 'Mise en favori…')
    try {
      const response = await fetch('/api/recipes', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipeId: recipe.id, versionId: isPreferred ? null : version.id }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Impossible de modifier le favori')
      await loadRecipes()
      setMessage(isPreferred ? 'Version retirée des favoris.' : 'Version favorite enregistrée.')
    } catch (error: any) {
      setMessage(`Erreur : ${error.message}`)
    }
  }

  async function deleteRecipe(recipe: Recipe) {
    if (!window.confirm(`Supprimer complètement « ${recipe.canonical_name} » et toutes ses versions ?`)) return
    setMessage('Suppression…')
    try {
      const response = await fetch('/api/recipes', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipeId: recipe.id }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Suppression impossible')
      setOpen(null)
      await loadRecipes()
      setMessage('Recette supprimée.')
    } catch (error: any) {
      setMessage(`Erreur : ${error.message}`)
    }
  }

  async function deleteVersion(recipe: Recipe, version: Version) {
    if (!window.confirm(`Supprimer ${version.version_label} de « ${recipe.canonical_name} » ?`)) return
    setMessage('Suppression…')
    try {
      const response = await fetch('/api/recipes', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipeId: recipe.id, versionId: version.id }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Suppression impossible')
      await loadRecipes()
      setMessage(data.deleted === 'last-version-and-recipe' ? 'Dernière version supprimée : la fiche a aussi été supprimée.' : 'Version supprimée.')
    } catch (error: any) {
      setMessage(`Erreur : ${error.message}`)
    }
  }

  return (
    <section>
      <header className="pageHead">
        <div className="eyebrow">Répertoire</div>
        <h1>Toutes tes recettes, au même format.</h1>
        <p className="muted">Une fiche par préparation. Plusieurs versions peuvent vivre dans la même fiche.</p>
      </header>

      <div className="recipeToolbar">
        <input className="input" placeholder="Rechercher une recette, un ingrédient, une technique, une catégorie…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <select className="select" value={category} onChange={(e) => setCategory(e.target.value)}>
          {categories.map((c) => <option key={c}>{c}</option>)}
        </select>
      </div>

      {message ? <div className="status">{message}</div> : null}
      {loading ? <p className="muted">Chargement…</p> : null}
      {!loading && filtered.length === 0 ? <div className="card">Aucune recette trouvée.</div> : null}

      <div className="recipeGrid">
        {filtered.map((recipe) => (
          <article className="card recipeCard" key={recipe.id} onClick={() => setOpen(recipe.id)}>
            <span className="badge">{recipe.category}</span>
            <h3>{recipe.canonical_name}</h3>
            <p className="muted">{recipe.recipe_versions?.length || 0} version{recipe.recipe_versions?.length === 1 ? '' : 's'}</p>
          </article>
        ))}
      </div>

      {openRecipe ? (
        <div className="recipeDrawerBackdrop" onClick={() => setOpen(null)}>
          <aside className="recipeDrawer" onClick={(e) => e.stopPropagation()}>
            <div className="drawerTop">
              <div>
                <span className="badge">{openRecipe.category}</span>
                <h2>{openRecipe.canonical_name}</h2>
                <p className="muted">{openRecipe.recipe_versions.length} version{openRecipe.recipe_versions.length === 1 ? '' : 's'}</p>
              </div>
              <button className="button secondary" type="button" onClick={() => setOpen(null)}>Fermer</button>
            </div>

            {(openRecipe.recipe_versions || []).map((version) => {
              const baseServings = firstNumber(version.servings)
              const target = Number((targets[version.id] || '').replace(',', '.'))
              const factor = baseServings && Number.isFinite(target) && target > 0 ? target / baseServings : 1
              const isPreferred = openRecipe.preferred_version_id === version.id

              return (
                <div className="version" id={`recipe-version-${version.id}`} key={version.id}>
                  <div className="printOnly printRecipeHead">
                    <h1>{openRecipe.canonical_name}</h1>
                    <p>{openRecipe.category} · {version.version_label}{version.servings ? ` · Rendement : ${version.servings}` : ''}</p>
                  </div>
                  <div className="row editHeader noPrint">
                    <h4>{version.version_label}</h4>
                    {isPreferred ? <span className="badge">★ Version favorite</span> : null}
                    {openRecipe.recipe_versions.length > 1 ? (
                      <button className="button secondary" type="button" onClick={() => setPreferredVersion(openRecipe, version)}>
                        {isPreferred ? '★ Retirer des favoris' : '☆ Mettre en favori'}
                      </button>
                    ) : null}
                    <button className="button secondary" type="button" onClick={() => startEdit(openRecipe, version)}>Modifier</button>
                    <button className="button secondary" type="button" onClick={() => printVersion(version.id)}>Imprimer</button>
                    <button className="button danger" type="button" onClick={() => deleteVersion(openRecipe, version)}>Supprimer la version</button>
                  </div>
                  <p className="muted noPrint">
                    Source : {version.source_name || version.source_file_name || version.source_url || version.source_type}
                    {version.servings ? ` · Rendement : ${version.servings}` : ''}
                  </p>

                  {baseServings ? (
                    <div className="scaleBox noPrint">
                      <strong>Adapter les quantités</strong>
                      <div className="row">
                        <span className="muted">Base : {version.servings}</span>
                        <input
                          className="input scaleInput"
                          inputMode="decimal"
                          placeholder="Portions souhaitées"
                          value={targets[version.id] || ''}
                          onChange={(e) => setTargets({ ...targets, [version.id]: e.target.value })}
                        />
                        {factor !== 1 ? <span className="badge">× {factor.toFixed(2).replace('.', ',')}</span> : null}
                      </div>
                    </div>
                  ) : null}

                  <div className="columns">
                    <div>
                      <strong>Ingrédients</strong>
                      <ul>
                        {(version.ingredients || []).map((i, index) => (
                          <li key={index}>{[scaledQuantity(i.quantity, factor), i.unit, i.item].filter(Boolean).join(' ')}{i.note ? ` · ${i.note}` : ''}</li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <strong>Étapes</strong>
                      <ol>
                        {[...(version.steps || [])].sort((a, b) => a.order - b.order).map((s, index) => <li key={index}>{s.instruction}</li>)}
                      </ol>
                    </div>
                  </div>
                  {version.temperatures?.length ? <p><strong>Températures :</strong> {version.temperatures.join(' · ')}</p> : null}
                  {version.allergens?.length ? <p><strong>Allergènes :</strong> {version.allergens.join(', ')}</p> : null}
                  {version.dressage ? <p className="dressageBlock"><strong>Dressage :</strong> {version.dressage}</p> : null}
                  {version.notes ? <p><strong>Notes :</strong> {version.notes}</p> : null}
                </div>
              )
            })}

            <div className="recipeDangerZone noPrint">
              <button className="button danger" type="button" onClick={() => deleteRecipe(openRecipe)}>Supprimer toute la fiche</button>
            </div>
          </aside>
        </div>
      ) : null}

      {editing ? (
        <div className="editorOverlay" onClick={() => setEditing(null)}>
          <div className="card recipeEditor" onClick={(e) => e.stopPropagation()}>
            <div className="row editorTitle">
              <div>
                <div className="eyebrow">Modification</div>
                <h2>Modifier la recette</h2>
              </div>
              <button className="button secondary" type="button" onClick={() => setEditing(null)}>Fermer</button>
            </div>

            {message ? <div className="status editorStatus">{message}</div> : null}

            <div className="grid grid2">
              <label>Nom<input className="input" value={editing.canonicalName} onChange={(e) => setEditing({ ...editing, canonicalName: e.target.value })} /></label>
              <label>Catégorie<input className="input" value={editing.category} onChange={(e) => setEditing({ ...editing, category: e.target.value })} /></label>
              <label>Rendement / portions<input className="input" value={editing.servings} onChange={(e) => setEditing({ ...editing, servings: e.target.value })} /></label>
              <label>Tags, séparés par des virgules<input className="input" value={editing.tags} onChange={(e) => setEditing({ ...editing, tags: e.target.value })} /></label>
            </div>

            <h3>Ingrédients</h3>
            <div className="editList">
              {editing.ingredients.map((ingredient, index) => (
                <div className="ingredientEdit" key={index}>
                  <input className="input" placeholder="Quantité" value={ingredient.quantity || ''} onChange={(e) => updateIngredient(index, 'quantity', e.target.value)} />
                  <input className="input" placeholder="Unité" value={ingredient.unit || ''} onChange={(e) => updateIngredient(index, 'unit', e.target.value)} />
                  <input className="input" placeholder="Ingrédient" value={ingredient.item} onChange={(e) => updateIngredient(index, 'item', e.target.value)} />
                  <input className="input" placeholder="Note" value={ingredient.note || ''} onChange={(e) => updateIngredient(index, 'note', e.target.value)} />
                  <button className="button secondary" type="button" onClick={() => setEditing({ ...editing, ingredients: editing.ingredients.filter((_, i) => i !== index) })}>Supprimer</button>
                </div>
              ))}
              <button className="button secondary" type="button" onClick={() => setEditing({ ...editing, ingredients: [...editing.ingredients, { item: '', quantity: '', unit: '', note: '' }] })}>+ Ajouter un ingrédient</button>
            </div>

            <h3>Étapes</h3>
            <div className="editList">
              {editing.steps.map((step, index) => (
                <div className="stepEdit" key={index}>
                  <span className="stepNumber">{index + 1}</span>
                  <textarea className="textarea" value={step.instruction} onChange={(e) => updateStep(index, e.target.value)} />
                  <button className="button secondary" type="button" onClick={() => setEditing({ ...editing, steps: editing.steps.filter((_, i) => i !== index).map((s, i) => ({ ...s, order: i + 1 })) })}>Supprimer</button>
                </div>
              ))}
              <button className="button secondary" type="button" onClick={() => setEditing({ ...editing, steps: [...editing.steps, { order: editing.steps.length + 1, instruction: '' }] })}>+ Ajouter une étape</button>
            </div>

            <div className="grid grid2">
              <label>Temps de préparation<input className="input" value={editing.preparation} onChange={(e) => setEditing({ ...editing, preparation: e.target.value })} /></label>
              <label>Temps de cuisson<input className="input" value={editing.cooking} onChange={(e) => setEditing({ ...editing, cooking: e.target.value })} /></label>
              <label>Temps de repos<input className="input" value={editing.resting} onChange={(e) => setEditing({ ...editing, resting: e.target.value })} /></label>
              <label>Temps total<input className="input" value={editing.total} onChange={(e) => setEditing({ ...editing, total: e.target.value })} /></label>
              <label>Matériel, séparé par des virgules<input className="input" value={editing.equipment} onChange={(e) => setEditing({ ...editing, equipment: e.target.value })} /></label>
              <label>Températures, séparées par des virgules<input className="input" value={editing.temperatures} onChange={(e) => setEditing({ ...editing, temperatures: e.target.value })} /></label>
              <label>Allergènes, séparés par des virgules<input className="input" value={editing.allergens} onChange={(e) => setEditing({ ...editing, allergens: e.target.value })} /></label>
            </div>

            <label>Dressage<textarea className="textarea" value={editing.dressage} onChange={(e) => setEditing({ ...editing, dressage: e.target.value })} placeholder="Décris le montage, la disposition et les finitions dans l’assiette…" /></label>
            <label>Notes<textarea className="textarea" value={editing.notes} onChange={(e) => setEditing({ ...editing, notes: e.target.value })} /></label>

            <div className="row editorActions">
              <button className="button" type="button" disabled={saving} onClick={saveEdit}>{saving ? 'Enregistrement…' : 'Enregistrer les modifications'}</button>
              <button className="button secondary" type="button" onClick={() => setEditing(null)}>Annuler</button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  )
}
