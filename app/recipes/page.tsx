'use client'

import { useEffect, useMemo, useState } from 'react'

type Version = {
  id: string
  version_label: string
  source_type: string
  source_name?: string | null
  source_url?: string | null
  source_file_name?: string | null
  servings?: string | null
  ingredients: Array<{ item: string; quantity?: string | null; unit?: string | null; note?: string | null }>
  equipment: string[]
  steps: Array<{ order: number; instruction: string }>
  times: Record<string, string | null>
  temperatures: string[]
  allergens: string[]
  notes?: string | null
}

type Recipe = {
  id: string
  canonical_name: string
  category: string
  tags: string[]
  recipe_versions: Version[]
}

export default function RecipesPage() {
  const [recipes, setRecipes] = useState<Recipe[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('Toutes')
  const [open, setOpen] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/recipes')
      .then((r) => r.json())
      .then((d) => setRecipes(d.recipes || []))
      .finally(() => setLoading(false))
  }, [])

  const categories = useMemo(() => ['Toutes', ...Array.from(new Set(recipes.map((r) => r.category))).sort()], [recipes])
  const filtered = recipes.filter((r) => {
    const haystack = `${r.canonical_name} ${r.category} ${(r.tags || []).join(' ')}`.toLowerCase()
    return haystack.includes(search.toLowerCase()) && (category === 'Toutes' || r.category === category)
  })

  return (
    <section>
      <header className="pageHead">
        <div className="eyebrow">Répertoire</div>
        <h1>Toutes tes recettes, au même format.</h1>
        <p className="muted">Une fiche par préparation. Plusieurs versions peuvent vivre dans la même fiche.</p>
      </header>

      <div className="recipeToolbar">
        <input className="input" placeholder="Rechercher une recette, un ingrédient, une catégorie…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <select className="select" value={category} onChange={(e) => setCategory(e.target.value)}>
          {categories.map((c) => <option key={c}>{c}</option>)}
        </select>
      </div>

      {loading ? <p className="muted">Chargement…</p> : null}
      {!loading && filtered.length === 0 ? <div className="card">Aucune recette trouvée.</div> : null}

      <div className="recipeGrid">
        {filtered.map((recipe) => (
          <article className="card recipeCard" key={recipe.id} onClick={() => setOpen(open === recipe.id ? null : recipe.id)}>
            <span className="badge">{recipe.category}</span>
            <h3>{recipe.canonical_name}</h3>
            <p className="muted">{recipe.recipe_versions?.length || 0} version{recipe.recipe_versions?.length === 1 ? '' : 's'}</p>
            {open === recipe.id ? (
              <div onClick={(e) => e.stopPropagation()}>
                {(recipe.recipe_versions || []).map((version) => (
                  <div className="version" key={version.id}>
                    <h4>{version.version_label}</h4>
                    <p className="muted">
                      Source : {version.source_name || version.source_file_name || version.source_url || version.source_type}
                      {version.servings ? ` · Rendement : ${version.servings}` : ''}
                    </p>
                    <div className="columns">
                      <div>
                        <strong>Ingrédients</strong>
                        <ul>
                          {(version.ingredients || []).map((i, index) => (
                            <li key={index}>{[i.quantity, i.unit, i.item].filter(Boolean).join(' ')}{i.note ? ` · ${i.note}` : ''}</li>
                          ))}
                        </ul>
                      </div>
                      <div>
                        <strong>Étapes</strong>
                        <ol>
                          {(version.steps || []).sort((a, b) => a.order - b.order).map((s, index) => <li key={index}>{s.instruction}</li>)}
                        </ol>
                      </div>
                    </div>
                    {version.temperatures?.length ? <p><strong>Températures :</strong> {version.temperatures.join(' · ')}</p> : null}
                    {version.allergens?.length ? <p><strong>Allergènes :</strong> {version.allergens.join(', ')}</p> : null}
                    {version.notes ? <p><strong>Notes :</strong> {version.notes}</p> : null}
                  </div>
                ))}
              </div>
            ) : null}
          </article>
        ))}
      </div>
    </section>
  )
}
