import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/cuisine'

export const runtime = 'nodejs'

export async function GET() {
  try {
    const supabase = getSupabaseAdmin()
    const { data, error } = await supabase
      .from('recipe_groups')
      .select('id, canonical_name, category, tags, updated_at, recipe_versions(*)')
      .order('canonical_name', { ascending: true })
    if (error) throw error

    const recipes = (data || []).map((recipe: any) => ({
      ...recipe,
      recipe_versions: (recipe.recipe_versions || []).sort(
        (a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      ),
    }))

    return NextResponse.json({ recipes })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Erreur répertoire', recipes: [] }, { status: 500 })
  }
}
