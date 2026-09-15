import { NextRequest, NextResponse } from 'next/server'
import { askGemini } from '@/lib/gemini'
import { getSupabaseAdmin } from '@/lib/cuisine'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  try {
    const { question } = await request.json()
    if (!question?.trim()) return NextResponse.json({ error: 'Question vide' }, { status: 400 })

    let libraryContext = 'Le répertoire est vide pour le moment.'
    try {
      const supabase = getSupabaseAdmin()
      const { data } = await supabase
        .from('recipe_groups')
        .select('canonical_name, category, tags, recipe_versions(version_label, servings, ingredients, steps, notes)')
        .order('updated_at', { ascending: false })
        .limit(60)
      if (data?.length) libraryContext = JSON.stringify(data)
    } catch {
      // L'assistant reste utilisable même avant la configuration de Supabase.
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
