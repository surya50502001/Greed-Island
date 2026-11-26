import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Sparkles, useGLTF, useTexture } from '@react-three/drei';
import * as THREE from 'three';
import { WATER_LEVEL } from '../types/game';
import {
  generateWorldProps,
  getTerrainColor,
  getTerrainHeight,
} from '../world/terrain';
import { InstancedGLB, InstanceTransform } from './InstancedGLB';
import { Landmarks } from './Landmarks';

const TREE_URLS = [
  '/models/nature/CommonTree_1.glb',
  '/models/nature/CommonTree_2.glb',
  '/models/nature/PineTree_1.glb',
  '/models/nature/BirchTree_1.glb',
  '/models/nature/Willow_1.glb',
];

const ROCK_URLS = [
  '/models/nature/Rock_1.glb',
  '/models/nature/Rock_3.glb',
  '/models/nature/Rock_Moss_1.glb',
  '/models/nature/Rock_Moss_3.glb',
];

function IslandTerrain() {
  const [diffMap, norMap, roughMap] = useTexture([
    '/textures/grass_diff.jpg',
    '/textures/grass_nor.jpg',
    '/textures/grass_rough.jpg',
  ]);

  useEffect(() => {
    [diffMap, norMap, roughMap].forEach((tex, idx) => {
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(32, 32);
      tex.colorSpace = idx === 0 ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      tex.needsUpdate = true;
    });
  }, [diffMap, norMap, roughMap]);

  const geometry = useMemo(() => {
    const size = 300;
    const segments = 180;
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

  useEffect(() => {
    return () => {
      geometry.dispose();
    };
  }, [geometry]);

  return (
    <mesh geometry={geometry} receiveShadow>
      <meshStandardMaterial
        map={diffMap}
        normalMap={norMap}
        normalScale={new THREE.Vector2(0.75, 0.75)}
        roughnessMap={roughMap}
        roughness={0.9}
        metalness={0.02}
        vertexColors
      />
    </mesh>
  );
}

function Ocean() {
  const waterRef = useRef<THREE.Mesh>(null);
  const foamRef = useRef<THREE.Mesh>(null);
  const normalMap = useTexture('/textures/grass_nor.jpg');

  useEffect(() => {
    normalMap.wrapS = THREE.RepeatWrapping;
    normalMap.wrapT = THREE.RepeatWrapping;
    normalMap.repeat.set(38, 38);
    normalMap.needsUpdate = true;
  }, [normalMap]);

  const waterGeo = useMemo(() => {
    const geo = new THREE.PlaneGeometry(950, 950, 72, 72);
    geo.rotateX(-Math.PI / 2);
    return geo;
  }, []);

  useEffect(() => {
    return () => waterGeo.dispose();
  }, [waterGeo]);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    normalMap.offset.x = t * 0.014;
    normalMap.offset.y = t * 0.01;

    if (waterRef.current) {
      const pos = waterGeo.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i);
        const z = pos.getZ(i);
        const wave =
          Math.sin(x * 0.045 + t * 1.15) * 0.16 +
          Math.cos(z * 0.052 + t * 0.92) * 0.14;
        pos.setY(i, wave);
      }
      pos.needsUpdate = true;
      waterGeo.computeVertexNormals();
    }

    if (foamRef.current) {
      foamRef.current.position.y = WATER_LEVEL + 0.08 + Math.sin(t * 1.3) * 0.05;
    }
  });

  return (
    <group>
      <mesh ref={waterRef} geometry={waterGeo} position={[0, WATER_LEVEL, 0]} receiveShadow>
        <meshStandardMaterial
          color="#1682b5"
          normalMap={normalMap}
          normalScale={new THREE.Vector2(0.35, 0.35)}
          roughness={0.14}
          metalness={0.28}
          envMapIntensity={1.65}
          transparent
          opacity={0.9}
        />
      </mesh>
      {/* Subtle animated coastal surf ring */}
      <mesh ref={foamRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, WATER_LEVEL + 0.08, 0]}>
        <ringGeometry args={[102, 118, 72]} />
        <meshBasicMaterial color="#d8f5ff" transparent opacity={0.16} depthWrite={false} />
      </mesh>
    </group>
  );
}

function Clouds() {
  const groupRef = useRef<THREE.Group>(null);
  const clouds = useMemo(
    () => [
      { pos: [-58, 54, -74] as [number, number, number], scale: 1.5 },
      { pos: [68, 60, -24] as [number, number, number], scale: 1.8 },
      { pos: [-28, 64, 70] as [number, number, number], scale: 1.4 },
      { pos: [44, 52, 78] as [number, number, number], scale: 1.6 },
      { pos: [-88, 56, 18] as [number, number, number], scale: 1.7 },
    ],
    []
  );

  useFrame((_, delta) => {
    if (groupRef.current) {
      groupRef.current.rotation.y += delta * 0.004;
    }
  });

  return (
    <group ref={groupRef}>
      {clouds.map((c, idx) => (
        <group key={idx} position={c.pos} scale={c.scale}>
          <mesh position={[0, 0, 0]}>
            <sphereGeometry args={[4.4, 14, 12]} />
            <meshStandardMaterial color="#ffffff" roughness={0.95} />
          </mesh>
          <mesh position={[4.1, -0.5, 0.8]}>
            <sphereGeometry args={[3.3, 12, 10]} />
            <meshStandardMaterial color="#f8fbff" roughness={0.95} />
          </mesh>
          <mesh position={[-3.7, -0.7, -0.5]}>
            <sphereGeometry args={[3.1, 12, 10]} />
            <meshStandardMaterial color="#f8fbff" roughness={0.95} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

export function World() {
  const propsData = useMemo(() => generateWorldProps(), []);

  const toInstances = (items: typeof propsData.trees, baseScale = 1): InstanceTransform[] =>
    items.map((item) => ({
      position: [item.x, item.y - 0.04, item.z],
      rotation: [0, item.rotation, 0],
      scale: item.scale * baseScale,
    }));

  const treeBuckets = useMemo(
    () =>
      TREE_URLS.map((_, variantIdx) =>
        toInstances(propsData.trees.filter((t) => t.variant === variantIdx), 1.35)
      ),
    [propsData.trees]
  );

  const rockBuckets = useMemo(
    () =>
      ROCK_URLS.map((_, variantIdx) =>
        toInstances(propsData.rocks.filter((r) => r.variant === variantIdx), 1.1)
      ),
    [propsData.rocks]
  );

  const bush0 = useMemo(
    () => toInstances(propsData.bushes.filter((b) => b.variant === 0), 1.1),
    [propsData.bushes]
  );
  const bush1 = useMemo(
    () => toInstances(propsData.bushes.filter((b) => b.variant === 1), 1.1),
    [propsData.bushes]
  );
  const grassInstances = useMemo(
    () => toInstances(propsData.grassTufts, 1.0),
    [propsData.grassTufts]
  );
  const flowerInstances = useMemo(
    () => toInstances(propsData.flowers, 1.05),
    [propsData.flowers]
  );
  const plantInstances = useMemo(
    () => toInstances(propsData.plants, 1.0),
    [propsData.plants]
  );
  const logInstances = useMemo(
    () => toInstances(propsData.fallenLogs.filter((l) => l.variant === 0), 1.15),
    [propsData.fallenLogs]
  );
  const stumpInstances = useMemo(
    () => toInstances(propsData.fallenLogs.filter((l) => l.variant === 1), 1.15),
    [propsData.fallenLogs]
  );

  return (
    <group>
      <IslandTerrain />
      <Ocean />
      <Landmarks />
      <Clouds />

      {/* Ambient fantasy pollen / light motes */}
      <Sparkles count={90} scale={[160, 18, 160]} position={[0, 8, 0]} size={2.2} speed={0.25} color="#fef9c3" opacity={0.45} />

      {/* Instanced Varied Trees */}
      {TREE_URLS.map((url, idx) => (
        <InstancedGLB key={url} url={url} instances={treeBuckets[idx]} />
      ))}

      {/* Instanced Bushes, Grass, Flowers, Ferns & Forest Debris */}
      <InstancedGLB url="/models/nature/Bush_1.glb" instances={bush0} />
      <InstancedGLB url="/models/nature/BushBerries_1.glb" instances={bush1} />
      <InstancedGLB url="/models/nature/Grass.glb" instances={grassInstances} castShadow={false} />
      <InstancedGLB url="/models/nature/Flowers.glb" instances={flowerInstances} castShadow={false} />
      <InstancedGLB url="/models/nature/Plant_1.glb" instances={plantInstances} castShadow={false} />
      <InstancedGLB url="/models/nature/WoodLog_Moss.glb" instances={logInstances} />
      <InstancedGLB url="/models/nature/TreeStump_Moss.glb" instances={stumpInstances} />

      {/* Instanced Detailed Rocks */}
      {ROCK_URLS.map((url, idx) => (
        <InstancedGLB key={url} url={url} instances={rockBuckets[idx]} />
      ))}
    </group>
  );
}

TREE_URLS.forEach((url) => useGLTF.preload(url));
ROCK_URLS.forEach((url) => useGLTF.preload(url));
useGLTF.preload('/models/nature/Bush_1.glb');
useGLTF.preload('/models/nature/BushBerries_1.glb');
useGLTF.preload('/models/nature/Grass.glb');
useGLTF.preload('/models/nature/Flowers.glb');
useGLTF.preload('/models/nature/Plant_1.glb');
useGLTF.preload('/models/nature/WoodLog_Moss.glb');
useGLTF.preload('/models/nature/TreeStump_Moss.glb');
