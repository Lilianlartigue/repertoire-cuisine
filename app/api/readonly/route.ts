import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

export const runtime = 'nodejs'

function cleanTerms(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .split(/[^a-z0-9œ]+/)
    .map((term) => term.trim())
    .filter((term) => term.length >= 2)
    .slice(0, 6)
}

export async function GET(request: NextRequest) {
  try {
    const q = String(request.nextUrl.searchParams.get('q') || '').trim()
    const limit = Math.min(8, Math.max(1, Number(request.nextUrl.searchParams.get('limit') || 5)))

    if (q.length < 2) {
      return NextResponse.json(
        { recipes: [], error: 'Recherche trop courte.' },
        { status: 400 }
      )
    }

    const terms = cleanTerms(q)
    if (!terms.length) {
      return NextResponse.json({ recipes: [] })
    }

    const db = getDb()

    const conditions: string[] = []
    const values: string[] = []

    terms.forEach((term, index) => {
      const p = index + 1
      values.push('%' + term + '%')
      conditions.push(`
        (
          lower(unaccent(g.canonical_name)) like $${p}
          or lower(unaccent(g.category)) like $${p}
          or lower(unaccent(array_to_string(g.tags, ' '))) like $${p}
          or exists (
            select 1
            from recipe_versions sx
            where sx.recipe_id = g.id
              and lower(unaccent(concat_ws(
                ' ',
                sx.ingredients::text,
                sx.steps::text,
                sx.notes,
                sx.dressage,
                sx.equipment::text,
                sx.temperatures::text
              ))) like $${p}
          )
        )
      `)
    })

    let result
    try {
      result = await db.query(
        `
          select
            g.id,
            g.canonical_name,
            g.category,
            g.tags,
            json_build_object(
              'id', v.id,
              'version_label', v.version_label,
              'servings', v.servings,
              'ingredients', v.ingredients,
              'equipment', v.equipment,
              'steps', v.steps,
              'times', v.times,
              'temperatures', v.temperatures,
              'allergens', v.allergens,
              'notes', v.notes,
              'dressage', v.dressage
            ) as version
          from recipe_groups g
          left join lateral (
            select rv.*
            from recipe_versions rv
            where rv.recipe_id = g.id
            order by
              (rv.id = g.preferred_version_id) desc,
              rv.created_at desc
            limit 1
          ) v on true
          where ${conditions.join(' or ')}
          order by
            case
              when lower(unaccent(g.canonical_name)) like $1 then 0
              else 1
            end,
            g.updated_at desc,
            g.canonical_name asc
          limit ${limit}
        `,
        values
      )
    } catch (error: any) {
      if (error?.code !== '42883') throw error

      result = await db.query(
        `
          select
            g.id,
            g.canonical_name,
            g.category,
            g.tags,
            json_build_object(
              'id', v.id,
              'version_label', v.version_label,
              'servings', v.servings,
              'ingredients', v.ingredients,
              'equipment', v.equipment,
              'steps', v.steps,
              'times', v.times,
              'temperatures', v.temperatures,
              'allergens', v.allergens,
              'notes', v.notes,
              'dressage', to_jsonb(v)->>'dressage'
            ) as version
          from recipe_groups g
          left join lateral (
            select rv.*
            from recipe_versions rv
            where rv.recipe_id = g.id
            order by
              (rv.id = g.preferred_version_id) desc,
              rv.created_at desc
            limit 1
          ) v on true
          where ${terms.map((_, index) => {
            const p = index + 1
            return `(
              lower(g.canonical_name) like $${p}
              or lower(g.category) like $${p}
              or lower(array_to_string(g.tags, ' ')) like $${p}
              or exists (
                select 1
                from recipe_versions sx
                where sx.recipe_id = g.id
                  and lower(concat_ws(
                    ' ',
                    sx.ingredients::text,
                    sx.steps::text,
                    sx.notes,
                    to_jsonb(sx)->>'dressage',
                    sx.equipment::text,
                    sx.temperatures::text
                  )) like $${p}
              )
            )`
          }).join(' or ')}
          order by g.updated_at desc, g.canonical_name asc
          limit ${limit}
        `,
        values
      )
    }

    const response = NextResponse.json({
      recipes: result.rows,
      readOnly: true
    })

    response.headers.set(
      'Cache-Control',
      'public, s-maxage=300, stale-while-revalidate=1800'
    )

    return response
  } catch (error: any) {
    return NextResponse.json(
      {
        recipes: [],
        readOnly: true,
        error: error?.message || 'Lecture du répertoire impossible.'
      },
      { status: 500 }
    )
  }
}
