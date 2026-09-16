import DuplicateAlert from './DuplicateAlert'

export default function RecipesLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <DuplicateAlert />
      {children}
    </>
  )
}
