import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function normalize(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
}

function asksForList(question: string) {
  const q = normalize(question)
  return /(liste|combien|quelles recettes|recettes enregistrees|recettes sauvegardees)/.test(q) &&
    /(recette|repertoire|enregistr|sauvegard)/.test(q)
}

function needsLibrary(question: string) {
  return /(recett|repertoire|version|enregistr|sauvegard)/.test(normalize(question))
}

async function getLibraryContext(question: string) {
  const db = getDb()
  const result = await db.query(
    'select id, canonical_name, category, tags from recipe_groups order by canonical_name limit 200'
  )
  const rows = result.rows as Array<{id: string, canonical_name: string, category: string, tags: string[]}>
  const q = normalize(question)
  const matches = rows.filter((row) => {
    const name = normalize(row.canonical_name)
    return name.length > 3 && (q.includes(name) || name.split(/\s+/).filter((word) => word.length > 3).every((word) => q.includes(word)))
  }).slice(0, 4)

  if (matches.length) {
    const sql = 'select g.canonical_name, g.category, g.tags, v.servings, v.ingredients, v.steps, v.notes, v.dressage ' +
      'from recipe_groups g left join lateral (' +
      'select * from recipe_versions rv where rv.recipe_id = g.id ' +
      'order by (rv.id = g.preferred_version_id) desc, rv.created_at asc limit 1' +
      ') v on true where g.id = any($1::uuid[])'
    const details = await db.query(sql, [matches.map((row) => row.id)]).catch(async (error: any) => {
      if (error?.code !== '42703') throw error
      return db.query(
        'select g.canonical_name, g.category, g.tags, v.servings, v.ingredients, v.steps, v.notes ' +
        'from recipe_groups g left join lateral (' +
        'select * from recipe_versions rv where rv.recipe_id = g.id order by rv.created_at asc limit 1' +
        ') v on true where g.id = any($1::uuid[])',
        [matches.map((row) => row.id)]
      )
    })
    return JSON.stringify(details.rows).slice(0, 12000)
  }

  if (/(mon|mes|repertoire|enregistr|sauvegard)/.test(q)) {
    return 'Recettes présentes (noms uniquement) : ' +
      rows.slice(0, 80).map((row) => row.canonical_name).join(', ')
  }
  return ''
}

async function openGeminiStream(prompt: string) {
  const key = process.env.GEMINI_API_KEY
  if (!key) throw new Error('Clé Gemini manquante dans la configuration du site.')
  const models = [...new Set([
    process.env.GEMINI_ASSISTANT_MODEL || 'gemini-3.5-flash-lite',
    process.env.GEMINI_MODEL || 'gemini-3.8-flash',
  ])]
  let lastError = 'Service IA indisponible.'

  for (const model of models) {
    try {
      const response = await fetch(
        'https://generativelanguage.googleapis.com/v1beta/models/' +
          encodeURIComponent(model) + ':streamGenerateContent?alt=sse',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: { maxOutputTokens: 1100, temperature: 0.55 },
          }),
          signal: AbortSignal.timeout(18000),
          cache: 'no-store',
        }
      )
      if (!response.ok) {
        const error = await response.json().catch(() => ({}))
        lastError = error?.error?.message || 'Gemini ' + response.status
        continue
      }
      if (response.body) return response.body
    } catch (error: any) {
      lastError = error?.name === 'TimeoutError' ? 'Délai de réponse dépassé.' : (error?.message || lastError)
    }
  }
  throw new Error(lastError)
}

function streamText(source: ReadableStream<Uint8Array>) {
  const encoder = new TextEncoder()
  const decoder = new TextDecoder()
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const reader = source.getReader()
      let buffer = ''
      let hasText = false
      function consume(event: string) {
        const payload = event.split(/\r?\n/).filter((line) => line.startsWith('data:'))
          .map((line) => line.slice(5).trim()).join('\n')
        if (!payload || payload === '[DONE]') return
        let data: any
        try { data = JSON.parse(payload) } catch { return }
        const parts = data?.candidates?.[0]?.content?.parts || []
        for (const part of parts) {
          if (typeof part.text === 'string' && !part.thought) {
            controller.enqueue(encoder.encode(part.text))
            hasText = true
          }
        }
      }
      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          const chunks = buffer.split(/\r?\n\r?\n/)
          buffer = chunks.pop() || ''
          for (const chunk of chunks) consume(chunk)
        }
        buffer += decoder.decode()
        if (buffer.trim()) consume(buffer)
        if (!hasText) throw new Error('La réponse du modèle est vide.')
        controller.close()
      } catch (error) {
        controller.error(error)
      } finally {
        reader.releaseLock()
      }
    },
  })
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const question = typeof body?.question === 'string' ? body.question.trim().slice(0, 1500) : ''
    if (!question) return NextResponse.json({ error: 'Question vide' }, { status: 400 })

    if (asksForList(question)) {
      const result = await getDb().query(
        'select g.canonical_name, g.category, count(v.id)::int as versions ' +
        'from recipe_groups g left join recipe_versions v on v.recipe_id = g.id ' +
        'group by g.id order by g.canonical_name limit 200'
      )
      const lines = result.rows.map((r: any) =>
        '• ' + r.canonical_name + ' · ' + r.category + ' · ' + r.versions + ' version(s)'
      )
      return NextResponse.json({
        answer: lines.length
          ? 'Voici ' + lines.length + ' recettes enregistrées :\n\n' + lines.join('\n')
          : 'Aucune recette enregistrée pour le moment.',
      })
    }

    // Les questions générales ne déclenchent plus le chargement de toute la base.
    let context = ''
    if (needsLibrary(question)) {
      try { context = await getLibraryContext(question) }
      catch { context = 'Répertoire momentanément inaccessible. Ne prétends pas avoir consulté les recettes.' }
    }

    const history = Array.isArray(body?.history) ? body.history.slice(-6)
      .filter((m: any) => (m?.role === 'user' || m?.role === 'ai') && typeof m.text === 'string')
      .map((m: any) => (m.role === 'user' ? 'Utilisateur' : 'Assistant') + ' : ' + m.text.slice(0, 700))
      .join('\n') : ''

    const prompt = [
      "Tu es l'assistant d'un répertoire de cuisine et pâtisserie professionnelle.",
      'Réponds en français, directement, avec précision et concision.',
      'Propose des associations de saveurs créatives mais cohérentes et des conseils techniques fiables.',
      'Si une recette est demandée, donne les quantités, les étapes et les températures utiles.',
      "Utilise la recette du répertoire uniquement si elle est fournie ci-dessous.",
      "Ne prétends jamais avoir consulté une recette qui n'est pas fournie.",
      context ? '\nRépertoire pertinent :\n' + context : '',
      history ? '\nHistorique récent :\n' + history : '',
      'Utilisateur : ' + question,
      'Assistant :'
    ].filter(Boolean).join('\n')

    const source = await openGeminiStream(prompt)
    return new Response(streamText(source), {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-store, no-transform',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch (error: any) {
    const message = error?.message || 'Erreur assistant'
    return NextResponse.json({ error: message }, { status: /manquante/.test(message) ? 503 : 500 })
  }
}
