import { NextRequest, NextResponse } from 'next/server'
import { AiError, askGemini } from '@/lib/gemini'
import { getDb } from '@/lib/db'
import { libraryContextForQuestion } from '@/lib/assistant-context'

export const runtime = 'nodejs'
export const maxDuration = 60

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
    /quelles recettes (ai|as|sont|j.ai|tu as)/.test(q) ||
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

async function readLibrary(db: any) {
  try {
    return await db.query({ query_timeout: 5000, text: `
      select
        g.canonical_name,
        g.category,
        g.tags,
        g.preferred_version_id,
        coalesce(
          json_agg(
            json_build_object(
              'id', v.id,
              'version_label', v.version_label,
              'preferred', v.id = g.preferred_version_id,
              'servings', v.servings,
              'ingredients', v.ingredients,
              'steps', v.steps,
              'notes', v.notes
            ) order by (v.id = g.preferred_version_id) desc, v.created_at asc
          ) filter (where v.id is not null),
          '[]'::json
        ) as recipe_versions
      from recipe_groups g
      left join recipe_versions v on v.recipe_id = g.id
      group by g.id
      order by g.canonical_name asc
      limit 200
    ` })
  } catch (error: any) {
    if (error?.code !== '42703') throw error
    return db.query({ query_timeout: 5000, text: `
      select
        g.canonical_name,
        g.category,
        g.tags,
        null::uuid as preferred_version_id,
        coalesce(
          json_agg(
            json_build_object(
              'id', v.id,
              'version_label', v.version_label,
              'preferred', false,
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
    ` })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null)
    const question = body?.question
    if (typeof question !== 'string' || !question.trim()) return NextResponse.json({ error: 'Écris une question pour l’assistant.' }, { status: 400 })
    if (question.length > 4000) return NextResponse.json({ error: 'Ta question est trop longue (4 000 caractères maximum).' }, { status: 400 })

    let libraryContext = 'Le répertoire est temporairement inaccessible. Ne le présente pas comme vide et ne prétends pas avoir consulté ses recettes.'
    let libraryRows: any[] = []
    let libraryAvailable = false
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      const db = getDb()
      const listQuery = { query_timeout: 5000, text: `select g.canonical_name, g.category, count(v.id)::int as version_count
            from recipe_groups g left join recipe_versions v on v.recipe_id = g.id
            group by g.id order by g.canonical_name asc` }
      const query = isRecipeListQuestion(question) ? db.query(listQuery) : readLibrary(db)
      // Also bound connection acquisition; query_timeout alone covers only execution.
      const result: any = await Promise.race([query, new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('LIBRARY_TIMEOUT')), 5500)
      })])
      libraryRows = result.rows
      libraryAvailable = true
      libraryContext = libraryContextForQuestion(libraryRows, question)
    } catch {
      console.warn('assistant_library_unavailable')
    } finally {
      if (timer) clearTimeout(timer)
    }

    if (isRecipeListQuestion(question)) {
      if (!libraryAvailable) return NextResponse.json({ error: 'Ton répertoire est temporairement inaccessible. Réessaie dans un instant.', code: 'LIBRARY_UNAVAILABLE' }, { status: 503 })
      if (!libraryRows.length) {
        return NextResponse.json({ answer: 'Aucune recette n’est enregistrée dans ton répertoire pour le moment.' })
      }

      const lines = libraryRows.map((recipe) => {
        const versions = recipe.version_count
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
- Quand une version a "preferred": true, utilise-la en priorité sur les autres versions de la même recette.
- N'invente pas qu'une recette est dans le répertoire si elle n'est pas dans le contexte.
- Utilise des unités de cuisine claires et des températures en °C.

Extrait du répertoire personnel :
${libraryContext}

Question : ${question}`

    const answer = await askGemini([{ text: prompt }], false, { signal: request.signal })
    return NextResponse.json({ answer, warning: libraryAvailable ? undefined : 'Répertoire inaccessible : cette réponse ne s’appuie pas sur tes recettes enregistrées.' })
  } catch (error: any) {
    if (error instanceof AiError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status })
    console.error('assistant_failed', { type: error?.name || 'UnknownError' })
    return NextResponse.json({ error: 'L’assistant a rencontré un problème. Réessaie dans un instant.' }, { status: 500 })
  }
}
