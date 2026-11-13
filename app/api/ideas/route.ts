import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getDb } from '@/lib/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const ideaSchema = z.object({
  type: z.enum(['photo', 'association']),
  title: z.string().trim().min(1).max(140),
  description: z.string().max(10000).default(''),
  flavors: z.string().max(500).default(''),
  tags: z.array(z.string().trim().max(45)).max(20).default([]),
  image_data: z.string().max(1600000).nullable().optional(),
})

const idSchema = z.string().uuid()
let initialization: Promise<void> | null = null

function ensureTable() {
  if (!initialization) {
    initialization = (async () => {
      const db = getDb()
      await db.query(
        'create table if not exists culinary_ideas (' +
        'id uuid primary key default gen_random_uuid(), ' +
        "type text not null check (type in ('photo','association')), " +
        'title text not null, description text not null default \'\', ' +
        'flavors text not null default \'\', tags text[] not null default \'{}\', ' +
        'image_data text, created_at timestamptz not null default now(), ' +
        'updated_at timestamptz not null default now())'
      )
      await db.query('create index if not exists culinary_ideas_updated_idx on culinary_ideas(updated_at desc)')
    })().catch((error) => {
      initialization = null
      throw error
    })
  }
  return initialization
}

function validatedImage(image: string | null | undefined) {
  if (!image) return image || null
  if (!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(image)) {
    throw new Error('Image non prise en charge. Utilise une photo JPEG, PNG ou WebP.')
  }
  return image
}

function errorResponse(error: any) {
  if (error?.name === 'ZodError') {
    return NextResponse.json({ error: 'Certains champs sont invalides ou la photo est trop lourde.' }, { status: 422 })
  }
  if (error?.message?.startsWith('Image non')) {
    return NextResponse.json({ error: error.message }, { status: 422 })
  }
  return NextResponse.json({
    error: 'Impossible de contacter les idées enregistrées. Vérifie la connexion Neon et réessaie.',
  }, { status: 500 })
}

export async function GET() {
  try {
    await ensureTable()
    const result = await getDb().query(
      'select id, type, title, description, flavors, tags, image_data, created_at, updated_at ' +
      'from culinary_ideas order by updated_at desc limit 200'
    )
    return NextResponse.json({ ideas: result.rows }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    return errorResponse(error)
  }
}

export async function POST(request: NextRequest) {
  try {
    const idea = ideaSchema.parse(await request.json())
    const image = validatedImage(idea.image_data)
    await ensureTable()
    const result = await getDb().query(
      'insert into culinary_ideas (type, title, description, flavors, tags, image_data) ' +
      'values ($1, $2, $3, $4, $5, $6) returning *',
      [idea.type, idea.title, idea.description, idea.flavors, idea.tags, image]
    )
    return NextResponse.json({ idea: result.rows[0] }, { status: 201 })
  } catch (error) {
    return errorResponse(error)
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json()
    const id = idSchema.parse(body?.id)
    const idea = ideaSchema.parse(body)
    const image = validatedImage(idea.image_data)
    await ensureTable()
    const result = await getDb().query(
      'update culinary_ideas set type=$1, title=$2, description=$3, flavors=$4, ' +
      'tags=$5, image_data=$6, updated_at=now() where id=$7 returning *',
      [idea.type, idea.title, idea.description, idea.flavors, idea.tags, image, id]
    )
    if (!result.rows[0]) return NextResponse.json({ error: 'Idée introuvable.' }, { status: 404 })
    return NextResponse.json({ idea: result.rows[0] })
  } catch (error) {
    return errorResponse(error)
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json()
    const id = idSchema.parse(body?.id)
    await ensureTable()
    const result = await getDb().query('delete from culinary_ideas where id=$1 returning id', [id])
    if (!result.rows[0]) return NextResponse.json({ error: 'Idée introuvable.' }, { status: 404 })
    return NextResponse.json({ ok: true })
  } catch (error) {
    return errorResponse(error)
  }
}
