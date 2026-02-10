'use client'

import { useRef, useMemo } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { Stars, Text, OrbitControls } from '@react-three/drei'
import * as THREE from 'three'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PlanetModel {
  name: string
  cost: string // pre-formatted like "$5,200"
  percentage: number // 0-100
}

interface PlanetsSceneProps {
  models: PlanetModel[] // can be 1-N models
}

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
// Constants
// ---------------------------------------------------------------------------

const SUN_RADIUS = 1.2

const COLOR_PALETTE = ['#6C3EC1', '#0EA5E9', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6']

/**
 * Darken a hex color by a factor (0-1, where 0 = black, 1 = original).
 */
function darkenColor(hex: string, factor: number): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  const dr = Math.round(r * factor)
  const dg = Math.round(g * factor)
  const db = Math.round(b * factor)
  return `#${dr.toString(16).padStart(2, '0')}${dg.toString(16).padStart(2, '0')}${db.toString(16).padStart(2, '0')}`
}

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

function Scene({ planets }: { planets: PlanetConfig[] }) {
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
      {planets.map((p) => (
        <OrbitRing key={`ring-${p.name}`} radius={p.orbitRadius} />
      ))}

      {/* Planets */}
      {planets.map((p) => (
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
// PlanetsScene Component
// ---------------------------------------------------------------------------

export function PlanetsScene({ models }: PlanetsSceneProps) {
  const derivedPlanets = useMemo<PlanetConfig[]>(() => {
    return models.map((model, index) => {
      // Scale percentage (0-100) to radius range [0.25, 0.7]
      const radius = 0.25 + (model.percentage / 100) * (0.7 - 0.25)

      // Orbit radius: start at 5, spacing 3 apart
      const orbitRadius = 5 + index * 3

      // Orbit speed: outer planets orbit faster
      const orbitSpeed = 0.15 + index * 0.15

      // Self rotation speed
      const selfRotationSpeed = 0.3 + index * 0.2

      // Color from palette, cycling by index
      const color = COLOR_PALETTE[index % COLOR_PALETTE.length]

      // Emissive: slightly darker version of the color
      const emissive = darkenColor(color, 0.7)

      return {
        name: model.name,
        cost: model.cost,
        radius,
        orbitRadius,
        orbitSpeed,
        selfRotationSpeed,
        color,
        emissive,
      }
    })
  }, [models])

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative', background: '#000000' }}>
      {/* Three.js Canvas */}
      <Canvas
        camera={{ position: [0, 10, 18], fov: 50 }}
        gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.2 }}
        style={{ width: '100%', height: '100%' }}
      >
        <color attach="background" args={['#030308']} />
        <Scene planets={derivedPlanets} />
      </Canvas>
    </div>
  )
}
