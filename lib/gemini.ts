import { CUISINE_CATEGORIES } from '@/lib/categories'

export class AiError extends Error {
  constructor(public code: string, message: string, public status = 503, public retryable = false) {
    super(message)
    this.name = 'AiError'
  }
}

type Options = { signal?: AbortSignal; timeoutMs?: number; attemptTimeoutMs?: number }

function httpError(status: number) {
  if (status === 401 || status === 403) return new AiError('AI_AUTH', 'La connexion au service IA doit être vérifiée par le propriétaire du site.')
  if (status === 404) return new AiError('AI_MODEL', 'Le modèle IA configuré est indisponible.')
  if (status === 429) return new AiError('AI_QUOTA', 'Le service IA a atteint sa limite de demandes. Réessaie un peu plus tard.', 429, true)
  if (status === 408 || status >= 500) return new AiError('AI_UNAVAILABLE', 'Le service IA est temporairement indisponible. Réessaie dans un instant.', 503, true)
  return new AiError('AI_REQUEST', 'Le service IA ne peut pas traiter cette demande. Essaie une question plus courte.', 422)
}

export async function askGemini(parts: any[], json = false, options: Options = {}) {
  const key = process.env.GEMINI_API_KEY
  if (!key) throw new AiError('AI_CONFIG', 'L’IA n’est pas encore configurée sur le site.')
  const primary = process.env.GEMINI_MODEL || 'gemini-3.8-flash'
  const fallback = process.env.GEMINI_FALLBACK_MODEL?.trim()
  const deadline = AbortSignal.timeout(options.timeoutMs ?? (json ? 90000 : 40000))
  const overall = options.signal ? AbortSignal.any([deadline, options.signal]) : deadline
  let model = primary

  // Two attempts total, including a possible fallback, within ONE time budget.
  for (let attempt = 0; attempt < 2; attempt++) {
    const started = Date.now()
    let retryAfter = 0
    try {
      overall.throwIfAborted()
      const signal = AbortSignal.any([overall, AbortSignal.timeout(options.attemptTimeoutMs ?? (json ? 45000 : 25000))])
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify({
          contents: [{ role: 'user', parts }],
          generationConfig: json ? { responseMimeType: 'application/json' } : {},
        }),
        signal,
      })
      if (!response.ok) {
        const value = response.headers.get('retry-after')
        retryAfter = value ? (/^\d+$/.test(value) ? Number(value) * 1000 : Math.max(0, Date.parse(value) - Date.now())) : 0
        await response.body?.cancel()
        throw httpError(response.status)
      }
      const data = await response.json()
      const candidate = data?.candidates?.[0]
      if (data?.promptFeedback?.blockReason || candidate?.finishReason === 'SAFETY') {
        throw new AiError('AI_BLOCKED', 'Le service IA n’a pas pu répondre à cette demande. Reformule ta question.', 422)
      }
      if (candidate?.finishReason && candidate.finishReason !== 'STOP') {
        throw new AiError('AI_INCOMPLETE', 'La réponse IA est incomplète. Essaie une demande plus ciblée.', 502)
      }
      const text = candidate?.content?.parts?.filter((part: any) => !part.thought).map((part: any) => part.text || '').join('').trim()
      if (!text) throw new AiError('AI_EMPTY', 'Le service IA a renvoyé une réponse vide. Réessaie.', 502)
      console.info('ai_request', { model, attempt: attempt + 1, durationMs: Date.now() - started, outcome: 'ok' })
      return text as string
    } catch (error) {
      const cancelled = options.signal?.aborted
      const timedOut = deadline.aborted || (error instanceof Error && ['TimeoutError', 'AbortError'].includes(error.name))
      const failure = cancelled
        ? new AiError('AI_CANCELLED', 'La demande a été annulée.', 499)
        : timedOut
          ? new AiError('AI_TIMEOUT', 'L’IA met trop de temps à répondre. Réessaie avec une demande plus courte.', 504, true)
          : error instanceof AiError ? error
            : error instanceof TypeError ? new AiError('AI_NETWORK', 'La connexion au service IA a été interrompue. Réessaie.', 503, true)
              : new AiError('AI_RESPONSE', 'La réponse du service IA est illisible. Réessaie.', 502)
      console.warn('ai_request', { model, attempt: attempt + 1, durationMs: Date.now() - started, code: failure.code })
      const canFallback = failure.code === 'AI_MODEL' && fallback && fallback !== model
      if (attempt === 1 || overall.aborted || (!failure.retryable && !canFallback) || retryAfter > 1500) throw failure
      if (fallback && fallback !== model) model = fallback
      await new Promise<void>((resolve, reject) => {
        const onAbort = () => { clearTimeout(timer); reject(failure) }
        const timer = setTimeout(() => { overall.removeEventListener('abort', onAbort); resolve() }, Math.max(300, retryAfter || 0))
        overall.addEventListener('abort', onAbort, { once: true })
        if (overall.aborted) { overall.removeEventListener('abort', onAbort); onAbort() }
      })
    }
  }
  throw new AiError('AI_UNAVAILABLE', 'Le service IA est temporairement indisponible.')
}

export function recipeExtractionPrompt(sourceDescription: string) {
  return `Tu es un assistant de cuisine professionnelle chargé de transformer des fiches techniques en données structurées.

SOURCE: ${sourceDescription}

Règles impératives :
1. Détecte TOUTES les recettes ou préparations distinctes présentes dans la source.
2. Si une feuille contient biscuit, crème, sauce, insert, glaçage, pâte, appareil, etc., crée une fiche distincte pour chaque préparation identifiable.
3. Ne fusionne jamais deux préparations différentes uniquement parce qu'elles appartiennent au même dessert ou plat.
4. Normalise le nom. canonicalName doit être un nom simple et stable servant à reconnaître la même recette lors d'un futur import.
5. N'invente aucune quantité absente. Utilise null si nécessaire.
6. Conserve les températures, temps, rendements et remarques utiles.
7. La catégorie doit être EXACTEMENT l’une de celles-ci : ${CUISINE_CATEGORIES.join(', ')}. Choisis la catégorie la plus précise. Distingue notamment pâte de base/pâte dérivée et crème de base/crème dérivée.
8. Retourne uniquement du JSON valide.

Format exact :
{
  "recipes": [
    {
      "canonicalName": "Crème pâtissière",
      "displayName": "Crème pâtissière",
      "category": "Crème de base",
      "tags": ["vanille"],
      "servings": "1 kg",
      "ingredients": [{"item":"Lait","quantity":"500","unit":"g","note":null}],
      "equipment": ["casserole"],
      "steps": [{"order":1,"instruction":"..."}],
      "times": {"preparation":null,"cooking":null,"resting":null,"total":null},
      "temperatures": ["Cuire jusqu'à épaississement"],
      "allergens": ["lait","oeuf"],
      "notes": null,
      "rawExcerpt": "court extrait permettant d'identifier cette préparation"
    }
  ]
}`
}
