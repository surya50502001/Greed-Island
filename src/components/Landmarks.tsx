import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { getTerrainHeight } from '../world/terrain';

function StartingPlaza() {
  const beaconRef = useRef<THREE.Mesh>(null);
  const y = getTerrainHeight(0, 0);

  useFrame(({ clock }) => {
    if (beaconRef.current) {
      beaconRef.current.rotation.y = clock.getElapsedTime() * 0.8;
      beaconRef.current.position.y = 4.6 + Math.sin(clock.getElapsedTime() * 2) * 0.35;
    }
  });

  const pillars = [
    [7.5, 7.5],
    [-7.5, 7.5],
    [7.5, -7.5],
    [-7.5, -7.5],
  ];

  return (
    <group position={[0, y, 0]}>
      {/* Central circular stone dais */}
      <mesh receiveShadow position={[0, 0.2, 0]}>
        <cylinderGeometry args={[9.5, 10.5, 0.5, 24]} />
        <meshStandardMaterial color="#b8b5ad" roughness={0.85} />
      </mesh>
      <mesh receiveShadow position={[0, 0.48, 0]}>
        <cylinderGeometry args={[6.2, 6.5, 0.16, 24]} />
        <meshStandardMaterial color="#d2cec4" roughness={0.75} />
      </mesh>
      {/* Glowing runic ring */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.57, 0]}>
        <ringGeometry args={[4.4, 4.9, 32]} />
        <meshBasicMaterial color="#4de8ff" transparent opacity={0.8} />
      </mesh>

      {/* 4 Obelisk Pillars */}
      {pillars.map(([px, pz], idx) => (
        <group key={idx} position={[px, 0, pz]}>
          <mesh castShadow receiveShadow position={[0, 2.2, 0]}>
            <boxGeometry args={[1.1, 4.4, 1.1]} />
            <meshStandardMaterial color="#9e9b93" roughness={0.8} />
          </mesh>
          <mesh position={[0, 4.65, 0]}>
            <octahedronGeometry args={[0.55, 0]} />
            <meshStandardMaterial
              color="#4de8ff"
              emissive="#25b8ff"
              emissiveIntensity={1.6}
              roughness={0.2}
            />
          </mesh>
        </group>
      ))}

      {/* Central floating beacon */}
      <mesh ref={beaconRef} position={[0, 4.6, 0]}>
        <octahedronGeometry args={[0.9, 0]} />
        <meshStandardMaterial
          color="#7cf7ff"
          emissive="#00c8ff"
          emissiveIntensity={2.0}
          roughness={0.15}
        />
      </mesh>
    </group>
  );
}

function AncientRuins() {
  const relicRef = useRef<THREE.Mesh>(null);
  const y = getTerrainHeight(-54, -46);

  useFrame(({ clock }) => {
    if (relicRef.current) {
      relicRef.current.rotation.y = clock.getElapsedTime() * 1.1;
      relicRef.current.position.y = 2.6 + Math.sin(clock.getElapsedTime() * 2.4) * 0.25;
    }
  });

  return (
    <group position={[-54, y, -46]}>
      {/* Ruin floor */}
      <mesh receiveShadow position={[0, 0.15, 0]}>
        <cylinderGeometry args={[11, 12, 0.4, 8]} />
        <meshStandardMaterial color="#6e7368" roughness={0.95} />
      </mesh>

      {/* Broken stone archway */}
      <group position={[0, 0, -6.5]}>
        <mesh castShadow receiveShadow position={[-3.2, 3.2, 0]}>
          <boxGeometry args={[1.5, 6.4, 1.5]} />
          <meshStandardMaterial color="#7d8275" roughness={0.9} />
        </mesh>
        <mesh castShadow receiveShadow position={[3.2, 3.2, 0]}>
          <boxGeometry args={[1.5, 6.4, 1.5]} />
          <meshStandardMaterial color="#7d8275" roughness={0.9} />
        </mesh>
        <mesh castShadow receiveShadow position={[0, 6.8, 0]} rotation={[0, 0, 0.05]}>
          <boxGeometry args={[8.8, 1.2, 1.7]} />
          <meshStandardMaterial color="#6e7368" roughness={0.9} />
        </mesh>
      </group>

      {/* Standing & fallen columns */}
      <mesh castShadow receiveShadow position={[-6.8, 2.3, 2]}>
        <cylinderGeometry args={[0.65, 0.75, 4.6, 8]} />
        <meshStandardMaterial color="#7b8072" roughness={0.9} />
      </mesh>
      <mesh castShadow receiveShadow position={[6.5, 1.6, 3.2]}>
        <cylinderGeometry args={[0.65, 0.75, 3.2, 8]} />
        <meshStandardMaterial color="#7b8072" roughness={0.9} />
      </mesh>
      <mesh castShadow receiveShadow position={[5.2, 0.65, -2.5]} rotation={[Math.PI / 2, 0.2, 0.7]}>
        <cylinderGeometry args={[0.6, 0.65, 4.2, 8]} />
        <meshStandardMaterial color="#6b7265" roughness={0.95} />
      </mesh>

      {/* Central altar + amber relic */}
      <mesh castShadow receiveShadow position={[0, 0.9, 0]}>
        <boxGeometry args={[2.6, 1.5, 2.6]} />
        <meshStandardMaterial color="#5c6158" roughness={0.9} />
      </mesh>
      <mesh ref={relicRef} position={[0, 2.6, 0]}>
        <dodecahedronGeometry args={[0.7, 0]} />
        <meshStandardMaterial
          color="#ffb347"
          emissive="#ff7b00"
          emissiveIntensity={1.8}
          roughness={0.2}
        />
      </mesh>
      <pointLight position={[0, 2.8, 0]} color="#ff9d3b" intensity={8} distance={18} />
    </group>
  );
}

function CrystalPeak() {
  const floatRef = useRef<THREE.Group>(null);
  const y = getTerrainHeight(58, -50);

  useFrame(({ clock }) => {
    if (floatRef.current) {
      floatRef.current.rotation.y = clock.getElapsedTime() * 0.45;
      floatRef.current.position.y = 7.5 + Math.sin(clock.getElapsedTime() * 1.5) * 0.5;
    }
  });

  const crystals: Array<{
    pos: [number, number, number];
    rot: [number, number, number];
    scale: [number, number, number];
    color: string;
  }> = [
    { pos: [0, 3.2, 0], rot: [0.05, 0.2, -0.05], scale: [1.8, 6.5, 1.8], color: '#38e8ff' },
    { pos: [-2.8, 2.1, 1.5], rot: [0.25, 0.5, 0.3], scale: [1.1, 4.2, 1.1], color: '#a855f7' },
    { pos: [2.6, 2.4, -1.2], rot: [-0.2, 0.1, -0.32], scale: [1.2, 4.8, 1.2], color: '#38e8ff' },
    { pos: [1.2, 1.6, 2.9], rot: [0.35, -0.3, 0.12], scale: [0.9, 3.4, 0.9], color: '#f472b6' },
    { pos: [-1.5, 1.8, -2.7], rot: [-0.3, 0.4, 0.22], scale: [1.0, 3.8, 1.0], color: '#38e8ff' },
  ];

  return (
    <group position={[58, y - 0.5, -50]}>
      {crystals.map((c, idx) => (
        <mesh key={idx} castShadow position={c.pos} rotation={c.rot} scale={c.scale}>
          <coneGeometry args={[0.85, 1.8, 5]} />
          <meshStandardMaterial
            color={c.color}
            emissive={c.color}
            emissiveIntensity={0.85}
            roughness={0.15}
            metalness={0.15}
            transparent
            opacity={0.9}
          />
        </mesh>
      ))}

      {/* Orbiting floating shards */}
      <group ref={floatRef} position={[0, 7.5, 0]}>
        {[0, 1, 2].map((i) => {
          const angle = (i / 3) * Math.PI * 2;
          return (
            <mesh
              key={i}
              position={[Math.cos(angle) * 3.8, 0, Math.sin(angle) * 3.8]}
              rotation={[0.4, angle, 0.2]}
            >
              <octahedronGeometry args={[0.55, 0]} />
              <meshStandardMaterial
                color="#7df9ff"
                emissive="#38e8ff"
                emissiveIntensity={1.6}
                roughness={0.1}
              />
            </mesh>
          );
        })}
      </group>
      <pointLight position={[0, 5, 0]} color="#4de8ff" intensity={12} distance={26} />
    </group>
  );
}

function ForestShrine() {
  const wispRef = useRef<THREE.Group>(null);
  const y = getTerrainHeight(0, 64);

  useFrame(({ clock }) => {
    if (wispRef.current) {
      wispRef.current.rotation.y = clock.getElapsedTime() * 0.5;
    }
  });

  return (
    <group position={[0, y, 64]}>
      {/* Stone shrine platform */}
      <mesh receiveShadow position={[0, 0.18, 0]}>
        <cylinderGeometry args={[8.5, 9.2, 0.36, 16]} />
        <meshStandardMaterial color="#58635a" roughness={0.9} />
      </mesh>

      {/* Torii-inspired shrine gate */}
      <group position={[0, 0, -5.5]}>
        <mesh castShadow position={[-2.6, 2.8, 0]}>
          <cylinderGeometry args={[0.32, 0.38, 5.6, 8]} />
          <meshStandardMaterial color="#b9382c" roughness={0.7} />
        </mesh>
        <mesh castShadow position={[2.6, 2.8, 0]}>
          <cylinderGeometry args={[0.32, 0.38, 5.6, 8]} />
          <meshStandardMaterial color="#b9382c" roughness={0.7} />
        </mesh>
        <mesh castShadow position={[0, 5.5, 0]}>
          <boxGeometry args={[7.4, 0.55, 0.7]} />
          <meshStandardMaterial color="#b9382c" roughness={0.7} />
        </mesh>
        <mesh castShadow position={[0, 4.4, 0]}>
          <boxGeometry args={[6.0, 0.36, 0.45]} />
          <meshStandardMaterial color="#962b21" roughness={0.7} />
        </mesh>
      </group>

      {/* Sacred Ancient Tree */}
      <group position={[0, 0, 1.8]}>
        <mesh castShadow receiveShadow position={[0, 2.8, 0]}>
          <cylinderGeometry args={[0.9, 1.5, 5.6, 8]} />
          <meshStandardMaterial color="#5c3d28" roughness={0.95} />
        </mesh>
        <mesh castShadow position={[0, 6.2, 0]}>
          <dodecahedronGeometry args={[3.4, 1]} />
          <meshStandardMaterial color="#1f8a5b" roughness={0.8} />
        </mesh>
        <mesh castShadow position={[-2.1, 5.2, 1.2]}>
          <dodecahedronGeometry args={[2.1, 1]} />
          <meshStandardMaterial color="#27a36b" roughness={0.8} />
        </mesh>
        <mesh castShadow position={[2.0, 5.4, -0.8]}>
          <dodecahedronGeometry args={[2.2, 1]} />
          <meshStandardMaterial color="#1b754d" roughness={0.8} />
        </mesh>
      </group>

      {/* Glowing spirit lanterns */}
      {[
        [-3.8, -2.5],
        [3.8, -2.5],
      ].map(([lx, lz], i) => (
        <group key={i} position={[lx, 0, lz]}>
          <mesh castShadow position={[0, 0.8, 0]}>
            <boxGeometry args={[0.5, 1.6, 0.5]} />
            <meshStandardMaterial color="#6e756e" roughness={0.9} />
          </mesh>
          <mesh position={[0, 1.85, 0]}>
            <boxGeometry args={[0.45, 0.5, 0.45]} />
            <meshStandardMaterial
              color="#9effb8"
              emissive="#34f57b"
              emissiveIntensity={2.0}
            />
          </mesh>
        </group>
      ))}

      {/* Orbiting forest wisps */}
      <group ref={wispRef} position={[0, 3.5, 1.8]}>
        {[0, 1, 2, 3].map((i) => {
          const a = (i / 4) * Math.PI * 2;
          return (
            <mesh key={i} position={[Math.cos(a) * 4.2, Math.sin(i * 1.7) * 0.8, Math.sin(a) * 4.2]}>
              <sphereGeometry args={[0.2, 8, 8]} />
              <meshBasicMaterial color="#8affb3" />
            </mesh>
          );
        })}
      </group>
      <pointLight position={[0, 3.5, 0]} color="#4ef58e" intensity={9} distance={20} />
    </group>
  );
}

export function Landmarks() {
  return (
    <group>
      <StartingPlaza />
      <AncientRuins />
      <CrystalPeak />
      <ForestShrine />
    </group>
  );
}
