import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getDb } from '@/lib/db'
import { canonicalKey } from '@/lib/cuisine'

export const runtime = 'nodejs'

const editSchema = z.object({
  recipeId: z.string().uuid(),
  versionId: z.string().uuid(),
  canonicalName: z.string().min(1),
  category: z.string().min(1),
  tags: z.array(z.string()).default([]),
  servings: z.string().nullable().optional(),
  ingredients: z.array(z.object({
    item: z.string().min(1),
    quantity: z.string().nullable().optional(),
    unit: z.string().nullable().optional(),
    note: z.string().nullable().optional(),
  })).default([]),
  equipment: z.array(z.string()).default([]),
  steps: z.array(z.object({
    order: z.number().int().positive(),
    instruction: z.string().min(1),
  })).default([]),
  times: z.object({
    preparation: z.string().nullable().optional(),
    cooking: z.string().nullable().optional(),
    resting: z.string().nullable().optional(),
    total: z.string().nullable().optional(),
  }).default({}),
  temperatures: z.array(z.string()).default([]),
  allergens: z.array(z.string()).default([]),
  notes: z.string().nullable().optional(),
})

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

export async function PATCH(request: NextRequest) {
  try {
    const body = editSchema.parse(await request.json())
    const db = getDb()

    const versionCheck = await db.query(
      'select id from recipe_versions where id = $1 and recipe_id = $2 limit 1',
      [body.versionId, body.recipeId]
    )
    if (!versionCheck.rows[0]) {
      return NextResponse.json({ error: 'Version introuvable' }, { status: 404 })
    }

    const key = canonicalKey(body.canonicalName)
    const duplicate = await db.query(
      'select id from recipe_groups where canonical_key = $1 and id <> $2 limit 1',
      [key, body.recipeId]
    )
    if (duplicate.rows[0]) {
      return NextResponse.json({ error: 'Une autre fiche utilise déjà ce nom.' }, { status: 409 })
    }

    await db.query(
      `update recipe_groups
       set canonical_name = $1, canonical_key = $2, category = $3, tags = $4, updated_at = now()
       where id = $5`,
      [body.canonicalName, key, body.category, body.tags, body.recipeId]
    )

    await db.query(
      `update recipe_versions
       set servings = $1,
           ingredients = $2::jsonb,
           equipment = $3::jsonb,
           steps = $4::jsonb,
           times = $5::jsonb,
           temperatures = $6::jsonb,
           allergens = $7,
           notes = $8
       where id = $9 and recipe_id = $10`,
      [
        body.servings || null,
        JSON.stringify(body.ingredients),
        JSON.stringify(body.equipment),
        JSON.stringify(body.steps),
        JSON.stringify(body.times),
        JSON.stringify(body.temperatures),
        body.allergens,
        body.notes || null,
        body.versionId,
        body.recipeId,
      ]
    )

    return NextResponse.json({ ok: true })
  } catch (error: any) {
    if (error?.name === 'ZodError') {
      return NextResponse.json({ error: 'Certains champs de la recette sont invalides.' }, { status: 422 })
    }
    return NextResponse.json({ error: error.message || 'Impossible de modifier la recette' }, { status: 500 })
  }
}
