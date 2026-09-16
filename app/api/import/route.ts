import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { askGemini, recipeExtractionPrompt } from '@/lib/gemini'
import { saveImportedRecipes, type ImportedRecipe } from '@/lib/cuisine'

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
      collectRecipeNodes(JSON.parse(raw), recipes)
    } catch {
      // Bloc JSON-LD invalide : on ignore ce bloc.
    }
  }

  const unique = new Map<string, Record<string, unknown>>()
  for (const recipe of recipes) {
    if (!recipe.name || !recipe.recipeIngredient || !recipe.recipeInstructions) continue
    const key = JSON.stringify([recipe.name, recipe.recipeIngredient, recipe.recipeInstructions])
    if (!unique.has(key)) unique.set(key, recipe)
  }
  return Array.from(unique.values()).slice(0, 8)
}

function toText(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) return value.trim()
  if (typeof value === 'number') return String(value)
  return null
}

function durationLabel(value: unknown): string | null {
  const text = toText(value)
  if (!text) return null
  const match = text.match(/^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/i)
  if (!match) return text
  const parts: string[] = []
  if (match[1]) parts.push(`${match[1]} j`)
  if (match[2]) parts.push(`${match[2]} h`)
  if (match[3]) parts.push(`${match[3]} min`)
  if (match[4]) parts.push(`${match[4]} s`)
  return parts.join(' ') || null
}

function flattenInstructions(value: unknown, output: string[]): void {
  if (typeof value === 'string') {
    if (value.trim()) output.push(value.trim())
    return
  }
  if (Array.isArray(value)) {
    for (const item of value) flattenInstructions(item, output)
    return
  }
  if (!value || typeof value !== 'object') return
  const object = value as Record<string, unknown>
  const text = toText(object.text) || toText(object.name)
  if (text) output.push(text)
  if (object.itemListElement) flattenInstructions(object.itemListElement, output)
}

function pickCategory(node: Record<string, unknown>, name: string): string {
  const raw = [node.recipeCategory, node.recipeCuisine, node.keywords]
    .flatMap((value) => Array.isArray(value) ? value : [value])
    .map((value) => toText(value)?.toLowerCase() || '')
    .join(' ')
  const haystack = `${name.toLowerCase()} ${raw}`
  if (haystack.includes('crème')) return 'Crèmes'
  if (haystack.includes('dessert') || haystack.includes('pâtiss')) return 'Desserts'
  if (haystack.includes('sauce')) return 'Sauces'
  if (haystack.includes('boulanger') || haystack.includes('pain') || haystack.includes('brioche')) return 'Boulangerie'
  return 'Autres'
}

function structuredRecipeToImported(node: Record<string, unknown>): ImportedRecipe | null {
  const name = toText(node.name)
  if (!name) return null

  const ingredientValues = Array.isArray(node.recipeIngredient) ? node.recipeIngredient : []
  const ingredients = ingredientValues
    .map((value) => toText(value))
    .filter((value): value is string => Boolean(value))
    .map((line) => ({ item: line, quantity: null, unit: null, note: null }))

  const instructionTexts: string[] = []
  flattenInstructions(node.recipeInstructions, instructionTexts)
  const steps = instructionTexts.map((instruction, index) => ({ order: index + 1, instruction }))

  if (!ingredients.length || !steps.length) return null

  const keywords = Array.isArray(node.keywords)
    ? node.keywords.map((value) => toText(value)).filter((value): value is string => Boolean(value))
    : (toText(node.keywords)?.split(',').map((value) => value.trim()).filter(Boolean) ?? [])

  const yieldValue = Array.isArray(node.recipeYield)
    ? node.recipeYield.map((value) => toText(value)).filter(Boolean).join(' / ')
    : toText(node.recipeYield)

  const description = toText(node.description)

  return {
    canonicalName: name,
    displayName: name,
    category: pickCategory(node, name),
    tags: keywords.slice(0, 12),
    servings: yieldValue || null,
    ingredients,
    equipment: [],
    steps,
    times: {
      preparation: durationLabel(node.prepTime),
      cooking: durationLabel(node.cookTime),
      total: durationLabel(node.totalTime),
    },
    temperatures: [],
    allergens: [],
    notes: description,
    rawExcerpt: JSON.stringify(node).slice(0, 12000),
  }
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
      const saved = await saveImportedRecipes([recipe], { type: 'manual', name: 'Ajout manuel' })
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
      .map(structuredRecipeToImported)
      .filter((recipe): recipe is ImportedRecipe => Boolean(recipe))

    if (structuredRecipes.length) {
      const saved = await saveImportedRecipes(structuredRecipes, {
        type: 'url',
        name: url.hostname,
        url: url.toString(),
      })
      return NextResponse.json({ detected: structuredRecipes.length, saved, extractionMethod: 'json-ld-direct' })
    }

    const text = cleanHtml(html).slice(0, 65000)
    if (text.length < 80) throw new Error('Le site ne contient pas assez de texte exploitable')

    const prompt = recipeExtractionPrompt(`Page web ${url.toString()}.
Analyse le contenu textuel ci-dessous. Ignore menus, publicité, newsletter et navigation.\n\n${text}`)
    const result = await parseAiJson([{ text: prompt }])
    const saved = await saveImportedRecipes(result.recipes, {
      type: 'url',
      name: url.hostname,
      url: url.toString(),
    })

    return NextResponse.json({ detected: result.recipes.length, saved, extractionMethod: 'text-ai' })
  } catch (error: any) {
    if (error?.name === 'ZodError') {
      return NextResponse.json({ error: 'La fiche est incomplète. Vérifie le nom, la catégorie, les ingrédients et les étapes.' }, { status: 422 })
    }
    return NextResponse.json({ error: error.message || 'Erreur pendant l’import' }, { status: 500 })
  }
}
