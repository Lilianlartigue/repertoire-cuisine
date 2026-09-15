# Répertoire Cuisine

Site indépendant pour centraliser des fiches techniques et recettes dans un format commun.

## Fonctions

- Assistant IA cuisine : idées, associations, techniques et recettes.
- Répertoire classé par catégories avec recherche par nom, ingrédient, allergène ou tag.
- Import depuis PDF, image ou URL.
- Détection de plusieurs préparations sur une même feuille.
- Une fiche distincte par préparation détectée.
- Si une recette existe déjà, la nouvelle occurrence devient une nouvelle version dans la même fiche.

## Configuration

Créer un fichier `.env.local` à partir de `.env.example` et renseigner :

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `GEMINI_API_KEY`
- `GEMINI_MODEL` (par défaut `gemini-3.8-flash`)

Exécuter ensuite `supabase/schema.sql` dans l'éditeur SQL du projet Supabase.

## Démarrage

```bash
npm install
npm run dev
```

Le projet utilise Next.js App Router et est prévu pour être déployé sur Vercel.
