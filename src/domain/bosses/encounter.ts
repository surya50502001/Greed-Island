import { cloneVec3, normalizeXZ, vec3, Vec3 } from '../math/vec3';
import {
  BossAbilityConfig,
  BossAttackEvent,
  BossConfig,
  BossEncounterState,
  BossPhaseConfig,
  BossTarget,
} from './types';

export type BossGroundFn = (x: number, z: number) => number;

export function createBossEncounterState(
  raidId: string,
  config: BossConfig,
  spawnLocation: Vec3
): BossEncounterState {
  return {
    raidId,
    bossId: config.bossId,
    position: cloneVec3(spawnLocation),
    home: cloneVec3(spawnLocation),
    yaw: 0,
    hp: config.maxHp,
    maxHp: config.maxHp,
    phase: 1,
    aiState: 'Idle',
    activeAbilityId: null,
    telegraphShape: 'circle',
    telegraphCenter: cloneVec3(spawnLocation),
    telegraphRadius: 4,
    telegraphTimer: 0,
    telegraphDuration: 1,
    recoverTimer: 0,
    vulnerableTimer: 0,
    shieldHp: 0,
    weakPointExposed: false,
    hitFlash: 0,
    cooldowns: {},
  };
}

export function resolveBossPhase(hp: number, maxHp: number, config: BossConfig): BossPhaseConfig {
  const pct = maxHp > 0 ? hp / maxHp : 0;
  let active = config.phases[0];
  for (const p of config.phases) {
    if (pct <= p.hpThresholdPct) {
      active = p;
    }
  }
  return active;
}

export function applyBossDamage(
  boss: BossEncounterState,
  config: BossConfig,
  rawDamage: number,
  isWeakPointHit = false
): { appliedDamage: number; brokeShield: boolean; defeated: boolean } {
  if (boss.aiState === 'Defeated' || boss.hp <= 0 || rawDamage <= 0) {
    return { appliedDamage: 0, brokeShield: false, defeated: false };
  }

  let mult = 1.0;
  if (boss.weakPointExposed || boss.aiState === 'Vulnerable') {
    mult *= isWeakPointHit ? config.weakPoints[0]?.damageMultiplier ?? 1.6 : 1.35;
  }
  const totalDamage = Math.max(1, Math.round(rawDamage * mult));
  boss.hitFlash = 0.18;

  let remaining = totalDamage;
  let brokeShield = false;
  if (boss.shieldHp > 0) {
    const absorbed = Math.min(boss.shieldHp, remaining);
    boss.shieldHp -= absorbed;
    remaining -= absorbed;
    if (boss.shieldHp <= 0) {
      brokeShield = true;
      boss.vulnerableTimer = Math.max(boss.vulnerableTimer, 3.0);
      boss.weakPointExposed = true;
      boss.aiState = 'Vulnerable';
    }
  }

  if (remaining > 0) {
    boss.hp = Math.max(0, boss.hp - remaining);
  }

  const nextPhase = resolveBossPhase(boss.hp, boss.maxHp, config);
  boss.phase = nextPhase.phase;

  if (boss.hp <= 0) {
    boss.aiState = 'Defeated';
    boss.activeAbilityId = null;
    boss.weakPointExposed = false;
    return { appliedDamage: totalDamage, brokeShield, defeated: true };
  }

  return { appliedDamage: totalDamage, brokeShield, defeated: false };
}

function pickNearestBossTarget(
  boss: BossEncounterState,
  targets: BossTarget[]
): { target: BossTarget; dist: number } | null {
  let best: BossTarget | null = null;
  let bestDist = Infinity;
  for (const t of targets) {
    if (t.isDead || t.isInvisible) continue;
    const dist = Math.hypot(t.position.x - boss.position.x, t.position.z - boss.position.z);
    if (dist < 32 && dist < bestDist) {
      best = t;
      bestDist = dist;
    }
  }
  return best ? { target: best, dist: bestDist } : null;
}

function chooseReadyAbility(
  boss: BossEncounterState,
  phaseCfg: BossPhaseConfig,
  config: BossConfig,
  distToTarget: number
): BossAbilityConfig | null {
  const candidates = phaseCfg.unlockedAbilities
    .map((id) => config.abilities.find((a) => a.id === id))
    .filter((a): a is BossAbilityConfig => Boolean(a))
    .filter((a) => (boss.cooldowns[a.id] ?? 0) <= 0 && distToTarget <= a.range + 1.5);

  if (candidates.length === 0) return null;
  // Prefer higher-impact special abilities when ready
  return candidates[candidates.length - 1];
}

export function stepBossEncounter(
  boss: BossEncounterState,
  config: BossConfig,
  targets: BossTarget[],
  dt: number,
  getGroundHeight: BossGroundFn
): BossAttackEvent | null {
  if (boss.aiState === 'Defeated' || boss.hp <= 0) {
    boss.aiState = 'Defeated';
    return null;
  }

  if (boss.hitFlash > 0) {
    boss.hitFlash = Math.max(0, boss.hitFlash - dt);
  }
  for (const key of Object.keys(boss.cooldowns)) {
    if (boss.cooldowns[key] > 0) {
      boss.cooldowns[key] = Math.max(0, boss.cooldowns[key] - dt);
    }
  }

  const phaseCfg = resolveBossPhase(boss.hp, boss.maxHp, config);
  boss.phase = phaseCfg.phase;

  // Vulnerability window
  if (boss.vulnerableTimer > 0) {
    boss.vulnerableTimer = Math.max(0, boss.vulnerableTimer - dt);
    boss.weakPointExposed = boss.vulnerableTimer > 0;
    if (boss.vulnerableTimer > 0) {
      boss.aiState = 'Vulnerable';
      return null;
    }
    boss.aiState = 'Idle';
  }

  // Recovery window after major attacks
  if (boss.recoverTimer > 0) {
    boss.recoverTimer = Math.max(0, boss.recoverTimer - dt);
    if (boss.recoverTimer > 0) {
      boss.aiState = 'Recover';
      return null;
    }
    boss.aiState = 'Idle';
  }

  // Telegraphing an ability
  if (boss.aiState === 'Telegraph' && boss.activeAbilityId) {
    boss.telegraphTimer -= dt;
    if (boss.telegraphTimer <= 0) {
      const ability = config.abilities.find((a) => a.id === boss.activeAbilityId);
      boss.activeAbilityId = null;
      if (!ability) {
        boss.aiState = 'Idle';
        return null;
      }

      boss.cooldowns[ability.id] = ability.cooldown * phaseCfg.cooldownMultiplier;
      if (ability.grantsShield) {
        boss.shieldHp = ability.grantsShield;
      }

      const hitPlayerIds: string[] = [];
      const bossFwdX = Math.sin(boss.yaw);
      const bossFwdZ = Math.cos(boss.yaw);

      for (const t of targets) {
        if (t.isDead) continue;
        const dx = t.position.x - boss.telegraphCenter.x;
        const dz = t.position.z - boss.telegraphCenter.z;
        const dist = Math.hypot(dx, dz);
        if (dist > boss.telegraphRadius) continue;

        if (ability.telegraphShape === 'cone' && ability.coneCosine !== undefined) {
          const inv = 1 / (dist || 1);
          const dot = dx * inv * bossFwdX + dz * inv * bossFwdZ;
          if (dist > 1.5 && dot < ability.coneCosine) continue;
        }
        hitPlayerIds.push(t.id);
      }

      if (ability.vulnerabilityAfterSec && !ability.grantsShield) {
        boss.vulnerableTimer = ability.vulnerabilityAfterSec;
        boss.weakPointExposed = true;
        boss.aiState = 'Vulnerable';
      } else {
        boss.recoverTimer = ability.recoverDuration;
        boss.aiState = 'Recover';
      }

      return {
        abilityId: ability.id,
        abilityName: ability.name,
        damage: Math.round(ability.damage * phaseCfg.damageMultiplier),
        hitPlayerIds,
        center: cloneVec3(boss.telegraphCenter),
        radius: boss.telegraphRadius,
      };
    }
    return null;
  }

  // Select target and chase / initiate telegraph
  const detected = pickNearestBossTarget(boss, targets);
  if (!detected) {
    boss.aiState = 'Idle';
    return null;
  }

  const dir = normalizeXZ(
    detected.target.position.x - boss.position.x,
    detected.target.position.z - boss.position.z
  );
  if (dir.length > 0.05) {
    boss.yaw = Math.atan2(dir.x, dir.z);
  }

  const readyAbility = chooseReadyAbility(boss, phaseCfg, config, detected.dist);
  if (readyAbility) {
    boss.aiState = 'Telegraph';
    boss.activeAbilityId = readyAbility.id;
    boss.telegraphShape = readyAbility.telegraphShape;
    boss.telegraphRadius = readyAbility.radius;
    boss.telegraphDuration = readyAbility.telegraphDuration;
    boss.telegraphTimer = readyAbility.telegraphDuration;
    if (readyAbility.kind === 'ranged') {
      boss.telegraphCenter = cloneVec3(detected.target.position);
    } else {
      boss.telegraphCenter = vec3(boss.position.x, boss.position.y, boss.position.z);
    }
    return null;
  }

  // Move toward target if outside attack range
  if (dir.length > config.attackRange * 0.85) {
    const speed = config.moveSpeed * phaseCfg.speedMultiplier;
    boss.position.x += dir.x * speed * dt;
    boss.position.z += dir.z * speed * dt;
    boss.position.y = getGroundHeight(boss.position.x, boss.position.z);
    boss.aiState = 'Chase';
  } else {
    boss.aiState = 'Idle';
  }

  return null;
}
