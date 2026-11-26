import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { CharacterStepResult } from '../gameplay/character/CharacterController';

interface HumanCharacterProps {
  stepRef: React.MutableRefObject<CharacterStepResult>;
  hasWeapon: boolean;
  isInvisible: boolean;
  weaponElement: React.ReactNode;
}

/**
 * Stylized, articulated normal human adventurer character.
 * Proportions: ~1.84m tall, boot soles resting at y = 0.
 * Faces +Z in local space.
 */
export function HumanCharacter({
  stepRef,
  hasWeapon,
  isInvisible,
  weaponElement,
}: HumanCharacterProps) {
  const rootRef = useRef<THREE.Group>(null);
  const hipsRef = useRef<THREE.Group>(null);
  const torsoRef = useRef<THREE.Group>(null);
  const headRef = useRef<THREE.Group>(null);

  const leftArmRef = useRef<THREE.Group>(null);
  const leftForeArmRef = useRef<THREE.Group>(null);
  const rightArmRef = useRef<THREE.Group>(null);
  const rightForeArmRef = useRef<THREE.Group>(null);

  const leftLegRef = useRef<THREE.Group>(null);
  const leftKneeRef = useRef<THREE.Group>(null);
  const leftFootRef = useRef<THREE.Group>(null);
  const rightLegRef = useRef<THREE.Group>(null);
  const rightKneeRef = useRef<THREE.Group>(null);
  const rightFootRef = useRef<THREE.Group>(null);

  const walkPhaseRef = useRef(0);

  // Shared materials so invisibility opacity applies uniformly
  const materials = useMemo(() => {
    const skin = new THREE.MeshStandardMaterial({ color: '#f2c4a2', roughness: 0.72 });
    const hair = new THREE.MeshStandardMaterial({ color: '#2e211b', roughness: 0.82 });
    const eyeWhite = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.3 });
    const eyePupil = new THREE.MeshStandardMaterial({ color: '#1e293b', roughness: 0.2 });
    const shirt = new THREE.MeshStandardMaterial({ color: '#f1f5f9', roughness: 0.85 });
    const tunic = new THREE.MeshStandardMaterial({ color: '#2b7a4b', roughness: 0.78 });
    const belt = new THREE.MeshStandardMaterial({ color: '#5c3a21', roughness: 0.7 });
    const buckle = new THREE.MeshStandardMaterial({ color: '#fbbf24', metalness: 0.65, roughness: 0.3 });
    const pants = new THREE.MeshStandardMaterial({ color: '#334155', roughness: 0.86 });
    const boots = new THREE.MeshStandardMaterial({ color: '#472d1b', roughness: 0.75 });
    return { skin, hair, eyeWhite, eyePupil, shirt, tunic, belt, buckle, pants, boots };
  }, []);

  useEffect(() => {
    Object.values(materials).forEach((mat) => {
      mat.transparent = isInvisible;
      mat.opacity = isInvisible ? 0.25 : 1.0;
      mat.depthWrite = !isInvisible;
      mat.needsUpdate = true;
    });
  }, [materials, isInvisible]);

  useEffect(() => {
    return () => {
      Object.values(materials).forEach((mat) => mat.dispose());
    };
  }, [materials]);

  useFrame(({ clock }, delta) => {
    const dt = Math.min(delta, 0.05);
    const step = stepRef.current;
    const state = step.state;
    const speed = step.horizSpeed;
    const t = clock.getElapsedTime();

    if (speed > 0.35 && step.grounded) {
      const dir = state === 'WalkBackward' ? -1 : 1;
      const freq = state === 'Sprint' ? 1.55 : state === 'Jog' ? 1.7 : 1.95;
      walkPhaseRef.current += dir * speed * dt * freq;
    }

    const phase = walkPhaseRef.current;
    const breath = Math.sin(t * 2.0);
    const sway = Math.sin(t * 0.95);

    // Target joint rotations [x, y, z]
    let hipsY = 0.92;
    let hipsRx = 0, hipsRy = 0, hipsRz = 0;
    let torsoRx = 0, torsoRy = 0, torsoRz = 0;
    let headRx = 0, headRy = 0;

    let lArmRx = 0, lArmRy = 0, lArmRz = 0.08;
    let lForeRx = -0.14;
    let rArmRx = 0, rArmRy = 0, rArmRz = -0.08;
    let rForeRx = -0.14;

    let lLegRx = 0, lLegRz = 0.02;
    let lKneeRx = 0.03;
    let lFootRx = 0;
    let rLegRx = 0, rLegRz = -0.02;
    let rKneeRx = 0.03;
    let rFootRx = 0;

    let blend = 14;

    switch (state) {
      case 'Idle':
      case 'StopMoving': {
        hipsY = 0.92 + breath * 0.005;
        hipsRy = sway * 0.025;
        torsoRx = 0.02 + breath * 0.012;
        headRy = sway * 0.04;
        lArmRx = 0.03;
        lArmRz = 0.09 + breath * 0.01;
        lForeRx = -0.16;
        rArmRx = 0.03;
        rArmRz = -0.09 - breath * 0.01;
        rForeRx = -0.16;
        blend = 10;
        break;
      }

      case 'CombatIdle': {
        hipsY = 0.87 + breath * 0.006;
        hipsRx = 0.06;
        hipsRy = -0.22;
        torsoRx = 0.08;
        torsoRy = 0.16;
        headRy = 0.06;
        lArmRx = -0.35;
        lArmRz = 0.25;
        lForeRx = -0.65;
        rArmRx = -0.65;
        rArmRy = -0.2;
        rArmRz = -0.18;
        rForeRx = -0.72;
        lLegRx = -0.26;
        lKneeRx = 0.42;
        lFootRx = -0.16;
        rLegRx = 0.2;
        rKneeRx = 0.28;
        rFootRx = -0.12;
        blend = 12;
        break;
      }

      case 'StartMoving':
      case 'Walk':
      case 'Jog':
      case 'Sprint':
      case 'WalkBackward': {
        const isSprint = state === 'Sprint';
        const isJog = state === 'Jog';
        const legAmp = isSprint ? 0.82 : isJog ? 0.62 : 0.44;
        const kneeAmp = isSprint ? 1.15 : isJog ? 0.85 : 0.55;
        const armAmp = isSprint ? 0.85 : isJog ? 0.62 : 0.38;
        const lean = isSprint ? 0.24 : isJog ? 0.12 : 0.04;

        const s = Math.sin(phase);
        const c = Math.cos(phase);

        hipsY = 0.92 - Math.abs(c) * (isSprint ? 0.05 : 0.025);
        hipsRy = s * 0.08;
        torsoRx = lean;
        torsoRy = -s * 0.12;
        headRx = -lean * 0.55;

        lLegRx = -s * legAmp;
        lKneeRx = Math.max(0.04, (c + 0.35) * 0.5 * kneeAmp);
        lFootRx = s * 0.2;

        rLegRx = s * legAmp;
        rKneeRx = Math.max(0.04, (-c + 0.35) * 0.5 * kneeAmp);
        rFootRx = -s * 0.2;

        lArmRx = s * armAmp;
        lForeRx = -0.28 - Math.max(0, -s) * 0.45;
        if (hasWeapon) {
          rArmRx = -0.45 - s * 0.22;
          rForeRx = -0.58;
        } else {
          rArmRx = -s * armAmp;
          rForeRx = -0.28 - Math.max(0, s) * 0.45;
        }
        blend = 16;
        break;
      }

      case 'StrafeLeft':
      case 'StrafeRight': {
        const dir = state === 'StrafeLeft' ? 1 : -1;
        const s = Math.sin(phase);
        hipsY = 0.9 - Math.abs(Math.cos(phase)) * 0.025;
        hipsRz = dir * 0.05;
        torsoRz = -dir * 0.04;
        lLegRx = -0.12;
        lLegRz = 0.1 + s * 0.24;
        lKneeRx = 0.22;
        rLegRx = -0.12;
        rLegRz = -0.1 - s * 0.24;
        rKneeRx = 0.22;
        lArmRx = -0.18;
        lArmRz = 0.22;
        lForeRx = -0.4;
        rArmRx = hasWeapon ? -0.5 : -0.18;
        rArmRz = -0.22;
        rForeRx = hasWeapon ? -0.6 : -0.4;
        blend = 15;
        break;
      }

      case 'JumpStart':
      case 'JumpLoop':
      case 'Fall': {
        const rising = state === 'JumpStart' || state === 'JumpLoop';
        hipsY = 0.92;
        torsoRx = rising ? 0.12 : 0.05;
        lLegRx = rising ? -0.55 : -0.3;
        lKneeRx = rising ? 0.85 : 0.52;
        rLegRx = rising ? -0.15 : -0.16;
        rKneeRx = rising ? 0.42 : 0.34;
        lArmRx = rising ? -0.6 : -0.25;
        lArmRz = 0.35;
        lForeRx = -0.48;
        rArmRx = rising ? -0.6 : -0.25;
        rArmRz = -0.35;
        rForeRx = -0.48;
        blend = 14;
        break;
      }

      case 'Land':
      case 'FlightLand': {
        hipsY = 0.8;
        torsoRx = 0.2;
        lLegRx = -0.45;
        lKneeRx = 0.78;
        lFootRx = -0.28;
        rLegRx = -0.45;
        rKneeRx = 0.78;
        rFootRx = -0.28;
        lArmRx = 0.15;
        lArmRz = 0.22;
        rArmRx = 0.15;
        rArmRz = -0.22;
        blend = 20;
        break;
      }

      case 'FlightTakeoff':
      case 'FlightHover':
      case 'FlightForward':
      case 'FlightAscend':
      case 'FlightDescend': {
        const isFwd = state === 'FlightForward' || state === 'FlightAscend';
        hipsY = 0.92 + Math.sin(t * 2.6) * 0.025;
        torsoRx = isFwd ? -0.1 : 0.04;
        headRx = isFwd ? -0.26 : 0;
        lLegRx = isFwd ? 0.16 : -0.18;
        lKneeRx = isFwd ? 0.22 : 0.4;
        rLegRx = isFwd ? 0.1 : -0.08;
        rKneeRx = isFwd ? 0.16 : 0.22;
        lArmRx = isFwd ? 0.55 : -0.1;
        lArmRz = 0.28;
        lForeRx = -0.22;
        rArmRx = isFwd ? 0.55 : -0.1;
        rArmRz = -0.28;
        rForeRx = -0.22;
        blend = 10;
        break;
      }

      case 'Attack': {
        const p = step.attackProgress;
        const swing = p < 0.24 ? -p / 0.24 : -1 + ((p - 0.24) / 0.76) * 2.3;
        hipsY = 0.86;
        hipsRy = -0.2 + swing * 0.25;
        torsoRx = 0.14;
        torsoRy = swing * 0.42;
        rArmRx = -1.05 + swing * 0.6;
        rArmRy = swing * 0.6;
        rArmRz = -0.28;
        rForeRx = -0.35;
        lArmRx = -0.25;
        lArmRz = 0.22;
        lForeRx = -0.5;
        lLegRx = -0.28;
        lKneeRx = 0.44;
        rLegRx = 0.22;
        rKneeRx = 0.28;
        blend = 28;
        break;
      }

      case 'Block': {
        hipsY = 0.85;
        hipsRy = -0.18;
        torsoRx = 0.1;
        torsoRy = 0.15;
        rArmRx = -1.0;
        rArmRy = 0.45;
        rArmRz = -0.2;
        rForeRx = -1.05;
        lArmRx = -0.55;
        lArmRz = 0.22;
        lForeRx = -0.8;
        lLegRx = -0.28;
        lKneeRx = 0.44;
        rLegRx = 0.22;
        rKneeRx = 0.3;
        blend = 20;
        break;
      }

      case 'Dodge': {
        hipsY = 0.78;
        hipsRx = 0.26;
        torsoRx = 0.34;
        lLegRx = -0.55;
        lKneeRx = 0.9;
        rLegRx = 0.25;
        rKneeRx = 0.55;
        lArmRx = 0.45;
        lArmRz = 0.2;
        rArmRx = 0.45;
        rArmRz = -0.2;
        blend = 22;
        break;
      }

      case 'HitReaction': {
        const hw = Math.sin(step.hitReactionProgress * Math.PI);
        hipsY = 0.92 - 0.04 * hw;
        torsoRx = -0.32 * hw;
        headRx = -0.35 * hw;
        lArmRx = -0.25 * hw;
        lArmRz = 0.25 * hw;
        rArmRx = -0.25 * hw;
        rArmRz = -0.25 * hw;
        blend = 24;
        break;
      }

      case 'Death': {
        hipsY = 0.16;
        hipsRx = 1.42;
        torsoRx = 0.2;
        lLegRx = -0.18;
        lKneeRx = 0.3;
        rLegRx = -0.1;
        rKneeRx = 0.2;
        lArmRx = -0.35;
        lArmRz = 0.45;
        rArmRx = -0.35;
        rArmRz = -0.45;
        blend = 9;
        break;
      }
    }

    const alpha = 1 - Math.exp(-blend * dt);
    const lerpRot = (
      ref: React.RefObject<THREE.Group>,
      rx: number,
      ry: number,
      rz: number
    ) => {
      if (!ref.current) return;
      ref.current.rotation.x = THREE.MathUtils.lerp(ref.current.rotation.x, rx, alpha);
      ref.current.rotation.y = THREE.MathUtils.lerp(ref.current.rotation.y, ry, alpha);
      ref.current.rotation.z = THREE.MathUtils.lerp(ref.current.rotation.z, rz, alpha);
    };

    if (hipsRef.current) {
      hipsRef.current.position.y = THREE.MathUtils.lerp(hipsRef.current.position.y, hipsY, alpha);
      lerpRot(hipsRef, hipsRx, hipsRy, hipsRz);
    }
    lerpRot(torsoRef, torsoRx, torsoRy, torsoRz);
    lerpRot(headRef, headRx, headRy, 0);

    lerpRot(leftArmRef, lArmRx, lArmRy, lArmRz);
    lerpRot(leftForeArmRef, lForeRx, 0, 0);
    lerpRot(rightArmRef, rArmRx, rArmRy, rArmRz);
    lerpRot(rightForeArmRef, rForeRx, 0, 0);

    lerpRot(leftLegRef, lLegRx, 0, lLegRz);
    lerpRot(leftKneeRef, lKneeRx, 0, 0);
    lerpRot(leftFootRef, lFootRx, 0, 0);
    lerpRot(rightLegRef, rLegRx, 0, rLegRz);
    lerpRot(rightKneeRef, rKneeRx, 0, 0);
    lerpRot(rightFootRef, rFootRx, 0, 0);
  });

  return (
    <group ref={rootRef}>
      <group ref={hipsRef} position={[0, 0.92, 0]}>
        {/* Pelvis / Shorts base */}
        <mesh castShadow receiveShadow material={materials.pants}>
          <capsuleGeometry args={[0.135, 0.08, 6, 14]} />
        </mesh>

        {/* Torso & Upper Body */}
        <group ref={torsoRef} position={[0, 0.04, 0]}>
          {/* Tunic / Jacket */}
          <mesh castShadow receiveShadow position={[0, 0.24, 0]} material={materials.tunic}>
            <cylinderGeometry args={[0.19, 0.155, 0.46, 16]} />
          </mesh>
          {/* Chest fullness */}
          <mesh castShadow receiveShadow position={[0, 0.34, 0.02]} material={materials.tunic}>
            <sphereGeometry args={[0.195, 16, 12]} />
          </mesh>
          {/* Cream Undershirt Collar */}
          <mesh castShadow position={[0, 0.47, 0.02]} material={materials.shirt}>
            <cylinderGeometry args={[0.1, 0.125, 0.07, 14]} />
          </mesh>
          {/* Leather Belt & Gold Buckle */}
          <mesh castShadow position={[0, 0.04, 0]} material={materials.belt}>
            <cylinderGeometry args={[0.162, 0.162, 0.06, 16]} />
          </mesh>
          <mesh position={[0, 0.04, 0.162]} material={materials.buckle}>
            <boxGeometry args={[0.07, 0.065, 0.02]} />
          </mesh>

          {/* Neck & Head */}
          <group ref={headRef} position={[0, 0.52, 0]}>
            <mesh castShadow position={[0, 0.04, 0]} material={materials.skin}>
              <cylinderGeometry args={[0.055, 0.065, 0.1, 12]} />
            </mesh>
            {/* Head */}
            <mesh castShadow receiveShadow position={[0, 0.21, 0.01]} material={materials.skin}>
              <sphereGeometry args={[0.145, 20, 16]} />
            </mesh>
            {/* Ears */}
            <mesh position={[0.14, 0.2, 0]} material={materials.skin}>
              <sphereGeometry args={[0.028, 8, 8]} />
            </mesh>
            <mesh position={[-0.14, 0.2, 0]} material={materials.skin}>
              <sphereGeometry args={[0.028, 8, 8]} />
            </mesh>
            {/* Eyes */}
            <mesh position={[0.05, 0.22, 0.135]} material={materials.eyeWhite}>
              <sphereGeometry args={[0.022, 10, 10]} />
            </mesh>
            <mesh position={[-0.05, 0.22, 0.135]} material={materials.eyeWhite}>
              <sphereGeometry args={[0.022, 10, 10]} />
            </mesh>
            <mesh position={[0.05, 0.22, 0.149]} material={materials.eyePupil}>
              <sphereGeometry args={[0.013, 10, 10]} />
            </mesh>
            <mesh position={[-0.05, 0.22, 0.149]} material={materials.eyePupil}>
              <sphereGeometry args={[0.013, 10, 10]} />
            </mesh>
            {/* Nose */}
            <mesh position={[0, 0.19, 0.152]} material={materials.skin}>
              <sphereGeometry args={[0.016, 8, 8]} />
            </mesh>
            {/* Stylized Hair Cap & Bangs */}
            <mesh castShadow position={[0, 0.25, -0.015]} material={materials.hair}>
              <sphereGeometry args={[0.154, 18, 14, 0, Math.PI * 2, 0, Math.PI * 0.62]} />
            </mesh>
            <mesh castShadow position={[0, 0.22, -0.06]} material={materials.hair}>
              <sphereGeometry args={[0.145, 14, 12]} />
            </mesh>
            <mesh castShadow position={[0.05, 0.31, 0.095]} rotation={[0.45, 0.2, -0.25]} material={materials.hair}>
              <coneGeometry args={[0.055, 0.12, 6]} />
            </mesh>
            <mesh castShadow position={[-0.05, 0.31, 0.095]} rotation={[0.45, -0.2, 0.25]} material={materials.hair}>
              <coneGeometry args={[0.055, 0.12, 6]} />
            </mesh>
          </group>

          {/* Left Arm */}
          <group ref={leftArmRef} position={[0.23, 0.44, 0]}>
            <mesh castShadow position={[0.01, -0.12, 0]} material={materials.tunic}>
              <capsuleGeometry args={[0.058, 0.18, 6, 12]} />
            </mesh>
            <group ref={leftForeArmRef} position={[0.01, -0.26, 0]}>
              <mesh castShadow position={[0, -0.11, 0]} material={materials.skin}>
                <capsuleGeometry args={[0.046, 0.18, 6, 12]} />
              </mesh>
              <mesh castShadow position={[0, -0.23, 0]} material={materials.skin}>
                <sphereGeometry args={[0.048, 10, 10]} />
              </mesh>
            </group>
          </group>

          {/* Right Arm + Summoned Weapon Socket */}
          <group ref={rightArmRef} position={[-0.23, 0.44, 0]}>
            <mesh castShadow position={[-0.01, -0.12, 0]} material={materials.tunic}>
              <capsuleGeometry args={[0.058, 0.18, 6, 12]} />
            </mesh>
            <group ref={rightForeArmRef} position={[-0.01, -0.26, 0]}>
              <mesh castShadow position={[0, -0.11, 0]} material={materials.skin}>
                <capsuleGeometry args={[0.046, 0.18, 6, 12]} />
              </mesh>
              <group position={[0, -0.23, 0]}>
                <mesh castShadow material={materials.skin}>
                  <sphereGeometry args={[0.048, 10, 10]} />
                </mesh>
                {hasWeapon && weaponElement}
              </group>
            </group>
          </group>
        </group>

        {/* Left Leg */}
        <group ref={leftLegRef} position={[0.105, -0.02, 0]}>
          <mesh castShadow receiveShadow position={[0, -0.2, 0]} material={materials.pants}>
            <capsuleGeometry args={[0.072, 0.3, 6, 12]} />
          </mesh>
          <group ref={leftKneeRef} position={[0, -0.42, 0]}>
            <mesh castShadow receiveShadow position={[0, -0.18, 0]} material={materials.pants}>
              <capsuleGeometry args={[0.058, 0.28, 6, 12]} />
            </mesh>
            <group ref={leftFootRef} position={[0, -0.38, 0]}>
              <mesh castShadow receiveShadow position={[0, -0.045, 0.035]} material={materials.boots}>
                <boxGeometry args={[0.11, 0.11, 0.22]} />
              </mesh>
            </group>
          </group>
        </group>

        {/* Right Leg */}
        <group ref={rightLegRef} position={[-0.105, -0.02, 0]}>
          <mesh castShadow receiveShadow position={[0, -0.2, 0]} material={materials.pants}>
            <capsuleGeometry args={[0.072, 0.3, 6, 12]} />
          </mesh>
          <group ref={rightKneeRef} position={[0, -0.42, 0]}>
            <mesh castShadow receiveShadow position={[0, -0.18, 0]} material={materials.pants}>
              <capsuleGeometry args={[0.058, 0.28, 6, 12]} />
            </mesh>
            <group ref={rightFootRef} position={[0, -0.38, 0]}>
              <mesh castShadow receiveShadow position={[0, -0.045, 0.035]} material={materials.boots}>
                <boxGeometry args={[0.11, 0.11, 0.22]} />
              </mesh>
            </group>
          </group>
        </group>
      </group>
    </group>
  );
}
