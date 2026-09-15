import { createClient } from '@supabase/supabase-js'

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

export function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY manquant')
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  })
}

export async function saveImportedRecipes(
  recipes: ImportedRecipe[],
  source: { type: 'url' | 'pdf' | 'image' | 'manual'; name?: string; url?: string; fileName?: string }
) {
  const supabase = getSupabaseAdmin()
  const saved: Array<{ id: string; name: string; version: string; existing: boolean }> = []

  for (const recipe of recipes) {
    const key = canonicalKey(recipe.canonicalName || recipe.displayName)
    const { data: existing, error: findError } = await supabase
      .from('recipe_groups')
      .select('id, canonical_name')
      .eq('canonical_key', key)
      .maybeSingle()
    if (findError) throw findError

    let groupId = existing?.id as string | undefined
    const wasExisting = Boolean(groupId)

    if (!groupId) {
      const { data: created, error: createError } = await supabase
        .from('recipe_groups')
        .insert({
          canonical_key: key,
          canonical_name: recipe.displayName || recipe.canonicalName,
          category: recipe.category || 'Autres',
          tags: recipe.tags ?? [],
        })
        .select('id')
        .single()
      if (createError) throw createError
      groupId = created.id
    } else {
      await supabase
        .from('recipe_groups')
        .update({ category: recipe.category || 'Autres', tags: recipe.tags ?? [], updated_at: new Date().toISOString() })
        .eq('id', groupId)
    }

    const { count, error: countError } = await supabase
      .from('recipe_versions')
      .select('*', { count: 'exact', head: true })
      .eq('recipe_id', groupId)
    if (countError) throw countError

    const versionLabel = `Version ${(count ?? 0) + 1}`
    const { error: versionError } = await supabase.from('recipe_versions').insert({
      recipe_id: groupId,
      version_label: versionLabel,
      source_type: source.type,
      source_name: source.name ?? null,
      source_url: source.url ?? null,
      source_file_name: source.fileName ?? null,
      servings: recipe.servings ?? null,
      ingredients: recipe.ingredients ?? [],
      equipment: recipe.equipment ?? [],
      steps: recipe.steps ?? [],
      times: recipe.times ?? {},
      temperatures: recipe.temperatures ?? [],
      allergens: recipe.allergens ?? [],
      notes: recipe.notes ?? null,
      raw_excerpt: recipe.rawExcerpt ?? null,
    })
    if (versionError) throw versionError

    saved.push({ id: groupId, name: recipe.displayName || recipe.canonicalName, version: versionLabel, existing: wasExisting })
  }

  return saved
}
