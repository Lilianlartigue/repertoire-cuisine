function normalize(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
}

// Read-only selection: never merge preparations or modify recipe versions.
export function libraryContextForQuestion(rows: any[], question: string) {
  if (!rows.length) return 'Le répertoire est vide pour le moment.'
  const stopWords = new Set(['avec', 'dans', 'pour', 'recette', 'recettes', 'faire', 'comment', 'quelles', 'quelle', 'donne', 'peux', 'veux', 'version', 'versions'])
  const terms = normalize(question).match(/[a-z0-9]+/g)?.filter((term) => term.length > 2 && !stopWords.has(term)) || []
  const ranked = rows.map((row, index) => {
    const name = normalize(row.canonical_name || '')
    const content = normalize(JSON.stringify(row))
    const score = terms.reduce((total, term) => total + (name.includes(term) ? 5 : content.includes(term) ? 1 : 0), 0)
    return { row, score, index }
  }).filter(({ score }) => score > 0).sort((a, b) => b.score - a.score || a.index - b.index)
  const details: any[] = []
  let size = 0
  for (const { row } of ranked.slice(0, 8)) {
    const length = JSON.stringify(row).length
    if (size + length > 60000) continue
    details.push(row)
    size += length
  }
  return JSON.stringify({
    notice: 'Extrait limité aux 200 premières fiches par nom. Les détails ci-dessous sont une sélection liée aux mots de la question, pas une recherche exhaustive. Une fiche absente des détails peut exister. Ne complète jamais ses quantités ou étapes en les attribuant au répertoire ; demande une précision si nécessaire.',
    catalogue: rows.map((row) => ({ nom: row.canonical_name, categorie: row.category })),
    details,
  })
}
