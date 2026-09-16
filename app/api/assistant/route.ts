import { NextRequest, NextResponse } from 'next/server'
import { askGemini } from '@/lib/gemini'
import { getDb } from '@/lib/db'

export const runtime = 'nodejs'

function normalizeQuestion(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

function isRecipeListQuestion(question: string) {
  const q = normalizeQuestion(question)
  return (
    q.includes('quelles recettes') ||
    q.includes('quelle recette') && q.includes('enregistr') ||
    q.includes('liste des recettes') ||
    q.includes('liste mes recettes') ||
    q.includes('recettes enregistrees') ||
    q.includes('recettes sauvegardees') ||
    q.includes('recettes dans le repertoire') ||
    q.includes('recettes dans mon repertoire') ||
    q.includes('combien de recettes')
  )
}

export async function POST(request: NextRequest) {
  try {
    const { question } = await request.json()
    if (!question?.trim()) return NextResponse.json({ error: 'Question vide' }, { status: 400 })

    let libraryContext = 'Le répertoire est vide pour le moment.'
    let libraryRows: any[] = []

    try {
      const db = getDb()
      const result = await db.query(`
        select
          g.canonical_name,
          g.category,
          g.tags,
          coalesce(
            json_agg(
              json_build_object(
                'version_label', v.version_label,
                'servings', v.servings,
                'ingredients', v.ingredients,
                'steps', v.steps,
                'notes', v.notes
              ) order by v.created_at asc
            ) filter (where v.id is not null),
            '[]'::json
          ) as recipe_versions
        from recipe_groups g
        left join recipe_versions v on v.recipe_id = g.id
        group by g.id
        order by g.canonical_name asc
        limit 200
      `)

      libraryRows = result.rows
      if (libraryRows.length) libraryContext = JSON.stringify(libraryRows)
    } catch {
      // L'assistant reste utilisable même si Neon est temporairement indisponible.
    }

    if (isRecipeListQuestion(question)) {
      if (!libraryRows.length) {
        return NextResponse.json({ answer: 'Aucune recette n’est enregistrée dans ton répertoire pour le moment.' })
      }

      const lines = libraryRows.map((recipe) => {
        const versions = Array.isArray(recipe.recipe_versions) ? recipe.recipe_versions.length : 0
        const versionText = `${versions} version${versions === 1 ? '' : 's'}`
        return `• ${recipe.canonical_name} — ${recipe.category} — ${versionText}`
      })

      return NextResponse.json({
        answer: `Tu as ${libraryRows.length} recette${libraryRows.length === 1 ? '' : 's'} enregistrée${libraryRows.length === 1 ? '' : 's'} :\n\n${lines.join('\n')}`,
      })
    }

    const prompt = `Tu es un assistant culinaire professionnel, précis et concis.
Tu aides pour les idées, associations de saveurs, techniques et recettes.

Règles de réponse :
- Pour une idée, association ou question technique : réponds en quelques phrases, directement.
- Si l'utilisateur demande explicitement une recette, donne une recette exploitable avec ingrédients puis étapes.
- Si une recette du répertoire correspond à la demande, privilégie cette recette et précise qu'elle vient du répertoire.
- N'invente pas qu'une recette est dans le répertoire si elle n'est pas dans le contexte.
- Utilise des unités de cuisine claires et des températures en °C.

Extrait du répertoire personnel :
${libraryContext}

Question : ${question}`

    const answer = await askGemini([{ text: prompt }])
    return NextResponse.json({ answer })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Erreur assistant' }, { status: 500 })
  }
}
