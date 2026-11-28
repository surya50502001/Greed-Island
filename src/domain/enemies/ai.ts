import { cloneVec3, normalizeXZ, vec3 } from '../math/vec3';
import { ISLAND_RADIUS } from '../world/island';
import {
  ENEMY_SPECIES_CONFIG,
  EnemyAttackHitEvent,
  EnemyDomainState,
  EnemyTarget,
  INITIAL_ENEMY_SPAWNS,
} from './types';

export type GroundHeightFn = (x: number, z: number) => number;

export function createInitialEnemyStates(getGroundHeight: GroundHeightFn): EnemyDomainState[] {
  return INITIAL_ENEMY_SPAWNS.map((spawn, idx) => {
    const cfg = ENEMY_SPECIES_CONFIG[spawn.species];
    const y = getGroundHeight(spawn.x, spawn.z);
    const home = vec3(spawn.x, y, spawn.z);
    return {
      id: `enemy-${idx}`,
      species: spawn.species,
      aiState: 'Patrol',
      home: cloneVec3(home),
      position: cloneVec3(home),
      patrolTarget: vec3(
        spawn.x + spawn.patrolRadius * 0.6,
        y,
        spawn.z + spawn.patrolRadius * 0.4
      ),
      patrolRadius: spawn.patrolRadius,
      hp: cfg.maxHp,
      maxHp: cfg.maxHp,
      alive: true,
      respawnTimer: 0,
      chasing: false,
      targetPlayerId: null,
      hitFlash: 0,
      staggerTimer: 0,
      idleTimer: 0,
      yaw: 0,
      attackCooldown: 0,
      knockbackX: 0,
      knockbackZ: 0,
    };
  });
}

export function applyEnemyDamage(
  enemy: EnemyDomainState,
  damage: number,
  knockbackDirX: number,
  knockbackDirZ: number,
  knockbackForce: number,
  hitFlashDuration = 0.22
): { damaged: boolean; killed: boolean } {
  if (!enemy.alive || damage <= 0) {
    return { damaged: false, killed: false };
  }

  const cfg = ENEMY_SPECIES_CONFIG[enemy.species];
  enemy.hitFlash = hitFlashDuration;
  enemy.hp = Math.max(0, enemy.hp - damage);
  enemy.knockbackX = knockbackDirX * knockbackForce;
  enemy.knockbackZ = knockbackDirZ * knockbackForce;

  if (enemy.hp <= 0) {
    enemy.alive = false;
    enemy.chasing = false;
    enemy.targetPlayerId = null;
    enemy.aiState = 'Death';
    enemy.respawnTimer = cfg.respawnTime;
    return { damaged: true, killed: true };
  }

  enemy.staggerTimer = cfg.staggerDuration;
  enemy.aiState = 'Stagger';
  return { damaged: true, killed: false };
}

function selectNearestTarget(
  enemy: EnemyDomainState,
  targets: EnemyTarget[],
  aggroRange: number,
  verticalAggroRange: number
): { target: EnemyTarget; dist: number } | null {
  let best: EnemyTarget | null = null;
  let bestDist = Infinity;

  for (const t of targets) {
    if (t.isDead || t.isInvisible) continue;
    const dist = Math.hypot(t.position.x - enemy.position.x, t.position.z - enemy.position.z);
    const vDiff = Math.abs(t.position.y - enemy.position.y);
    const maxV = t.isFlying ? 2.4 : verticalAggroRange;
    if (dist < aggroRange && vDiff < maxV && dist < bestDist) {
      best = t;
      bestDist = dist;
    }
  }

  return best ? { target: best, dist: bestDist } : null;
}

export function stepEnemyAI(
  enemy: EnemyDomainState,
  targets: EnemyTarget[],
  dt: number,
  getGroundHeight: GroundHeightFn,
  rng: () => number = Math.random
): EnemyAttackHitEvent | null {
  const cfg = ENEMY_SPECIES_CONFIG[enemy.species];

  // Death & Respawn lifecycle
  if (!enemy.alive) {
    enemy.respawnTimer -= dt;
    if (enemy.respawnTimer <= 0) {
      enemy.alive = true;
      enemy.hp = enemy.maxHp;
      enemy.chasing = false;
      enemy.targetPlayerId = null;
      enemy.hitFlash = 0;
      enemy.staggerTimer = 0;
      enemy.knockbackX = 0;
      enemy.knockbackZ = 0;
      enemy.position.x = enemy.home.x;
      enemy.position.y = enemy.home.y;
      enemy.position.z = enemy.home.z;
      enemy.aiState = 'Respawn';
    } else {
      enemy.aiState = 'Death';
    }
    return null;
  }

  if (enemy.hitFlash > 0) {
    enemy.hitFlash = Math.max(0, enemy.hitFlash - dt);
  }
  if (enemy.staggerTimer > 0) {
    enemy.staggerTimer = Math.max(0, enemy.staggerTimer - dt);
  }
  if (enemy.attackCooldown > 0) {
    enemy.attackCooldown = Math.max(0, enemy.attackCooldown - dt);
  }

  // Apply & decay knockback impulse, clamped within island bounds
  if (Math.abs(enemy.knockbackX) > 0.05 || Math.abs(enemy.knockbackZ) > 0.05) {
    enemy.position.x += enemy.knockbackX * dt;
    enemy.position.z += enemy.knockbackZ * dt;
    const distFromCenter = Math.hypot(enemy.position.x, enemy.position.z);
    const maxR = ISLAND_RADIUS - 8;
    if (distFromCenter > maxR) {
      const r = maxR / distFromCenter;
      enemy.position.x *= r;
      enemy.position.z *= r;
    }
    const decay = Math.exp(-10 * dt);
    enemy.knockbackX *= decay;
    enemy.knockbackZ *= decay;
  }

  // Target detection
  const detected = selectNearestTarget(
    enemy,
    targets,
    cfg.aggroRange,
    cfg.verticalAggroRange
  );
  const wasChasing = enemy.chasing;
  enemy.chasing = Boolean(detected);
  enemy.targetPlayerId = detected ? detected.target.id : null;

  let attackEvent: EnemyAttackHitEvent | null = null;

  if (detected) {
    const dir = normalizeXZ(
      detected.target.position.x - enemy.position.x,
      detected.target.position.z - enemy.position.z
    );

    const vDiff = Math.abs(detected.target.position.y - enemy.position.y);
    if (dir.length > cfg.attackRange) {
      enemy.position.x += dir.x * cfg.chaseSpeed * dt;
      enemy.position.z += dir.z * cfg.chaseSpeed * dt;
      enemy.yaw = Math.atan2(dir.x, dir.z);
      enemy.aiState = enemy.staggerTimer > 0 ? 'Stagger' : !wasChasing ? 'Detection' : 'Chase';
    } else if (enemy.attackCooldown <= 0 && vDiff <= 1.65) {
      enemy.attackCooldown = cfg.attackCooldown;
      enemy.aiState = 'Attack';
      attackEvent = {
        enemyId: enemy.id,
        targetId: detected.target.id,
        damage: cfg.attackDamage,
      };
    } else {
      enemy.aiState = enemy.staggerTimer > 0 ? 'Stagger' : 'Chase';
    }
  } else {
    const dir = normalizeXZ(
      enemy.patrolTarget.x - enemy.position.x,
      enemy.patrolTarget.z - enemy.position.z
    );
    if (dir.length < 1.2) {
      const angle = rng() * Math.PI * 2;
      const r = 4 + rng() * enemy.patrolRadius;
      const nx = enemy.home.x + Math.cos(angle) * r;
      const nz = enemy.home.z + Math.sin(angle) * r;
      enemy.patrolTarget.x = nx;
      enemy.patrolTarget.y = getGroundHeight(nx, nz);
      enemy.patrolTarget.z = nz;
      enemy.aiState = enemy.staggerTimer > 0 ? 'Stagger' : 'Idle';
    } else {
      enemy.position.x += dir.x * cfg.patrolSpeed * dt;
      enemy.position.z += dir.z * cfg.patrolSpeed * dt;
      enemy.yaw = Math.atan2(dir.x, dir.z);
      enemy.aiState = enemy.staggerTimer > 0 ? 'Stagger' : 'Patrol';
    }
  }

  enemy.position.y = getGroundHeight(enemy.position.x, enemy.position.z);
  return attackEvent;
}
