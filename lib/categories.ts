export const CUISINE_CATEGORIES = [
  'Velouté / soupe',
  'Tarte salée',
  'Entrée',
  'Viande',
  'Poisson',
  'Œuf',
  'Garniture',
  'Sauce',
  'Pâte de base',
  'Pâte dérivée',
  'Crème de base',
  'Crème dérivée',
  'Crémeux',
  'Ganache',
  'Meringue',
  'Glace et sorbet',
  'Mousse',
  'Confit',
  'Pâtisserie',
  'Dessert',
  'Boulangerie',
] as const

export type CuisineCategory = typeof CUISINE_CATEGORIES[number]

export function normalizeCuisineCategory(value: string | null | undefined, name = ''): CuisineCategory {
  const raw = `${value || ''} ${name}`.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/œ/g, 'oe').toLowerCase()

  const aliases: Array<[RegExp, CuisineCategory]> = [
    [/veloute|soupe|potage/, 'Velouté / soupe'],
    [/tarte.*sale|quiche/, 'Tarte salée'],
    [/\bviande|boeuf|veau|porc|agneau|volaille|poulet|canard|lapin/, 'Viande'],
    [/poisson|saumon|cabillaud|dorade|thon|truite|merlu|lotte|sole|bar\b/, 'Poisson'],
    [/\boeuf\b|\boeufs\b|omelette|oeuf/, 'Œuf'],
    [/garniture|legume|puree|risotto|polenta/, 'Garniture'],
    [/sauce|jus\b|coulis sale/, 'Sauce'],
    [/pate.*base|pate brisee|pate sablee|pate sucree|pate feuilletee/, 'Pâte de base'],
    [/pate.*derivee|appareil/, 'Pâte dérivée'],
    [/creme.*base|creme patissiere|creme anglaise/, 'Crème de base'],
    [/creme.*derivee|mousseline|chiboust|diplomate|frangipane/, 'Crème dérivée'],
    [/cremeux/, 'Crémeux'],
    [/ganache/, 'Ganache'],
    [/meringue/, 'Meringue'],
    [/glace|sorbet/, 'Glace et sorbet'],
    [/mousse/, 'Mousse'],
    [/confit/, 'Confit'],
    [/boulanger|pain|brioche|croissant|viennoiser/, 'Boulangerie'],
    [/patisserie|gateau|biscuit|entremets|tarte sucree/, 'Pâtisserie'],
    [/dessert/, 'Dessert'],
    [/entree|starter|appetizer/, 'Entrée'],
  ]

  for (const [pattern, category] of aliases) {
    if (pattern.test(raw)) return category
  }

  const exact = CUISINE_CATEGORIES.find((category) => category.toLowerCase() === (value || '').trim().toLowerCase())
  return exact || 'Entrée'
}
