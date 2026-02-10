'use client'

import { useRef, useMemo, useState, useEffect } from 'react'
import * as THREE from 'three'
import { Canvas, useFrame } from '@react-three/fiber'
import { Text, RoundedBox, OrbitControls, Environment } from '@react-three/drei'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface LeaderEntry {
  rank: number
  name: string
  cost: string
  color: string
  medalColor: string
  spotlightColor: string
  podiumHeight: number
  xPos: number
}

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

const LEADERS: LeaderEntry[] = [
  {
    rank: 1,
    name: 'Alice',
    cost: '$4,230',
    color: '#ffd700',
    medalColor: '#ffd700',
    spotlightColor: '#ffd700',
    podiumHeight: 2.4,
    xPos: 0,
  },
  {
    rank: 2,
    name: 'Bob',
    cost: '$3,150',
    color: '#c0c0c0',
    medalColor: '#c0c0c0',
    spotlightColor: '#e8e8e8',
    podiumHeight: 1.8,
    xPos: -2.6,
  },
  {
    rank: 3,
    name: 'Charlie',
    cost: '$2,890',
    color: '#cd7f32',
    medalColor: '#cd7f32',
    spotlightColor: '#cd7f32',
    podiumHeight: 1.4,
    xPos: 2.6,
  },
]

const MEDAL_LABELS: Record<number, string> = {
  1: '1st',
  2: '2nd',
  3: '3rd',
}

// ---------------------------------------------------------------------------
// Confetti Particle System (1st place only)
// ---------------------------------------------------------------------------

function Confetti() {
  const count = 200
  const meshRef = useRef<THREE.InstancedMesh>(null!)
  const dummy = useMemo(() => new THREE.Object3D(), [])

  const particles = useMemo(() => {
    const arr: { pos: THREE.Vector3; vel: THREE.Vector3; rot: THREE.Euler; scale: number; color: THREE.Color }[] = []
    const palette = ['#ffd700', '#ff6b6b', '#4ecdc4', '#45b7d1', '#f9ca24', '#ff9ff3', '#54a0ff', '#5f27cd']
    for (let i = 0; i < count; i++) {
      arr.push({
        pos: new THREE.Vector3(
          (Math.random() - 0.5) * 8,
          Math.random() * 10 + 5,
          (Math.random() - 0.5) * 8
        ),
        vel: new THREE.Vector3(
          (Math.random() - 0.5) * 0.02,
          -(Math.random() * 0.02 + 0.01),
          (Math.random() - 0.5) * 0.02
        ),
        rot: new THREE.Euler(
          Math.random() * Math.PI * 2,
          Math.random() * Math.PI * 2,
          Math.random() * Math.PI * 2
        ),
        scale: Math.random() * 0.12 + 0.04,
        color: new THREE.Color(palette[Math.floor(Math.random() * palette.length)]),
      })
    }
    return arr
  }, [count])

  // Set per-instance colors once
  useEffect(() => {
    if (!meshRef.current) return
    for (let i = 0; i < count; i++) {
      meshRef.current.setColorAt(i, particles[i].color)
    }
    if (meshRef.current.instanceColor) {
      meshRef.current.instanceColor.needsUpdate = true
    }
  }, [particles, count])

  useFrame(() => {
    if (!meshRef.current) return
    for (let i = 0; i < count; i++) {
      const p = particles[i]
      p.pos.add(p.vel)
      p.rot.x += 0.02
      p.rot.y += 0.03

      // Reset to top when fallen below ground
      if (p.pos.y < -1) {
        p.pos.y = Math.random() * 4 + 8
        p.pos.x = (Math.random() - 0.5) * 8
        p.pos.z = (Math.random() - 0.5) * 8
      }

      dummy.position.copy(p.pos)
      dummy.rotation.copy(p.rot)
      dummy.scale.setScalar(p.scale)
      dummy.updateMatrix()
      meshRef.current.setMatrixAt(i, dummy.matrix)
    }
    meshRef.current.instanceMatrix.needsUpdate = true
  })

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, count]} frustumCulled={false}>
      <boxGeometry args={[1, 1, 0.15]} />
      <meshStandardMaterial roughness={0.4} metalness={0.3} />
    </instancedMesh>
  )
}

// ---------------------------------------------------------------------------
// Podium Platform (animated rise)
// ---------------------------------------------------------------------------

function PodiumPlatform({
  height,
  xPos,
  color,
  delay,
}: {
  height: number
  xPos: number
  color: string
  delay: number
}) {
  const groupRef = useRef<THREE.Group>(null!)
  const [animProgress, setAnimProgress] = useState(0)

  useFrame((_, delta) => {
    if (animProgress < 1) {
      const next = Math.min(animProgress + delta * 0.8 * (1 / (delay * 0.3 + 1)), 1)
      setAnimProgress(next)
    }
    if (groupRef.current) {
      // Ease-out cubic
      const t = 1 - Math.pow(1 - animProgress, 3)
      groupRef.current.position.y = -height / 2 + t * (height / 2)
      groupRef.current.scale.y = t
    }
  })

  return (
    <group ref={groupRef} position={[xPos, 0, 0]}>
      <RoundedBox args={[2, height, 2]} radius={0.15} smoothness={4} position={[0, 0, 0]}>
        <meshStandardMaterial
          color={color}
          metalness={0.85}
          roughness={0.15}
          envMapIntensity={1.2}
        />
      </RoundedBox>
      {/* Rank number on front face */}
      <Text
        position={[0, 0, 1.02]}
        fontSize={0.7}
        color="#ffffff"
        anchorX="center"
        anchorY="middle"
        font={undefined}
      >
        {MEDAL_LABELS[delay === 0 ? 1 : delay === 1 ? 2 : 3] ?? ''}
        <meshStandardMaterial
          color="#ffffff"
          metalness={0.3}
          roughness={0.6}
          transparent
          opacity={0.7}
        />
      </Text>
    </group>
  )
}

// ---------------------------------------------------------------------------
// Avatar (capsule body + sphere head)
// ---------------------------------------------------------------------------

function Avatar({
  xPos,
  podiumHeight,
  bodyColor,
}: {
  xPos: number
  podiumHeight: number
  bodyColor: string
}) {
  const groupRef = useRef<THREE.Group>(null!)
  const [visible, setVisible] = useState(false)

  useFrame((state) => {
    // Show avatar after podium has risen
    if (!visible && state.clock.elapsedTime > 1.5) {
      setVisible(true)
    }
    if (groupRef.current && visible) {
      // Gentle bobbing
      groupRef.current.position.y =
        podiumHeight + 0.85 + Math.sin(state.clock.elapsedTime * 2 + xPos) * 0.05
    }
  })

  if (!visible) return null

  return (
    <group ref={groupRef} position={[xPos, podiumHeight + 0.85, 0]}>
      {/* Body (capsule shape using cylinder + two hemispheres) */}
      <mesh position={[0, 0, 0]}>
        <capsuleGeometry args={[0.3, 0.7, 8, 16]} />
        <meshStandardMaterial
          color={bodyColor}
          metalness={0.2}
          roughness={0.6}
        />
      </mesh>
      {/* Head */}
      <mesh position={[0, 0.75, 0]}>
        <sphereGeometry args={[0.28, 16, 16]} />
        <meshStandardMaterial
          color="#ffe0bd"
          metalness={0.1}
          roughness={0.7}
        />
      </mesh>
      {/* Eyes */}
      <mesh position={[-0.1, 0.78, 0.22]}>
        <sphereGeometry args={[0.04, 8, 8]} />
        <meshStandardMaterial color="#333333" />
      </mesh>
      <mesh position={[0.1, 0.78, 0.22]}>
        <sphereGeometry args={[0.04, 8, 8]} />
        <meshStandardMaterial color="#333333" />
      </mesh>
    </group>
  )
}

// ---------------------------------------------------------------------------
// Floating Label (name + cost + medal badge)
// ---------------------------------------------------------------------------

function FloatingLabel({
  xPos,
  podiumHeight,
  name,
  cost,
  medalColor,
  rank,
}: {
  xPos: number
  podiumHeight: number
  name: string
  cost: string
  medalColor: string
  rank: number
}) {
  const groupRef = useRef<THREE.Group>(null!)
  const [visible, setVisible] = useState(false)

  useFrame((state) => {
    if (!visible && state.clock.elapsedTime > 2.0) {
      setVisible(true)
    }
    if (groupRef.current && visible) {
      groupRef.current.position.y =
        podiumHeight + 2.4 + Math.sin(state.clock.elapsedTime * 1.5 + xPos * 2) * 0.08
      // Face camera
      groupRef.current.quaternion.copy(state.camera.quaternion)
    }
  })

  if (!visible) return null

  const medalEmoji = rank === 1 ? '\u{1F947}' : rank === 2 ? '\u{1F948}' : '\u{1F949}'

  return (
    <group ref={groupRef} position={[xPos, podiumHeight + 2.4, 0]}>
      {/* Background panel */}
      <mesh position={[0, 0, -0.02]}>
        <planeGeometry args={[2.4, 1.1]} />
        <meshStandardMaterial
          color="#111111"
          transparent
          opacity={0.75}
          side={THREE.DoubleSide}
        />
      </mesh>
      {/* Medal circle */}
      <mesh position={[0, 0.22, 0.01]}>
        <circleGeometry args={[0.18, 32]} />
        <meshStandardMaterial
          color={medalColor}
          metalness={0.9}
          roughness={0.1}
          emissive={medalColor}
          emissiveIntensity={0.3}
        />
      </mesh>
      <Text
        position={[0, 0.22, 0.02]}
        fontSize={0.18}
        color="#000000"
        anchorX="center"
        anchorY="middle"
        font={undefined}
      >
        {medalEmoji}
      </Text>
      {/* Name */}
      <Text
        position={[0, -0.08, 0.01]}
        fontSize={0.22}
        color="#ffffff"
        anchorX="center"
        anchorY="middle"
        fontWeight="bold"
        font={undefined}
      >
        {name}
      </Text>
      {/* Cost */}
      <Text
        position={[0, -0.34, 0.01]}
        fontSize={0.26}
        color={medalColor}
        anchorX="center"
        anchorY="middle"
        fontWeight="bold"
        font={undefined}
      >
        {cost}
      </Text>
    </group>
  )
}

// ---------------------------------------------------------------------------
// Ground Plane
// ---------------------------------------------------------------------------

function Ground() {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} receiveShadow>
      <planeGeometry args={[30, 30]} />
      <meshStandardMaterial
        color="#0a0a0f"
        metalness={0.8}
        roughness={0.3}
      />
    </mesh>
  )
}

// ---------------------------------------------------------------------------
// Spotlight Beam (volumetric cone)
// ---------------------------------------------------------------------------

function SpotlightBeam({
  xPos,
  color,
  podiumHeight,
}: {
  xPos: number
  color: string
  podiumHeight: number
}) {
  return (
    <group position={[xPos, podiumHeight + 6, 0]}>
      {/* Cone beam visual */}
      <mesh rotation={[Math.PI, 0, 0]}>
        <coneGeometry args={[1.8, 6 + podiumHeight, 32, 1, true]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.04}
          side={THREE.DoubleSide}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>
      {/* Point light */}
      <pointLight
        color={color}
        intensity={8}
        distance={15}
        decay={2}
        position={[0, 2, 0]}
      />
    </group>
  )
}

// ---------------------------------------------------------------------------
// Scene (composes everything)
// ---------------------------------------------------------------------------

function Scene() {
  return (
    <>
      {/* Environment lighting */}
      <ambientLight intensity={0.15} />
      <directionalLight position={[5, 10, 5]} intensity={0.4} color="#ffffff" />
      <Environment preset="night" />

      {/* Ground */}
      <Ground />

      {/* Podium platforms with staggered animation */}
      {LEADERS.map((leader) => (
        <PodiumPlatform
          key={leader.rank}
          height={leader.podiumHeight}
          xPos={leader.xPos}
          color={leader.color}
          delay={leader.rank - 1}
        />
      ))}

      {/* Avatars */}
      {LEADERS.map((leader) => (
        <Avatar
          key={`avatar-${leader.rank}`}
          xPos={leader.xPos}
          podiumHeight={leader.podiumHeight}
          bodyColor={leader.rank === 1 ? '#e74c3c' : leader.rank === 2 ? '#3498db' : '#2ecc71'}
        />
      ))}

      {/* Floating labels */}
      {LEADERS.map((leader) => (
        <FloatingLabel
          key={`label-${leader.rank}`}
          xPos={leader.xPos}
          podiumHeight={leader.podiumHeight}
          name={leader.name}
          cost={leader.cost}
          medalColor={leader.medalColor}
          rank={leader.rank}
        />
      ))}

      {/* Spotlight beams */}
      {LEADERS.map((leader) => (
        <SpotlightBeam
          key={`spot-${leader.rank}`}
          xPos={leader.xPos}
          color={leader.spotlightColor}
          podiumHeight={leader.podiumHeight}
        />
      ))}

      {/* Confetti for 1st place */}
      <Confetti />

      {/* Camera controls */}
      <OrbitControls
        autoRotate
        autoRotateSpeed={0.6}
        enablePan={false}
        minPolarAngle={Math.PI / 6}
        maxPolarAngle={Math.PI / 2.2}
        minDistance={5}
        maxDistance={18}
        target={[0, 1.5, 0]}
      />
    </>
  )
}

// ---------------------------------------------------------------------------
// Page Component
// ---------------------------------------------------------------------------

export default function PodiumPage() {
  return (
    <div className="relative w-full" style={{ height: 'calc(100vh - 48px)' }}>
      {/* Dark gradient background */}
      <div
        className="absolute inset-0 z-0"
        style={{
          background: 'radial-gradient(ellipse at 50% 30%, #1a1a2e 0%, #0a0a0f 60%, #000000 100%)',
        }}
      />

      {/* Title overlay */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex flex-col items-center pt-6">
        <h1
          className="text-3xl font-bold tracking-tight text-white md:text-4xl"
          style={{
            textShadow: '0 0 30px rgba(255, 215, 0, 0.3), 0 2px 4px rgba(0,0,0,0.8)',
          }}
        >
          3D Leaderboard Podium
        </h1>
        <p className="mt-2 text-sm text-white/50">
          Top contributors this month
        </p>
      </div>

      {/* 3D Canvas */}
      <Canvas
        className="absolute inset-0 z-[1]"
        camera={{ position: [6, 5, 8], fov: 50 }}
        gl={{
          antialias: true,
          alpha: true,
          powerPreference: 'high-performance',
        }}
        dpr={[1, 2]}
      >
        <Scene />
      </Canvas>

      {/* Bottom legend */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex justify-center gap-6 pb-6">
        {LEADERS.sort((a, b) => a.rank - b.rank).map((leader) => (
          <div
            key={leader.rank}
            className="flex items-center gap-2 rounded-full border border-white/10 bg-black/60 px-4 py-2 backdrop-blur-sm"
          >
            <div
              className="h-3 w-3 rounded-full"
              style={{
                backgroundColor: leader.medalColor,
                boxShadow: `0 0 8px ${leader.medalColor}40`,
              }}
            />
            <span className="text-xs font-medium text-white/80">
              #{leader.rank} {leader.name}
            </span>
            <span
              className="font-mono text-xs font-bold"
              style={{ color: leader.medalColor }}
            >
              {leader.cost}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
