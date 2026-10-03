import UploadPanel from '../components/UploadPanel'

export default function HomePage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-stone-800 via-stone-950 to-black px-4 py-10 text-stone-100 sm:px-6">
      <UploadPanel />
    </main>
  )
}
