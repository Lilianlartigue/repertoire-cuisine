const { test, afterEach } = require('node:test')
const assert = require('node:assert/strict')
const ts = require('typescript')
const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')
const root = path.resolve(__dirname, '..')
function load(file, mocks = {}) {
  const filename = path.join(root, file)
  const mod = new Module(filename, module)
  mod.filename = filename
  mod.paths = module.paths
  mod.require = (name) => name in mocks ? mocks[name] : name.startsWith('@/') ? load(name.slice(2) + '.ts', mocks) : require(name)
  mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, filename)
  return mod.exports
}
const { askGemini, AiError } = load('lib/gemini.ts')
const { libraryContextForQuestion } = load('lib/assistant-context.ts')
const originalFetch = global.fetch
const env = { ...process.env }
afterEach(() => { global.fetch = originalFetch; process.env = { ...env } })
function setup() { process.env.GEMINI_API_KEY = 'test-only'; process.env.GEMINI_MODEL = 'primary'; process.env.GEMINI_FALLBACK_MODEL = 'fallback' }
const answer = () => Response.json({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'secret thought', thought: true }, { text: 'Bonjour' }] } }] })

test('missing key fails without any network call', async () => {
  delete process.env.GEMINI_API_KEY
  global.fetch = () => assert.fail('must not call provider')
  await assert.rejects(askGemini([]), { code: 'AI_CONFIG' })
})
for (const status of [400, 401, 403]) test(`HTTP ${status} stops after one attempt and hides provider details`, async () => {
  setup(); let calls = 0
  global.fetch = async () => { calls++; return new Response('secret provider details', { status }) }
  await assert.rejects(askGemini([]), (error) => error instanceof AiError && !error.message.includes('secret'))
  assert.equal(calls, 1)
})
test('transient failure falls back only once; key stays out of URL', async () => {
  setup(); const calls = []
  global.fetch = async (url, options) => { calls.push(url); assert.equal(options.headers['x-goog-api-key'], 'test-only'); return calls.length === 1 ? new Response('', { status: 503 }) : answer() }
  assert.equal(await askGemini([]), 'Bonjour')
  assert.equal(calls.length, 2); assert.match(calls[1], /fallback/); assert.ok(calls.every(url => !url.includes('test-only')))
})
test('404 uses configured fallback without repeatedly calling missing model', async () => {
  setup(); let calls = 0
  global.fetch = async () => ++calls === 1 ? new Response('', { status: 404 }) : answer()
  assert.equal(await askGemini([]), 'Bonjour'); assert.equal(calls, 2)
})
test('quota Retry-After is respected without another immediate request', async () => {
  setup(); let calls = 0
  global.fetch = async () => { calls++; return new Response('', { status: 429, headers: { 'Retry-After': '60' } }) }
  await assert.rejects(askGemini([]), { code: 'AI_QUOTA', status: 429 }); assert.equal(calls, 1)
})
test('overall timeout cancels a hanging request', async () => {
  setup(); let calls = 0
  global.fetch = (_url, { signal }) => new Promise((resolve, reject) => { calls++; signal.addEventListener('abort', () => reject(signal.reason), { once: true }) })
  const keepAlive = setTimeout(() => {}, 1000)
  try { await assert.rejects(askGemini([], false, { timeoutMs: 20 }), { code: 'AI_TIMEOUT' }); assert.equal(calls, 1) }
  finally { clearTimeout(keepAlive) }
})
test('already cancelled request never reaches provider', async () => {
  setup(); global.fetch = () => assert.fail('must not call')
  await assert.rejects(askGemini([], false, { signal: AbortSignal.abort() }), { code: 'AI_CANCELLED' })
})
for (const data of [{}, { candidates: [{ finishReason: 'MAX_TOKENS', content: { parts: [{ text: 'partial' }] } }] }]) test('empty or partial response is not accepted', async () => {
  setup(); let calls = 0
  global.fetch = async () => { calls++; return Response.json(data) }
  await assert.rejects(askGemini([], true), AiError); assert.equal(calls, 1)
})
test('context keeps preparations and all versions intact, bounds detail size', () => {
  const rows = Array.from({ length: 200 }, (_, i) => ({ canonical_name: `Crème ${i}`, category: 'Crème', recipe_versions: [{ id: `${i}a`, preferred: false, steps: 'x'.repeat(2000) }, { id: `${i}b`, preferred: true, steps: 'y'.repeat(2000) }] }))
  const before = JSON.stringify(rows)
  const context = libraryContextForQuestion(rows, 'crème')
  const parsed = JSON.parse(context)
  assert.equal(parsed.catalogue.length, 200); assert.equal(parsed.details.length, 8)
  assert.deepEqual(parsed.details[0].recipe_versions, rows[0].recipe_versions)
  assert.equal(JSON.stringify(rows), before); assert.ok(context.length < before.length / 5)
})
function route(db, ask = async () => 'Réponse générale') {
  return load('app/api/assistant/route.ts', { '@/lib/db': { getDb: () => db }, '@/lib/gemini': { askGemini: ask, AiError }, 'next/server': { NextResponse: { json: (data, init) => Response.json(data, init) } } }).POST
}
function request(question) { return new Request('http://localhost/api/assistant', { method: 'POST', body: JSON.stringify({ question }) }) }
test('invalid input rejected before database or AI', async () => {
  const post = route({ query: () => assert.fail('must not read') })
  for (const q of [null, {}, 123, '', 'x'.repeat(4001)]) assert.equal((await post(request(q))).status, 400)
})
test('database failure is not reported as an empty library', async () => {
  const post = route({ query: async () => { throw new Error('private DB information') } })
  const result = await post(request('liste mes recettes'))
  assert.equal(result.status, 503); assert.equal((await result.json()).code, 'LIBRARY_UNAVAILABLE')
})
test('list reads only metadata and does not call AI', async () => {
  const post = route({ query: async (q) => { assert.ok(!q.text.includes('ingredients')); assert.ok(!q.text.includes('limit 200')); return { rows: [{ canonical_name: 'Crème', category: 'Dessert', version_count: 2 }] } } }, () => assert.fail('must not call AI'))
  const result = await post(request('liste mes recettes')); assert.match((await result.json()).answer, /2 versions/)
})
test('general answer warns when library is unavailable', async () => {
  const post = route({ query: async () => { throw new Error('DB down') } }, async ([part]) => { assert.match(part.text, /temporairement inaccessible/); return 'Conseil général' })
  const data = await (await post(request('Comment monter des blancs ?'))).json()
  assert.match(data.warning, /inaccessible/); assert.equal(data.answer, 'Conseil général')
})
test('legacy preferred-version column fallback is retained', async () => {
  let calls = 0
  const post = route({ query: async (q) => { calls++; if (calls === 1) throw Object.assign(new Error(), { code: '42703' }); assert.match(q.text, /false/); return { rows: [] } } })
  assert.equal((await post(request('Comment monter des blancs ?'))).status, 200); assert.equal(calls, 2)
})
test('typed provider error keeps useful status and safe message', async () => {
  const post = route({ query: async () => ({ rows: [] }) }, async () => { throw new AiError('AI_QUOTA', 'Limite atteinte', 429) })
  const result = await post(request('Une idée vanille ?')); assert.equal(result.status, 429); assert.equal((await result.json()).code, 'AI_QUOTA')
})
test('persistent provider failure stops after two total attempts', async () => {
  setup(); let calls = 0
  global.fetch = async () => { calls++; return new Response('', { status: 503 }) }
  await assert.rejects(askGemini([]), { code: 'AI_UNAVAILABLE' }); assert.equal(calls, 2)
})
test('import keeps JSON mode and source parts intact', async () => {
  setup(); const parts = [{ text: 'Deux préparations distinctes' }, { inlineData: { mimeType: 'image/png', data: 'test' } }]
  global.fetch = async (_url, options) => {
    const body = JSON.parse(options.body)
    assert.equal(body.generationConfig.responseMimeType, 'application/json')
    assert.deepEqual(body.contents[0].parts, parts)
    return Response.json({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: '{"recipes":[]}' }] } }] })
  }
  assert.equal(await askGemini(parts, true), '{"recipes":[]}')
})
test('recipe ideas are not mistaken for a library inventory', async () => {
  let asked = false
  const post = route({ query: async () => ({ rows: [] }) }, async () => { asked = true; return 'Une idée' })
  await post(request('Quelles recettes faire avec du citron ?')); assert.equal(asked, true)
})
test('hanging database connection returns a temporary error within its budget', async () => {
  const post = route({ query: () => new Promise(() => {}) })
  const start = Date.now()
  const result = await post(request('liste mes recettes'))
  assert.equal(result.status, 503); assert.ok(Date.now() - start < 6500)
})
