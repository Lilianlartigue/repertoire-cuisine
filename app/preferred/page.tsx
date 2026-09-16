'use client'

import { useEffect, useState } from 'react'

type Version = {
  id: string
  version_label: string
  source_name?: string | null
  source_file_name?: string | null
  source_url?: string | null
  source_type: string
}

type Recipe = {
  id: string
  canonical_name: string
  category: string
  preferred_version_id?: string | null
  recipe_versions: Version[]
}

export default function PreferredVersionsPage() {
  const [recipes, setRecipes] = useState<Recipe[]>([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')

  async function loadRecipes() {
    const response = await fetch('/api/recipes', { cache: 'no-store' })
    const data = await response.json()
    if (!response.ok) throw new Error(data.error || 'Impossible de charger les recettes')
    setRecipes(data.recipes || [])
  }

  useEffect(() => {
    loadRecipes()
      .catch((error) => setMessage(`Erreur : ${error.message}`))
      .finally(() => setLoading(false))
  }, [])

  async function choose(recipeId: string, versionId: string | null) {
    setMessage('Enregistrement…')
    try {
      const response = await fetch('/api/recipes', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipeId, versionId }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Impossible de choisir cette version')
      await loadRecipes()
      setMessage(versionId ? 'Version préférée enregistrée.' : 'Version préférée retirée.')
    } catch (error: any) {
      setMessage(`Erreur : ${error.message}`)
    }
  }

  return (
    <section>
      <header className="pageHead">
        <div className="eyebrow">Versions</div>
        <h1>Choisis ta version de référence.</h1>
        <p className="muted">Quand une recette possède plusieurs versions, l’assistant utilisera celle que tu préfères en priorité.</p>
      </header>

      {message ? <div className="status">{message}</div> : null}
      {loading ? <p className="muted">Chargement…</p> : null}

      <div className="grid">
        {recipes.filter((recipe) => recipe.recipe_versions?.length > 1).map((recipe) => (
          <div className="card" key={recipe.id}>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <div>
                <span className="badge">{recipe.category}</span>
                <h2 style={{ marginTop: 8 }}>{recipe.canonical_name}</h2>
              </div>
              {recipe.preferred_version_id ? (
                <button className="button secondary" type="button" onClick={() => choose(recipe.id, null)}>Retirer le choix</button>
              ) : null}
            </div>

            <div className="grid" style={{ gap: 10 }}>
              {recipe.recipe_versions.map((version) => {
                const preferred = version.id === recipe.preferred_version_id
                return (
                  <div className="detectedItem" key={version.id}>
                    <div className="row" style={{ justifyContent: 'space-between' }}>
                      <div>
                        <strong>{version.version_label}</strong>
                        {preferred ? <span className="badge" style={{ marginLeft: 8 }}>Préférée</span> : null}
                        <div className="muted" style={{ marginTop: 5 }}>
                          {version.source_name || version.source_file_name || version.source_url || version.source_type}
                        </div>
                      </div>
                      <button className={preferred ? 'button secondary' : 'button'} type="button" disabled={preferred} onClick={() => choose(recipe.id, version.id)}>
                        {preferred ? 'Version actuelle' : 'Choisir cette version'}
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      {!loading && !recipes.some((recipe) => recipe.recipe_versions?.length > 1) ? (
        <div className="card">Tu n’as pas encore de recette avec plusieurs versions.</div>
      ) : null}
    </section>
  )
}
