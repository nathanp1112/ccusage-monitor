'use client'

import { useRef, useMemo, useState } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { Text, OrbitControls } from '@react-three/drei'
import * as THREE from 'three'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ARC_RADIUS = 3.2
const ARC_TUBE = 0.18
const TICK_COUNT = 9 // 0 .. 100 in steps of 12.5
const NEEDLE_LENGTH = 2.8
const NEEDLE_WIDTH = 0.06

// Angle mapping: the gauge arc sweeps from PI (left, 0 %) to 0 (right, 100 %)
function valueToAngle(v: number) {
  return Math.PI * (1 - v)
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UsageMeterSceneProps {
  burnRate: number // 0 to 1
}

// ---------------------------------------------------------------------------
// Gauge Arc  -- semicircular dial with colour gradient
// ---------------------------------------------------------------------------

function GaugeArc() {
  const mesh = useRef<THREE.Mesh>(null)

  const geometry = useMemo(() => {
    const segments = 128
    const geo = new THREE.TorusGeometry(ARC_RADIUS, ARC_TUBE, 16, segments, Math.PI)

    // Vertex colours: green -> yellow -> red across the arc
    const count = geo.attributes.position.count
    const colors = new Float32Array(count * 3)
    const uv = geo.attributes.uv

    for (let i = 0; i < count; i++) {
      // Use the U coordinate to drive the gradient (0 = left/green, 1 = right/red)
      const t = uv ? uv.getX(i) : i / count

      let r: number, g: number, b: number
      if (t < 0.5) {
        // green -> yellow
        const s = t / 0.5
        r = s * 1.0
        g = 0.85
        b = 0.15 * (1 - s)
      } else {
        // yellow -> red
        const s = (t - 0.5) / 0.5
        r = 1.0
        g = 0.85 * (1 - s * 0.85)
        b = 0.0
      }

      colors[i * 3] = r
      colors[i * 3 + 1] = g
      colors[i * 3 + 2] = b
    }

    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    return geo
  }, [])

  return (
    <mesh ref={mesh} geometry={geometry} rotation={[0, 0, 0]}>
      <meshStandardMaterial vertexColors roughness={0.35} metalness={0.3} />
    </mesh>
  )
}

// ---------------------------------------------------------------------------
// Outer rim  -- thin decorative ring behind the dial
// ---------------------------------------------------------------------------

function OuterRim() {
  return (
    <mesh position={[0, 0, -0.12]}>
      <torusGeometry args={[ARC_RADIUS + 0.35, 0.04, 12, 128, Math.PI]} />
      <meshStandardMaterial color="#444" metalness={0.6} roughness={0.4} />
    </mesh>
  )
}

// ---------------------------------------------------------------------------
// Tick Marks & Labels
// ---------------------------------------------------------------------------

function TickMarks() {
  const ticks = useMemo(() => {
    const items: { position: [number, number, number]; rotation: [number, number, number]; major: boolean; label: string }[] = []
    for (let i = 0; i <= TICK_COUNT; i++) {
      const t = i / TICK_COUNT
      const angle = valueToAngle(t)
      const r = ARC_RADIUS + 0.55
      const x = Math.cos(angle) * r
      const y = Math.sin(angle) * r
      const major = i % 2 === 0
      items.push({
        position: [x, y, 0],
        rotation: [0, 0, angle - Math.PI / 2],
        major,
        label: major ? `${Math.round(t * 100)}%` : '',
      })
    }
    return items
  }, [])

  return (
    <group>
      {ticks.map((tick, i) => (
        <group key={i} position={tick.position} rotation={tick.rotation}>
          <mesh>
            <boxGeometry args={[tick.major ? 0.06 : 0.03, tick.major ? 0.35 : 0.2, 0.04]} />
            <meshStandardMaterial color={tick.major ? '#ccc' : '#888'} />
          </mesh>
        </group>
      ))}
    </group>
  )
}

function TickLabels() {
  const labels = useMemo(() => {
    const items: { position: [number, number, number]; text: string }[] = []
    const percentages = [0, 25, 50, 75, 100]
    for (const pct of percentages) {
      const t = pct / 100
      const angle = valueToAngle(t)
      const r = ARC_RADIUS + 1.05
      const x = Math.cos(angle) * r
      const y = Math.sin(angle) * r
      items.push({ position: [x, y, 0.05], text: `${pct}%` })
    }
    return items
  }, [])

  return (
    <group>
      {labels.map((item, i) => (
        <Text
          key={i}
          position={item.position}
          fontSize={0.28}
          color="#aaaaaa"
          anchorX="center"
          anchorY="middle"
          font={undefined}
        >
          {item.text}
        </Text>
      ))}
    </group>
  )
}

// ---------------------------------------------------------------------------
// Needle  -- animated with spring-like overshoot
// ---------------------------------------------------------------------------

function Needle({ burnRate }: { burnRate: number }) {
  const groupRef = useRef<THREE.Group>(null)
  const glowRef = useRef<THREE.Mesh>(null)
  const timeRef = useRef(0)
  const [arrived, setArrived] = useState(false)

  useFrame((_, delta) => {
    if (!groupRef.current) return
    timeRef.current += delta

    const t = timeRef.current
    // Spring animation: critically under-damped oscillation
    const dampedT = 1 - Math.exp(-2.5 * t) * Math.cos(6 * t)
    const currentValue = burnRate * Math.min(dampedT, 1.0 + 0.001)
    const angle = valueToAngle(Math.max(0, Math.min(1, currentValue)))

    groupRef.current.rotation.z = angle

    // Detect arrival (close to final position after initial oscillation)
    if (t > 1.8 && !arrived) setArrived(true)

    // Subtle idle wobble after arriving
    if (arrived) {
      const wobble = Math.sin(t * 3) * 0.003 + Math.sin(t * 7.3) * 0.001
      groupRef.current.rotation.z = valueToAngle(burnRate) + wobble
    }

    // Pulsing glow at needle tip
    if (glowRef.current) {
      const pulse = 0.8 + 0.4 * Math.sin(t * 4)
      glowRef.current.scale.setScalar(pulse)
      const mat = glowRef.current.material as THREE.MeshBasicMaterial
      if (mat) mat.opacity = 0.3 + 0.3 * Math.sin(t * 4)
    }
  })

  return (
    <group ref={groupRef} rotation={[0, 0, Math.PI]}>
      {/* Needle body */}
      <mesh position={[NEEDLE_LENGTH / 2, 0, 0.1]}>
        <boxGeometry args={[NEEDLE_LENGTH, NEEDLE_WIDTH, 0.04]} />
        <meshStandardMaterial color="#ff3333" metalness={0.5} roughness={0.3} />
      </mesh>

      {/* Needle tip -- pointed */}
      <mesh position={[NEEDLE_LENGTH + 0.12, 0, 0.1]} rotation={[0, 0, Math.PI / 4]}>
        <boxGeometry args={[0.1, 0.1, 0.04]} />
        <meshStandardMaterial color="#ff5555" metalness={0.5} roughness={0.3} />
      </mesh>

      {/* Glow at tip */}
      <mesh ref={glowRef} position={[NEEDLE_LENGTH + 0.12, 0, 0.12]}>
        <sphereGeometry args={[0.2, 16, 16]} />
        <meshBasicMaterial color="#ff4422" transparent opacity={0.5} />
      </mesh>

      {/* Center hub */}
      <mesh position={[0, 0, 0.15]}>
        <cylinderGeometry args={[0.22, 0.22, 0.12, 32]} />
        <meshStandardMaterial color="#333" metalness={0.7} roughness={0.2} />
      </mesh>
    </group>
  )
}

// ---------------------------------------------------------------------------
// Digital Readout
// ---------------------------------------------------------------------------

function DigitalReadout({ burnRate }: { burnRate: number }) {
  const textRef = useRef<THREE.Mesh>(null)
  const timeRef = useRef(0)
  const [displayValue, setDisplayValue] = useState(0)

  useFrame((_, delta) => {
    timeRef.current += delta
    const t = timeRef.current
    const dampedT = 1 - Math.exp(-2.5 * t) * Math.cos(6 * t)
    const current = burnRate * Math.min(dampedT, 1.0)
    setDisplayValue(Math.round(Math.max(0, Math.min(100, current * 100))))
  })

  return (
    <Text
      ref={textRef}
      position={[0, -0.6, 0.2]}
      fontSize={0.7}
      color="#ff9944"
      anchorX="center"
      anchorY="middle"
      font={undefined}
    >
      {`${displayValue}%`}
    </Text>
  )
}

// ---------------------------------------------------------------------------
// Floating Particles / Energy Effects
// ---------------------------------------------------------------------------

function Particles({ count = 60 }: { count?: number }) {
  const meshRef = useRef<THREE.InstancedMesh>(null)
  const dummy = useMemo(() => new THREE.Object3D(), [])

  const particleData = useMemo(() => {
    return Array.from({ length: count }, () => ({
      angle: Math.random() * Math.PI,
      radius: ARC_RADIUS + 0.5 + Math.random() * 1.5,
      speed: 0.2 + Math.random() * 0.6,
      offset: Math.random() * Math.PI * 2,
      size: 0.02 + Math.random() * 0.04,
      zOffset: (Math.random() - 0.5) * 1.5,
    }))
  }, [count])

  useFrame(({ clock }) => {
    if (!meshRef.current) return
    const t = clock.getElapsedTime()

    for (let i = 0; i < count; i++) {
      const p = particleData[i]
      const angle = p.angle + Math.sin(t * p.speed + p.offset) * 0.3
      const radius = p.radius + Math.sin(t * 0.8 + p.offset) * 0.3
      const x = Math.cos(angle) * radius
      const y = Math.sin(angle) * radius
      const z = p.zOffset + Math.sin(t * 1.2 + p.offset) * 0.2

      dummy.position.set(x, y, z)
      dummy.scale.setScalar(p.size * (0.8 + 0.4 * Math.sin(t * 3 + p.offset)))
      dummy.updateMatrix()
      meshRef.current.setMatrixAt(i, dummy.matrix)
    }
    meshRef.current.instanceMatrix.needsUpdate = true
  })

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, count]}>
      <sphereGeometry args={[1, 8, 8]} />
      <meshBasicMaterial color="#ff8844" transparent opacity={0.6} />
    </instancedMesh>
  )
}

// ---------------------------------------------------------------------------
// Energy Ring  -- rotating ring of small spheres around the gauge
// ---------------------------------------------------------------------------

function EnergyRing() {
  const groupRef = useRef<THREE.Group>(null)

  useFrame(({ clock }) => {
    if (groupRef.current) {
      groupRef.current.rotation.z = clock.getElapsedTime() * 0.15
    }
  })

  const dots = useMemo(() => {
    return Array.from({ length: 36 }, (_, i) => {
      const angle = (i / 36) * Math.PI
      const r = ARC_RADIUS + 0.9
      return {
        position: [Math.cos(angle) * r, Math.sin(angle) * r, -0.05] as [number, number, number],
        scale: 0.03 + (i % 3 === 0 ? 0.02 : 0),
      }
    })
  }, [])

  return (
    <group ref={groupRef}>
      {dots.map((dot, i) => (
        <mesh key={i} position={dot.position}>
          <sphereGeometry args={[dot.scale, 8, 8]} />
          <meshBasicMaterial color="#665533" transparent opacity={0.4} />
        </mesh>
      ))}
    </group>
  )
}

// ---------------------------------------------------------------------------
// The Complete Gauge Assembly  -- slowly rotates on Y axis
// ---------------------------------------------------------------------------

function GaugeAssembly({ burnRate }: { burnRate: number }) {
  const groupRef = useRef<THREE.Group>(null)

  useFrame(({ clock }) => {
    if (groupRef.current) {
      groupRef.current.rotation.y = Math.sin(clock.getElapsedTime() * 0.15) * 0.25
    }
  })

  return (
    <group ref={groupRef} rotation={[0.3, 0, 0]}>
      {/* Back plate */}
      <mesh position={[0, 1.2, -0.25]}>
        <circleGeometry args={[ARC_RADIUS + 0.6, 64, 0, Math.PI]} />
        <meshStandardMaterial color="#1a1a1a" metalness={0.3} roughness={0.7} side={THREE.DoubleSide} />
      </mesh>

      <OuterRim />
      <GaugeArc />
      <TickMarks />
      <TickLabels />
      <Needle burnRate={burnRate} />
      <DigitalReadout burnRate={burnRate} />

      {/* "Team Burn Rate" label */}
      <Text
        position={[0, -1.4, 0.1]}
        fontSize={0.36}
        color="#cccccc"
        anchorX="center"
        anchorY="middle"
        font={undefined}
        letterSpacing={0.08}
      >
        Team Burn Rate
      </Text>

      {/* Sub-label */}
      <Text
        position={[0, -1.85, 0.1]}
        fontSize={0.18}
        color="#666666"
        anchorX="center"
        anchorY="middle"
        font={undefined}
        letterSpacing={0.05}
      >
        Monthly Budget Utilization
      </Text>

      <Particles count={60} />
      <EnergyRing />

      {/* Decorative base */}
      <mesh position={[0, -0.15, -0.15]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[4.2, 4.4, 0.1, 64, 1, false, 0, Math.PI]} />
        <meshStandardMaterial color="#111111" metalness={0.5} roughness={0.5} />
      </mesh>
    </group>
  )
}

// ---------------------------------------------------------------------------
// Scene  -- lighting setup
// ---------------------------------------------------------------------------

function Scene({ burnRate }: { burnRate: number }) {
  return (
    <>
      {/* Ambient base */}
      <ambientLight intensity={0.3} />

      {/* Warm orange key light */}
      <pointLight position={[3, 4, 5]} intensity={40} color="#ff9944" />

      {/* Cool fill from the left */}
      <pointLight position={[-4, 2, 3]} intensity={15} color="#4488ff" />

      {/* Subtle back light */}
      <pointLight position={[0, -2, -4]} intensity={10} color="#ff6633" />

      {/* Top accent */}
      <pointLight position={[0, 6, 2]} intensity={8} color="#ffcc88" />

      <GaugeAssembly burnRate={burnRate} />

      <OrbitControls
        enablePan={false}
        enableZoom={true}
        minDistance={4}
        maxDistance={15}
        minPolarAngle={Math.PI * 0.2}
        maxPolarAngle={Math.PI * 0.65}
        autoRotate={false}
      />
    </>
  )
}

// ---------------------------------------------------------------------------
// UsageMeterScene Component
// ---------------------------------------------------------------------------

export function UsageMeterScene({ burnRate }: UsageMeterSceneProps) {
  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', background: '#0a0a0a' }}>
      <Canvas
        camera={{ position: [0, 1.5, 8], fov: 45 }}
        style={{ width: '100%', height: '100%' }}
        gl={{ antialias: true, alpha: false }}
        onCreated={({ gl }) => {
          gl.setClearColor('#0a0a0a')
          gl.toneMapping = THREE.ACESFilmicToneMapping
          gl.toneMappingExposure = 1.2
        }}
      >
        <Scene burnRate={burnRate} />
      </Canvas>
    </div>
  )
}
