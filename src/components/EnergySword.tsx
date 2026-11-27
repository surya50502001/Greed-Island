import { forwardRef, useEffect, useMemo } from 'react';
import * as THREE from 'three';

interface EnergySwordProps {
  scale?: number;
  position?: [number, number, number];
  rotation?: [number, number, number];
}

/**
 * Sculpted fantasy energy sword with:
 * - Faceted pommel + arcane gem
 * - Wrapped leather/obsidian grip centered at local (0, 0, 0) for palm alignment
 * - Swept winged crossguard with central rune crystal
 * - Beveled metallic double-edged blade with sharp pointed tip
 * - Glowing central energy vein + subtle edge aura
 */
export const EnergySword = forwardRef<THREE.Group, EnergySwordProps>(
  ({ scale = 1, position = [0, 0, 0], rotation = [0, 0, 0] }, ref) => {
    const { bladeGeo, coreGeo, auraGeo, guardGeo } = useMemo(() => {
      // 1. Beveled double-edged blade with sharp pointed tip (starts at y = +0.16 above grip)
      const bladeShape = new THREE.Shape();
      bladeShape.moveTo(0, 0);
      bladeShape.lineTo(0.056, 0.03);
      bladeShape.lineTo(0.062, 0.88);
      bladeShape.lineTo(0.0, 1.14); // Sharp tip
      bladeShape.lineTo(-0.062, 0.88);
      bladeShape.lineTo(-0.056, 0.03);
      bladeShape.closePath();

      const blade = new THREE.ExtrudeGeometry(bladeShape, {
        depth: 0.014,
        bevelEnabled: true,
        bevelThickness: 0.008,
        bevelSize: 0.007,
        bevelSegments: 2,
      });
      blade.translate(0, 0.16, -0.007);

      // 2. Glowing central fuller / energy vein inside the blade
      const coreShape = new THREE.Shape();
      coreShape.moveTo(0, 0.04);
      coreShape.lineTo(0.015, 0.08);
      coreShape.lineTo(0.012, 0.86);
      coreShape.lineTo(0, 1.03);
      coreShape.lineTo(-0.012, 0.86);
      coreShape.lineTo(-0.015, 0.08);
      coreShape.closePath();

      const core = new THREE.ExtrudeGeometry(coreShape, {
        depth: 0.022,
        bevelEnabled: false,
      });
      core.translate(0, 0.16, -0.011);

      // 3. Subtle outer energy edge aura (follows blade silhouette without hiding it)
      const auraShape = new THREE.Shape();
      auraShape.moveTo(0, 0.0);
      auraShape.lineTo(0.078, 0.03);
      auraShape.lineTo(0.082, 0.89);
      auraShape.lineTo(0.0, 1.18);
      auraShape.lineTo(-0.082, 0.89);
      auraShape.lineTo(-0.078, 0.03);
      auraShape.closePath();

      const aura = new THREE.ExtrudeGeometry(auraShape, {
        depth: 0.006,
        bevelEnabled: false,
      });
      aura.translate(0, 0.16, -0.003);

      // 4. Swept winged fantasy crossguard
      const guardShape = new THREE.Shape();
      guardShape.moveTo(-0.22, 0.055);
      guardShape.lineTo(-0.09, -0.02);
      guardShape.lineTo(0.09, -0.02);
      guardShape.lineTo(0.22, 0.055);
      guardShape.lineTo(0.18, 0.085);
      guardShape.lineTo(0.06, 0.035);
      guardShape.lineTo(-0.06, 0.035);
      guardShape.lineTo(-0.18, 0.085);
      guardShape.closePath();

      const guard = new THREE.ExtrudeGeometry(guardShape, {
        depth: 0.042,
        bevelEnabled: true,
        bevelThickness: 0.006,
        bevelSize: 0.006,
        bevelSegments: 1,
      });
      guard.translate(0, 0.135, -0.021);

      return { bladeGeo: blade, coreGeo: core, auraGeo: aura, guardGeo: guard };
    }, []);

    useEffect(() => {
      return () => {
        bladeGeo.dispose();
        coreGeo.dispose();
        auraGeo.dispose();
        guardGeo.dispose();
      };
    }, [bladeGeo, coreGeo, auraGeo, guardGeo]);

    return (
      <group ref={ref} scale={scale} position={position} rotation={rotation}>
        {/* Pommel */}
        <mesh position={[0, -0.155, 0]}>
          <octahedronGeometry args={[0.038, 0]} />
          <meshStandardMaterial color="#d4af37" metalness={0.82} roughness={0.22} />
        </mesh>
        <mesh position={[0, -0.19, 0]}>
          <octahedronGeometry args={[0.02, 0]} />
          <meshStandardMaterial
            color="#38bdf8"
            emissive="#06b6d4"
            emissiveIntensity={1.6}
            roughness={0.15}
          />
        </mesh>

        {/* Ergonomic Wrapped Handle (centered at y = 0 inside palm) */}
        <mesh position={[0, -0.005, 0]}>
          <cylinderGeometry args={[0.02, 0.023, 0.25, 10]} />
          <meshStandardMaterial color="#18181b" roughness={0.78} metalness={0.2} />
        </mesh>
        {[-0.075, -0.025, 0.025, 0.075].map((ry, idx) => (
          <mesh key={idx} position={[0, ry, 0]}>
            <cylinderGeometry args={[0.024, 0.024, 0.012, 10]} />
            <meshStandardMaterial color="#b48a2d" metalness={0.75} roughness={0.3} />
          </mesh>
        ))}

        {/* Swept Winged Crossguard + Center Rune Gem */}
        <mesh geometry={guardGeo}>
          <meshStandardMaterial color="#c9a23f" metalness={0.8} roughness={0.26} />
        </mesh>
        <mesh position={[0, 0.162, 0]} rotation={[0, 0, Math.PI / 4]}>
          <octahedronGeometry args={[0.028, 0]} />
          <meshStandardMaterial
            color="#7dd3fc"
            emissive="#0ea5e9"
            emissiveIntensity={2.0}
            roughness={0.1}
          />
        </mesh>

        {/* Metallic Double-Edged Blade */}
        <mesh geometry={bladeGeo} castShadow>
          <meshStandardMaterial color="#cbd5e1" metalness={0.85} roughness={0.22} />
        </mesh>

        {/* Glowing Energy Vein */}
        <mesh geometry={coreGeo}>
          <meshStandardMaterial
            color="#67e8f9"
            emissive="#06b6d4"
            emissiveIntensity={2.1}
            roughness={0.1}
          />
        </mesh>

        {/* Subtle Edge Energy Glow */}
        <mesh geometry={auraGeo}>
          <meshBasicMaterial
            color="#38bdf8"
            transparent
            opacity={0.24}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
            side={THREE.DoubleSide}
          />
        </mesh>
      </group>
    );
  }
);

EnergySword.displayName = 'EnergySword';
