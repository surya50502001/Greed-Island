import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { Environment, Lightformer, Sky } from '@react-three/drei';
import * as THREE from 'three';
import { CardId, INVISIBILITY_DURATION, PLAYER_MAX_HP } from './types/game';
import { getGroundHeight, getTerrainHeight } from './world/terrain';
import { World } from './components/World';
import { createInitialEnemies, Enemies, EnemyEntity } from './components/Enemies';
import {
  FloatingDamageEvent,
  MeleeHitCheckParams,
  Player,
  PlayerCombatBridge,
  PlayerTouchBridge,
} from './components/Player';
import { CombatVFX, CombatVFXHandle } from './components/CombatVFX';
import { Grimoire } from './components/Grimoire';
import { GrimoireOverlay } from './components/GrimoireOverlay';
import { ActiveDamageNumber, HUD } from './components/HUD';
import { MobileControls } from './components/MobileControls';
import {
  applyPlayerDamage,
  PLAYER_DAMAGE_COOLDOWN,
} from './gameplay/combat/HealthSystem';
import {
  DEFAULT_RAID_SCHEDULER_CONFIG,
  RaidEvent,
} from './domain/raids/types';
import {
  createRaidEvent,
  forceStartGatheringRaid,
  joinRaid,
  leaveRaid,
  rollRaidTier,
  selectRaidSpawnLocation,
  stepRaidLifecycle,
} from './domain/raids/scheduler';
import {
  BossEncounterState,
  FENRIR_BOSS_CONFIG,
} from './domain/bosses/types';
import {
  applyBossDamage,
  createBossEncounterState,
} from './domain/bosses/encounter';
import { claimRaidRewards } from './domain/rewards/rules';
import { RaidRewardGrant } from './domain/rewards/types';
import { RaidBossActor } from './components/raids/RaidBossActor';
import { RaidNotifications } from './components/raids/RaidNotifications';
import { IslandMapModal } from './components/raids/IslandMapModal';
import { RaidGatheringPanel } from './components/raids/RaidGatheringPanel';
import { RaidEncounterHUD } from './components/raids/RaidEncounterHUD';
import { RaidRewardModal } from './components/raids/RaidRewardModal';

const LOCAL_PLAYER_ID = 'local-player';

export function App() {
  const [playerHp, setPlayerHp] = useState(PLAYER_MAX_HP);
  const [isFlying, setIsFlying] = useState(false);
  const [hasWeapon, setHasWeapon] = useState(false);
  const [invisTimer, setInvisTimer] = useState(0);
  const [isGrimoireOpen, setIsGrimoireOpen] = useState(false);
  const [isMapOpen, setIsMapOpen] = useState(false);
  const [isTouchVisible, setIsTouchVisible] = useState(false);
  const [, setPointerLocked] = useState(false);

  // Raid Event & Boss Prototype State (throttled UI sync from domain refs)
  const raidsRef = useRef<RaidEvent[]>([]);
  const activeBossRef = useRef<BossEncounterState | null>(null);
  const hitBossAttackIdRef = useRef<number>(-1);
  const raidSeqRef = useRef<number>(1);
  const nextAutoRaidAtRef = useRef<number>(Math.floor(Date.now() / 1000) + 25);
  const [raidUiTick, setRaidUiTick] = useState<number>(Math.floor(Date.now() / 1000));
  const [dismissedRaidIds, setDismissedRaidIds] = useState<Set<string>>(() => new Set());
  const [selectedMapRaidId, setSelectedMapRaidId] = useState<string | null>(null);
  const [trackedRaidId, setTrackedRaidId] = useState<string | null>(null);
  const [claimedRewardGrant, setClaimedRewardGrant] = useState<RaidRewardGrant | null>(null);

  


  const playerPosRef = useRef<THREE.Vector3>(new THREE.Vector3(0, getGroundHeight(0, 0), 0));
  const enemiesRef = useRef<EnemyEntity[]>(createInitialEnemies());
  const combatBridgeRef = useRef<PlayerCombatBridge | null>(null);
  const touchBridgeRef = useRef<PlayerTouchBridge | null>(null);
  const vfxRef = useRef<CombatVFXHandle | null>(null);
  const lastDamageTimeRef = useRef<number>(0);
  const dmgIdRef = useRef<number>(1);
  const [damageNumbers, setDamageNumbers] = useState<ActiveDamageNumber[]>([]);
  const [comboState, setComboState] = useState<{
    count: number;
    step: number;
    attackName: string;
    timer: number;
  }>({ count: 0, step: 0, attackName: '', timer: 0 });

  const handleDamageNumber = useCallback((ev: FloatingDamageEvent) => {
    const id = dmgIdRef.current++;
    setDamageNumbers((prev) => [...prev.slice(-9), { ...ev, id }]);
    window.setTimeout(() => {
      setDamageNumbers((prev) => prev.filter((item) => item.id !== id));
    }, 680);
  }, []);

  const handleComboHit = useCallback((comboStep: number, attackName: string) => {
    setComboState((prev) => ({
      count: prev.count + 1,
      step: comboStep,
      attackName,
      timer: 2.6,
    }));
  }, []);

  useEffect(() => {
    if (comboState.timer <= 0) return;
    const interval = window.setInterval(() => {
      setComboState((prev) => {
        const next = prev.timer - 0.1;
        if (next <= 0) return { count: 0, step: 0, attackName: '', timer: 0 };
        return { ...prev, timer: next };
      });
    }, 100);
    return () => window.clearInterval(interval);
  }, [comboState.timer > 0]);

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

  const spawnPrototypeRaid = useCallback((immediateGathering = false) => {
    const now = Date.now() / 1000;
    const activeCount = raidsRef.current.filter(
      (r) => r.status === 'Upcoming' || r.status === 'Gathering' || r.status === 'InProgress'
    ).length;
    if (activeCount >= DEFAULT_RAID_SCHEDULER_CONFIG.maxSimultaneousRaids) return;

    const seq = raidSeqRef.current++;
    const seed = Math.floor(now * 1000) + seq * 7919;
    const loc = selectRaidSpawnLocation(seed, raidsRef.current, getTerrainHeight);
    if (!loc) return;

    const tier = rollRaidTier(Math.random, DEFAULT_RAID_SCHEDULER_CONFIG.tierProbabilities);
    const raid = createRaidEvent({
      raidId: `raid-${seq}`,
      bossId: FENRIR_BOSS_CONFIG.bossId,
      bossName: FENRIR_BOSS_CONFIG.displayName,
      bossTitle: FENRIR_BOSS_CONFIG.title,
      bossMaxHp: FENRIR_BOSS_CONFIG.maxHp,
      rewardTableId: FENRIR_BOSS_CONFIG.rewardTableId,
      tier,
      location: loc,
      nowSec: now,
      startImmediatelyInGathering: immediateGathering,
    });
    raidsRef.current = [...raidsRef.current.slice(-4), raid];
    if (!activeBossRef.current) {
      activeBossRef.current = createBossEncounterState(raid.raidId, FENRIR_BOSS_CONFIG, loc);
    }
    setRaidUiTick(now);
  }, []);

  // Periodic raid scheduler & lifecycle tick (4Hz UI sync)
  useEffect(() => {
    const timer = window.setInterval(() => {
      const now = Date.now() / 1000;
      if (now >= nextAutoRaidAtRef.current) {
        spawnPrototypeRaid(false);
        const span =
          DEFAULT_RAID_SCHEDULER_CONFIG.maxIntervalSec -
          DEFAULT_RAID_SCHEDULER_CONFIG.minIntervalSec;
        nextAutoRaidAtRef.current =
          now + DEFAULT_RAID_SCHEDULER_CONFIG.minIntervalSec + Math.random() * span;
      }

      for (const r of raidsRef.current) {
        stepRaidLifecycle(r, now);
        if (
          r.status === 'Completed' &&
          r.completionStatus === 'victory' &&
          !claimedRewardGrant
        ) {
          const res = claimRaidRewards(r, LOCAL_PLAYER_ID);
          if (res.success && res.grant) {
            setClaimedRewardGrant(res.grant);
          }
        }
      }

      // Ensure activeBossRef tracks the current Gathering/InProgress raid
      const liveRaid =
        raidsRef.current.find((r) => r.status === 'InProgress') ??
        raidsRef.current.find((r) => r.status === 'Gathering' || r.status === 'Upcoming') ??
        null;
      if (liveRaid && activeBossRef.current?.raidId !== liveRaid.raidId) {
        activeBossRef.current = createBossEncounterState(
          liveRaid.raidId,
          FENRIR_BOSS_CONFIG,
          liveRaid.location
        );
      } else if (!liveRaid) {
        activeBossRef.current = null;
      }

      setRaidUiTick(now);
    }, 250);
    return () => window.clearInterval(timer);
  }, [spawnPrototypeRaid, claimedRewardGrant]);

  const handleJoinRaid = useCallback((raidId: string) => {
    const raid = raidsRef.current.find((r) => r.raidId === raidId);
    if (!raid) return;
    joinRaid(raid, LOCAL_PLAYER_ID, 'Hunter (You)', Date.now() / 1000);
    setRaidUiTick(Date.now() / 1000);
  }, []);

  const handleLeaveRaid = useCallback((raidId: string) => {
    const raid = raidsRef.current.find((r) => r.raidId === raidId);
    if (!raid) return;
    leaveRaid(raid, LOCAL_PLAYER_ID);
    setRaidUiTick(Date.now() / 1000);
  }, []);

  const handleBeginEncounter = useCallback((raidId: string) => {
    const raid = raidsRef.current.find((r) => r.raidId === raidId);
    if (!raid) return;
    forceStartGatheringRaid(raid, Date.now() / 1000);
    setRaidUiTick(Date.now() / 1000);
  }, []);

  const handleMeleeBossCheck = useCallback(
    (params: MeleeHitCheckParams): boolean => {
      const boss = activeBossRef.current;
      const raid = raidsRef.current.find((r) => r.raidId === boss?.raidId);
      if (!boss || !raid || raid.status !== 'InProgress' || boss.aiState === 'Defeated') {
        return false;
      }
      if (hitBossAttackIdRef.current === params.attackId) {
        return false;
      }

      const dx = boss.position.x - params.playerPos.x;
      const dz = boss.position.z - params.playerPos.z;
      const dist = Math.hypot(dx, dz);
      if (dist > params.reach + 1.2) return false;

      hitBossAttackIdRef.current = params.attackId;
      const isWeakPoint = boss.weakPointExposed;
      const res = applyBossDamage(boss, FENRIR_BOSS_CONFIG, params.damage, isWeakPoint);
      if (res.appliedDamage <= 0) return false;

      const participant = raid.participants.find((p) => p.playerId === LOCAL_PLAYER_ID);
      if (participant) {
        participant.totalDamageDealt += res.appliedDamage;
        participant.hitsLanded += 1;
      }

      const invD = 1 / (dist || 1);
      vfxRef.current?.spawnHitImpact(
        boss.position,
        dx * invD,
        dz * invD,
        params.color,
        params.isFinisher || res.brokeShield
      );
      handleDamageNumber({
        x: 50,
        y: 36,
        amount: res.appliedDamage,
        isFinisher: params.isFinisher || isWeakPoint,
        comboStep: params.comboStep,
      });

      if (res.defeated) {
        raid.bossHp = 0;
        stepRaidLifecycle(raid, Date.now() / 1000);
        const rewardRes = claimRaidRewards(raid, LOCAL_PLAYER_ID);
        if (rewardRes.success && rewardRes.grant) {
          setClaimedRewardGrant(rewardRes.grant);
        }
      }
      return true;
    },
    [handleDamageNumber]
  );

  // Grimoire & Island Map keybindings + Revival
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
        setIsMapOpen(false);
        setIsGrimoireOpen((prev) => !prev);
      } else if (e.code === 'KeyM') {
        setIsGrimoireOpen(false);
        setIsMapOpen((prev) => !prev);
      } else if (e.code === 'Escape') {
        setIsGrimoireOpen(false);
        setIsMapOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isDead, handleRevive]);

  const activeSceneRaid =
    raidsRef.current.find((r) => r.status === 'InProgress') ??
    raidsRef.current.find((r) => r.status === 'Gathering' || r.status === 'Upcoming') ??
    null;

  const nearbyGatheringRaid =
    raidsRef.current.find(
      (r) =>
        (r.status === 'Gathering' || r.status === 'Upcoming') &&
        Math.hypot(
          r.location.x - playerPosRef.current.x,
          r.location.z - playerPosRef.current.z
        ) <= 17
    ) ?? null;

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
        shadows="soft"
        dpr={[1, 2]}
        gl={{
          antialias: true,
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 0.95,
        }}
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

        <Environment resolution={256}>
          <Lightformer
            form="rect"
            intensity={2.2}
            color="#e0f4ff"
            position={[0, 12, 0]}
            rotation={[Math.PI / 2, 0, 0]}
            scale={[24, 24, 1]}
          />
          <Lightformer
            form="circle"
            intensity={3.0}
            color="#fff6e0"
            position={[12, 10, 8]}
            scale={[8, 8, 1]}
          />
          <Lightformer
            form="rect"
            intensity={1.4}
            color="#d8f0ff"
            position={[-10, 5, -10]}
            rotation={[0, Math.PI / 4, 0]}
            scale={[18, 10, 1]}
          />
          <Lightformer
            form="rect"
            intensity={1.1}
            color="#9bbf8a"
            position={[0, -8, 0]}
            rotation={[-Math.PI / 2, 0, 0]}
            scale={[24, 24, 1]}
          />
        </Environment>

        <ambientLight intensity={0.46} />
        <hemisphereLight args={['#d8f3ff', '#6b8e63', 0.68]} />
        <directionalLight
          castShadow
          position={[70, 95, 40]}
          intensity={1.55}
          shadow-bias={-0.0003}
          shadow-normalBias={0.03}
          shadow-mapSize-width={2048}
          shadow-mapSize-height={2048}
          shadow-camera-near={10}
          shadow-camera-far={260}
          shadow-camera-left={-120}
          shadow-camera-right={120}
          shadow-camera-top={120}
          shadow-camera-bottom={-120}
        />

        <Suspense fallback={null}>
          <World />
          <Enemies
            enemiesRef={enemiesRef}
            playerPosRef={playerPosRef}
            isInvisible={isInvisible}
            isFlying={isFlying}
            isPlayerDead={isDead}
            onPlayerHit={handlePlayerHit}
          />
          <CombatVFX ref={vfxRef} />
          <RaidBossActor
            raid={activeSceneRaid}
            bossRef={activeBossRef}
            playerPosRef={playerPosRef}
            isInvisible={isInvisible}
            isPlayerDead={isDead}
            onBossAttackHit={(dmg, abilityName) => handlePlayerHit(dmg, abilityName)}
          />
          <Player
            playerPosRef={playerPosRef}
            enemiesRef={enemiesRef}
            isFlying={isFlying}
            hasWeapon={hasWeapon}
            isInvisible={isInvisible}
            isGrimoireOpen={isGrimoireOpen || isMapOpen}
            isDead={isDead}
            combatBridgeRef={combatBridgeRef}
            touchBridgeRef={touchBridgeRef}
            vfxRef={vfxRef}
            onDamageNumber={handleDamageNumber}
            onMeleeHitCheck={handleMeleeBossCheck}
            onComboHit={handleComboHit}
            onPointerLockChange={setPointerLocked}
          />
        </Suspense>
        <Grimoire
          isOpen={isGrimoireOpen && !isDead}
        />
      </Canvas>

      {isGrimoireOpen && !isDead && (
        <GrimoireOverlay
          isOpen={isGrimoireOpen && !isDead}
          isFlying={isFlying}
          hasWeapon={hasWeapon}
          isInvisible={isInvisible}
          onActivateCard={handleActivateCard}
          onClose={() => setIsGrimoireOpen(false)}
        />
      )}
      <HUD
        hp={playerHp}
        maxHp={PLAYER_MAX_HP}
        isDead={isDead}
        isFlying={isFlying}
        hasWeapon={hasWeapon}
        invisTimer={invisTimer}
        isGrimoireOpen={isGrimoireOpen}
        hideKeyboardHints={isTouchVisible}
        damageNumbers={damageNumbers}
        comboCount={comboState.count}
        comboStep={comboState.step}
        comboAttackName={comboState.attackName}
        comboTimer={comboState.timer}
        onRevive={handleRevive}
      />
      <RaidEncounterHUD
        raid={activeSceneRaid}
        boss={activeBossRef.current}
        nowSec={raidUiTick}
      />
      <RaidNotifications
        raids={raidsRef.current}
        playerPos={{
          x: playerPosRef.current.x,
          y: playerPosRef.current.y,
          z: playerPosRef.current.z,
        }}
        nowSec={raidUiTick}
        dismissedIds={dismissedRaidIds}
        trackedRaidId={trackedRaidId}
        onDismiss={(id) =>
          setDismissedRaidIds((prev) => new Set(prev).add(id))
        }
        onReopenAll={() => setDismissedRaidIds(new Set())}
        onViewOnMap={(id) => {
          setSelectedMapRaidId(id);
          setIsGrimoireOpen(false);
          setIsMapOpen(true);
        }}
        onClearTrack={() => setTrackedRaidId(null)}
      />
      {nearbyGatheringRaid && !isDead && (
        <RaidGatheringPanel
          raid={nearbyGatheringRaid}
          localPlayerId={LOCAL_PLAYER_ID}
          nowSec={raidUiTick}
          onJoin={handleJoinRaid}
          onLeave={handleLeaveRaid}
          onBeginEncounter={handleBeginEncounter}
        />
      )}
      <IslandMapModal
        isOpen={isMapOpen && !isDead}
        raids={raidsRef.current}
        playerPos={{
          x: playerPosRef.current.x,
          y: playerPosRef.current.y,
          z: playerPosRef.current.z,
        }}
        nowSec={raidUiTick}
        selectedRaidId={selectedMapRaidId}
        trackedRaidId={trackedRaidId}
        onSelectRaid={setSelectedMapRaidId}
        onTrackRaid={setTrackedRaidId}
        onSpawnPrototypeRaid={() => spawnPrototypeRaid(true)}
        onClose={() => setIsMapOpen(false)}
      />
      <RaidRewardModal
        grant={claimedRewardGrant}
        onClose={() => setClaimedRewardGrant(null)}
      />
      <MobileControls
        touchBridgeRef={touchBridgeRef}
        isFlying={isFlying}
        hasWeapon={hasWeapon}
        isGrimoireOpen={isGrimoireOpen || isDead}
        onVisibilityChange={setIsTouchVisible}
        onToggleGrimoire={() => {
          if (!isDead) setIsGrimoireOpen((prev) => !prev);
        }}
      />
    </div>
  );

}

export default App;
