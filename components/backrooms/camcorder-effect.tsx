'use client'

import { useEffect, useMemo } from 'react'
import { Effect, EffectAttribute } from 'postprocessing'
import * as THREE from 'three'

const fragment = /* glsl */ `
uniform float strength;
uniform float aberration;

void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  vec2 c = uv - 0.5;
  float r2 = dot(c, c);
  // Barrel distortion, normalized so the corners stay on screen (no black borders).
  vec2 d = c * (1.0 + strength * r2) / (1.0 + strength * 0.5);
  vec2 duv = d + 0.5;
  vec2 off = c * aberration * r2;
  float r = texture2D(inputBuffer, duv + off).r;
  float g = texture2D(inputBuffer, duv).g;
  float b = texture2D(inputBuffer, duv - off).b;
  outputColor = vec4(r, g, b, inputColor.a);
}
`

class CamcorderEffectImpl extends Effect {
  constructor() {
    super('CamcorderEffect', fragment, {
      attributes: EffectAttribute.CONVOLUTION,
      uniforms: new Map<string, THREE.Uniform>([
        ['strength', new THREE.Uniform(0)],
        ['aberration', new THREE.Uniform(0)],
      ]),
    })
  }
}

/** Cheap fisheye + chromatic edge pass. Stays mounted; disabling just zeroes it. */
export function Camcorder({ enabled }: { enabled: boolean }) {
  const effect = useMemo(() => new CamcorderEffectImpl(), [])
  useEffect(() => {
    effect.uniforms.get('strength')!.value = enabled ? 0.2 : 0
    effect.uniforms.get('aberration')!.value = enabled ? 0.01 : 0
  }, [effect, enabled])
  useEffect(() => () => effect.dispose(), [effect])
  return <primitive object={effect} dispose={null} />
}
