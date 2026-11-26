import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { Sky } from '@react-three/drei';
import * as THREE from 'three';
import { CardId, INVISIBILITY_DURATION, PLAYER_MAX_HP } from './types/game';
import { getTerrainHeight } from './world/terrain';
import { World } from './components/World';
import { createInitialEnemies, Enemies, EnemyEntity } from './components/Enemies';
import { Player, PlayerCombatBridge, PlayerTouchBridge } from './components/Player';
import { Grimoire } from './components/Grimoire';
import { HUD } from './components/HUD';
import { MobileControls } from './components/MobileControls';
import {
  applyPlayerDamage,
  PLAYER_DAMAGE_COOLDOWN,
} from './gameplay/combat/HealthSystem';

export function App() {
  const [playerHp, setPlayerHp] = useState(PLAYER_MAX_HP);
  const [isFlying, setIsFlying] = useState(false);
  const [hasWeapon, setHasWeapon] = useState(false);
  const [invisTimer, setInvisTimer] = useState(0);
  const [isGrimoireOpen, setIsGrimoireOpen] = useState(false);
  const [, setPointerLocked] = useState(false);

  const playerPosRef = useRef<THREE.Vector3>(
    new THREE.Vector3(0, getTerrainHeight(0, 0), 0)
  );
  const enemiesRef = useRef<EnemyEntity[]>(createInitialEnemies());
  const combatBridgeRef = useRef<PlayerCombatBridge | null>(null);
  const touchBridgeRef = useRef<PlayerTouchBridge | null>(null);
  const lastDamageTimeRef = useRef<number>(0);

  const isDead = playerHp <= 0;

  const handleActivateCard = useCallback((id: CardId) => {
    if (id === 'flight') {
      setIsFlying((prev) => !prev);
    } else if (id === 'weapon') {
      setHasWeapon((prev) => !prev);
    } else if (id === 'invisibility') {
      setInvisTimer(INVISIBILITY_DURATION);
    }
  }, []);

  const handlePlayerHit = useCallback(
    (damage: number, sourceId: string) => {
      if (playerHp <= 0) return;
      const now = performance.now();
      if (now - lastDamageTimeRef.current < PLAYER_DAMAGE_COOLDOWN * 1000) {
        return;
      }

      const isBlocking = combatBridgeRef.current?.isBlocking() ?? false;
      const result = applyPlayerDamage(playerHp, { amount: damage, sourceId }, isBlocking);
      if (result.wasBlocked) return;

      lastDamageTimeRef.current = now;
      setPlayerHp(result.nextHp);

      if (result.isFatal) {
        setIsGrimoireOpen(false);
        setIsFlying(false);
        combatBridgeRef.current?.triggerDeath();
      } else {
        combatBridgeRef.current?.triggerHitReaction();
      }
    },
    [playerHp]
  );

  const handleRevive = useCallback(() => {
    setPlayerHp(PLAYER_MAX_HP);
    setIsFlying(false);
    setIsGrimoireOpen(false);
    lastDamageTimeRef.current = 0;
    combatBridgeRef.current?.reviveAtStartingPlaza();
  }, []);

  // Grimoire summon/dismiss & Revival keybindings
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (isDead) {
        if (e.code === 'KeyR') {
          handleRevive();
        }
        return;
      }
      if (e.code === 'KeyG') {
        setIsGrimoireOpen((prev) => !prev);
      } else if (e.code === 'Escape') {
        setIsGrimoireOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isDead, handleRevive]);

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
        camera={{ fov: 60, near: 0.1, far: 600, position: [0, 6, 10] }}
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
          isPlayerDead={isDead}
          onPlayerHit={handlePlayerHit}
        />
        <Suspense fallback={null}>
          <Player
            playerPosRef={playerPosRef}
            enemiesRef={enemiesRef}
            isFlying={isFlying}
            hasWeapon={hasWeapon}
            isInvisible={isInvisible}
            isGrimoireOpen={isGrimoireOpen}
            isDead={isDead}
            combatBridgeRef={combatBridgeRef}
            touchBridgeRef={touchBridgeRef}
            onPointerLockChange={setPointerLocked}
          />
        </Suspense>
        <Grimoire
          isOpen={isGrimoireOpen && !isDead}
          isFlying={isFlying}
          hasWeapon={hasWeapon}
          isInvisible={isInvisible}
          onActivateCard={handleActivateCard}
          onClose={() => setIsGrimoireOpen(false)}
        />
      </Canvas>

      <HUD
        hp={playerHp}
        maxHp={PLAYER_MAX_HP}
        isDead={isDead}
        isFlying={isFlying}
        hasWeapon={hasWeapon}
        invisTimer={invisTimer}
        isGrimoireOpen={isGrimoireOpen}
        onRevive={handleRevive}
      />
      <MobileControls
        touchBridgeRef={touchBridgeRef}
        isFlying={isFlying}
        hasWeapon={hasWeapon}
        isGrimoireOpen={isGrimoireOpen || isDead}
        onToggleGrimoire={() => {
          if (!isDead) setIsGrimoireOpen((prev) => !prev);
        }}
      />
    </div>
  );
}

export default App;
