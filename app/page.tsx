import { GameLoader } from '@/components/backrooms/game-loader'

export default function Page() {
  return (
    <main className="h-dvh w-full">
      <h1 className="sr-only">Backrooms — explorable 3D environment</h1>
      <GameLoader />
    </main>
  )
}
