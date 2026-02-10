'use client'

import { useRef, useMemo, useState, useEffect, useCallback } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { OrbitControls, Text } from '@react-three/drei'
import * as THREE from 'three'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const COIN_COUNT = 40
const SPAWN_Y = 12
const FLOOR_Y = -5
const BOUNCE_DAMPING = 0.55
const GRAVITY = -9.8
const DRIFT_STRENGTH = 0.4
const PARTICLE_COUNT = 200
const COIN_RADIUS = 0.45
const COIN_THICKNESS = 0.08

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CoinState {
  position: THREE.Vector3
  velocity: THREE.Vector3
  rotation: THREE.Euler
  angularVelocity: THREE.Vector3
  driftPhase: number
  driftFreq: number
  settled: boolean
  settledTime: number
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function randomRange(min: number, max: number): number {
  return Math.random() * (max - min) + min
}

function createCoinState(): CoinState {
  return {
    position: new THREE.Vector3(
      randomRange(-6, 6),
      randomRange(SPAWN_Y, SPAWN_Y + 10),
      randomRange(-4, 4)
    ),
    velocity: new THREE.Vector3(
      randomRange(-0.3, 0.3),
      randomRange(-2, -0.5),
      randomRange(-0.3, 0.3)
    ),
    rotation: new THREE.Euler(
      randomRange(0, Math.PI * 2),
      randomRange(0, Math.PI * 2),
      randomRange(0, Math.PI * 2)
    ),
    angularVelocity: new THREE.Vector3(
      randomRange(-3, 3),
      randomRange(-3, 3),
      randomRange(-1, 1)
    ),
    driftPhase: randomRange(0, Math.PI * 2),
    driftFreq: randomRange(0.5, 1.5),
    settled: false,
    settledTime: 0,
  }
}

// ---------------------------------------------------------------------------
// Coin Geometry (shared)
// ---------------------------------------------------------------------------

function useCoinGeometry() {
  return useMemo(() => {
    const geo = new THREE.CylinderGeometry(COIN_RADIUS, COIN_RADIUS, COIN_THICKNESS, 32)
    return geo
  }, [])
}

// ---------------------------------------------------------------------------
// Single Coin Component
// ---------------------------------------------------------------------------

function Coin({ state }: { state: CoinState }) {
  const meshRef = useRef<THREE.Mesh>(null)
  const textFrontRef = useRef<THREE.Mesh>(null)
  const textBackRef = useRef<THREE.Mesh>(null)
  const geometry = useCoinGeometry()

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05)
    const mesh = meshRef.current
    if (!mesh) return

    if (!state.settled) {
      // Gravity
      state.velocity.y += GRAVITY * dt

      // Horizontal drift via sine wave
      const driftX = Math.sin(state.driftPhase) * DRIFT_STRENGTH * dt
      const driftZ = Math.cos(state.driftPhase * 0.7) * DRIFT_STRENGTH * 0.5 * dt
      state.driftPhase += state.driftFreq * dt

      // Update position
      state.position.x += state.velocity.x * dt + driftX
      state.position.y += state.velocity.y * dt
      state.position.z += state.velocity.z * dt + driftZ

      // Update rotation
      state.rotation.x += state.angularVelocity.x * dt
      state.rotation.y += state.angularVelocity.y * dt
      state.rotation.z += state.angularVelocity.z * dt

      // Floor bounce
      if (state.position.y <= FLOOR_Y + COIN_RADIUS * 0.5) {
        state.position.y = FLOOR_Y + COIN_RADIUS * 0.5
        state.velocity.y = Math.abs(state.velocity.y) * BOUNCE_DAMPING

        // Dampen horizontal and angular velocity on bounce
        state.velocity.x *= 0.7
        state.velocity.z *= 0.7
        state.angularVelocity.multiplyScalar(0.6)

        // Check if effectively settled
        if (Math.abs(state.velocity.y) < 0.3) {
          state.settled = true
          state.settledTime = 0
        }
      }

      // Wrap horizontally if drifted too far
      if (state.position.x > 8) state.position.x = -8
      if (state.position.x < -8) state.position.x = 8
      if (state.position.z > 6) state.position.z = -6
      if (state.position.z < -6) state.position.z = 6
    } else {
      // Settled: gentle resting animation
      state.settledTime += dt
      // After resting for a while, respawn
      if (state.settledTime > randomRange(2, 5)) {
        const fresh = createCoinState()
        state.position.copy(fresh.position)
        state.velocity.copy(fresh.velocity)
        state.rotation.copy(fresh.rotation)
        state.angularVelocity.copy(fresh.angularVelocity)
        state.driftPhase = fresh.driftPhase
        state.driftFreq = fresh.driftFreq
        state.settled = false
        state.settledTime = 0
      }
    }

    mesh.position.copy(state.position)
    mesh.rotation.copy(state.rotation)

    // Keep text facing outward on coin faces
    if (textFrontRef.current) {
      textFrontRef.current.position.set(0, COIN_THICKNESS / 2 + 0.001, 0)
      textFrontRef.current.rotation.set(-Math.PI / 2, 0, 0)
    }
    if (textBackRef.current) {
      textBackRef.current.position.set(0, -(COIN_THICKNESS / 2 + 0.001), 0)
      textBackRef.current.rotation.set(Math.PI / 2, 0, Math.PI)
    }
  })

  return (
    <mesh ref={meshRef} geometry={geometry} castShadow>
      <meshStandardMaterial
        color="#d4a017"
        metalness={0.85}
        roughness={0.2}
        emissive="#b8860b"
        emissiveIntensity={0.15}
      />
      {/* Rim highlight using a slightly different material via groups would be complex,
          so we keep it simple with one material and add text labels */}
      <Text
        ref={textFrontRef}
        fontSize={0.32}
        color="#8b6914"
        anchorX="center"
        anchorY="middle"
        position={[0, COIN_THICKNESS / 2 + 0.001, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        font={undefined}
      >
        $
      </Text>
      <Text
        ref={textBackRef}
        fontSize={0.28}
        color="#8b6914"
        anchorX="center"
        anchorY="middle"
        position={[0, -(COIN_THICKNESS / 2 + 0.001), 0]}
        rotation={[Math.PI / 2, 0, Math.PI]}
        font={undefined}
      >
        T
      </Text>
    </mesh>
  )
}

// ---------------------------------------------------------------------------
// Coins Manager
// ---------------------------------------------------------------------------

function Coins() {
  const coinStates = useMemo(() => {
    const states: CoinState[] = []
    for (let i = 0; i < COIN_COUNT; i++) {
      const s = createCoinState()
      // Stagger initial Y so they don't all appear at once
      s.position.y = randomRange(SPAWN_Y - 5, SPAWN_Y + 15)
      states.push(s)
    }
    return states
  }, [])

  return (
    <>
      {coinStates.map((state, i) => (
        <Coin key={i} state={state} />
      ))}
    </>
  )
}

// ---------------------------------------------------------------------------
// Background Particles
// ---------------------------------------------------------------------------

function Particles() {
  const pointsRef = useRef<THREE.Points>(null)

  const { positions, velocities } = useMemo(() => {
    const pos = new Float32Array(PARTICLE_COUNT * 3)
    const vel = new Float32Array(PARTICLE_COUNT * 3)
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const i3 = i * 3
      pos[i3] = randomRange(-15, 15)
      pos[i3 + 1] = randomRange(-8, 15)
      pos[i3 + 2] = randomRange(-10, 10)
      vel[i3] = randomRange(-0.02, 0.02)
      vel[i3 + 1] = randomRange(0.01, 0.05)
      vel[i3 + 2] = randomRange(-0.02, 0.02)
    }
    return { positions: pos, velocities: vel }
  }, [])

  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    return geo
  }, [positions])

  useFrame(() => {
    const pts = pointsRef.current
    if (!pts) return
    const posAttr = pts.geometry.attributes.position as THREE.BufferAttribute
    const arr = posAttr.array as Float32Array

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const i3 = i * 3
      arr[i3] += velocities[i3]
      arr[i3 + 1] += velocities[i3 + 1]
      arr[i3 + 2] += velocities[i3 + 2]

      // Reset particles that drift too high
      if (arr[i3 + 1] > 16) {
        arr[i3] = randomRange(-15, 15)
        arr[i3 + 1] = randomRange(-8, -6)
        arr[i3 + 2] = randomRange(-10, 10)
      }
    }
    posAttr.needsUpdate = true
  })

  return (
    <points ref={pointsRef} geometry={geometry}>
      <pointsMaterial
        size={0.06}
        color="#ffd700"
        transparent
        opacity={0.4}
        sizeAttenuation
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  )
}

// ---------------------------------------------------------------------------
// Glow Particles (larger, fewer, more luminous)
// ---------------------------------------------------------------------------

function GlowParticles() {
  const pointsRef = useRef<THREE.Points>(null)

  const { positions, phases } = useMemo(() => {
    const count = 30
    const pos = new Float32Array(count * 3)
    const ph = new Float32Array(count)
    for (let i = 0; i < count; i++) {
      const i3 = i * 3
      pos[i3] = randomRange(-12, 12)
      pos[i3 + 1] = randomRange(-6, 14)
      pos[i3 + 2] = randomRange(-8, 8)
      ph[i] = randomRange(0, Math.PI * 2)
    }
    return { positions: pos, phases: ph }
  }, [])

  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    return geo
  }, [positions])

  useFrame(({ clock }) => {
    const pts = pointsRef.current
    if (!pts) return
    const posAttr = pts.geometry.attributes.position as THREE.BufferAttribute
    const arr = posAttr.array as Float32Array
    const t = clock.getElapsedTime()

    for (let i = 0; i < 30; i++) {
      const i3 = i * 3
      // Gentle floating motion
      arr[i3] += Math.sin(t * 0.3 + phases[i]) * 0.003
      arr[i3 + 1] += Math.cos(t * 0.2 + phases[i] * 1.3) * 0.004
      arr[i3 + 2] += Math.sin(t * 0.25 + phases[i] * 0.7) * 0.002
    }
    posAttr.needsUpdate = true

    // Pulsate opacity
    const mat = pts.material as THREE.PointsMaterial
    mat.opacity = 0.25 + Math.sin(t * 1.5) * 0.1
  })

  return (
    <points ref={pointsRef} geometry={geometry}>
      <pointsMaterial
        size={0.3}
        color="#ffb347"
        transparent
        opacity={0.3}
        sizeAttenuation
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  )
}

// ---------------------------------------------------------------------------
// Floor
// ---------------------------------------------------------------------------

function Floor() {
  return (
    <mesh position={[0, FLOOR_Y, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <planeGeometry args={[30, 20]} />
      <meshStandardMaterial
        color="#0a0a14"
        metalness={0.3}
        roughness={0.8}
        transparent
        opacity={0.6}
      />
    </mesh>
  )
}

// ---------------------------------------------------------------------------
// Scene (contains all 3D elements)
// ---------------------------------------------------------------------------

function Scene() {
  return (
    <>
      {/* Lighting */}
      <ambientLight intensity={0.3} color="#b0c4de" />
      <directionalLight
        position={[8, 12, 5]}
        intensity={1.8}
        color="#fff5e0"
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-camera-far={30}
        shadow-camera-near={1}
        shadow-camera-top={10}
        shadow-camera-bottom={-10}
        shadow-camera-left={-10}
        shadow-camera-right={10}
      />
      <directionalLight position={[-5, 8, -3]} intensity={0.6} color="#ffd700" />
      <pointLight position={[0, 2, 0]} intensity={0.8} color="#ffa500" distance={15} />

      {/* Objects */}
      <Coins />
      <Particles />
      <GlowParticles />
      <Floor />

      {/* Controls */}
      <OrbitControls
        enablePan={false}
        minDistance={5}
        maxDistance={25}
        minPolarAngle={Math.PI * 0.1}
        maxPolarAngle={Math.PI * 0.6}
        autoRotate
        autoRotateSpeed={0.3}
        target={[0, 0, 0]}
      />
    </>
  )
}

// ---------------------------------------------------------------------------
// Animated Counter Hook
// ---------------------------------------------------------------------------

function useAnimatedCounter(target: number, duration: number = 2000): number {
  const [value, setValue] = useState(0)
  const startTime = useRef<number | null>(null)
  const animFrame = useRef<number>(0)

  const animate = useCallback(
    (timestamp: number) => {
      if (startTime.current === null) startTime.current = timestamp
      const elapsed = timestamp - startTime.current
      const progress = Math.min(elapsed / duration, 1)
      // Ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3)
      setValue(Math.floor(eased * target))
      if (progress < 1) {
        animFrame.current = requestAnimationFrame(animate)
      }
    },
    [target, duration]
  )

  useEffect(() => {
    animFrame.current = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(animFrame.current)
  }, [animate])

  return value
}

// ---------------------------------------------------------------------------
// Stat Overlay
// ---------------------------------------------------------------------------

function StatOverlay() {
  const cost = useAnimatedCounter(12847, 2500)
  const tokens = useAnimatedCounter(2456789, 3000)

  const formattedCost = cost.toLocaleString('en-US')
  const formattedTokens =
    tokens >= 1_000_000
      ? `${(tokens / 1_000_000).toFixed(1)}M`
      : tokens >= 1_000
        ? `${(tokens / 1_000).toFixed(0)}K`
        : tokens.toString()

  return (
    <div
      style={{
        position: 'absolute',
        bottom: '2rem',
        left: '50%',
        transform: 'translateX(-50%)',
        display: 'flex',
        gap: '2rem',
        zIndex: 20,
        pointerEvents: 'none',
      }}
    >
      <div
        style={{
          background: 'rgba(0, 0, 0, 0.65)',
          backdropFilter: 'blur(12px)',
          border: '1px solid rgba(212, 160, 23, 0.3)',
          borderRadius: '12px',
          padding: '1rem 1.75rem',
          textAlign: 'center',
        }}
      >
        <div
          style={{
            fontSize: '0.75rem',
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
            color: 'rgba(255, 215, 0, 0.7)',
            marginBottom: '0.25rem',
          }}
        >
          Team Cost
        </div>
        <div
          style={{
            fontSize: '1.75rem',
            fontWeight: 700,
            fontFamily: 'monospace',
            color: '#ffd700',
            textShadow: '0 0 20px rgba(255, 215, 0, 0.4)',
          }}
        >
          ${formattedCost}
        </div>
      </div>
      <div
        style={{
          background: 'rgba(0, 0, 0, 0.65)',
          backdropFilter: 'blur(12px)',
          border: '1px solid rgba(212, 160, 23, 0.3)',
          borderRadius: '12px',
          padding: '1rem 1.75rem',
          textAlign: 'center',
        }}
      >
        <div
          style={{
            fontSize: '0.75rem',
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
            color: 'rgba(255, 215, 0, 0.7)',
            marginBottom: '0.25rem',
          }}
        >
          Total Tokens
        </div>
        <div
          style={{
            fontSize: '1.75rem',
            fontWeight: 700,
            fontFamily: 'monospace',
            color: '#ffd700',
            textShadow: '0 0 20px rgba(255, 215, 0, 0.4)',
          }}
        >
          {formattedTokens}
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Title Overlay
// ---------------------------------------------------------------------------

function TitleOverlay() {
  return (
    <div
      style={{
        position: 'absolute',
        top: '1.25rem',
        left: '1.5rem',
        zIndex: 20,
        pointerEvents: 'none',
      }}
    >
      <h1
        style={{
          fontSize: '1.5rem',
          fontWeight: 700,
          color: '#ffd700',
          margin: 0,
          textShadow: '0 0 30px rgba(255, 215, 0, 0.3)',
          letterSpacing: '-0.02em',
        }}
      >
        Flying Token Coins
      </h1>
      <p
        style={{
          fontSize: '0.8rem',
          color: 'rgba(255, 255, 255, 0.45)',
          margin: '0.25rem 0 0 0',
        }}
      >
        Drag to orbit -- Scroll to zoom
      </p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Page Component
// ---------------------------------------------------------------------------

export default function TokensPlaygroundPage() {
  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        height: 'calc(100vh - 48px)',
        background: '#05050f',
        overflow: 'hidden',
      }}
    >
      <TitleOverlay />
      <StatOverlay />
      <Canvas
        shadows
        camera={{ position: [0, 4, 14], fov: 50, near: 0.1, far: 100 }}
        gl={{
          antialias: true,
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 1.2,
        }}
        style={{ width: '100%', height: '100%' }}
      >
        <color attach="background" args={['#05050f']} />
        <fog attach="fog" args={['#05050f', 15, 35]} />
        <Scene />
      </Canvas>
    </div>
  )
}
