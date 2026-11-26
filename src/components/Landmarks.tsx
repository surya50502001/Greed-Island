import { useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Sparkles, useGLTF, useTexture } from '@react-three/drei';
import * as THREE from 'three';
import { getTerrainHeight } from '../world/terrain';
import { PlacedGLB } from './InstancedGLB';

function StartingPlaza() {
  const beaconRef = useRef<THREE.Mesh>(null);
  const y = getTerrainHeight(0, 0);

  const [cobbleDiff, cobbleNor] = useTexture([
    '/textures/cobble_diff.jpg',
    '/textures/cobble_nor.jpg',
  ]);

  useEffect(() => {
    [cobbleDiff, cobbleNor].forEach((tex, idx) => {
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(6, 6);
      tex.colorSpace = idx === 0 ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      tex.needsUpdate = true;
    });
  }, [cobbleDiff, cobbleNor]);

  useFrame(({ clock }) => {
    if (beaconRef.current) {
      beaconRef.current.rotation.y = clock.getElapsedTime() * 0.8;
      beaconRef.current.position.y = 4.9 + Math.sin(clock.getElapsedTime() * 2) * 0.35;
    }
  });

  // Ground height around settlement perimeter
  const yHouse1 = getTerrainHeight(-15, -10) - y;
  const yHouse2 = getTerrainHeight(15, -11) - y;
  const yGazebo = getTerrainHeight(-14, 12) - y;
  const yMarket = getTerrainHeight(13, 10) - y;
  const yWell = getTerrainHeight(8, -11) - y;
  const yFire = getTerrainHeight(-9, 10) - y;

  return (
    <group position={[0, y, 0]}>
      {/* Central Cobblestone Dais (matches getGroundHeight heights +0.45 / +0.56) */}
      <mesh receiveShadow position={[0, 0.2, 0]}>
        <cylinderGeometry args={[9.5, 10.5, 0.5, 32]} />
        <meshStandardMaterial
          map={cobbleDiff}
          normalMap={cobbleNor}
          color="#d8d4cb"
          roughness={0.85}
        />
      </mesh>
      <mesh receiveShadow position={[0, 0.48, 0]}>
        <cylinderGeometry args={[6.2, 6.5, 0.16, 32]} />
        <meshStandardMaterial
          map={cobbleDiff}
          normalMap={cobbleNor}
          color="#ebe6dc"
          roughness={0.78}
        />
      </mesh>

      {/* Glowing Runic Ring */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.57, 0]}>
        <ringGeometry args={[4.4, 4.9, 40]} />
        <meshBasicMaterial color="#38bdf8" transparent opacity={0.85} />
      </mesh>

      {/* 4 Ancient Stone Pillars around Dais */}
      {[
        [7.4, 7.4, 0.78],
        [-7.4, 7.4, -0.78],
        [7.4, -7.4, 2.35],
        [-7.4, -7.4, -2.35],
      ].map(([px, pz, rotY], idx) => (
        <group key={idx} position={[px, 0.42, pz]} rotation={[0, rotY, 0]}>
          <PlacedGLB url="/models/landmarks/Column.glb" targetHeight={4.2} />
          <mesh position={[0, 4.55, 0]}>
            <octahedronGeometry args={[0.45, 0]} />
            <meshStandardMaterial
              color="#4de8ff"
              emissive="#25b8ff"
              emissiveIntensity={1.6}
              roughness={0.2}
            />
          </mesh>
        </group>
      ))}

      {/* Central Floating Arcane Beacon */}
      <mesh ref={beaconRef} position={[0, 4.9, 0]}>
        <octahedronGeometry args={[0.85, 0]} />
        <meshStandardMaterial
          color="#7cf7ff"
          emissive="#00c8ff"
          emissiveIntensity={2.0}
          roughness={0.15}
        />
      </mesh>

      {/* Fantasy Settlement Architecture */}
      <PlacedGLB
        url="/models/landmarks/House_1.glb"
        position={[-15, yHouse1, -10]}
        rotation={[0, 0.65, 0]}
        targetHeight={6.2}
      />
      <PlacedGLB
        url="/models/landmarks/House_2.glb"
        position={[15, yHouse2, -11]}
        rotation={[0, -0.7, 0]}
        targetHeight={6.5}
      />
      <PlacedGLB
        url="/models/landmarks/Gazebo.glb"
        position={[-14, yGazebo, 12]}
        rotation={[0, 2.3, 0]}
        targetHeight={4.8}
      />
      <PlacedGLB
        url="/models/landmarks/MarketStand_1.glb"
        position={[13, yMarket, 10]}
        rotation={[0, -2.2, 0]}
        targetHeight={3.2}
      />
      <PlacedGLB
        url="/models/landmarks/Well.glb"
        position={[8, yWell, -11]}
        rotation={[0, 0.3, 0]}
        targetHeight={2.6}
      />
      <PlacedGLB
        url="/models/landmarks/Bonfire_Lit.glb"
        position={[-9, yFire, 10]}
        targetHeight={1.2}
      />
      <pointLight position={[-9, yFire + 1.4, 10]} color="#ff9233" intensity={8} distance={14} />

      {/* Pathways, Benches, Fences & Plaza Vegetation */}
      <PlacedGLB url="/models/landmarks/Path_Straight.glb" position={[0, 0.05, 12]} targetHeight={0.25} />
      <PlacedGLB url="/models/landmarks/Path_Straight.glb" position={[0, 0.05, -12]} targetHeight={0.25} />
      <PlacedGLB url="/models/landmarks/Bench_1.glb" position={[6.5, 0.45, 0]} rotation={[0, -Math.PI / 2, 0]} targetHeight={0.9} />
      <PlacedGLB url="/models/landmarks/Bench_1.glb" position={[-6.5, 0.45, 0]} rotation={[0, Math.PI / 2, 0]} targetHeight={0.9} />
      <PlacedGLB url="/models/landmarks/Fence.glb" position={[11, 0.05, 3.5]} rotation={[0, Math.PI / 2, 0]} targetHeight={1.2} />
      <PlacedGLB url="/models/landmarks/Fence.glb" position={[-11, 0.05, -3.5]} rotation={[0, Math.PI / 2, 0]} targetHeight={1.2} />
      <PlacedGLB url="/models/nature/Flowers.glb" position={[8.5, 0.25, 4.5]} targetHeight={0.65} />
      <PlacedGLB url="/models/nature/Flowers.glb" position={[-8.5, 0.25, -4.5]} targetHeight={0.65} />
      <PlacedGLB url="/models/nature/BushBerries_1.glb" position={[10.5, 0.05, -5.5]} targetHeight={1.4} />
      <PlacedGLB url="/models/nature/BushBerries_1.glb" position={[-10.5, 0.05, 5.5]} targetHeight={1.4} />

      <Sparkles count={28} scale={[16, 6, 16]} position={[0, 3, 0]} size={2.4} speed={0.3} color="#7dd3fc" opacity={0.65} />
    </group>
  );
}

function AncientRuins() {
  const relicRef = useRef<THREE.Mesh>(null);
  const y = getTerrainHeight(-54, -46);

  const [rockDiff, rockNor] = useTexture([
    '/textures/rock_diff.jpg',
    '/textures/rock_nor.jpg',
  ]);

  useEffect(() => {
    [rockDiff, rockNor].forEach((tex, idx) => {
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(5, 5);
      tex.colorSpace = idx === 0 ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      tex.needsUpdate = true;
    });
  }, [rockDiff, rockNor]);

  useFrame(({ clock }) => {
    if (relicRef.current) {
      relicRef.current.rotation.y = clock.getElapsedTime() * 1.1;
      relicRef.current.position.y = 2.8 + Math.sin(clock.getElapsedTime() * 2.4) * 0.25;
    }
  });

  return (
    <group position={[-54, y, -46]}>
      {/* Textured Ruin Floor (matches getGroundHeight +0.35) */}
      <mesh receiveShadow position={[0, 0.15, 0]}>
        <cylinderGeometry args={[11, 12, 0.4, 12]} />
        <meshStandardMaterial
          map={rockDiff}
          normalMap={rockNor}
          color="#949c8c"
          roughness={0.92}
        />
      </mesh>

      {/* Grand Ancient Archway */}
      <PlacedGLB url="/models/landmarks/Entrance.glb" position={[0, 0.35, -7.5]} targetHeight={6.8} />

      {/* Weathered & Broken Columns */}
      <PlacedGLB url="/models/landmarks/Column.glb" position={[-7.2, 0.3, 2.5]} targetHeight={5.0} />
      <PlacedGLB url="/models/landmarks/Column_Broken.glb" position={[6.8, 0.3, 3.2]} targetHeight={3.4} />
      <PlacedGLB url="/models/landmarks/Column_Broken2.glb" position={[-6.5, 0.3, -3.5]} rotation={[0, 0.8, 0]} targetHeight={2.6} />
      <PlacedGLB url="/models/landmarks/Column_Broken.glb" position={[7.2, 0.3, -3.0]} rotation={[0, -0.5, 0]} targetHeight={4.0} />

      {/* Crumbling Stone Walls */}
      <PlacedGLB url="/models/landmarks/ModularStoneWall.glb" position={[-9.5, 0.1, 0]} rotation={[0, Math.PI / 2, 0]} targetHeight={3.2} />
      <PlacedGLB url="/models/landmarks/ModularStoneWall.glb" position={[9.5, 0.1, 0]} rotation={[0, Math.PI / 2, 0]} targetHeight={3.2} />

      {/* Candelabra & Overgrowth */}
      <PlacedGLB url="/models/landmarks/Candelabrum_tall.glb" position={[-2.6, 0.35, 0]} targetHeight={2.1} />
      <PlacedGLB url="/models/landmarks/Candelabrum_tall.glb" position={[2.6, 0.35, 0]} targetHeight={2.1} />
      <PlacedGLB url="/models/nature/Rock_Moss_1.glb" position={[5.2, 0.25, -5.8]} targetHeight={1.6} />
      <PlacedGLB url="/models/nature/Rock_Moss_3.glb" position={[-5.4, 0.25, 6.2]} targetHeight={1.4} />
      <PlacedGLB url="/models/nature/Plant_1.glb" position={[4.5, 0.35, 5.5]} targetHeight={1.1} />

      {/* Central Altar + Mysterious Amber Relic */}
      <mesh castShadow receiveShadow position={[0, 0.95, 0]}>
        <boxGeometry args={[2.4, 1.3, 2.4]} />
        <meshStandardMaterial map={rockDiff} normalMap={rockNor} color="#72786c" roughness={0.9} />
      </mesh>
      <mesh ref={relicRef} position={[0, 2.8, 0]}>
        <dodecahedronGeometry args={[0.68, 0]} />
        <meshStandardMaterial
          color="#ffb347"
          emissive="#ff7b00"
          emissiveIntensity={1.9}
          roughness={0.2}
        />
      </mesh>
      <pointLight position={[0, 3.0, 0]} color="#ff9d3b" intensity={10} distance={20} />
      <Sparkles count={24} scale={[14, 5, 14]} position={[0, 2.5, 0]} size={2.2} speed={0.35} color="#fbbf24" opacity={0.7} />
    </group>
  );
}

function CrystalPeak() {
  const floatRef = useRef<THREE.Group>(null);
  const y = getTerrainHeight(58, -50);

  useFrame(({ clock }) => {
    if (floatRef.current) {
      floatRef.current.rotation.y = clock.getElapsedTime() * 0.45;
      floatRef.current.position.y = 7.8 + Math.sin(clock.getElapsedTime() * 1.5) * 0.5;
    }
  });

  return (
    <group position={[58, y - 0.4, -50]}>
      {/* Dramatic Crystal Formations */}
      <PlacedGLB url="/models/landmarks/Crystal1.glb" position={[0, 0, 0]} rotation={[0.05, 0.2, -0.05]} targetHeight={8.5} />
      <PlacedGLB url="/models/landmarks/Crystal2.glb" position={[-3.2, -0.4, 1.8]} rotation={[0.2, 0.6, 0.25]} targetHeight={5.6} />
      <PlacedGLB url="/models/landmarks/Crystal4.glb" position={[3.0, -0.3, -1.6]} rotation={[-0.18, 0.1, -0.26]} targetHeight={6.2} />
      <PlacedGLB url="/models/landmarks/Crystal1.glb" position={[1.5, -0.5, 3.4]} rotation={[0.3, -0.4, 0.12]} targetHeight={4.4} />
      <PlacedGLB url="/models/landmarks/Crystal2.glb" position={[-1.8, -0.5, -3.2]} rotation={[-0.25, 0.4, 0.2]} targetHeight={4.8} />

      {/* Alpine Peak Boulders */}
      <PlacedGLB url="/models/nature/Rock_Snow_1.glb" position={[-4.5, -0.8, -2.2]} targetHeight={2.4} />
      <PlacedGLB url="/models/nature/Rock_Snow_1.glb" position={[4.2, -0.9, 2.5]} rotation={[0, 1.4, 0]} targetHeight={2.2} />

      {/* Orbiting Floating Crystal Shards */}
      <group ref={floatRef} position={[0, 7.8, 0]}>
        {[0, 1, 2].map((i) => {
          const angle = (i / 3) * Math.PI * 2;
          return (
            <mesh
              key={i}
              position={[Math.cos(angle) * 4.0, 0, Math.sin(angle) * 4.0]}
              rotation={[0.4, angle, 0.2]}
            >
              <octahedronGeometry args={[0.55, 0]} />
              <meshStandardMaterial
                color="#7df9ff"
                emissive="#38e8ff"
                emissiveIntensity={1.8}
                roughness={0.1}
              />
            </mesh>
          );
        })}
      </group>
      <pointLight position={[0, 5.5, 0]} color="#4de8ff" intensity={14} distance={28} />
      <Sparkles count={36} scale={[14, 10, 14]} position={[0, 5, 0]} size={2.8} speed={0.4} color="#67e8f9" opacity={0.75} />
    </group>
  );
}

function ForestShrine() {
  const wispRef = useRef<THREE.Group>(null);
  const y = getTerrainHeight(0, 64);

  const [cobbleDiff, cobbleNor] = useTexture([
    '/textures/cobble_diff.jpg',
    '/textures/cobble_nor.jpg',
  ]);

  useFrame(({ clock }) => {
    if (wispRef.current) {
      wispRef.current.rotation.y = clock.getElapsedTime() * 0.5;
    }
  });

  return (
    <group position={[0, y, 64]}>
      {/* Textured Shrine Platform (matches getGroundHeight +0.36) */}
      <mesh receiveShadow position={[0, 0.18, 0]}>
        <cylinderGeometry args={[8.5, 9.2, 0.36, 24]} />
        <meshStandardMaterial
          map={cobbleDiff}
          normalMap={cobbleNor}
          color="#6c7d6e"
          roughness={0.9}
        />
      </mesh>

      {/* Ancient Shrine Gate */}
      <PlacedGLB url="/models/landmarks/Entrance.glb" position={[0, 0.36, -6.0]} targetHeight={5.8} />

      {/* Sacred Ancient Willow Tree */}
      <PlacedGLB url="/models/nature/Willow_1.glb" position={[0, 0.35, 1.8]} targetHeight={9.5} />

      {/* Spirit Lanterns & Forest Overgrowth */}
      <PlacedGLB url="/models/landmarks/Candelabrum_tall.glb" position={[-3.8, 0.36, -2.5]} targetHeight={2.3} />
      <PlacedGLB url="/models/landmarks/Candelabrum_tall.glb" position={[3.8, 0.36, -2.5]} targetHeight={2.3} />
      <PlacedGLB url="/models/nature/Rock_Moss_1.glb" position={[-5.2, 0.3, 3.2]} targetHeight={1.5} />
      <PlacedGLB url="/models/nature/Rock_Moss_3.glb" position={[5.0, 0.3, 2.8]} targetHeight={1.4} />
      <PlacedGLB url="/models/nature/BushBerries_1.glb" position={[-6.4, 0.15, -1.5]} targetHeight={1.5} />
      <PlacedGLB url="/models/nature/BushBerries_1.glb" position={[6.4, 0.15, -1.5]} targetHeight={1.5} />
      <PlacedGLB url="/models/nature/Flowers.glb" position={[-2.5, 0.36, 4.5]} targetHeight={0.7} />
      <PlacedGLB url="/models/nature/Flowers.glb" position={[2.5, 0.36, 4.5]} targetHeight={0.7} />

      {/* Orbiting Forest Wisps */}
      <group ref={wispRef} position={[0, 3.8, 1.8]}>
        {[0, 1, 2, 3].map((i) => {
          const a = (i / 4) * Math.PI * 2;
          return (
            <mesh key={i} position={[Math.cos(a) * 4.4, Math.sin(i * 1.7) * 0.8, Math.sin(a) * 4.4]}>
              <sphereGeometry args={[0.18, 10, 10]} />
              <meshBasicMaterial color="#8affb3" />
            </mesh>
          );
        })}
      </group>
      <pointLight position={[0, 3.8, 0]} color="#4ef58e" intensity={10} distance={22} />
      <Sparkles count={32} scale={[15, 7, 15]} position={[0, 3.5, 0]} size={2.5} speed={0.3} color="#6ee7b7" opacity={0.7} />
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

[
  '/models/landmarks/Gazebo.glb',
  '/models/landmarks/House_1.glb',
  '/models/landmarks/House_2.glb',
  '/models/landmarks/Well.glb',
  '/models/landmarks/MarketStand_1.glb',
  '/models/landmarks/Path_Straight.glb',
  '/models/landmarks/Fence.glb',
  '/models/landmarks/Bench_1.glb',
  '/models/landmarks/Bonfire_Lit.glb',
  '/models/landmarks/Column.glb',
  '/models/landmarks/Column_Broken.glb',
  '/models/landmarks/Column_Broken2.glb',
  '/models/landmarks/Entrance.glb',
  '/models/landmarks/ModularStoneWall.glb',
  '/models/landmarks/Candelabrum_tall.glb',
  '/models/landmarks/Crystal1.glb',
  '/models/landmarks/Crystal2.glb',
  '/models/landmarks/Crystal4.glb',
  '/models/nature/Rock_Snow_1.glb',
].forEach((url) => useGLTF.preload(url));
