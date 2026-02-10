'use client'

import { useRef, useMemo } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { OrbitControls, Text } from '@react-three/drei'
import * as THREE from 'three'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ReactionState = 'idle' | 'typing' | 'overloaded' | 'celebrating'

interface MascotSceneProps {
  reactionState: ReactionState
}

interface MascotProps {
  state: ReactionState
}

interface EyeProps {
  position: [number, number, number]
  state: ReactionState
}

interface ParticleSystemProps {
  type: 'steam' | 'confetti'
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const USAGE_LABELS: Record<ReactionState, string> = {
  idle: 'Usage: Low',
  typing: 'Usage: Medium',
  overloaded: 'Usage: High',
  celebrating: 'Usage: Milestone!',
}

// ---------------------------------------------------------------------------
// Utility: smooth lerp for transition
// ---------------------------------------------------------------------------

function lerpValue(current: number, target: number, speed: number, delta: number): number {
  return current + (target - current) * Math.min(speed * delta, 1)
}

// ---------------------------------------------------------------------------
// Eye component with blinking and state-based expressions
// ---------------------------------------------------------------------------

function Eye({ position, state }: EyeProps) {
  const meshRef = useRef<THREE.Mesh>(null)
  const materialRef = useRef<THREE.MeshStandardMaterial>(null)
  const blinkTimer = useRef(Math.random() * 5)
  const isBlinking = useRef(false)

  // Happy eye crescent (torus arc) for celebrating
  const crescentRef = useRef<THREE.Mesh>(null)
  const crescentVisible = useRef(false)

  useFrame((_, delta) => {
    if (!meshRef.current || !materialRef.current) return

    const mat = materialRef.current
    const mesh = meshRef.current

    // Blink logic for idle state
    blinkTimer.current -= delta
    if (blinkTimer.current <= 0 && state === 'idle') {
      isBlinking.current = !isBlinking.current
      blinkTimer.current = isBlinking.current ? 0.12 : 2.5 + Math.random() * 3
    }

    // Eye scale for blinking
    const targetScaleY = isBlinking.current && state === 'idle' ? 0.1 : 1
    mesh.scale.y = lerpValue(mesh.scale.y, targetScaleY, 12, delta)

    // Eye color per state
    let targetColor: THREE.Color
    let emissiveIntensity: number

    switch (state) {
      case 'idle':
        targetColor = new THREE.Color('#6ee7b7') // emerald-300
        emissiveIntensity = 1.5
        break
      case 'typing':
        targetColor = new THREE.Color('#93c5fd') // blue-300
        emissiveIntensity = 2.0
        break
      case 'overloaded':
        targetColor = new THREE.Color('#ff4444')
        emissiveIntensity = 3.0
        break
      case 'celebrating':
        targetColor = new THREE.Color('#fbbf24') // amber-400
        emissiveIntensity = 2.5
        break
    }

    mat.color.lerp(targetColor, delta * 5)
    mat.emissive.lerp(targetColor, delta * 5)
    mat.emissiveIntensity = lerpValue(mat.emissiveIntensity, emissiveIntensity, 5, delta)

    // Celebrating: hide sphere eye, show crescent
    const showCrescent = state === 'celebrating'
    crescentVisible.current = showCrescent
    mesh.visible = !showCrescent

    if (crescentRef.current) {
      crescentRef.current.visible = showCrescent
    }
  })

  return (
    <group position={position}>
      {/* Normal sphere eye */}
      <mesh ref={meshRef}>
        <sphereGeometry args={[0.1, 16, 16]} />
        <meshStandardMaterial
          ref={materialRef}
          color="#6ee7b7"
          emissive="#6ee7b7"
          emissiveIntensity={1.5}
        />
      </mesh>
      {/* Happy crescent eye for celebrating */}
      <mesh ref={crescentRef} rotation={[0, 0, Math.PI]} visible={false} scale={[1.0, 1.0, 1.0]}>
        <torusGeometry args={[0.08, 0.03, 8, 16, Math.PI]} />
        <meshStandardMaterial color="#fbbf24" emissive="#fbbf24" emissiveIntensity={2.5} />
      </mesh>
    </group>
  )
}

// ---------------------------------------------------------------------------
// Antenna component
// ---------------------------------------------------------------------------

function Antenna({ state }: { state: ReactionState }) {
  const groupRef = useRef<THREE.Group>(null)
  const tipRef = useRef<THREE.Mesh>(null)
  const tipMatRef = useRef<THREE.MeshStandardMaterial>(null)

  useFrame(({ clock }, delta) => {
    if (!groupRef.current || !tipRef.current || !tipMatRef.current) return
    const t = clock.getElapsedTime()

    // Gentle sway
    groupRef.current.rotation.z = Math.sin(t * 2) * 0.1

    // Tip glow pulse
    let glowColor: THREE.Color
    let pulseSpeed: number

    switch (state) {
      case 'idle':
        glowColor = new THREE.Color('#a78bfa')
        pulseSpeed = 1.5
        break
      case 'typing':
        glowColor = new THREE.Color('#60a5fa')
        pulseSpeed = 4
        break
      case 'overloaded':
        glowColor = new THREE.Color('#ff4444')
        pulseSpeed = 8
        break
      case 'celebrating':
        glowColor = new THREE.Color('#fbbf24')
        pulseSpeed = 6
        break
    }

    tipMatRef.current.emissive.lerp(glowColor, delta * 5)
    tipMatRef.current.emissiveIntensity = 1.5 + Math.sin(t * pulseSpeed) * 1.0
  })

  return (
    <group ref={groupRef} position={[0, 0.55, 0]}>
      {/* Antenna stalk */}
      <mesh position={[0, 0.2, 0]}>
        <cylinderGeometry args={[0.02, 0.02, 0.4, 8]} />
        <meshStandardMaterial color="#94a3b8" metalness={0.8} roughness={0.2} />
      </mesh>
      {/* Antenna tip */}
      <mesh ref={tipRef} position={[0, 0.45, 0]}>
        <sphereGeometry args={[0.06, 16, 16]} />
        <meshStandardMaterial
          ref={tipMatRef}
          color="#a78bfa"
          emissive="#a78bfa"
          emissiveIntensity={1.5}
        />
      </mesh>
    </group>
  )
}

// ---------------------------------------------------------------------------
// Arm component
// ---------------------------------------------------------------------------

function Arm({
  side,
  state,
}: {
  side: 'left' | 'right'
  state: ReactionState
}) {
  const groupRef = useRef<THREE.Group>(null)
  const xSign = side === 'left' ? -1 : 1

  useFrame(({ clock }, delta) => {
    if (!groupRef.current) return
    const t = clock.getElapsedTime()

    let targetRotZ: number
    let targetRotX: number

    switch (state) {
      case 'idle':
        targetRotZ = xSign * (0.3 + Math.sin(t * 1.2) * 0.05)
        targetRotX = 0
        break
      case 'typing':
        // Fast typing motion - arms swing forward/back rapidly
        targetRotZ = xSign * 0.2
        targetRotX = Math.sin(t * 12 + (side === 'left' ? 0 : Math.PI)) * 0.4
        break
      case 'overloaded':
        // Stiff arms, slight vibration
        targetRotZ = xSign * (0.4 + Math.sin(t * 20) * 0.05)
        targetRotX = Math.sin(t * 20 + (side === 'left' ? 0 : Math.PI)) * 0.03
        break
      case 'celebrating':
        // Arms raised and waving
        targetRotZ = xSign * (-0.8 + Math.sin(t * 6) * 0.3)
        targetRotX = Math.sin(t * 4 + (side === 'left' ? 0 : Math.PI)) * 0.2
        break
    }

    const speed = state === 'typing' ? 15 : 6
    groupRef.current.rotation.z = lerpValue(groupRef.current.rotation.z, targetRotZ, speed, delta)
    groupRef.current.rotation.x = lerpValue(groupRef.current.rotation.x, targetRotX, speed, delta)
  })

  return (
    <group ref={groupRef} position={[xSign * 0.45, -0.15, 0]}>
      {/* Upper arm */}
      <mesh position={[xSign * 0.12, -0.15, 0]}>
        <capsuleGeometry args={[0.05, 0.25, 4, 8]} />
        <meshStandardMaterial color="#cbd5e1" metalness={0.5} roughness={0.3} />
      </mesh>
      {/* Hand sphere */}
      <mesh position={[xSign * 0.15, -0.35, 0]}>
        <sphereGeometry args={[0.06, 12, 12]} />
        <meshStandardMaterial color="#e2e8f0" metalness={0.4} roughness={0.3} />
      </mesh>
    </group>
  )
}

// ---------------------------------------------------------------------------
// Steam particles for overloaded state
// ---------------------------------------------------------------------------

function SteamParticles({ type }: ParticleSystemProps) {
  const particlesRef = useRef<THREE.InstancedMesh>(null)
  const count = type === 'steam' ? 20 : 40
  const dummy = useMemo(() => new THREE.Object3D(), [])

  // Per-particle state
  const particles = useMemo(() => {
    return Array.from({ length: count }, () => ({
      x: (Math.random() - 0.5) * 0.4,
      y: Math.random() * 1.5,
      z: (Math.random() - 0.5) * 0.4,
      speed: 0.3 + Math.random() * 0.5,
      offset: Math.random() * Math.PI * 2,
      scale: 0.02 + Math.random() * 0.04,
      // confetti extras
      color: new THREE.Color().setHSL(Math.random(), 0.8, 0.6),
      rotSpeed: (Math.random() - 0.5) * 10,
    }))
  }, [count])

  useFrame(({ clock }) => {
    if (!particlesRef.current) return
    const t = clock.getElapsedTime()

    for (let i = 0; i < count; i++) {
      const p = particles[i]
      const life = ((t * p.speed + p.offset) % 1.5) / 1.5

      if (type === 'steam') {
        dummy.position.set(
          p.x + Math.sin(t * 2 + p.offset) * 0.1,
          1.2 + life * 1.2,
          p.z + Math.cos(t * 2 + p.offset) * 0.1
        )
        const s = p.scale * (1 - life * 0.5) * (life < 0.1 ? life / 0.1 : 1)
        dummy.scale.setScalar(s * 15)
      } else {
        // Confetti - fountain up then gravity down
        const upPhase = Math.min(life * 2, 1)
        const yPos = 1.5 + upPhase * 2 - life * life * 3
        dummy.position.set(
          p.x * 2 + Math.sin(t * 3 + p.offset) * life * 0.5,
          Math.max(yPos, -0.5),
          p.z * 2 + Math.cos(t * 3 + p.offset) * life * 0.5
        )
        dummy.rotation.set(t * p.rotSpeed, t * p.rotSpeed * 0.7, 0)
        const s = p.scale * (1 - life * 0.3)
        dummy.scale.set(s * 20, s * 20, s * 5)
      }

      dummy.updateMatrix()
      particlesRef.current.setMatrixAt(i, dummy.matrix)

      if (type === 'confetti') {
        particlesRef.current.setColorAt(i, p.color)
      }
    }

    particlesRef.current.instanceMatrix.needsUpdate = true
    if (type === 'confetti' && particlesRef.current.instanceColor) {
      particlesRef.current.instanceColor.needsUpdate = true
    }
  })

  return (
    <instancedMesh ref={particlesRef} args={[undefined, undefined, count]}>
      {type === 'steam' ? (
        <sphereGeometry args={[0.04, 6, 6]} />
      ) : (
        <boxGeometry args={[0.04, 0.04, 0.01]} />
      )}
      <meshStandardMaterial
        color={type === 'steam' ? '#e2e8f0' : '#ffffff'}
        transparent
        opacity={type === 'steam' ? 0.4 : 0.9}
      />
    </instancedMesh>
  )
}

// ---------------------------------------------------------------------------
// Usage label floating above the mascot
// ---------------------------------------------------------------------------

function UsageLabel({ state }: { state: ReactionState }) {
  const groupRef = useRef<THREE.Group>(null)

  useFrame(({ clock }) => {
    if (!groupRef.current) return
    const t = clock.getElapsedTime()
    groupRef.current.position.y = 2.2 + Math.sin(t * 1.5) * 0.05
  })

  const colorMap: Record<ReactionState, string> = {
    idle: '#6ee7b7',
    typing: '#93c5fd',
    overloaded: '#ff6b6b',
    celebrating: '#fbbf24',
  }

  return (
    <group ref={groupRef} position={[0, 2.2, 0]}>
      <Text
        fontSize={0.22}
        color={colorMap[state]}
        anchorX="center"
        anchorY="middle"
        font={undefined}
      >
        {USAGE_LABELS[state]}
      </Text>
    </group>
  )
}

// ---------------------------------------------------------------------------
// Mouth
// ---------------------------------------------------------------------------

function Mouth({ state }: { state: ReactionState }) {
  const meshRef = useRef<THREE.Mesh>(null)

  useFrame(({ clock }, delta) => {
    if (!meshRef.current) return
    const t = clock.getElapsedTime()

    // Scale mouth based on state
    let targetScaleX: number
    let targetScaleY: number

    switch (state) {
      case 'idle':
        targetScaleX = 1
        targetScaleY = 0.6 + Math.sin(t * 1.5) * 0.1
        break
      case 'typing':
        // Small focused mouth
        targetScaleX = 0.6
        targetScaleY = 0.4
        break
      case 'overloaded':
        // Open wide
        targetScaleX = 1.3
        targetScaleY = 1.5 + Math.sin(t * 15) * 0.2
        break
      case 'celebrating':
        // Big smile
        targetScaleX = 1.5
        targetScaleY = 1.0
        break
    }

    meshRef.current.scale.x = lerpValue(meshRef.current.scale.x, targetScaleX, 6, delta)
    meshRef.current.scale.y = lerpValue(meshRef.current.scale.y, targetScaleY, 6, delta)
  })

  return (
    <mesh ref={meshRef} position={[0, -0.15, 0.47]} rotation={[0.1, 0, 0]}>
      <torusGeometry args={[0.06, 0.02, 8, 16, Math.PI]} />
      <meshStandardMaterial color="#475569" />
    </mesh>
  )
}

// ---------------------------------------------------------------------------
// Platform / floor
// ---------------------------------------------------------------------------

function Platform() {
  return (
    <group position={[0, -1.55, 0]}>
      {/* Main platform disc */}
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[1.5, 1.6, 0.12, 32]} />
        <meshStandardMaterial color="#1e293b" metalness={0.6} roughness={0.3} />
      </mesh>
      {/* Ring highlight */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.07, 0]}>
        <torusGeometry args={[1.45, 0.02, 8, 64]} />
        <meshStandardMaterial color="#6366f1" emissive="#6366f1" emissiveIntensity={0.8} />
      </mesh>
      {/* Shadow plane */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.07, 0]}>
        <circleGeometry args={[3, 32]} />
        <meshStandardMaterial color="#0f172a" transparent opacity={0.6} />
      </mesh>
    </group>
  )
}

// ---------------------------------------------------------------------------
// Main mascot character
// ---------------------------------------------------------------------------

function Mascot({ state }: MascotProps) {
  const bodyGroupRef = useRef<THREE.Group>(null)
  const headGroupRef = useRef<THREE.Group>(null)
  const wholeRef = useRef<THREE.Group>(null)

  // Smooth transition tracking
  const currentBob = useRef(0)
  const currentShakeX = useRef(0)
  const currentShakeZ = useRef(0)
  const currentLean = useRef(0)

  useFrame(({ clock }, delta) => {
    if (!wholeRef.current || !bodyGroupRef.current || !headGroupRef.current) return
    const t = clock.getElapsedTime()

    let targetBob: number
    let targetShakeX: number
    let targetShakeZ: number
    let targetLean: number

    switch (state) {
      case 'idle':
        targetBob = Math.sin(t * 1.8) * 0.08
        targetShakeX = 0
        targetShakeZ = 0
        targetLean = 0
        break
      case 'typing':
        targetBob = Math.sin(t * 3) * 0.03
        targetShakeX = 0
        targetShakeZ = 0
        targetLean = 0.15
        break
      case 'overloaded':
        targetBob = 0
        targetShakeX = Math.sin(t * 30) * 0.03
        targetShakeZ = Math.cos(t * 25) * 0.02
        targetLean = 0
        break
      case 'celebrating':
        // Jumping: use abs(sin) for bounce-like motion
        targetBob = Math.abs(Math.sin(t * 5)) * 0.5
        targetShakeX = 0
        targetShakeZ = 0
        targetLean = 0
        break
    }

    const transSpeed = 4
    currentBob.current = lerpValue(currentBob.current, targetBob, transSpeed, delta)
    currentShakeX.current = lerpValue(currentShakeX.current, targetShakeX, transSpeed * 2, delta)
    currentShakeZ.current = lerpValue(currentShakeZ.current, targetShakeZ, transSpeed * 2, delta)
    currentLean.current = lerpValue(currentLean.current, targetLean, transSpeed, delta)

    wholeRef.current.position.y = currentBob.current
    wholeRef.current.position.x = currentShakeX.current
    wholeRef.current.rotation.z = currentShakeZ.current
    wholeRef.current.rotation.x = currentLean.current

    // Subtle body squash/stretch during celebration jump
    if (state === 'celebrating') {
      const jumpPhase = Math.sin(t * 5)
      const squash = 1 - jumpPhase * 0.08
      const stretch = 1 + jumpPhase * 0.08
      bodyGroupRef.current.scale.set(squash, stretch, squash)
    } else {
      bodyGroupRef.current.scale.x = lerpValue(bodyGroupRef.current.scale.x, 1, 4, delta)
      bodyGroupRef.current.scale.y = lerpValue(bodyGroupRef.current.scale.y, 1, 4, delta)
      bodyGroupRef.current.scale.z = lerpValue(bodyGroupRef.current.scale.z, 1, 4, delta)
    }

    // Head tilt tracking
    headGroupRef.current.rotation.z = Math.sin(t * 1.2) * 0.05
  })

  return (
    <group ref={wholeRef}>
      {/* Body group */}
      <group ref={bodyGroupRef}>
        {/* Body - rounded cylinder (capsule) */}
        <mesh position={[0, -0.5, 0]}>
          <capsuleGeometry args={[0.32, 0.55, 8, 16]} />
          <meshStandardMaterial color="#cbd5e1" metalness={0.3} roughness={0.4} />
        </mesh>

        {/* Chest accent */}
        <mesh position={[0, -0.35, 0.3]}>
          <sphereGeometry args={[0.15, 12, 12]} />
          <meshStandardMaterial
            color="#818cf8"
            emissive="#818cf8"
            emissiveIntensity={0.3}
            metalness={0.5}
            roughness={0.2}
          />
        </mesh>

        {/* Arms */}
        <Arm side="left" state={state} />
        <Arm side="right" state={state} />
      </group>

      {/* Head group */}
      <group ref={headGroupRef} position={[0, 0.3, 0]}>
        {/* Head - sphere */}
        <mesh>
          <sphereGeometry args={[0.5, 32, 32]} />
          <meshStandardMaterial color="#e2e8f0" metalness={0.2} roughness={0.4} />
        </mesh>

        {/* Face visor */}
        <mesh position={[0, 0, 0.05]}>
          <sphereGeometry args={[0.48, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2]} />
          <meshStandardMaterial
            color="#334155"
            metalness={0.7}
            roughness={0.1}
            transparent
            opacity={0.4}
          />
        </mesh>

        {/* Eyes */}
        <Eye position={[-0.16, 0.05, 0.42]} state={state} />
        <Eye position={[0.16, 0.05, 0.42]} state={state} />

        {/* Mouth */}
        <Mouth state={state} />

        {/* Antenna */}
        <Antenna state={state} />
      </group>

      {/* Usage label */}
      <UsageLabel state={state} />

      {/* Particle effects */}
      {state === 'overloaded' && <SteamParticles type="steam" />}
      {state === 'celebrating' && <SteamParticles type="confetti" />}
    </group>
  )
}

// ---------------------------------------------------------------------------
// Scene (lights, camera helpers, etc.)
// ---------------------------------------------------------------------------

function Scene({ state }: { state: ReactionState }) {
  return (
    <>
      {/* Lighting */}
      <ambientLight intensity={0.4} color="#c4b5fd" />
      <directionalLight position={[3, 5, 4]} intensity={1.0} color="#f8fafc" castShadow />
      <directionalLight position={[-2, 3, -2]} intensity={0.3} color="#a78bfa" />
      <pointLight position={[0, 2, 3]} intensity={0.6} color="#818cf8" distance={8} />
      <pointLight position={[0, -1, 2]} intensity={0.3} color="#6ee7b7" distance={5} />

      {/* Background color */}
      <color attach="background" args={['#0f172a']} />
      <fog attach="fog" args={['#0f172a', 6, 14]} />

      {/* Mascot */}
      <Mascot state={state} />

      {/* Platform */}
      <Platform />

      {/* Camera controls */}
      <OrbitControls
        enablePan={false}
        minDistance={3}
        maxDistance={8}
        minPolarAngle={Math.PI / 6}
        maxPolarAngle={Math.PI / 2.1}
        target={[0, 0, 0]}
      />
    </>
  )
}

// ---------------------------------------------------------------------------
// Exported MascotScene component
// ---------------------------------------------------------------------------

export function MascotScene({ reactionState }: MascotSceneProps) {
  return (
    <div className="bg-slate-950" style={{ position: 'relative', width: '100%', height: '100%' }}>
      <Canvas
        camera={{ position: [0, 1, 5], fov: 45 }}
        dpr={[1, 2]}
        gl={{ antialias: true }}
      >
        <Scene state={reactionState} />
      </Canvas>
    </div>
  )
}
