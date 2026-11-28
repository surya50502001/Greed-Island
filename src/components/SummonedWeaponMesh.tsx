import { forwardRef } from 'react';
import * as THREE from 'three';
import { SpellWeaponType } from '../domain/cards/spellTravel';
import { EnergySword } from './EnergySword';

interface SummonedWeaponMeshProps {
  weaponType?: SpellWeaponType | string;
  scale?: number;
  position?: [number, number, number];
  rotation?: [number, number, number];
}

/**
 * Renders the player's currently summoned weapon (reusing EnergySword for Sword,
 * and sculpted 3D meshes for Greatsword, Spear, Axe, Dagger, and Bow).
 */
export const SummonedWeaponMesh = forwardRef<THREE.Group, SummonedWeaponMeshProps>(
  ({ weaponType = 'Sword', scale = 1, position = [0, 0, 0], rotation = [0, 0, 0] }, ref) => {
    if (weaponType === 'Sword') {
      return <EnergySword ref={ref} scale={scale} position={position} rotation={rotation} />;
    }

    if (weaponType === 'Greatsword') {
      return (
        <EnergySword
          ref={ref}
          scale={scale * 1.32}
          position={position}
          rotation={rotation}
        />
      );
    }

    return (
      <group ref={ref} scale={scale} position={position} rotation={rotation}>
        {weaponType === 'Spear' && (
          <>
            <mesh position={[0, 0.45, 0]}>
              <cylinderGeometry args={[0.022, 0.024, 1.55, 8]} />
              <meshStandardMaterial color="#334155" metalness={0.7} roughness={0.3} />
            </mesh>
            <mesh position={[0, 1.35, 0]}>
              <coneGeometry args={[0.065, 0.34, 4]} />
              <meshStandardMaterial
                color="#7dd3fc"
                emissive="#38bdf8"
                emissiveIntensity={1.6}
                metalness={0.5}
                roughness={0.2}
              />
            </mesh>
          </>
        )}

        {weaponType === 'Axe' && (
          <>
            <mesh position={[0, 0.42, 0]}>
              <cylinderGeometry args={[0.026, 0.028, 1.05, 8]} />
              <meshStandardMaterial color="#451a03" roughness={0.7} />
            </mesh>
            <mesh position={[0.14, 0.84, 0]} rotation={[0, 0, Math.PI / 2]}>
              <cylinderGeometry args={[0.22, 0.14, 0.04, 6]} />
              <meshStandardMaterial
                color="#fbbf24"
                emissive="#f97316"
                emissiveIntensity={1.2}
                metalness={0.7}
                roughness={0.25}
              />
            </mesh>
          </>
        )}

        {weaponType === 'Dagger' && (
          <>
            <mesh position={[0, 0.02, 0]}>
              <cylinderGeometry args={[0.022, 0.022, 0.22, 8]} />
              <meshStandardMaterial color="#1e293b" roughness={0.5} />
            </mesh>
            <mesh position={[0, 0.34, 0]}>
              <coneGeometry args={[0.042, 0.46, 4]} />
              <meshStandardMaterial
                color="#e9d5ff"
                emissive="#c084fc"
                emissiveIntensity={1.7}
                metalness={0.6}
                roughness={0.2}
              />
            </mesh>
          </>
        )}

        {weaponType === 'Bow' && (
          <>
            <mesh position={[0.06, 0.12, 0]} rotation={[0, 0, Math.PI / 2]}>
              <torusGeometry args={[0.56, 0.026, 8, 20, Math.PI]} />
              <meshStandardMaterial
                color="#fde68a"
                emissive="#f59e0b"
                emissiveIntensity={1.1}
                metalness={0.5}
                roughness={0.3}
              />
            </mesh>
            <mesh position={[0.06, 0.12, 0]}>
              <cylinderGeometry args={[0.006, 0.006, 1.1, 6]} />
              <meshBasicMaterial color="#e0f2fe" />
            </mesh>
          </>
        )}
      </group>
    );
  }
);
