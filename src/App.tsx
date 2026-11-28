import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { Environment, Lightformer, Sky } from '@react-three/drei';
import * as THREE from 'three';
import { CARD_DEFINITIONS, INVISIBILITY_DURATION, PLAYER_MAX_HP } from './types/game';
import {
  ActiveCardLoadout,
  ActiveCardSlotIndex,
  AnyCardId,
  CardCooldownMap,
  CardInventory,
} from './domain/cards/types';
import {
  addCardToInventory,
  canActivateCard,
  createStarterInventory,
  createStarterLoadout,
  equipCardToSlot,
  getEffectiveCardCooldown,
  getFlightSpeedMultiplier,
  getInvisibilityDuration,
  getWeaponAttackBonus,
  tickCardCooldowns,
  unequipSlot,
  upgradeCard,
} from './domain/cards/rules';
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
import {
  ConnectionStatus,
  GreedSignalRClient,
  MovementInputPayload,
  RemotePlayerSnapshot,
} from './network/SignalRClient';
import { MultiplayerLobby } from './components/multiplayer/MultiplayerLobby';
import { RemotePlayer } from './components/multiplayer/RemotePlayer';

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

  // Multiplayer Lobby, Identity & SignalR Sync State
  const signalRRef = useRef<GreedSignalRClient | null>(null);
  const remoteSnapshotsRef = useRef<Record<string, RemotePlayerSnapshot>>({});
  const [isLobbyOpen, setIsLobbyOpen] = useState(true);
  const [isMultiplayerActive, setIsMultiplayerActive] = useState(false);
  const [mpBusy, setMpBusy] = useState(false);
  const [mpStatus, setMpStatus] = useState<string | null>(null);
  const [mpConnectionStatus, setMpConnectionStatus] = useState<ConnectionStatus>('disconnected');
  const [mpRoomCode, setMpRoomCode] = useState<string | null>(null);
  const [mpLocalPlayerId, setMpLocalPlayerId] = useState<string | null>(null);
  const [mpCharacterName, setMpCharacterName] = useState<string | null>(null);
  const [mpRoomPlayers, setMpRoomPlayers] = useState<RemotePlayerSnapshot[]>([]);
  const [mpLocalSpawn, setMpLocalSpawn] = useState<{
    x: number;
    y: number;
    z: number;
    yaw: number;
  } | null>(null);

  const mpSelfIdRef = useRef<string | null>(null);
  const mpRoomCodeRef = useRef<string | null>(null);
  const mpCharNameRef = useRef<string | null>(null);

  // Local Card Inventory, 4-Slot Loadout, Cooldowns, & Progression Materials
  const [cardInventory, setCardInventory] = useState<CardInventory>(() =>
    createStarterInventory()
  );
  const [cardLoadout, setCardLoadout] = useState<ActiveCardLoadout>(() =>
    createStarterLoadout()
  );
  const [cardCooldowns, setCardCooldowns] = useState<CardCooldownMap>({});
  const [, setCardMaterials] = useState<Record<string, number>>({});

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

  const ensureSignalRConnected = useCallback(async () => {
    if (!signalRRef.current) {
      signalRRef.current = new GreedSignalRClient();
    }
    await signalRRef.current.connect({
      onConnectionStateChange: (status) => {
        setMpConnectionStatus(status);
      },
      onRoomUpdated: (payload) => {
        const selfId = mpSelfIdRef.current;
        for (const p of payload.players) {
          if (p.playerId !== selfId) {
            remoteSnapshotsRef.current[p.playerId] = p;
          }
        }
        setMpRoomPlayers(payload.players);
      },
      onWorldReady: (payload) => {
        const selfId = mpSelfIdRef.current;
        setMpRoomPlayers(payload.players);
        for (const p of payload.players) {
          if (p.playerId === selfId) {
            setMpLocalSpawn({ x: p.x, y: p.y, z: p.z, yaw: p.yaw });
          } else {
            remoteSnapshotsRef.current[p.playerId] = p;
          }
        }
        setIsMultiplayerActive(true);
        setIsLobbyOpen(false);
      },
      onPlayerMoved: (snapshot) => {
        remoteSnapshotsRef.current[snapshot.playerId] = snapshot;
      },
      onPlayerLeft: (payload) => {
        delete remoteSnapshotsRef.current[payload.playerId];
        setMpRoomPlayers(payload.players);
      },
      onReconnected: () => {
        const selfId = mpSelfIdRef.current;
        const charName = mpCharNameRef.current;
        const code = mpRoomCodeRef.current;
        if (!selfId || !charName || !code || !signalRRef.current) return;
        void signalRRef.current.reconnectToRoom(selfId, charName, code).then((res) => {
          if (!res.success) {
            setMpStatus(res.error ?? 'Failed to restore room after reconnect.');
            return;
          }
          const activeIds = new Set(res.players.map((p) => p.playerId));
          for (const existingId of Object.keys(remoteSnapshotsRef.current)) {
            if (!activeIds.has(existingId)) {
              delete remoteSnapshotsRef.current[existingId];
            }
          }
          for (const p of res.players) {
            if (p.playerId !== selfId) {
              remoteSnapshotsRef.current[p.playerId] = p;
            }
          }
          setMpRoomPlayers(res.players);
        });
      },
      onDisconnected: () => {
        setMpStatus('Disconnected from multiplayer server.');
      },
    });
  }, []);

  const handleCreateRoom = useCallback(
    async (characterName: string) => {
      setMpBusy(true);
      setMpStatus(null);
      try {
        await ensureSignalRConnected();
        const res = await signalRRef.current!.createRoom(characterName);
        if (!res.success) {
          setMpStatus(res.error ?? 'Failed to create room.');
          return;
        }
        mpSelfIdRef.current = res.playerId ?? null;
        mpCharNameRef.current = res.characterName ?? characterName;
        mpRoomCodeRef.current = res.roomCode ?? null;
        setMpLocalPlayerId(res.playerId ?? null);
        setMpCharacterName(res.characterName ?? characterName);
        setMpRoomCode(res.roomCode ?? null);
        setMpRoomPlayers(res.players);
      } catch (err) {
        setMpStatus(
          err instanceof Error && err.message.includes('VITE_MULTIPLAYER_URL')
            ? err.message
            : 'Could not reach multiplayer server. Check backend URL.'
        );
      } finally {
        setMpBusy(false);
      }
    },
    [ensureSignalRConnected]
  );

  const handleJoinRoom = useCallback(
    async (characterName: string, roomCode: string) => {
      setMpBusy(true);
      setMpStatus(null);
      try {
        await ensureSignalRConnected();
        const res = await signalRRef.current!.joinRoom(characterName, roomCode);
        if (!res.success) {
          setMpStatus(res.error ?? 'Failed to join room.');
          return;
        }
        mpSelfIdRef.current = res.playerId ?? null;
        mpCharNameRef.current = res.characterName ?? characterName;
        mpRoomCodeRef.current = res.roomCode ?? null;
        setMpLocalPlayerId(res.playerId ?? null);
        setMpCharacterName(res.characterName ?? characterName);
        setMpRoomCode(res.roomCode ?? null);
        setMpRoomPlayers(res.players);
        if (res.isReady) {
          for (const p of res.players) {
            if (p.playerId === res.playerId) {
              setMpLocalSpawn({ x: p.x, y: p.y, z: p.z, yaw: p.yaw });
            } else {
              remoteSnapshotsRef.current[p.playerId] = p;
            }
          }
          setIsMultiplayerActive(true);
          setIsLobbyOpen(false);
        }
      } catch (err) {
        setMpStatus(
          err instanceof Error && err.message.includes('VITE_MULTIPLAYER_URL')
            ? err.message
            : 'Could not reach multiplayer server. Check backend URL.'
        );
      } finally {
        setMpBusy(false);
      }
    },
    [ensureSignalRConnected]
  );

  const handlePlaySolo = useCallback(() => {
    void signalRRef.current?.disconnect();
    mpSelfIdRef.current = null;
    mpCharNameRef.current = null;
    mpRoomCodeRef.current = null;
    remoteSnapshotsRef.current = {};
    setIsMultiplayerActive(false);
    setMpConnectionStatus('disconnected');
    setMpRoomCode(null);
    setMpRoomPlayers([]);
    setIsLobbyOpen(false);
  }, []);

  const handleLocalStateBroadcast = useCallback(
    (payload: MovementInputPayload) => {
      if (!isMultiplayerActive) return;
      signalRRef.current?.sendMovement(payload);
    },
    [isMultiplayerActive]
  );

  useEffect(() => {
    return () => {
      void signalRRef.current?.disconnect();
    };
  }, []);

  const handleActivateCard = useCallback(
    (id: AnyCardId): boolean => {
      if (isDead) return false;
      const check = canActivateCard(id, cardLoadout, cardCooldowns);
      if (!check.allowed) return false;

      const entry = cardInventory.cards[id];
      const level = entry?.level ?? 1;
      const def = CARD_DEFINITIONS.find((c) => c.id === id);
      const cd = getEffectiveCardCooldown(def, level);

      if (id === 'flight') {
        setIsFlying((prev) => !prev);
      } else if (id === 'weapon') {
        setHasWeapon((prev) => !prev);
      } else if (id === 'invisibility') {
        setInvisTimer(getInvisibilityDuration(level, INVISIBILITY_DURATION));
      } else {
        return false;
      }

      if (cd > 0) {
        setCardCooldowns((prev) => ({ ...prev, [id]: cd }));
      }
      return true;
    },
    [isDead, cardLoadout, cardCooldowns, cardInventory]
  );

  const handleEquipCard = useCallback(
    (cardId: AnyCardId, slotIndex: ActiveCardSlotIndex) => {
      setCardLoadout((prev) => equipCardToSlot(prev, cardInventory, cardId, slotIndex).loadout);
    },
    [cardInventory]
  );

  const handleUnequipSlot = useCallback(
    (slotIndex: ActiveCardSlotIndex) => {
      const removed = cardLoadout.slots[slotIndex];
      setCardLoadout((prev) => unequipSlot(prev, slotIndex));
      if (removed === 'flight') setIsFlying(false);
      if (removed === 'weapon') setHasWeapon(false);
    },
    [cardLoadout]
  );

  const handleUpgradeCard = useCallback((cardId: AnyCardId) => {
    const def = CARD_DEFINITIONS.find((c) => c.id === cardId);
    setCardInventory((prev) => upgradeCard(prev, cardId, def).inventory);
  }, []);

  const applyRewardGrantToInventory = useCallback((grant: RaidRewardGrant) => {
    setCardInventory((prev) => {
      let next = prev;
      for (const item of grant.items) {
        if (item.cardId) {
          next = addCardToInventory(next, item.cardId, item.quantity);
        }
      }
      return next;
    });
    setCardMaterials((prev) => {
      const next = { ...prev };
      for (const item of grant.items) {
        if (!item.cardId) {
          next[item.id] = (next[item.id] ?? 0) + item.quantity;
        }
      }
      return next;
    });
  }, []);

  const hasActiveCooldowns = Object.keys(cardCooldowns).length > 0;
  useEffect(() => {
    if (!hasActiveCooldowns) return;
    const interval = window.setInterval(() => {
      setCardCooldowns((prev) => tickCardCooldowns(prev, 0.2));
    }, 200);
    return () => window.clearInterval(interval);
  }, [hasActiveCooldowns]);

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
            applyRewardGrantToInventory(res.grant);
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
  }, [spawnPrototypeRaid, claimedRewardGrant, applyRewardGrantToInventory]);

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
          applyRewardGrantToInventory(rewardRes.grant);
          setClaimedRewardGrant(rewardRes.grant);
        }
      }
      return true;
    },
    [handleDamageNumber, applyRewardGrantToInventory]
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
      } else if (!isGrimoireOpen && !isMapOpen) {
        const slotIdx: ActiveCardSlotIndex | null =
          e.code === 'Digit1'
            ? 0
            : e.code === 'Digit2'
              ? 1
              : e.code === 'Digit3'
                ? 2
                : e.code === 'Digit4'
                  ? 3
                  : null;
        if (slotIdx !== null) {
          const cardId = cardLoadout.slots[slotIdx];
          if (cardId) handleActivateCard(cardId);
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isDead, handleRevive, isGrimoireOpen, isMapOpen, cardLoadout, handleActivateCard]);

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
            isGrimoireOpen={isGrimoireOpen || isMapOpen || isLobbyOpen}
            isDead={isDead}
            flightSpeedMultiplier={getFlightSpeedMultiplier(
              cardInventory.cards['flight']?.level ?? 1
            )}
            weaponAttackBonus={getWeaponAttackBonus(
              cardInventory.cards['weapon']?.level ?? 1
            )}
            initialSpawn={mpLocalSpawn}
            characterName={isMultiplayerActive ? mpCharacterName : null}
            onLocalStateBroadcast={isMultiplayerActive ? handleLocalStateBroadcast : undefined}
            combatBridgeRef={combatBridgeRef}
            touchBridgeRef={touchBridgeRef}
            vfxRef={vfxRef}
            onDamageNumber={handleDamageNumber}
            onMeleeHitCheck={handleMeleeBossCheck}
            onComboHit={handleComboHit}
            onPointerLockChange={setPointerLocked}
          />
          {isMultiplayerActive &&
            mpRoomPlayers
              .filter((p) => p.playerId !== mpLocalPlayerId)
              .map((rp) => (
                <RemotePlayer
                  key={rp.playerId}
                  initialSnapshot={rp}
                  snapshotsRef={remoteSnapshotsRef}
                />
              ))}
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
          inventory={cardInventory}
          loadout={cardLoadout}
          cooldowns={cardCooldowns}
          onActivateCard={handleActivateCard}
          onEquipCard={handleEquipCard}
          onUnequipSlot={handleUnequipSlot}
          onUpgradeCard={handleUpgradeCard}
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
        inventory={cardInventory}
        loadout={cardLoadout}
        cooldowns={cardCooldowns}
        onActivateSlotCard={handleActivateCard}
        multiplayerStatus={isMultiplayerActive ? mpConnectionStatus : null}
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
      <MultiplayerLobby
        isOpen={isLobbyOpen}
        roomCode={mpRoomCode}
        players={mpRoomPlayers}
        localPlayerId={mpLocalPlayerId}
        statusMessage={mpStatus}
        isBusy={mpBusy}
        onCreateRoom={handleCreateRoom}
        onJoinRoom={handleJoinRoom}
        onPlaySolo={handlePlaySolo}
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
