import { Float, Sparkles } from "@react-three/drei";
import { Canvas, useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";

const ACCENT = new THREE.Color("#ffffff");
const VIOLET = new THREE.Color("#8a8a8a");

/**
 * A slowly turning constellation: points on a shell, linked to near neighbours.
 * It stands in for the knowledge graph before there is one.
 */
/** Deterministic PRNG so the scene is identical on every render. */
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function Constellation({ count = 380 }: { count?: number }) {
  const group = useRef<THREE.Group>(null);
  const { positions, colors, lines } = useMemo(() => {
    const rand = mulberry32(1337);
    const pts: THREE.Vector3[] = [];
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      // Fibonacci sphere with jittered radius → even but organic.
      const y = 1 - (i / (count - 1)) * 2;
      const r = Math.sqrt(1 - y * y);
      const theta = i * 2.399963;
      const rad = 2 + rand() * 0.8;
      const v = new THREE.Vector3(Math.cos(theta) * r * rad, y * rad, Math.sin(theta) * r * rad);
      pts.push(v);
      positions.set([v.x, v.y, v.z], i * 3);
      const c = rand() < 0.82 ? ACCENT : VIOLET;
      colors.set([c.r, c.g, c.b], i * 3);
    }
    const seg: number[] = [];
    for (let i = 0; i < count; i++)
      for (let j = i + 1; j < count; j++) {
        if (pts[i].distanceTo(pts[j]) < 0.62) seg.push(pts[i].x, pts[i].y, pts[i].z, pts[j].x, pts[j].y, pts[j].z);
      }
    return { positions, colors, lines: new Float32Array(seg) };
  }, [count]);

  useFrame((state, dt) => {
    if (!group.current) return;
    group.current.rotation.y += dt * 0.06;
    // Pointer parallax, eased.
    const tx = state.pointer.y * 0.25;
    const tz = -state.pointer.x * 0.15;
    group.current.rotation.x += (tx - group.current.rotation.x) * 0.04;
    group.current.rotation.z += (tz - group.current.rotation.z) * 0.04;
  });

  return (
    <group ref={group}>
      <points>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[positions, 3]} />
          <bufferAttribute attach="attributes-color" args={[colors, 3]} />
        </bufferGeometry>
        <pointsMaterial size={0.045} vertexColors transparent opacity={0.95} sizeAttenuation depthWrite={false} />
      </points>
      <lineSegments>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[lines, 3]} />
        </bufferGeometry>
        <lineBasicMaterial color={ACCENT} transparent opacity={0.18} depthWrite={false} />
      </lineSegments>
    </group>
  );
}

function Core() {
  const outer = useRef<THREE.Mesh>(null);
  const inner = useRef<THREE.Mesh>(null);
  useFrame((_, dt) => {
    if (outer.current) {
      outer.current.rotation.x -= dt * 0.12;
      outer.current.rotation.y += dt * 0.18;
    }
    if (inner.current) inner.current.rotation.y -= dt * 0.4;
  });
  return (
    <Float speed={1.2} rotationIntensity={0.4} floatIntensity={0.6}>
      <mesh ref={outer}>
        <icosahedronGeometry args={[1.05, 1]} />
        <meshBasicMaterial color={ACCENT} wireframe transparent opacity={0.35} />
      </mesh>
      <mesh ref={inner}>
        <icosahedronGeometry args={[0.55, 2]} />
        <meshStandardMaterial color="#111111" emissive="#ffffff" emissiveIntensity={0.08} roughness={0.3} metalness={0.7} flatShading />
      </mesh>
      <pointLight position={[2, 2, 2]} color="#ffffff" intensity={30} distance={8} decay={2} />
      <pointLight position={[-2, -1, 1]} color={VIOLET} intensity={10} distance={6} decay={2} />
    </Float>
  );
}

export function Hero3D({ className }: { className?: string }) {
  return (
    <div className={className} aria-hidden>
      <Canvas camera={{ position: [0, 0, 6.2], fov: 48 }} dpr={[1, 1.75]} gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}>
        <ambientLight intensity={0.4} />
        <Core />
        <Constellation />
        <Sparkles count={70} scale={7} size={2.2} speed={0.25} color="#ffffff" opacity={0.4} />
      </Canvas>
    </div>
  );
}
