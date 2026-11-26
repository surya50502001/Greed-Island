import { useCallback, useEffect, useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { Sky } from '@react-three/drei';
import * as THREE from 'three';
import { INVISIBILITY_DURATION } from './types/game';
import { getTerrainHeight } from './world/terrain';
import { World } from './components/World';
import { createInitialEnemies, Enemies, EnemyEntity } from './components/Enemies';
import { Player } from './components/Player';
import { HUD } from './components/HUD';

export function App() {
  const [isFlying, setIsFlying] = useState(false);
  const [hasWeapon, setHasWeapon] = useState(false);
  const [invisTimer, setInvisTimer] = useState(0);
  const [, setPointerLocked] = useState(false);

  const playerPosRef = useRef<THREE.Vector3>(
    new THREE.Vector3(0, getTerrainHeight(0, 0), 0)
  );
  const enemiesRef = useRef<EnemyEntity[]>(createInitialEnemies());

  const toggleFlight = useCallback(() => {
    setIsFlying((prev) => !prev);
  }, []);

  const toggleWeapon = useCallback(() => {
    setHasWeapon((prev) => !prev);
  }, []);

  const triggerInvisibility = useCallback(() => {
    setInvisTimer(INVISIBILITY_DURATION);
  }, []);

  // 1, 2, 3 hotbar keybindings
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (e.code === 'Digit1') {
        toggleFlight();
      } else if (e.code === 'Digit2') {
        toggleWeapon();
      } else if (e.code === 'Digit3') {
        triggerInvisibility();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [toggleFlight, toggleWeapon, triggerInvisibility]);

  // Invisibility countdown timer
  useEffect(() => {
    if (invisTimer <= 0) return;
    const interval = window.setInterval(() => {
      setInvisTimer((prev) => {
        const next = prev - 0.1;
        return next <= 0 ? 0 : next;
      });
    }, 100);
    return () => window.clearInterval(interval);
  }, [invisTimer > 0]);

  const isInvisible = invisTimer > 0;

  return (
    <div style={{ width: '100vw', height: '100vh', position: 'relative' }}>
      <Canvas
        shadows
        camera={{ fov: 60, near: 0.2, far: 600, position: [0, 6, 10] }}
        onContextMenu={(e) => e.preventDefault()}
      >
        <Sky
          distance={450000}
          sunPosition={[80, 60, -40]}
          inclination={0.48}
          azimuth={0.25}
        />
        <fog attach="fog" args={['#b8ddf2', 95, 310]} />

        <ambientLight intensity={0.45} />
        <hemisphereLight args={['#bfe9ff', '#3a5f3b', 0.6]} />
        <directionalLight
          castShadow
          position={[70, 95, 40]}
          intensity={1.55}
          shadow-mapSize-width={2048}
          shadow-mapSize-height={2048}
          shadow-camera-near={10}
          shadow-camera-far={260}
          shadow-camera-left={-120}
          shadow-camera-right={120}
          shadow-camera-top={120}
          shadow-camera-bottom={-120}
        />

        <World />
        <Enemies
          enemiesRef={enemiesRef}
          playerPosRef={playerPosRef}
          isInvisible={isInvisible}
        />
        <Player
          playerPosRef={playerPosRef}
          enemiesRef={enemiesRef}
          isFlying={isFlying}
          hasWeapon={hasWeapon}
          isInvisible={isInvisible}
          onPointerLockChange={setPointerLocked}
        />
      </Canvas>

      <HUD
        isFlying={isFlying}
        hasWeapon={hasWeapon}
        invisTimer={invisTimer}
        onToggleFlight={toggleFlight}
        onToggleWeapon={toggleWeapon}
        onTriggerInvis={triggerInvisibility}
      />
    </div>
  );
}

export default App;
