import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

export const runtime = 'nodejs'

export async function GET() {
  try {
    const db = getDb()
    const result = await db.query(`
      select
        g.id,
        g.canonical_name,
        g.category,
        g.tags,
        g.updated_at,
        coalesce(
          json_agg(
            json_build_object(
              'id', v.id,
              'recipe_id', v.recipe_id,
              'version_label', v.version_label,
              'source_type', v.source_type,
              'source_name', v.source_name,
              'source_url', v.source_url,
              'source_file_name', v.source_file_name,
              'servings', v.servings,
              'ingredients', v.ingredients,
              'equipment', v.equipment,
              'steps', v.steps,
              'times', v.times,
              'temperatures', v.temperatures,
              'allergens', v.allergens,
              'notes', v.notes,
              'raw_excerpt', v.raw_excerpt,
              'created_at', v.created_at
            ) order by v.created_at asc
          ) filter (where v.id is not null),
          '[]'::json
        ) as recipe_versions
      from recipe_groups g
      left join recipe_versions v on v.recipe_id = g.id
      group by g.id
      order by g.canonical_name asc
    `)

    return NextResponse.json({ recipes: result.rows })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Erreur répertoire', recipes: [] }, { status: 500 })
  }
}
