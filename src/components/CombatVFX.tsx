import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { getGroundHeight } from '../world/terrain';
import { Vec3 } from '../domain/math/vec3';

export interface CombatVFXHandle {
  spawnHitImpact: (
    pos: Vec3,
    dirX: number,
    dirZ: number,
    colorHex: string,
    isFinisher: boolean
  ) => void;
  spawnFinisherShockwave: (pos: Vec3) => void;
}

interface SparkSlot {
  active: boolean;
  life: number;
  maxLife: number;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  color: THREE.Color;
  scale: number;
}

interface BurstSlot {
  active: boolean;
  life: number;
  maxLife: number;
  pos: THREE.Vector3;
  color: THREE.Color;
  maxScale: number;
}

interface ShockwaveSlot {
  active: boolean;
  life: number;
  maxLife: number;
  pos: THREE.Vector3;
}

const SPARK_POOL_SIZE = 32;
const BURST_POOL_SIZE = 6;
const SHOCKWAVE_POOL_SIZE = 2;

/**
 * Builds a tapered anime crescent blade-arc geometry with UVs (u = arc 0..1, v = inner 0..outer 1).
 */
export function createCrescentArcGeometry(
  innerRadius: number,
  maxWidth: number,
  arcAngle: number,
  segments = 36
): THREE.BufferGeometry {
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const startAngle = -arcAngle * 0.5;

  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const angle = startAngle + t * arcAngle;
    const taper = Math.pow(Math.sin(t * Math.PI), 0.75);
    const rIn = innerRadius + (1 - taper) * maxWidth * 0.28;
    const rOut = innerRadius + taper * maxWidth;

    const cos = Math.cos(angle);
    const sin = Math.sin(angle);

    positions.push(cos * rIn, sin * rIn, 0);
    positions.push(cos * rOut, sin * rOut, 0);
    uvs.push(t, 0);
    uvs.push(t, 1);

    if (i < segments) {
      const base = i * 2;
      indices.push(base, base + 1, base + 2);
      indices.push(base + 1, base + 3, base + 2);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

/**
 * Custom GLSL anime blade-slash shader with white-hot cutting edge,
 * gradient energy tail, and sweeping speed streaks.
 */
export function createAnimeSlashMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    uniforms: {
      uColorCore: { value: new THREE.Color('#ffffff') },
      uColorEdge: { value: new THREE.Color('#38bdf8') },
      uOpacity: { value: 0.9 },
      uTime: { value: 0 },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColorCore;
      uniform vec3 uColorEdge;
      uniform float uOpacity;
      uniform float uTime;
      varying vec2 vUv;

      void main() {
        float arcMask = pow(sin(vUv.x * 3.14159265), 0.65);
        float edgeGlow = smoothstep(0.55, 0.96, vUv.y);
        float innerFade = smoothstep(0.0, 0.35, vUv.y);
        float outerSoft = 1.0 - smoothstep(0.94, 1.0, vUv.y);
        float streaks = 0.72 + 0.28 * sin(vUv.y * 24.0 - vUv.x * 10.0 + uTime * 22.0);
        float alpha = arcMask * innerFade * outerSoft * streaks * uOpacity;
        vec3 col = mix(uColorEdge, uColorCore, pow(edgeGlow, 1.4));
        gl_FragColor = vec4(col * 1.35, alpha);
      }
    `,
  });
}

export const CombatVFX = forwardRef<CombatVFXHandle>((_, ref) => {
  const sparkMeshRefs = useRef<Array<THREE.Mesh | null>>([]);
  const burstMeshRefs = useRef<Array<THREE.Mesh | null>>([]);
  const shockwaveGroupRefs = useRef<Array<THREE.Group | null>>([]);

  const sparksRef = useRef<SparkSlot[]>(
    Array.from({ length: SPARK_POOL_SIZE }, () => ({
      active: false,
      life: 0,
      maxLife: 0.28,
      pos: new THREE.Vector3(),
      vel: new THREE.Vector3(),
      color: new THREE.Color('#67e8f9'),
      scale: 1,
    }))
  );

  const burstsRef = useRef<BurstSlot[]>(
    Array.from({ length: BURST_POOL_SIZE }, () => ({
      active: false,
      life: 0,
      maxLife: 0.22,
      pos: new THREE.Vector3(),
      color: new THREE.Color('#67e8f9'),
      maxScale: 1.4,
    }))
  );

  const shockwavesRef = useRef<ShockwaveSlot[]>(
    Array.from({ length: SHOCKWAVE_POOL_SIZE }, () => ({
      active: false,
      life: 0,
      maxLife: 0.5,
      pos: new THREE.Vector3(),
    }))
  );

  const { sparkGeo, burstGeo, shockRingGeo, shockDiscGeo, shockPillarGeo } = useMemo(() => {
    const sg = new THREE.OctahedronGeometry(0.085, 0);
    sg.scale(0.45, 2.2, 0.45);
    const bg = new THREE.RingGeometry(0.28, 0.62, 20);
    const srg = new THREE.RingGeometry(0.65, 1.0, 36);
    const sdg = new THREE.CircleGeometry(0.95, 32);
    const spg = new THREE.CylinderGeometry(0.18, 0.55, 2.6, 16, 1, true);
    spg.translate(0, 1.3, 0);
    return {
      sparkGeo: sg,
      burstGeo: bg,
      shockRingGeo: srg,
      shockDiscGeo: sdg,
      shockPillarGeo: spg,
    };
  }, []);

  useEffect(() => {
    return () => {
      sparkGeo.dispose();
      burstGeo.dispose();
      shockRingGeo.dispose();
      shockDiscGeo.dispose();
      shockPillarGeo.dispose();
    };
  }, [sparkGeo, burstGeo, shockRingGeo, shockDiscGeo, shockPillarGeo]);

  useImperativeHandle(ref, () => ({
    spawnHitImpact(pos, dirX, dirZ, colorHex, isFinisher) {
      const count = isFinisher ? 14 : 8;
      let spawned = 0;
      for (const slot of sparksRef.current) {
        if (slot.active) continue;
        slot.active = true;
        slot.maxLife = isFinisher ? 0.34 : 0.24;
        slot.life = slot.maxLife;
        slot.pos.set(pos.x, pos.y, pos.z);
        slot.pos.y += 0.75 + (Math.random() - 0.5) * 0.45;
        const spread = (Math.random() - 0.5) * 2.2;
        const speed = (isFinisher ? 9.5 : 6.8) + Math.random() * 4.5;
        slot.vel.set(
          (dirX + spread * 0.65) * speed,
          2.8 + Math.random() * (isFinisher ? 5.2 : 3.4),
          (dirZ + spread * 0.65) * speed
        );
        slot.color.set(colorHex);
        slot.scale = isFinisher ? 1.45 : 1.0;
        spawned++;
        if (spawned >= count) break;
      }

      for (const burst of burstsRef.current) {
        if (burst.active) continue;
        burst.active = true;
        burst.maxLife = isFinisher ? 0.28 : 0.18;
        burst.life = burst.maxLife;
        burst.pos.set(pos.x, pos.y, pos.z);
        burst.pos.y += 0.82;
        burst.color.set(colorHex);
        burst.maxScale = isFinisher ? 2.4 : 1.35;
        break;
      }
    },

    spawnFinisherShockwave(pos) {
      for (const sw of shockwavesRef.current) {
        if (sw.active) continue;
        sw.active = true;
        sw.maxLife = 0.5;
        sw.life = sw.maxLife;
        sw.pos.set(pos.x, getGroundHeight(pos.x, pos.z) + 0.08, pos.z);
        break;
      }
    },
  }));

  const tempLook = useRef(new THREE.Vector3());

  useFrame(({ camera }, delta) => {
    const dt = Math.min(delta, 0.05);

    // Update pooled sparks
    for (let i = 0; i < SPARK_POOL_SIZE; i++) {
      const slot = sparksRef.current[i];
      const mesh = sparkMeshRefs.current[i];
      if (!mesh) continue;
      if (!slot.active) {
        mesh.visible = false;
        continue;
      }
      slot.life -= dt;
      if (slot.life <= 0) {
        slot.active = false;
        mesh.visible = false;
        continue;
      }
      slot.vel.y -= 18 * dt;
      slot.pos.addScaledVector(slot.vel, dt);
      const t = slot.life / slot.maxLife;
      mesh.visible = true;
      mesh.position.copy(slot.pos);
      tempLook.current.copy(slot.pos).add(slot.vel);
      mesh.lookAt(tempLook.current);
      mesh.rotateX(Math.PI / 2);
      mesh.scale.setScalar(slot.scale * (0.4 + 0.8 * t));
      const mat = mesh.material as THREE.MeshBasicMaterial;
      mat.color.copy(slot.color);
      mat.opacity = Math.min(1, t * 1.4);
    }

    // Update pooled hit bursts
    for (let i = 0; i < BURST_POOL_SIZE; i++) {
      const burst = burstsRef.current[i];
      const mesh = burstMeshRefs.current[i];
      if (!mesh) continue;
      if (!burst.active) {
        mesh.visible = false;
        continue;
      }
      burst.life -= dt;
      if (burst.life <= 0) {
        burst.active = false;
        mesh.visible = false;
        continue;
      }
      const p = 1 - burst.life / burst.maxLife;
      mesh.visible = true;
      mesh.position.copy(burst.pos);
      mesh.lookAt(camera.position);
      mesh.scale.setScalar(0.35 + p * burst.maxScale);
      const mat = mesh.material as THREE.MeshBasicMaterial;
      mat.color.copy(burst.color);
      mat.opacity = (1 - p) * 0.9;
    }

    // Update pooled Attack 4 ground shockwaves
    for (let i = 0; i < SHOCKWAVE_POOL_SIZE; i++) {
      const sw = shockwavesRef.current[i];
      const group = shockwaveGroupRefs.current[i];
      if (!group) continue;
      if (!sw.active) {
        group.visible = false;
        continue;
      }
      sw.life -= dt;
      if (sw.life <= 0) {
        sw.active = false;
        group.visible = false;
        continue;
      }
      const p = 1 - sw.life / sw.maxLife;
      group.visible = true;
      group.position.copy(sw.pos);

      const ringMesh = group.children[0] as THREE.Mesh | undefined;
      const discMesh = group.children[1] as THREE.Mesh | undefined;
      const pillarMesh = group.children[2] as THREE.Mesh | undefined;

      if (ringMesh) {
        const s = 0.6 + p * 4.2;
        ringMesh.scale.set(s, s, 1);
        (ringMesh.material as THREE.MeshBasicMaterial).opacity = (1 - p) * 0.92;
      }
      if (discMesh) {
        const s = 0.4 + p * 3.1;
        discMesh.scale.set(s, s, 1);
        (discMesh.material as THREE.MeshBasicMaterial).opacity = (1 - p) * 0.36;
      }
      if (pillarMesh) {
        const ps = 1 - p * 0.65;
        pillarMesh.scale.set(0.7 + p * 1.4, 0.4 + (1 - p) * 1.1, 0.7 + p * 1.4);
        (pillarMesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, (1 - p * 1.35) * 0.55 * ps);
      }
    }
  });

  return (
    <group>
      {Array.from({ length: SPARK_POOL_SIZE }).map((_, i) => (
        <mesh
          key={`spark-${i}`}
          ref={(el) => {
            sparkMeshRefs.current[i] = el;
          }}
          geometry={sparkGeo}
          visible={false}
        >
          <meshBasicMaterial
            color="#67e8f9"
            transparent
            opacity={0.9}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
          />
        </mesh>
      ))}

      {Array.from({ length: BURST_POOL_SIZE }).map((_, i) => (
        <mesh
          key={`burst-${i}`}
          ref={(el) => {
            burstMeshRefs.current[i] = el;
          }}
          geometry={burstGeo}
          visible={false}
        >
          <meshBasicMaterial
            color="#fde047"
            transparent
            opacity={0.85}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
            side={THREE.DoubleSide}
          />
        </mesh>
      ))}

      {Array.from({ length: SHOCKWAVE_POOL_SIZE }).map((_, i) => (
        <group
          key={`sw-${i}`}
          ref={(el) => {
            shockwaveGroupRefs.current[i] = el;
          }}
          visible={false}
        >
          <mesh geometry={shockRingGeo} rotation={[-Math.PI / 2, 0, 0]}>
            <meshBasicMaterial
              color="#fde047"
              transparent
              opacity={0.9}
              blending={THREE.AdditiveBlending}
              depthWrite={false}
              side={THREE.DoubleSide}
            />
          </mesh>
          <mesh geometry={shockDiscGeo} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
            <meshBasicMaterial
              color="#f97316"
              transparent
              opacity={0.35}
              blending={THREE.AdditiveBlending}
              depthWrite={false}
              side={THREE.DoubleSide}
            />
          </mesh>
          <mesh geometry={shockPillarGeo}>
            <meshBasicMaterial
              color="#fb923c"
              transparent
              opacity={0.5}
              blending={THREE.AdditiveBlending}
              depthWrite={false}
              side={THREE.DoubleSide}
            />
          </mesh>
        </group>
      ))}
    </group>
  );
});

CombatVFX.displayName = 'CombatVFX';
