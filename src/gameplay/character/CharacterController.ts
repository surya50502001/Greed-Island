import * as THREE from 'three';
import { ISLAND_RADIUS } from '../../types/game';
import { getTerrainHeight } from '../../world/terrain';
import { CharacterLocomotionState } from './CharacterStates';

export interface CharacterInputState {
  forward: boolean;
  backward: boolean;
  left: boolean;
  right: boolean;
  sprint: boolean;
  jump: boolean;
  descend: boolean;
}

export interface CharacterStepResult {
  state: CharacterLocomotionState;
  horizSpeed: number;
  verticalVelocity: number;
  grounded: boolean;
  attackProgress: number; // 0 when not attacking, 0..1 during attack
  isAttackActiveHitWindow: boolean;
  hitReactionProgress: number;
  flightTiltX: number;
  flightRollZ: number;
}

export class CharacterController {
  public readonly position: THREE.Vector3;
  public readonly velocity = new THREE.Vector3();
  public yaw = 0;
  public grounded = true;

  private keys: Record<string, boolean> = {};
  private prevIsFlying = false;

  // Jump / Land timers
  private jumpAnticipationTimer = 0;
  private pendingJump = false;
  private landRecoveryTimer = 0;

  // Flight transition timers
  private flightTakeoffTimer = 0;
  private flightLandTimer = 0;

  // Combat & hit reaction timers
  private attackTimer = 0;
  private attackCooldown = 0;
  private hitReactionTimer = 0;
  private readonly attackDuration = 0.42;

  // Reusable math vectors
  private readonly forwardVec = new THREE.Vector3();
  private readonly rightVec = new THREE.Vector3();
  private readonly moveDir = new THREE.Vector3();

  constructor(initialX = 0, initialZ = 0) {
    this.position = new THREE.Vector3(initialX, getTerrainHeight(initialX, initialZ), initialZ);
  }

  public setKey(code: string, pressed: boolean): void {
    this.keys[code] = pressed;
  }

  public clearInputs(): void {
    this.keys = {};
  }

  public triggerAttack(hasWeapon: boolean, isGrimoireOpen: boolean): boolean {
    if (!hasWeapon || isGrimoireOpen) return false;
    if (this.attackCooldown > 0 || this.hitReactionTimer > 0) return false;
    this.attackTimer = this.attackDuration;
    this.attackCooldown = 0.48;
    return true;
  }

  public triggerHitReaction(): void {
    if (this.hitReactionTimer > 0) return;
    this.hitReactionTimer = 0.35;
    this.attackTimer = 0;
  }

  private readInputs(isGrimoireOpen: boolean): CharacterInputState {
    if (isGrimoireOpen) {
      return {
        forward: false,
        backward: false,
        left: false,
        right: false,
        sprint: false,
        jump: false,
        descend: false,
      };
    }
    return {
      forward: Boolean(this.keys['KeyW'] || this.keys['ArrowUp']),
      backward: Boolean(this.keys['KeyS'] || this.keys['ArrowDown']),
      left: Boolean(this.keys['KeyA'] || this.keys['ArrowLeft']),
      right: Boolean(this.keys['KeyD'] || this.keys['ArrowRight']),
      sprint: Boolean(this.keys['ShiftLeft'] || this.keys['ShiftRight']),
      jump: Boolean(this.keys['Space']),
      descend: Boolean(this.keys['KeyC']),
    };
  }

  public update(
    dt: number,
    camYaw: number,
    camPitch: number,
    isFlying: boolean,
    hasWeapon: boolean,
    isGrimoireOpen: boolean
  ): CharacterStepResult {
    const safeDt = Math.min(dt, 0.05);
    const input = this.readInputs(isGrimoireOpen);

    // Update timers
    if (this.attackCooldown > 0) this.attackCooldown = Math.max(0, this.attackCooldown - safeDt);
    if (this.attackTimer > 0) this.attackTimer = Math.max(0, this.attackTimer - safeDt);
    if (this.hitReactionTimer > 0) this.hitReactionTimer = Math.max(0, this.hitReactionTimer - safeDt);
    if (this.landRecoveryTimer > 0) this.landRecoveryTimer = Math.max(0, this.landRecoveryTimer - safeDt);
    if (this.flightTakeoffTimer > 0) this.flightTakeoffTimer = Math.max(0, this.flightTakeoffTimer - safeDt);
    if (this.flightLandTimer > 0) this.flightLandTimer = Math.max(0, this.flightLandTimer - safeDt);

    // Detect flight toggle transitions
    if (isFlying && !this.prevIsFlying) {
      this.flightTakeoffTimer = 0.28;
      this.velocity.y = Math.max(this.velocity.y, 4.5);
      this.grounded = false;
    } else if (!isFlying && this.prevIsFlying) {
      this.flightTakeoffTimer = 0;
    }
    this.prevIsFlying = isFlying;

    const forwardInput = (input.forward ? 1 : 0) - (input.backward ? 1 : 0);
    const strafeInput = (input.right ? 1 : 0) - (input.left ? 1 : 0);

    let flightTiltX = 0;
    let flightRollZ = 0;

    if (isFlying) {
      // 3D camera-directed flight
      const cosPitch = Math.cos(camPitch);
      this.forwardVec
        .set(-Math.sin(camYaw) * cosPitch, -Math.sin(camPitch), -Math.cos(camYaw) * cosPitch)
        .normalize();
      this.rightVec.set(Math.cos(camYaw), 0, -Math.sin(camYaw)).normalize();

      this.moveDir.set(0, 0, 0);
      this.moveDir.addScaledVector(this.forwardVec, forwardInput);
      this.moveDir.addScaledVector(this.rightVec, strafeInput);
      if (input.jump) this.moveDir.y += 1;
      if (input.descend) this.moveDir.y -= 1;

      if (this.moveDir.lengthSq() > 1) {
        this.moveDir.normalize();
      }

      const flySpeed = input.sprint ? 26 : 13.5;
      const targetVel = this.moveDir.multiplyScalar(flySpeed);
      const accel = this.moveDir.lengthSq() > 0.01 ? 6.5 : 4.5;
      this.velocity.lerp(targetVel, 1 - Math.exp(-accel * safeDt));
      this.position.addScaledVector(this.velocity, safeDt);

      const floorY = getTerrainHeight(this.position.x, this.position.z) + 0.4;
      if (this.position.y < floorY) {
        this.position.y = floorY;
        if (this.velocity.y < 0) this.velocity.y = 0;
      }
      if (this.position.y > 95) this.position.y = 95;
      this.grounded = false;

      // Smoothly face flight direction
      const horizSpeed = Math.hypot(this.velocity.x, this.velocity.z);
      if (horizSpeed > 0.5) {
        this.rotateTowards(Math.atan2(this.velocity.x, this.velocity.z), 7.5, safeDt);
      }

      const pitchFactor = THREE.MathUtils.clamp(this.velocity.y / 14, -0.35, 0.35);
      flightTiltX = (horizSpeed > 1.5 ? 0.68 : 0.25) - pitchFactor * 0.5;
      flightRollZ = -strafeInput * 0.22;
    } else {
      // Grounded & airborne locomotion
      this.forwardVec.set(-Math.sin(camYaw), 0, -Math.cos(camYaw)).normalize();
      this.rightVec.set(Math.cos(camYaw), 0, -Math.sin(camYaw)).normalize();

      this.moveDir.set(0, 0, 0);
      this.moveDir.addScaledVector(this.forwardVec, forwardInput);
      this.moveDir.addScaledVector(this.rightVec, strafeInput);

      // Normalize diagonal input so diagonal speed never exceeds cardinal speed
      if (this.moveDir.lengthSq() > 1) {
        this.moveDir.normalize();
      }

      const isPureBackward = forwardInput < 0 && strafeInput === 0;
      const isPureStrafe = forwardInput === 0 && strafeInput !== 0;

      let targetSpeed = 0;
      if (this.moveDir.lengthSq() > 0.01) {
        if (isPureBackward) {
          targetSpeed = 3.8;
        } else if (isPureStrafe) {
          targetSpeed = input.sprint ? 6.8 : 4.6;
        } else if (input.sprint) {
          targetSpeed = 11.8;
        } else if (hasWeapon) {
          targetSpeed = 6.2;
        } else {
          targetSpeed = 4.8;
        }
      }

      const targetVx = this.moveDir.x * targetSpeed;
      const targetVz = this.moveDir.z * targetSpeed;
      const hasMoveInput = this.moveDir.lengthSq() > 0.01;
      const accelRate = this.grounded ? (hasMoveInput ? 10.5 : 8.5) : 3.5;

      this.velocity.x = THREE.MathUtils.lerp(
        this.velocity.x,
        targetVx,
        1 - Math.exp(-accelRate * safeDt)
      );
      this.velocity.z = THREE.MathUtils.lerp(
        this.velocity.z,
        targetVz,
        1 - Math.exp(-accelRate * safeDt)
      );

      // Snap tiny residual velocity to 0 for clean Idle transition
      if (!hasMoveInput && Math.hypot(this.velocity.x, this.velocity.z) < 0.08) {
        this.velocity.x = 0;
        this.velocity.z = 0;
      }

      // Jump anticipation + takeoff (only when grounded and not recovering)
      if (input.jump && this.grounded && !this.pendingJump && this.landRecoveryTimer <= 0) {
        this.pendingJump = true;
        this.jumpAnticipationTimer = 0.08;
      }
      if (this.pendingJump) {
        this.jumpAnticipationTimer -= safeDt;
        if (this.jumpAnticipationTimer <= 0) {
          this.pendingJump = false;
          this.velocity.y = 11.0;
          this.grounded = false;
        }
      }

      // Gravity & vertical integration
      this.velocity.y -= 28 * safeDt;
      this.position.x += this.velocity.x * safeDt;
      this.position.z += this.velocity.z * safeDt;
      this.position.y += this.velocity.y * safeDt;

      const groundY = getTerrainHeight(this.position.x, this.position.z);
      if (this.position.y <= groundY) {
        if (!this.grounded && this.velocity.y < -4.5) {
          this.landRecoveryTimer = 0.16;
          if (this.prevIsFlying) {
            this.flightLandTimer = 0.22;
          }
        }
        this.position.y = groundY;
        this.velocity.y = 0;
        this.grounded = true;
      } else if (this.position.y - groundY > 0.22) {
        this.grounded = false;
      }

      // Natural turning: keep facing camera-forward when backing up or strafing
      if (hasMoveInput) {
        const camForwardYaw = Math.atan2(this.forwardVec.x, this.forwardVec.z);
        if (isPureBackward || isPureStrafe) {
          this.rotateTowards(camForwardYaw, 8.5, safeDt);
        } else {
          const moveYaw = Math.atan2(this.moveDir.x, this.moveDir.z);
          this.rotateTowards(moveYaw, 9.0, safeDt);
        }
      }
    }

    // Clamp to island boundary
    const distFromCenter = Math.hypot(this.position.x, this.position.z);
    const maxR = ISLAND_RADIUS - 5;
    if (distFromCenter > maxR) {
      const ratio = maxR / distFromCenter;
      this.position.x *= ratio;
      this.position.z *= ratio;
    }

    const horizSpeed = Math.hypot(this.velocity.x, this.velocity.z);
    const state = this.resolveState(
      isFlying,
      hasWeapon,
      horizSpeed,
      forwardInput,
      strafeInput,
      input.sprint
    );

    const attackProgress =
      this.attackTimer > 0 ? 1 - this.attackTimer / this.attackDuration : 0;
    const isAttackActiveHitWindow =
      this.attackTimer > 0 && attackProgress >= 0.24 && attackProgress <= 0.68;

    return {
      state,
      horizSpeed,
      verticalVelocity: this.velocity.y,
      grounded: this.grounded,
      attackProgress,
      isAttackActiveHitWindow,
      hitReactionProgress: this.hitReactionTimer > 0 ? 1 - this.hitReactionTimer / 0.35 : 0,
      flightTiltX,
      flightRollZ,
    };
  }

  private rotateTowards(targetYaw: number, turnRate: number, dt: number): void {
    let diff = targetYaw - this.yaw;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    this.yaw += diff * Math.min(1, turnRate * dt);
  }

  private resolveState(
    isFlying: boolean,
    hasWeapon: boolean,
    horizSpeed: number,
    forwardInput: number,
    strafeInput: number,
    sprint: boolean
  ): CharacterLocomotionState {
    if (this.hitReactionTimer > 0) return 'HitReaction';
    if (this.attackTimer > 0) return 'Attack';

    if (isFlying) {
      if (this.flightTakeoffTimer > 0) return 'FlightTakeoff';
      return horizSpeed > 1.8 ? 'FlightForward' : 'FlightHover';
    }
    if (this.flightLandTimer > 0) return 'FlightLand';

    if (this.pendingJump) return 'JumpStart';
    if (!this.grounded) {
      return this.velocity.y > 0.5 ? 'JumpLoop' : 'Fall';
    }
    if (this.landRecoveryTimer > 0) return 'Land';

    if (horizSpeed > 0.35) {
      if (forwardInput < 0 && strafeInput === 0) return 'WalkBackward';
      if (forwardInput === 0 && strafeInput < 0) return 'StrafeLeft';
      if (forwardInput === 0 && strafeInput > 0) return 'StrafeRight';
      if (sprint && horizSpeed > 8.2) return 'Sprint';
      if (horizSpeed > 6.2) return 'Jog';
      return 'Walk';
    }

    return hasWeapon ? 'CombatIdle' : 'Idle';
  }
}
