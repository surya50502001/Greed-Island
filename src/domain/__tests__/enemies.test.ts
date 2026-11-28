import { describe, expect, it } from 'vitest';
import {
  applyEnemyDamage,
  createInitialEnemyStates,
  stepEnemyAI,
} from '../enemies/ai';
import { EnemyTarget } from '../enemies/types';

const flatGround = () => 2;

describe('enemy AI state machine', () => {
  it('spawns all 8 enemies with 60 HP and wolf/spider species', () => {
    const enemies = createInitialEnemyStates(flatGround);
    expect(enemies).toHaveLength(8);
    expect(enemies.every((e) => e.hp === 60 && e.maxHp === 60)).toBe(true);
    expect(enemies.some((e) => e.species === 'wolf')).toBe(true);
    expect(enemies.some((e) => e.species === 'spider')).toBe(true);
  });

  it('transitions Patrol -> Detection -> Chase -> Attack with 1.4s cooldown', () => {
    const [wolf] = createInitialEnemyStates(flatGround);
    const farTarget: EnemyTarget[] = [
      { id: 'p1', position: { x: wolf.position.x + 30, y: 2, z: wolf.position.z }, isDead: false, isInvisible: false },
    ];
    stepEnemyAI(wolf, farTarget, 0.05, flatGround, () => 0.5);
    expect(wolf.aiState).toBe('Patrol');

    // Enter 17m aggro range
    const nearTarget: EnemyTarget[] = [
      { id: 'p1', position: { x: wolf.position.x + 10, y: 2, z: wolf.position.z }, isDead: false, isInvisible: false },
    ];
    stepEnemyAI(wolf, nearTarget, 0.05, flatGround);
    expect(wolf.aiState).toBe('Detection');
    expect(wolf.chasing).toBe(true);

    stepEnemyAI(wolf, nearTarget, 0.05, flatGround);
    expect(wolf.aiState).toBe('Chase');

    // Move into 1.85m attack range
    const meleeTarget: EnemyTarget[] = [
      { id: 'p1', position: { x: wolf.position.x + 1.0, y: 2, z: wolf.position.z }, isDead: false, isInvisible: false },
    ];
    const hit1 = stepEnemyAI(wolf, meleeTarget, 0.05, flatGround);
    expect(wolf.aiState).toBe('Attack');
    expect(hit1).toEqual({ enemyId: wolf.id, targetId: 'p1', damage: 15 });
    expect(wolf.attackCooldown).toBeCloseTo(1.4);

    // Cooldown prevents immediate repeat hit
    const hit2 = stepEnemyAI(wolf, meleeTarget, 0.5, flatGround);
    expect(hit2).toBeNull();
  });

  it('ignores invisible targets and handles Stagger -> Death -> 14s Respawn', () => {
    const [spider] = createInitialEnemyStates(flatGround);
    const invisTarget: EnemyTarget[] = [
      { id: 'p1', position: { x: spider.position.x + 5, y: 2, z: spider.position.z }, isDead: false, isInvisible: true },
    ];
    stepEnemyAI(spider, invisTarget, 0.05, flatGround);
    expect(spider.chasing).toBe(false);

    const dmg1 = applyEnemyDamage(spider, 25, 1, 0, 12);
    expect(dmg1).toEqual({ damaged: true, killed: false });
    expect(spider.aiState).toBe('Stagger');
    expect(spider.hp).toBe(35);

    const dmg2 = applyEnemyDamage(spider, 50, 1, 0, 20);
    expect(dmg2).toEqual({ damaged: true, killed: true });
    expect(spider.alive).toBe(false);
    expect(spider.aiState).toBe('Death');
    expect(spider.respawnTimer).toBe(14);

    stepEnemyAI(spider, [], 13.5, flatGround);
    expect(spider.alive).toBe(false);

    stepEnemyAI(spider, [], 0.6, flatGround);
    expect(spider.alive).toBe(true);
    expect(spider.hp).toBe(60);
    expect(spider.aiState).toBe('Respawn');
  });
});
