import './globals.css'
import Link from 'next/link'

export const metadata = {
  title: 'Répertoire Cuisine',
  description: 'Bibliothèque culinaire intelligente',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    title: 'Répertoire Cuisine',
    statusBarStyle: 'default' as const,
  },
  icons: {
    icon: '/icon.svg',
    apple: '/icon.svg',
  },
}

export const viewport = {
  themeColor: '#5f7d67',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover' as const,
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
