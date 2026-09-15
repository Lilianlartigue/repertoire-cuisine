function apiUrl(model: string) {
  const key = process.env.GEMINI_API_KEY
  if (!key) throw new Error('GEMINI_API_KEY manquante')
  return `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`
}

function extractText(data: any) {
  const text = data?.candidates?.[0]?.content?.parts?.map((part: any) => part.text || '').join('')
  if (!text) throw new Error(data?.error?.message || 'Réponse IA vide')
  return text
}

export async function askGemini(parts: any[], json = false) {
  const model = process.env.GEMINI_MODEL || 'gemini-3.8-flash'
  const response = await fetch(apiUrl(model), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts }],
      generationConfig: {
        ...(json ? { responseMimeType: 'application/json' } : {}),
      },
    }),
  })

  const data = await response.json()
  if (!response.ok) throw new Error(data?.error?.message || `Gemini ${response.status}`)
  return extractText(data)
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
7. Catégories conseillées : Entrées, Poissons, Viandes, Garnitures, Sauces, Pâtes et appareils, Crèmes, Biscuits, Pâtisserie, Desserts, Glaces et sorbets, Boulangerie, Bases, Autres.
8. Retourne uniquement du JSON valide.

Format exact :
{
  "recipes": [
    {
      "canonicalName": "Crème pâtissière",
      "displayName": "Crème pâtissière",
      "category": "Crèmes",
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
