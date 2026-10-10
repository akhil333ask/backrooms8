'use client'

import { useMemo } from 'react'
import { Bloom, ChromaticAberration, EffectComposer, Noise, SMAA, ToneMapping, Vignette } from '@react-three/postprocessing'
import { BlendFunction, ToneMappingMode } from 'postprocessing'
import * as THREE from 'three'
import { useUi } from '@/lib/backrooms/store'
import { Camcorder } from './camcorder-effect'

export function Effects() {
  const offset = useMemo(() => new THREE.Vector2(0.0004, 0.0003), [])
  const footage = useUi((s) => s.footage)
  return (
    <EffectComposer multisampling={0} enableNormalPass={false} frameBufferType={THREE.HalfFloatType}>
      <Bloom mipmapBlur luminanceThreshold={1.3} luminanceSmoothing={0.25} intensity={0.9} radius={0.7} />
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      <SMAA />
      <ChromaticAberration offset={offset} radialModulation={false} modulationOffset={0} />
      <Camcorder enabled={footage} />
      <Noise premultiply blendFunction={BlendFunction.SOFT_LIGHT} opacity={footage ? 0.04 : 0.1} />
      <Vignette offset={0.35} darkness={0.4} />
    </EffectComposer>
  )
}
