import { useEffect, useMemo, useRef } from 'react';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';

export interface InstanceTransform {
  position: [number, number, number];
  rotation?: [number, number, number];
  scale?: number | [number, number, number];
}

interface InstancedGLBProps {
  url: string;
  instances: InstanceTransform[];
  castShadow?: boolean;
  receiveShadow?: boolean;
  /** Shift geometry base so its bounding box min.y sits at y=0 before instancing */
  groundAtZero?: boolean;
}

interface ExtractedPart {
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  localMatrix: THREE.Matrix4;
}

/**
 * Renders an array of world transforms for any multi-mesh GLB using
 * `THREE.InstancedMesh` (one instanced draw call per sub-mesh).
 */
export function InstancedGLB({
  url,
  instances,
  castShadow = true,
  receiveShadow = true,
  groundAtZero = true,
}: InstancedGLBProps) {
  const { scene } = useGLTF(url);
  const meshRefs = useRef<Array<THREE.InstancedMesh | null>>([]);

  const { parts, baseOffsetY } = useMemo(() => {
    const result: ExtractedPart[] = [];
    scene.updateMatrixWorld(true);
    const rootInv = new THREE.Matrix4().copy(scene.matrixWorld).invert();
    const box = new THREE.Box3().setFromObject(scene);
    const offsetY = groundAtZero && isFinite(box.min.y) ? -box.min.y : 0;

    scene.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        const mesh = obj as THREE.Mesh;
        const localMatrix = new THREE.Matrix4().multiplyMatrices(rootInv, mesh.matrixWorld);
        const mat = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
        if (mat) {
          result.push({
            geometry: mesh.geometry,
            material: mat,
            localMatrix,
          });
        }
      }
    });
    return { parts: result, baseOffsetY: offsetY };
  }, [scene, groundAtZero]);

  useEffect(() => {
    if (instances.length === 0) return;
    const dummy = new THREE.Object3D();
    const worldM = new THREE.Matrix4();
    const offsetM = new THREE.Matrix4().makeTranslation(0, baseOffsetY, 0);

    parts.forEach((part, partIdx) => {
      const inst = meshRefs.current[partIdx];
      if (!inst) return;
      for (let i = 0; i < instances.length; i++) {
        const item = instances[i];
        dummy.position.set(item.position[0], item.position[1], item.position[2]);
        if (item.rotation) {
          dummy.rotation.set(item.rotation[0], item.rotation[1], item.rotation[2]);
        } else {
          dummy.rotation.set(0, 0, 0);
        }
        if (typeof item.scale === 'number') {
          dummy.scale.setScalar(item.scale);
        } else if (item.scale) {
          dummy.scale.set(item.scale[0], item.scale[1], item.scale[2]);
        } else {
          dummy.scale.setScalar(1);
        }
        dummy.updateMatrix();
        worldM.multiplyMatrices(dummy.matrix, offsetM).multiply(part.localMatrix);
        inst.setMatrixAt(i, worldM);
      }
      inst.instanceMatrix.needsUpdate = true;
      inst.computeBoundingSphere();
    });
  }, [parts, instances, baseOffsetY]);

  if (instances.length === 0) return null;

  return (
    <group>
      {parts.map((part, idx) => (
        <instancedMesh
          key={idx}
          ref={(el) => {
            meshRefs.current[idx] = el;
          }}
          args={[part.geometry, part.material, instances.length]}
          castShadow={castShadow}
          receiveShadow={receiveShadow}
          frustumCulled={false}
        />
      ))}
    </group>
  );
}

interface PlacedGLBProps {
  url: string;
  position?: [number, number, number];
  rotation?: [number, number, number];
  scale?: number;
  targetHeight?: number;
  groundAtZero?: boolean;
  castShadow?: boolean;
  receiveShadow?: boolean;
}

/**
 * Places a single static GLB prop/building with automatic grounding and optional height normalization.
 */
export function PlacedGLB({
  url,
  position = [0, 0, 0],
  rotation = [0, 0, 0],
  scale = 1,
  targetHeight,
  groundAtZero = true,
  castShadow = true,
  receiveShadow = true,
}: PlacedGLBProps) {
  const { scene } = useGLTF(url);

  const { cloned, normScale, offsetY } = useMemo(() => {
    const clone = scene.clone(true);
    clone.updateMatrixWorld(true);
    clone.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        obj.castShadow = castShadow;
        obj.receiveShadow = receiveShadow;
      }
    });
    const box = new THREE.Box3().setFromObject(clone);
    const size = new THREE.Vector3();
    box.getSize(size);
    const s = targetHeight && size.y > 0.01 ? (targetHeight / size.y) * scale : scale;
    const oy = groundAtZero && isFinite(box.min.y) ? -box.min.y * s : 0;
    return { cloned: clone, normScale: s, offsetY: oy };
  }, [scene, scale, targetHeight, groundAtZero, castShadow, receiveShadow]);

  return (
    <group position={position} rotation={rotation}>
      <group position={[0, offsetY, 0]} scale={normScale}>
        <primitive object={cloned} />
      </group>
    </group>
  );
}
