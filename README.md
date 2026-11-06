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

- `DATABASE_URL` : chaîne de connexion Neon PostgreSQL.
- `GEMINI_API_KEY`.
- `GEMINI_MODEL` (par défaut `gemini-3.8-flash`).

Exécuter ensuite `neon/schema.sql` dans l'éditeur SQL du projet Neon.

## Démarrage

```bash
npm install
npm run dev
```

Le projet utilise Next.js App Router, Neon PostgreSQL et Gemini, et est prévu pour être déployé sur Vercel.

## Fiabilité de l’IA

- `GEMINI_FALLBACK_MODEL` est facultatif : renseigner uniquement un modèle accessible à la même clé. Sans cette variable, une erreur transitoire entraîne au maximum un nouvel essai du modèle principal.
- Deux appels maximum au total, secours compris. Budget IA global de 40 s pour l’assistant et 90 s pour les imports, avec 25 s / 45 s maximum par tentative.
- Les erreurs de clé, requête invalide, réponse vide ou incomplète ne sont pas répétées. Un modèle introuvable peut utiliser le secours configuré. Un `Retry-After` supérieur à 1,5 s est rendu à l’utilisateur sans nouvel appel immédiat.
- L’assistant attend au plus 5,5 s la bibliothèque, puis indique explicitement son indisponibilité. Une demande de liste renvoie une erreur temporaire au lieu de déclarer le répertoire vide.
- La liste des recettes est lue sans appel IA et sans plafond de 200 fiches. Pour les autres questions, le catalogue des 200 premières fiches est conservé, avec au plus 8 fiches pertinentes / 60 000 caractères de détails. Toutes les versions des fiches sélectionnées sont conservées, sans fusion ni découpe. La sélection est lexicale, pas sémantique ; le prompt signale ce caractère partiel.
- Journaux `ai_request` : modèle, tentative, durée et résultat/code uniquement. Aucune clé, question ni recette n’est journalisée.
- Limites des fonctions : assistant 60 s, import 120 s. Le navigateur abandonne l’attente de l’assistant après 55 s et permet de reprendre la question.

### Vérification et mise en ligne

```bash
npm test
npm run build
```

Les tests utilisent des réponses simulées (aucun appel payant, aucune écriture en base). Ils couvrent les erreurs fournisseur, quotas, délais, annulation, lecture de bibliothèque et conservation des versions dans le contexte.

Après fusion et déploiement, vérifier dans Vercel que `GEMINI_API_KEY`, `GEMINI_MODEL` et éventuellement `GEMINI_FALLBACK_MODEL` correspondent à des modèles accessibles dans Google AI Studio, avec quota disponible. Les variables déjà présentes sur Vercel ne sont pas remplacées par `.env.example`. Essayer une question technique, une recette connue, la liste des recettes et un import en prévisualisation ; contrôler les événements `ai_request` dans les journaux.

Aucune migration de base n’est nécessaire pour ces corrections. Ne pas réexécuter le schéma SQL pour cette mise à jour.
