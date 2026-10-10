'use client'

import dynamic from 'next/dynamic'

const BackroomsGame = dynamic(() => import('./backrooms-game'), {
  ssr: false,
  loading: () => (
    <div className="fixed inset-0 flex items-center justify-center bg-[#2a2716] font-mono text-sm text-[#f3ecc4]/70">
      Generating level...
    </div>
  ),
})

export function GameLoader() {
  return <BackroomsGame />
}
