import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { askGemini, recipeExtractionPrompt } from '@/lib/gemini'
import { saveImportedRecipes } from '@/lib/cuisine'

export const runtime = 'nodejs'

const recipeSchema = z.object({
  canonicalName: z.string().min(1),
  displayName: z.string().min(1),
  category: z.string().min(1),
  tags: z.array(z.string()).optional().default([]),
  servings: z.string().nullable().optional(),
  ingredients: z.array(z.object({
    item: z.string().min(1),
    quantity: z.string().nullable().optional(),
    unit: z.string().nullable().optional(),
    note: z.string().nullable().optional(),
  })).default([]),
  equipment: z.array(z.string()).optional().default([]),
  steps: z.array(z.object({ order: z.number(), instruction: z.string().min(1) })).default([]),
  times: z.object({
    preparation: z.string().nullable().optional(),
    cooking: z.string().nullable().optional(),
    resting: z.string().nullable().optional(),
    total: z.string().nullable().optional(),
  }).optional().default({}),
  temperatures: z.array(z.string()).optional().default([]),
  allergens: z.array(z.string()).optional().default([]),
  notes: z.string().nullable().optional(),
  rawExcerpt: z.string().nullable().optional(),
})

const payloadSchema = z.object({ recipes: z.array(recipeSchema).min(1) })

function cleanHtml(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<svg[\s\S]*?<\/svg>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
}

function isRecipeType(value: unknown): boolean {
  if (typeof value === 'string') return value.toLowerCase() === 'recipe'
  if (Array.isArray(value)) return value.some((item): boolean => isRecipeType(item))
  return false
}

function collectRecipeNodes(value: unknown, output: Record<string, unknown>[]): void {
  if (Array.isArray(value)) {
    for (const item of value) collectRecipeNodes(item, output)
    return
  }

  if (!value || typeof value !== 'object') return
  const object = value as Record<string, unknown>

  if (isRecipeType(object['@type'])) output.push(object)

  for (const nested of Object.values(object)) {
    if (nested && typeof nested === 'object') collectRecipeNodes(nested, output)
  }
}

function extractRecipeJsonLd(html: string): Record<string, unknown>[] {
  const recipes: Record<string, unknown>[] = []
  const scriptRegex = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  let match: RegExpExecArray | null

  while ((match = scriptRegex.exec(html)) !== null) {
    const raw = match[1]?.trim()
    if (!raw) continue

    try {
      const parsed = JSON.parse(raw)
      collectRecipeNodes(parsed, recipes)
    } catch {
      // Certains sites contiennent un JSON-LD non valide. On passe au bloc suivant.
    }
  }

  const unique = new Map<string, Record<string, unknown>>()
  for (const recipe of recipes) {
    const key = JSON.stringify([
      recipe.name ?? '',
      recipe.recipeIngredient ?? [],
      recipe.recipeInstructions ?? [],
    ])
    if (!unique.has(key)) unique.set(key, recipe)
  }

  return Array.from(unique.values()).slice(0, 8)
}

function assertPublicUrl(value: string) {
  const url = new URL(value)
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Adresse non autorisée')
  const host = url.hostname.toLowerCase()
  const blocked = host === 'localhost' || host === '0.0.0.0' || host === '::1' || host.startsWith('127.') || host.startsWith('10.') || host.startsWith('192.168.') || host.startsWith('169.254.')
  if (blocked) throw new Error('Adresse non autorisée')
  return url
}

async function parseAiJson(parts: any[]) {
  const raw = await askGemini(parts, true)
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    const match = raw.match(/\{[\s\S]*\}/)
    if (!match) throw new Error('L’IA n’a pas renvoyé de fiche exploitable')
    parsed = JSON.parse(match[0])
  }
  return payloadSchema.parse(parsed)
}

export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get('content-type') || ''

    if (contentType.includes('multipart/form-data')) {
      const form = await request.formData()
      const file = form.get('file')
      if (!(file instanceof File)) return NextResponse.json({ error: 'Fichier manquant' }, { status: 400 })
      if (file.size > 18 * 1024 * 1024) return NextResponse.json({ error: 'Fichier trop volumineux (18 Mo maximum)' }, { status: 413 })

      const allowed = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
      if (!allowed.includes(file.type)) return NextResponse.json({ error: 'Format de fichier non pris en charge' }, { status: 415 })

      const bytes = Buffer.from(await file.arrayBuffer())
      const base64 = bytes.toString('base64')
      const sourceType = file.type === 'application/pdf' ? 'pdf' : 'image'
      const prompt = recipeExtractionPrompt(`${sourceType.toUpperCase()} nommé ${file.name}. Analyse visuellement toutes les zones du document.`)
      const result = await parseAiJson([
        { text: prompt },
        { inlineData: { mimeType: file.type, data: base64 } },
      ])

      const saved = await saveImportedRecipes(result.recipes, {
        type: sourceType,
        name: file.name,
        fileName: file.name,
      })
      return NextResponse.json({ detected: result.recipes.length, saved })
    }

    const body = await request.json()

    if (body.manual) {
      const recipe = recipeSchema.parse(body.manual)
      const saved = await saveImportedRecipes([recipe], {
        type: 'manual',
        name: 'Ajout manuel',
      })
      return NextResponse.json({ detected: 1, saved })
    }

    if (!body.url) return NextResponse.json({ error: 'URL manquante' }, { status: 400 })
    const url = assertPublicUrl(body.url)
    const page = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124.0 Safari/537.36',
        'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8',
      },
      cache: 'no-store',
      redirect: 'follow',
      signal: AbortSignal.timeout(15000),
    })
    if (!page.ok) throw new Error(`Impossible de lire le site (${page.status})`)

    const html = await page.text()
    const structuredRecipes = extractRecipeJsonLd(html)

    let sourceForAi: string
    let extractionMethod: 'json-ld' | 'text'

    if (structuredRecipes.length) {
      extractionMethod = 'json-ld'
      sourceForAi = `Page web ${url.toString()}.
Le site fournit des données structurées Schema.org Recipe. Utilise-les en priorité et n'invente rien qui n'y figure pas.

Données Recipe :\n${JSON.stringify(structuredRecipes).slice(0, 60000)}`
    } else {
      extractionMethod = 'text'
      const text = cleanHtml(html).slice(0, 65000)
      if (text.length < 80) throw new Error('Le site ne contient pas assez de texte exploitable')
      sourceForAi = `Page web ${url.toString()}.
Aucune donnée Recipe structurée exploitable n'a été trouvée. Analyse le contenu textuel ci-dessous et ignore menus, publicité, newsletter et navigation.\n\n${text}`
    }

    const prompt = recipeExtractionPrompt(sourceForAi)
    const result = await parseAiJson([{ text: prompt }])
    const saved = await saveImportedRecipes(result.recipes, {
      type: 'url',
      name: url.hostname,
      url: url.toString(),
    })

    return NextResponse.json({
      detected: result.recipes.length,
      saved,
      extractionMethod,
    })
  } catch (error: any) {
    if (error?.name === 'ZodError') {
      return NextResponse.json({ error: 'La fiche est incomplète. Vérifie le nom, la catégorie, les ingrédients et les étapes.' }, { status: 422 })
    }
    return NextResponse.json({ error: error.message || 'Erreur pendant l’import' }, { status: 500 })
  }
}
