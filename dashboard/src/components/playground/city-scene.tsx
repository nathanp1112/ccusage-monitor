'use client'

import { useRef, useMemo, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Text, OrbitControls, MeshTransmissionMaterial } from '@react-three/drei'
import * as THREE from 'three'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CityMember {
  name: string
  cost: number
}

interface CitySceneProps {
  members: CityMember[]
}

// ---------------------------------------------------------------------------
// Color palette from cool blue to warm orange (cycles for large member lists)
// ---------------------------------------------------------------------------

const PALETTE = [
  '#1e40af', // deep blue
  '#2563eb', // blue
  '#0891b2', // cyan
  '#059669', // emerald
  '#84cc16', // lime
  '#eab308', // yellow
  '#f97316', // orange
  '#ef4444', // red-orange
]

function getPaletteColor(index: number): string {
  return PALETTE[index % PALETTE.length]
}

// ---------------------------------------------------------------------------
// Dynamic layout helpers
// ---------------------------------------------------------------------------

const MIN_HEIGHT = 1
const MAX_HEIGHT = 8

function makeCostToHeight(minCost: number, maxCost: number) {
  return function costToHeight(cost: number): number {
    if (maxCost === minCost) return (MIN_HEIGHT + MAX_HEIGHT) / 2
    return MIN_HEIGHT + ((cost - minCost) / (maxCost - minCost)) * (MAX_HEIGHT - MIN_HEIGHT)
  }
}

function makeGetGridPosition(memberCount: number) {
  const cols = Math.max(1, Math.ceil(Math.sqrt(memberCount)))
  const spacingX = 3.5
  const spacingZ = 4.5

  return function getGridPosition(index: number): [number, number] {
    const col = index % cols
    const row = Math.floor(index / cols)
    const offsetX = -((cols - 1) * spacingX) / 2
    const rows = Math.ceil(memberCount / cols)
    const offsetZ = -((rows - 1) * spacingZ) / 2
    return [offsetX + col * spacingX, offsetZ + row * spacingZ]
  }
}

// ---------------------------------------------------------------------------
// Window lights (small emissive squares on building faces)
// ---------------------------------------------------------------------------

function WindowLights({
  width,
  depth,
  height,
  color,
}: {
  width: number
  depth: number
  height: number
  color: string
}) {
  const windows = useMemo(() => {
    const result: { position: [number, number, number]; rotation: [number, number, number] }[] = []
    const windowSpacingY = 0.7
    const windowSpacingX = 0.5
    const rowCount = Math.max(1, Math.floor((height - 0.6) / windowSpacingY))
    const frontCols = Math.max(1, Math.floor((width - 0.4) / windowSpacingX))
    const sideCols = Math.max(1, Math.floor((depth - 0.4) / windowSpacingX))

    for (let row = 0; row < rowCount; row++) {
      const y = 0.4 + row * windowSpacingY
      // Front face (+z)
      for (let col = 0; col < frontCols; col++) {
        const x = -((frontCols - 1) * windowSpacingX) / 2 + col * windowSpacingX
        if (Math.random() > 0.3) {
          result.push({ position: [x, y, depth / 2 + 0.01], rotation: [0, 0, 0] })
        }
      }
      // Back face (-z)
      for (let col = 0; col < frontCols; col++) {
        const x = -((frontCols - 1) * windowSpacingX) / 2 + col * windowSpacingX
        if (Math.random() > 0.3) {
          result.push({ position: [x, y, -(depth / 2 + 0.01)], rotation: [0, Math.PI, 0] })
        }
      }
      // Right face (+x)
      for (let col = 0; col < sideCols; col++) {
        const z = -((sideCols - 1) * windowSpacingX) / 2 + col * windowSpacingX
        if (Math.random() > 0.3) {
          result.push({
            position: [width / 2 + 0.01, y, z],
            rotation: [0, Math.PI / 2, 0],
          })
        }
      }
      // Left face (-x)
      for (let col = 0; col < sideCols; col++) {
        const z = -((sideCols - 1) * windowSpacingX) / 2 + col * windowSpacingX
        if (Math.random() > 0.3) {
          result.push({
            position: [-(width / 2 + 0.01), y, z],
            rotation: [0, -Math.PI / 2, 0],
          })
        }
      }
    }
    return result
  }, [width, depth, height])

  const emissiveColor = useMemo(() => {
    const c = new THREE.Color(color)
    c.lerp(new THREE.Color('#fffde0'), 0.6)
    return c
  }, [color])

  return (
    <group>
      {windows.map((w, i) => (
        <mesh key={i} position={w.position} rotation={w.rotation}>
          <planeGeometry args={[0.2, 0.15]} />
          <meshStandardMaterial
            emissive={emissiveColor}
            emissiveIntensity={1.5}
            color={emissiveColor}
            transparent
            opacity={0.9}
            side={THREE.DoubleSide}
          />
        </mesh>
      ))}
    </group>
  )
}

// ---------------------------------------------------------------------------
// Building component with spring-like growth animation
// ---------------------------------------------------------------------------

function Building({
  member,
  index,
  color,
  costToHeight,
  getGridPosition,
}: {
  member: CityMember
  index: number
  color: string
  costToHeight: (cost: number) => number
  getGridPosition: (index: number) => [number, number]
}) {
  const groupRef = useRef<THREE.Group>(null)
  const targetHeight = costToHeight(member.cost)
  const [gridX, gridZ] = getGridPosition(index)
  const width = 2
  const depth = 2

  // Animation state
  const animState = useRef({
    currentHeight: 0,
    velocity: 0,
    started: false,
    startTime: 0,
    delay: index * 0.15,
  })

  useFrame((state, delta) => {
    const anim = animState.current
    const elapsed = state.clock.getElapsedTime()

    if (!anim.started) {
      if (elapsed >= anim.delay) {
        anim.started = true
        anim.startTime = elapsed
      }
      return
    }

    // Spring physics
    const stiffness = 4.0
    const damping = 3.5
    const diff = targetHeight - anim.currentHeight
    const springForce = diff * stiffness
    const dampingForce = -anim.velocity * damping
    anim.velocity += (springForce + dampingForce) * delta
    anim.currentHeight += anim.velocity * delta

    // Clamp near target
    if (Math.abs(diff) < 0.005 && Math.abs(anim.velocity) < 0.005) {
      anim.currentHeight = targetHeight
      anim.velocity = 0
    }

    if (groupRef.current) {
      groupRef.current.position.y = anim.currentHeight / 2
      groupRef.current.scale.y = Math.max(0.001, anim.currentHeight / targetHeight)
    }
  })

  const edgeColor = useMemo(() => {
    const c = new THREE.Color(color)
    c.lerp(new THREE.Color('#ffffff'), 0.5)
    return c
  }, [color])

  return (
    <group position={[gridX, 0, gridZ]}>
      {/* Main building body */}
      <group ref={groupRef} position={[0, 0, 0]} scale={[1, 0.001, 1]}>
        <mesh castShadow receiveShadow>
          <boxGeometry args={[width, targetHeight, depth]} />
          <MeshTransmissionMaterial
            backside
            samples={6}
            resolution={128}
            transmission={0.85}
            roughness={0.15}
            thickness={1.5}
            ior={1.5}
            chromaticAberration={0.06}
            anisotropy={0.1}
            distortion={0.0}
            distortionScale={0.2}
            color={color}
            attenuationColor={color}
            attenuationDistance={1}
          />
        </mesh>

        {/* Edge glow lines */}
        <lineSegments>
          <edgesGeometry args={[new THREE.BoxGeometry(width + 0.02, targetHeight + 0.02, depth + 0.02)]} />
          <lineBasicMaterial color={edgeColor} transparent opacity={0.4} />
        </lineSegments>

        {/* Window lights */}
        <WindowLights width={width} depth={depth} height={targetHeight} color={color} />
      </group>

      {/* Floating label above building */}
      <FloatingLabel
        name={member.name}
        cost={member.cost}
        targetHeight={targetHeight}
        delay={index * 0.15}
      />
    </group>
  )
}

// ---------------------------------------------------------------------------
// Floating label that tracks building height
// ---------------------------------------------------------------------------

function FloatingLabel({
  name,
  cost,
  targetHeight,
  delay,
}: {
  name: string
  cost: number
  targetHeight: number
  delay: number
}) {
  const groupRef = useRef<THREE.Group>(null)
  const animRef = useRef({ opacity: 0, y: 0 })

  useFrame((state) => {
    const elapsed = state.clock.getElapsedTime()
    if (elapsed < delay + 0.5) return

    const fadeProgress = Math.min(1, (elapsed - delay - 0.5) / 0.8)
    animRef.current.opacity = fadeProgress
    animRef.current.y = targetHeight + 0.8

    if (groupRef.current) {
      groupRef.current.position.y = animRef.current.y + Math.sin(elapsed * 1.5 + delay) * 0.1
    }
  })

  return (
    <group ref={groupRef} position={[0, targetHeight + 0.8, 0]}>
      <Text
        fontSize={0.35}
        color="#ffffff"
        anchorX="center"
        anchorY="bottom"
        font={undefined}
        outlineWidth={0.02}
        outlineColor="#000000"
      >
        {name}
      </Text>
      <Text
        fontSize={0.22}
        color="#94a3b8"
        anchorX="center"
        anchorY="top"
        position={[0, -0.05, 0]}
        font={undefined}
        outlineWidth={0.015}
        outlineColor="#000000"
      >
        {`$${cost.toLocaleString()}`}
      </Text>
    </group>
  )
}

// ---------------------------------------------------------------------------
// Ground plane with grid
// ---------------------------------------------------------------------------

function Ground() {
  return (
    <group>
      {/* Ground plane */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} receiveShadow>
        <planeGeometry args={[40, 40]} />
        <meshStandardMaterial
          color="#0a0f1e"
          metalness={0.8}
          roughness={0.4}
        />
      </mesh>
      {/* Grid overlay */}
      <gridHelper
        args={[40, 40, '#1e3a5f', '#0f1f36']}
        position={[0, 0.01, 0]}
      />
    </group>
  )
}

// ---------------------------------------------------------------------------
// Camera orbit controller
// ---------------------------------------------------------------------------

function CameraRig() {
  const { camera } = useThree()
  const angleRef = useRef(0)

  useFrame((_, delta) => {
    angleRef.current += delta * 0.08
    const radius = 18
    const height = 10
    camera.position.x = Math.sin(angleRef.current) * radius
    camera.position.z = Math.cos(angleRef.current) * radius
    camera.position.y = height
    camera.lookAt(0, 2, 0)
  })

  return null
}

// ---------------------------------------------------------------------------
// Scene composition
// ---------------------------------------------------------------------------

function Scene({
  members,
  costToHeight,
  getGridPosition,
}: {
  members: CityMember[]
  costToHeight: (cost: number) => number
  getGridPosition: (index: number) => [number, number]
}) {
  return (
    <>
      {/* Fog */}
      <fog attach="fog" args={['#070b18', 15, 45]} />

      {/* Lighting */}
      <ambientLight intensity={0.3} color="#8ab4f8" />
      <directionalLight
        position={[10, 15, 8]}
        intensity={1.2}
        color="#ffffff"
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-camera-far={50}
        shadow-camera-left={-15}
        shadow-camera-right={15}
        shadow-camera-top={15}
        shadow-camera-bottom={-15}
      />
      <directionalLight
        position={[-8, 10, -6]}
        intensity={0.4}
        color="#4a90d9"
      />
      <pointLight position={[0, 12, 0]} intensity={0.6} color="#7dd3fc" distance={30} decay={2} />

      {/* Ground */}
      <Ground />

      {/* Buildings */}
      {members.map((member, index) => (
        <Building
          key={member.name}
          member={member}
          index={index}
          color={getPaletteColor(index)}
          costToHeight={costToHeight}
          getGridPosition={getGridPosition}
        />
      ))}

      {/* Camera controls */}
      <CameraRig />
      <OrbitControls
        enableZoom={true}
        enablePan={true}
        enableRotate={true}
        minDistance={8}
        maxDistance={35}
        maxPolarAngle={Math.PI / 2.1}
      />
    </>
  )
}

// ---------------------------------------------------------------------------
// Exported CityScene component
// ---------------------------------------------------------------------------

export function CityScene({ members }: CitySceneProps) {
  const [isLoaded, setIsLoaded] = useState(false)

  const maxCost = useMemo(() => (members.length > 0 ? Math.max(...members.map((m) => m.cost)) : 0), [members])
  const minCost = useMemo(() => (members.length > 0 ? Math.min(...members.map((m) => m.cost)) : 0), [members])
  const costToHeight = useMemo(() => makeCostToHeight(minCost, maxCost), [minCost, maxCost])
  const getGridPosition = useMemo(() => makeGetGridPosition(members.length), [members.length])

  return (
    <div className="relative" style={{ height: '100%' }}>
      {/* Legend overlay */}
      <div className="pointer-events-none absolute bottom-4 left-4 z-10 flex flex-col gap-1 rounded-lg bg-black/60 px-3 py-2 backdrop-blur-md">
        {members.map((member, i) => (
          <div key={member.name} className="flex items-center gap-2 text-xs text-white/70">
            <span
              className="inline-block h-2.5 w-2.5 rounded-sm"
              style={{ backgroundColor: getPaletteColor(i) }}
            />
            <span className="w-16">{member.name}</span>
            <span className="font-mono text-white/50">${member.cost.toLocaleString()}</span>
          </div>
        ))}
      </div>

      {/* Loading indicator */}
      {!isLoaded && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-[#070b18]">
          <div className="flex flex-col items-center gap-3">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-white/70" />
            <span className="text-sm text-white/50">Loading 3D scene...</span>
          </div>
        </div>
      )}

      {/* Three.js Canvas */}
      <Canvas
        shadows
        camera={{ position: [18, 10, 0], fov: 50, near: 0.1, far: 100 }}
        gl={{
          antialias: true,
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 1.2,
        }}
        style={{ background: '#070b18' }}
        onCreated={() => setIsLoaded(true)}
      >
        <Scene members={members} costToHeight={costToHeight} getGridPosition={getGridPosition} />
      </Canvas>
    </div>
  )
}
