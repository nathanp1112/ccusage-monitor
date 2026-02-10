'use client'

import { useRef, useMemo } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { Stars, Text, OrbitControls } from '@react-three/drei'
import * as THREE from 'three'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PlanetConfig {
  name: string
  cost: string
  radius: number
  orbitRadius: number
  orbitSpeed: number
  selfRotationSpeed: number
  color: string
  emissive: string
}

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

const PLANETS: PlanetConfig[] = [
  {
    name: 'Opus',
    cost: '$5,200',
    radius: 0.6,
    orbitRadius: 5,
    orbitSpeed: 0.15,
    selfRotationSpeed: 0.3,
    color: '#6C3EC1',
    emissive: '#4B0082',
  },
  {
    name: 'Sonnet',
    cost: '$4,100',
    radius: 0.45,
    orbitRadius: 8,
    orbitSpeed: 0.3,
    selfRotationSpeed: 0.5,
    color: '#0EA5E9',
    emissive: '#0284C7',
  },
  {
    name: 'Haiku',
    cost: '$1,200',
    radius: 0.3,
    orbitRadius: 11,
    orbitSpeed: 0.55,
    selfRotationSpeed: 0.8,
    color: '#10B981',
    emissive: '#059669',
  },
]

const SUN_RADIUS = 1.2

// ---------------------------------------------------------------------------
// Sun Component
// ---------------------------------------------------------------------------

function Sun() {
  const meshRef = useRef<THREE.Mesh>(null)

  useFrame(({ clock }) => {
    if (!meshRef.current) return
    const t = clock.getElapsedTime()
    const scale = 1 + Math.sin(t * 1.5) * 0.04
    meshRef.current.scale.set(scale, scale, scale)
  })

  return (
    <group>
      {/* Core sphere */}
      <mesh ref={meshRef}>
        <sphereGeometry args={[SUN_RADIUS, 64, 64]} />
        <meshStandardMaterial
          color="#FFA500"
          emissive="#FF8C00"
          emissiveIntensity={2.5}
          toneMapped={false}
        />
      </mesh>

      {/* Inner glow layer */}
      <mesh>
        <sphereGeometry args={[SUN_RADIUS * 1.15, 32, 32]} />
        <meshBasicMaterial
          color="#FFA500"
          transparent
          opacity={0.15}
          side={THREE.BackSide}
        />
      </mesh>

      {/* Outer glow layer */}
      <mesh>
        <sphereGeometry args={[SUN_RADIUS * 1.4, 32, 32]} />
        <meshBasicMaterial
          color="#FF6B00"
          transparent
          opacity={0.06}
          side={THREE.BackSide}
        />
      </mesh>

      {/* Sun label */}
      <Text
        position={[0, SUN_RADIUS + 0.8, 0]}
        fontSize={0.35}
        color="#FFD700"
        anchorX="center"
        anchorY="middle"
        fontWeight="bold"
      >
        Team
      </Text>

      {/* Sun point light */}
      <pointLight
        color="#FFA500"
        intensity={80}
        distance={50}
        decay={2}
      />
    </group>
  )
}

// ---------------------------------------------------------------------------
// Orbit Ring Component
// ---------------------------------------------------------------------------

function OrbitRing({ radius }: { radius: number }) {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]}>
      <torusGeometry args={[radius, 0.015, 16, 128]} />
      <meshBasicMaterial color="#ffffff" transparent opacity={0.08} />
    </mesh>
  )
}

// ---------------------------------------------------------------------------
// Planet Component
// ---------------------------------------------------------------------------

function Planet({ config }: { config: PlanetConfig }) {
  const groupRef = useRef<THREE.Group>(null)
  const meshRef = useRef<THREE.Mesh>(null)

  // Create the atmosphere material once
  const atmosphereMaterial = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: config.color,
        transparent: true,
        opacity: 0.12,
        side: THREE.BackSide,
      }),
    [config.color]
  )

  useFrame(({ clock }) => {
    if (!groupRef.current || !meshRef.current) return
    const t = clock.getElapsedTime()

    // Orbital motion
    const angle = t * config.orbitSpeed
    groupRef.current.position.x = Math.cos(angle) * config.orbitRadius
    groupRef.current.position.z = Math.sin(angle) * config.orbitRadius

    // Self rotation
    meshRef.current.rotation.y += config.selfRotationSpeed * 0.01
  })

  return (
    <group ref={groupRef}>
      {/* Planet body */}
      <mesh ref={meshRef}>
        <sphereGeometry args={[config.radius, 48, 48]} />
        <meshStandardMaterial
          color={config.color}
          emissive={config.emissive}
          emissiveIntensity={0.6}
          roughness={0.5}
          metalness={0.3}
        />
      </mesh>

      {/* Atmosphere glow */}
      <mesh>
        <sphereGeometry args={[config.radius * 1.25, 32, 32]} />
        <primitive object={atmosphereMaterial} attach="material" />
      </mesh>

      {/* Label: model name */}
      <Text
        position={[0, config.radius + 0.55, 0]}
        fontSize={0.28}
        color="#ffffff"
        anchorX="center"
        anchorY="middle"
        fontWeight="bold"
      >
        {config.name}
      </Text>

      {/* Label: cost */}
      <Text
        position={[0, config.radius + 0.28, 0]}
        fontSize={0.2}
        color={config.color}
        anchorX="center"
        anchorY="middle"
      >
        {config.cost}
      </Text>
    </group>
  )
}

// ---------------------------------------------------------------------------
// Scene (assembles everything inside Canvas)
// ---------------------------------------------------------------------------

function Scene() {
  return (
    <>
      {/* Lighting */}
      <ambientLight intensity={0.15} />

      {/* Background stars */}
      <Stars
        radius={100}
        depth={80}
        count={4000}
        factor={4}
        saturation={0}
        fade
        speed={0.5}
      />

      {/* Sun */}
      <Sun />

      {/* Orbit rings */}
      {PLANETS.map((p) => (
        <OrbitRing key={`ring-${p.name}`} radius={p.orbitRadius} />
      ))}

      {/* Planets */}
      {PLANETS.map((p) => (
        <Planet key={p.name} config={p} />
      ))}

      {/* Camera controls */}
      <OrbitControls
        autoRotate
        autoRotateSpeed={0.3}
        enablePan={false}
        minDistance={6}
        maxDistance={30}
        maxPolarAngle={Math.PI * 0.85}
      />
    </>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function PlanetsPage() {
  return (
    <div style={{ width: '100%', height: 'calc(100vh - 48px)', position: 'relative', background: '#000000' }}>
      {/* Title overlay */}
      <div
        style={{
          position: 'absolute',
          top: 24,
          left: 0,
          right: 0,
          zIndex: 10,
          textAlign: 'center',
          pointerEvents: 'none',
        }}
      >
        <h1
          style={{
            margin: 0,
            fontSize: 28,
            fontWeight: 700,
            color: '#ffffff',
            letterSpacing: '0.04em',
          }}
        >
          Orbiting Model Planets
        </h1>
        <p
          style={{
            margin: '6px 0 0',
            fontSize: 14,
            color: 'rgba(255,255,255,0.5)',
          }}
        >
          Each planet represents a Claude model and its team cost
        </p>
      </div>

      {/* Three.js Canvas */}
      <Canvas
        camera={{ position: [0, 10, 18], fov: 50 }}
        gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.2 }}
        style={{ width: '100%', height: '100%' }}
      >
        <color attach="background" args={['#030308']} />
        <Scene />
      </Canvas>
    </div>
  )
}
