import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { WATER_LEVEL } from '../types/game';
import {
  generateWorldProps,
  getTerrainColor,
  getTerrainHeight,
} from '../world/terrain';
import { Landmarks } from './Landmarks';

function IslandTerrain() {
  const geometry = useMemo(() => {
    const size = 300;
    const segments = 150;
    const geo = new THREE.PlaneGeometry(size, size, segments, segments);
    geo.rotateX(-Math.PI / 2);

    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);

    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const y = getTerrainHeight(x, z);
      pos.setY(i, y);

      const [r, g, b] = getTerrainColor(x, z, y);
      colors[i * 3] = r;
      colors[i * 3 + 1] = g;
      colors[i * 3 + 2] = b;
    }

    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    return geo;
  }, []);

  return (
    <mesh geometry={geometry} receiveShadow>
      <meshStandardMaterial vertexColors roughness={0.88} flatShading />
    </mesh>
  );
}

function Ocean() {
  const ref = useRef<THREE.Mesh>(null);

  useFrame(({ clock }) => {
    if (ref.current) {
      ref.current.position.y = WATER_LEVEL + Math.sin(clock.getElapsedTime() * 0.9) * 0.12;
    }
  });

  return (
    <mesh ref={ref} rotation={[-Math.PI / 2, 0, 0]} position={[0, WATER_LEVEL, 0]} receiveShadow>
      <circleGeometry args={[520, 64]} />
      <meshStandardMaterial
        color="#1878a8"
        roughness={0.22}
        metalness={0.18}
        transparent
        opacity={0.9}
      />
    </mesh>
  );
}

function Clouds() {
  const clouds = useMemo(
    () => [
      { pos: [-55, 52, -70] as [number, number, number], scale: 1.4 },
      { pos: [65, 58, -20] as [number, number, number], scale: 1.7 },
      { pos: [-25, 62, 68] as [number, number, number], scale: 1.3 },
      { pos: [40, 50, 75] as [number, number, number], scale: 1.5 },
      { pos: [-85, 55, 15] as [number, number, number], scale: 1.6 },
    ],
    []
  );

  return (
    <group>
      {clouds.map((c, idx) => (
        <group key={idx} position={c.pos} scale={c.scale}>
          <mesh position={[0, 0, 0]}>
            <dodecahedronGeometry args={[4.5, 1]} />
            <meshStandardMaterial color="#ffffff" roughness={0.95} />
          </mesh>
          <mesh position={[4.2, -0.5, 0.8]}>
            <dodecahedronGeometry args={[3.4, 1]} />
            <meshStandardMaterial color="#f5f8ff" roughness={0.95} />
          </mesh>
          <mesh position={[-3.8, -0.7, -0.5]}>
            <dodecahedronGeometry args={[3.2, 1]} />
            <meshStandardMaterial color="#f5f8ff" roughness={0.95} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

export function World() {
  const { trees, rocks } = useMemo(() => generateWorldProps(), []);

  return (
    <group>
      <IslandTerrain />
      <Ocean />
      <Landmarks />
      <Clouds />

      {/* Stylized Trees */}
      {trees.map((t, i) => (
        <group
          key={`tree-${i}`}
          position={[t.x, t.y, t.z]}
          scale={t.scale}
          rotation={[0, t.rotation, 0]}
        >
          <mesh castShadow receiveShadow position={[0, 1.3, 0]}>
            <cylinderGeometry args={[0.25, 0.38, 2.6, 6]} />
            <meshStandardMaterial color="#6e472b" roughness={0.95} />
          </mesh>
          {t.variant === 0 ? (
            <>
              <mesh castShadow position={[0, 3.2, 0]}>
                <coneGeometry args={[1.6, 2.8, 7]} />
                <meshStandardMaterial color="#277d48" roughness={0.85} flatShading />
              </mesh>
              <mesh castShadow position={[0, 4.5, 0]}>
                <coneGeometry args={[1.15, 2.2, 7]} />
                <meshStandardMaterial color="#2f9455" roughness={0.85} flatShading />
              </mesh>
            </>
          ) : (
            <mesh castShadow position={[0, 3.3, 0]}>
              <dodecahedronGeometry args={[1.65, 0]} />
              <meshStandardMaterial color="#34944e" roughness={0.85} flatShading />
            </mesh>
          )}
        </group>
      ))}

      {/* Stylized Rocks */}
      {rocks.map((r, i) => (
        <mesh
          key={`rock-${i}`}
          castShadow
          receiveShadow
          position={[r.x, r.y + r.scale * 0.35, r.z]}
          scale={[r.scale, r.scale * 0.72, r.scale * 0.9]}
          rotation={[0.1 * r.variant, r.rotation, 0.08]}
        >
          <dodecahedronGeometry args={[1, 0]} />
          <meshStandardMaterial color="#6d7480" roughness={0.92} flatShading />
        </mesh>
      ))}
    </group>
  );
}
