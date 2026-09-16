import './globals.css'
import Link from 'next/link'

export const metadata = {
  title: 'Répertoire Cuisine',
  description: 'Bibliothèque culinaire intelligente',
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr">
      <body>
        <div className="shell">
          <aside className="sidebar">
            <div className="brand">
              <div className="brandMark">RC</div>
              <div>
                <strong>Répertoire</strong>
                <span>Cuisine</span>
              </div>
            </div>
            <nav>
              <Link href="/assistant">Assistant cuisine</Link>
              <Link href="/recipes">Mes recettes</Link>
              <Link href="/preferred">Versions préférées</Link>
              <Link href="/import">Ajouter une recette</Link>
            </nav>
          </aside>
          <main className="content">{children}</main>
        </div>
      </body>
    </html>
  )
}
