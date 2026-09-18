import { getDb } from '@/lib/db'
import { normalizeCuisineCategory } from '@/lib/categories'

export type ImportedRecipe = {
  canonicalName: string
  displayName: string
  category: string
  tags?: string[]
  servings?: string | null
  ingredients: Array<{ item: string; quantity?: string | null; unit?: string | null; note?: string | null }>
  equipment?: string[]
  steps: Array<{ order: number; instruction: string }>
  times?: { preparation?: string | null; cooking?: string | null; resting?: string | null; total?: string | null }
  temperatures?: string[]
  allergens?: string[]
  notes?: string | null
  rawExcerpt?: string | null
}

export function canonicalKey(name: string) {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/œ/g, 'oe')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, '-')
}

export async function saveImportedRecipes(
  recipes: ImportedRecipe[],
  source: { type: 'url' | 'pdf' | 'image' | 'manual'; name?: string; url?: string; fileName?: string }
) {
  const db = getDb()
  const saved: Array<{ id: string; name: string; version: string; existing: boolean }> = []

  for (const recipe of recipes) {
    const category = normalizeCuisineCategory(recipe.category, recipe.displayName || recipe.canonicalName)
    const key = canonicalKey(recipe.canonicalName || recipe.displayName)

    const existingResult = await db.query(
      'select id, canonical_name from recipe_groups where canonical_key = $1 limit 1',
      [key]
    )

    let groupId = existingResult.rows[0]?.id as string | undefined
    const wasExisting = Boolean(groupId)

    if (!groupId) {
      const created = await db.query(
        `insert into recipe_groups (canonical_key, canonical_name, category, tags)
         values ($1, $2, $3, $4)
         returning id`,
        [
          key,
          recipe.displayName || recipe.canonicalName,
          category,
          recipe.tags ?? [],
        ]
      )
      groupId = created.rows[0]?.id
    } else {
      await db.query(
        `update recipe_groups
         set category = $1, tags = $2, updated_at = now()
         where id = $3`,
        [category, recipe.tags ?? [], groupId]
      )
    }

    if (!groupId) throw new Error('Impossible de créer la fiche recette')

    const countResult = await db.query(
      'select count(*)::int as count from recipe_versions where recipe_id = $1',
      [groupId]
    )
    const versionLabel = `Version ${Number(countResult.rows[0]?.count ?? 0) + 1}`

    await db.query(
      `insert into recipe_versions (
        recipe_id, version_label, source_type, source_name, source_url, source_file_name,
        servings, ingredients, equipment, steps, times, temperatures, allergens, notes, raw_excerpt
      ) values (
        $1, $2, $3, $4, $5, $6,
        $7, $8::jsonb, $9::jsonb, $10::jsonb, $11::jsonb, $12::jsonb, $13, $14, $15
      )`,
      [
        groupId,
        versionLabel,
        source.type,
        source.name ?? null,
        source.url ?? null,
        source.fileName ?? null,
        recipe.servings ?? null,
        JSON.stringify(recipe.ingredients ?? []),
        JSON.stringify(recipe.equipment ?? []),
        JSON.stringify(recipe.steps ?? []),
        JSON.stringify(recipe.times ?? {}),
        JSON.stringify(recipe.temperatures ?? []),
        recipe.allergens ?? [],
        recipe.notes ?? null,
        recipe.rawExcerpt ?? null,
      ]
    )

    saved.push({
      id: groupId,
      name: recipe.displayName || recipe.canonicalName,
      version: versionLabel,
      existing: wasExisting,
    })
  }

  return saved
}
