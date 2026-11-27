import * as THREE from 'three';
import { ISLAND_RADIUS } from '../../types/game';
import { getGroundHeight } from '../../world/terrain';
import { CharacterLocomotionState } from './CharacterStates';

export interface CharacterInputState {
  forward: boolean;
  backward: boolean;
  left: boolean;
  right: boolean;
  sprint: boolean;
  jump: boolean;
  descend: boolean;
  block: boolean;
}

export interface CharacterStepResult {
  state: CharacterLocomotionState;
  horizSpeed: number;
  verticalVelocity: number;
  grounded: boolean;
  attackProgress: number;
  isAttackActiveHitWindow: boolean;
  hitReactionProgress: number;
  isBlocking: boolean;
  flightTiltX: number;
  flightRollZ: number;
}

export class CharacterController {
  public readonly position: THREE.Vector3;
  public readonly velocity = new THREE.Vector3();
  public yaw = 0;
  public grounded = true;

  private keys: Record<string, boolean> = {};
  private touchMoveX = 0;
  private touchMoveY = 0;
  private touchSprint = false;
  private touchJump = false;
  private touchDescend = false;
  private touchBlock = false;
  private prevIsFlying = false;
  private pendingFlightLand = false;
  private wasMoving = false;

  // Transition timers
  private startMovingTimer = 0;
  private stopMovingTimer = 0;
  private jumpAnticipationTimer = 0;
  private jumpStartHoldTimer = 0;
  private pendingJump = false;
  private landRecoveryTimer = 0;
  private flightTakeoffTimer = 0;
  private flightLandTimer = 0;

  // Combat, death & reaction timers
  private isDead = false;
  private attackTimer = 0;
  private attackCooldown = 0;
  private dodgeTimer = 0;
  private dodgeCooldown = 0;
  private hitReactionTimer = 0;
  private readonly attackDuration = 0.42;
  private readonly dodgeDuration = 0.36;

  // Reusable math vectors & step result (zero per-frame allocations)
  private readonly forwardVec = new THREE.Vector3();
  private readonly rightVec = new THREE.Vector3();
  private readonly moveDir = new THREE.Vector3();
  private readonly stepResult: CharacterStepResult = {
    state: 'Idle',
    horizSpeed: 0,
    verticalVelocity: 0,
    grounded: true,
    attackProgress: 0,
    isAttackActiveHitWindow: false,
    hitReactionProgress: 0,
    isBlocking: false,
    flightTiltX: 0,
    flightRollZ: 0,
  };

  constructor(initialX = 0, initialZ = 0) {
    this.position = new THREE.Vector3(initialX, getGroundHeight(initialX, initialZ), initialZ);
  }

  public setKey(code: string, pressed: boolean): void {
    this.keys[code] = pressed;
  }

  public setTouchMove(x: number, y: number): void {
    this.touchMoveX = THREE.MathUtils.clamp(x, -1, 1);
    this.touchMoveY = THREE.MathUtils.clamp(y, -1, 1);
  }

  public setTouchAction(
    action: 'sprint' | 'jump' | 'descend' | 'block',
    pressed: boolean
  ): void {
    if (action === 'sprint') this.touchSprint = pressed;
    else if (action === 'jump') this.touchJump = pressed;
    else if (action === 'descend') this.touchDescend = pressed;
    else if (action === 'block') this.touchBlock = pressed;
  }

  public clearInputs(): void {
    this.keys = {};
    this.touchMoveX = 0;
    this.touchMoveY = 0;
    this.touchSprint = false;
    this.touchJump = false;
    this.touchDescend = false;
    this.touchBlock = false;
  }

  public triggerAttack(hasWeapon: boolean, isGrimoireOpen: boolean): boolean {
    if (this.isDead || !hasWeapon || isGrimoireOpen) return false;
    const input = this.readInputs(isGrimoireOpen);
    if (
      this.attackCooldown > 0 ||
      this.hitReactionTimer > 0 ||
      this.dodgeTimer > 0 ||
      this.pendingJump ||
      input.block
    ) {
      return false;
    }
    this.attackTimer = this.attackDuration;
    this.attackCooldown = 0.48;
    return true;
  }

  public triggerDodge(isFlying: boolean, isGrimoireOpen: boolean): boolean {
    if (this.isDead || isFlying || isGrimoireOpen || !this.grounded) return false;
    if (this.dodgeCooldown > 0 || this.hitReactionTimer > 0) return false;
    this.dodgeTimer = this.dodgeDuration;
    this.dodgeCooldown = 0.7;
    this.attackTimer = 0;
    return true;
  }

  public triggerHitReaction(hasWeapon: boolean, isGrimoireOpen: boolean): void {
    if (this.isDead) return;
    const input = this.readInputs(isGrimoireOpen);
    if (hasWeapon && input.block) return; // Blocked!
    if (this.hitReactionTimer > 0 || this.dodgeTimer > 0) return;
    this.hitReactionTimer = 0.35;
    this.attackTimer = 0;
  }

  public triggerDeath(): void {
    if (this.isDead) return;
    this.isDead = true;
    this.attackTimer = 0;
    this.dodgeTimer = 0;
    this.hitReactionTimer = 0;
    this.pendingJump = false;
    this.jumpStartHoldTimer = 0;
    this.clearInputs();
  }

  public resetDeath(): void {
    this.isDead = false;
  }

  public reviveAt(x = 0, z = 0): void {
    this.isDead = false;
    this.position.set(x, getGroundHeight(x, z), z);
    this.velocity.set(0, 0, 0);
    this.yaw = 0;
    this.grounded = true;
    this.prevIsFlying = false;
    this.pendingFlightLand = false;
    this.pendingJump = false;
    this.jumpAnticipationTimer = 0;
    this.jumpStartHoldTimer = 0;
    this.landRecoveryTimer = 0;
    this.flightTakeoffTimer = 0;
    this.flightLandTimer = 0;
    this.attackTimer = 0;
    this.attackCooldown = 0;
    this.dodgeTimer = 0;
    this.dodgeCooldown = 0;
    this.hitReactionTimer = 0;
    this.clearInputs();
  }

  public getIsBlocking(): boolean {
    if (this.isDead) return false;
    return Boolean(this.readInputs(false).block && this.grounded && !this.prevIsFlying);
  }

  public completeOneShotState(state: CharacterLocomotionState): void {
    switch (state) {
      case 'JumpStart':
        this.jumpStartHoldTimer = 0;
        break;
      case 'Attack':
        this.attackTimer = 0;
        break;
      case 'Dodge':
        this.dodgeTimer = 0;
        break;
      case 'Land':
        this.landRecoveryTimer = 0;
        break;
      case 'FlightTakeoff':
        this.flightTakeoffTimer = 0;
        break;
      case 'FlightLand':
        this.flightLandTimer = 0;
        break;
      case 'HitReaction':
        this.hitReactionTimer = 0;
        break;
    }
  }

  private readInputs(isGrimoireOpen: boolean): CharacterInputState {
    if (isGrimoireOpen || this.isDead) {
      return {
        forward: false,
        backward: false,
        left: false,
        right: false,
        sprint: false,
        jump: false,
        descend: false,
        block: false,
      };
    }
    return {
      forward: Boolean(this.keys['KeyW'] || this.keys['ArrowUp']) || this.touchMoveY > 0.2,
      backward: Boolean(this.keys['KeyS'] || this.keys['ArrowDown']) || this.touchMoveY < -0.2,
      left: Boolean(this.keys['KeyA'] || this.keys['ArrowLeft']) || this.touchMoveX < -0.2,
      right: Boolean(this.keys['KeyD'] || this.keys['ArrowRight']) || this.touchMoveX > 0.2,
      sprint: Boolean(this.keys['ShiftLeft'] || this.keys['ShiftRight']) || this.touchSprint,
      jump: Boolean(this.keys['Space']) || this.touchJump,
      descend: Boolean(this.keys['KeyC']) || this.touchDescend,
      block: Boolean(this.keys['KeyF']) || this.touchBlock,
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
    if (this.dodgeCooldown > 0) this.dodgeCooldown = Math.max(0, this.dodgeCooldown - safeDt);
    if (this.dodgeTimer > 0) this.dodgeTimer = Math.max(0, this.dodgeTimer - safeDt);
    if (this.hitReactionTimer > 0) this.hitReactionTimer = Math.max(0, this.hitReactionTimer - safeDt);
    if (this.jumpStartHoldTimer > 0) {
      this.jumpStartHoldTimer = Math.max(0, this.jumpStartHoldTimer - safeDt);
    }
    if (this.landRecoveryTimer > 0) this.landRecoveryTimer = Math.max(0, this.landRecoveryTimer - safeDt);
    if (this.flightTakeoffTimer > 0) this.flightTakeoffTimer = Math.max(0, this.flightTakeoffTimer - safeDt);
    if (this.flightLandTimer > 0) this.flightLandTimer = Math.max(0, this.flightLandTimer - safeDt);
    if (this.startMovingTimer > 0) this.startMovingTimer = Math.max(0, this.startMovingTimer - safeDt);
    if (this.stopMovingTimer > 0) this.stopMovingTimer = Math.max(0, this.stopMovingTimer - safeDt);

    // Detect flight toggle transitions
    if (isFlying && !this.prevIsFlying) {
      this.flightTakeoffTimer = 0.28;
      this.pendingFlightLand = false;
      this.velocity.y = Math.max(this.velocity.y, 4.5);
      this.grounded = false;
    } else if (!isFlying && this.prevIsFlying) {
      this.flightTakeoffTimer = 0;
      if (!this.grounded) {
        this.pendingFlightLand = true;
      } else {
        this.flightLandTimer = 0.24;
      }
    }
    this.prevIsFlying = isFlying;

    const forwardInput = (input.forward ? 1 : 0) - (input.backward ? 1 : 0);
    const strafeInput = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    const isBlocking = Boolean(hasWeapon && input.block && !isFlying && this.grounded);

    let flightTiltX = 0;
    let flightRollZ = 0;

    if (isFlying) {
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

      const floorY = getGroundHeight(this.position.x, this.position.z) + 0.4;
      if (this.position.y < floorY) {
        this.position.y = floorY;
        if (this.velocity.y < 0) this.velocity.y = 0;
      }
      if (this.position.y > 95) this.position.y = 95;
      this.grounded = false;

      const horizSpeed = Math.hypot(this.velocity.x, this.velocity.z);
      if (horizSpeed > 0.5) {
        this.rotateTowards(Math.atan2(this.velocity.x, this.velocity.z), 7.5, safeDt);
      }

      const pitchFactor = THREE.MathUtils.clamp(this.velocity.y / 14, -0.35, 0.35);
      flightTiltX = (horizSpeed > 1.5 ? 0.68 : 0.25) - pitchFactor * 0.5;
      flightRollZ = -strafeInput * 0.22;
    } else {
      this.forwardVec.set(-Math.sin(camYaw), 0, -Math.cos(camYaw)).normalize();
      this.rightVec.set(Math.cos(camYaw), 0, -Math.sin(camYaw)).normalize();

      this.moveDir.set(0, 0, 0);
      this.moveDir.addScaledVector(this.forwardVec, forwardInput);
      this.moveDir.addScaledVector(this.rightVec, strafeInput);

      if (this.moveDir.lengthSq() > 1) {
        this.moveDir.normalize();
      }

      const hasMoveInput = this.moveDir.lengthSq() > 0.01;
      if (hasMoveInput && !this.wasMoving && this.grounded) {
        this.startMovingTimer = 0.14;
      } else if (!hasMoveInput && this.wasMoving && this.grounded) {
        this.stopMovingTimer = 0.16;
      }
      this.wasMoving = hasMoveInput;

      const isPureBackward = forwardInput < 0 && strafeInput === 0;
      const isPureStrafe = forwardInput === 0 && strafeInput !== 0;

      let targetSpeed = 0;
      if (this.dodgeTimer > 0) {
        targetSpeed = 12.5;
      } else if (isBlocking) {
        targetSpeed = hasMoveInput ? 2.2 : 0;
      } else if (hasMoveInput) {
        if (isPureBackward) {
          targetSpeed = 3.8;
        } else if (isPureStrafe) {
          targetSpeed = input.sprint ? 7.2 : 4.6;
        } else if (input.sprint) {
          targetSpeed = 12.5;
        } else if (hasWeapon) {
          targetSpeed = 5.5;
        } else {
          targetSpeed = 4.6;
        }
      }

      const dodgeDirX = this.dodgeTimer > 0 && !hasMoveInput ? Math.sin(this.yaw) : this.moveDir.x;
      const dodgeDirZ = this.dodgeTimer > 0 && !hasMoveInput ? Math.cos(this.yaw) : this.moveDir.z;

      const targetVx = dodgeDirX * targetSpeed;
      const targetVz = dodgeDirZ * targetSpeed;
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

      if (!hasMoveInput && this.dodgeTimer <= 0 && Math.hypot(this.velocity.x, this.velocity.z) < 0.08) {
        this.velocity.x = 0;
        this.velocity.z = 0;
      }

      // Jump anticipation + takeoff
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
          this.jumpStartHoldTimer = 0.18;
        }
      }

      this.velocity.y -= 28 * safeDt;
      this.position.x += this.velocity.x * safeDt;
      this.position.z += this.velocity.z * safeDt;
      this.position.y += this.velocity.y * safeDt;

      const groundY = getGroundHeight(this.position.x, this.position.z);
      if (this.position.y <= groundY) {
        this.jumpStartHoldTimer = 0;
        if (!this.grounded && (this.velocity.y < -4.5 || this.pendingFlightLand)) {
          this.landRecoveryTimer = 0.16;
          if (this.pendingFlightLand) {
            this.flightLandTimer = 0.26;
            this.pendingFlightLand = false;
          }
        } else {
          this.pendingFlightLand = false;
        }
        this.position.y = groundY;
        this.velocity.y = 0;
        this.grounded = true;
      } else if (this.position.y - groundY > 0.22) {
        this.grounded = false;
      }

      const camForwardYaw = Math.atan2(-Math.sin(camYaw), -Math.cos(camYaw));
      if (this.attackTimer > 0 || isBlocking) {
        this.rotateTowards(camForwardYaw, 14.0, safeDt);
      } else if (hasMoveInput) {
        if (isPureBackward || isPureStrafe) {
          this.rotateTowards(camForwardYaw, 8.5, safeDt);
        } else {
          const moveYaw = Math.atan2(this.moveDir.x, this.moveDir.z);
          this.rotateTowards(moveYaw, 9.0, safeDt);
        }
      }
    }

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
      isBlocking,
      horizSpeed,
      forwardInput,
      strafeInput,
      input.sprint
    );

    const attackProgress =
      this.attackTimer > 0 ? 1 - this.attackTimer / this.attackDuration : 0;
    const isAttackActiveHitWindow =
      this.attackTimer > 0 && attackProgress >= 0.24 && attackProgress <= 0.68;

    this.stepResult.state = state;
    this.stepResult.horizSpeed = horizSpeed;
    this.stepResult.verticalVelocity = this.velocity.y;
    this.stepResult.grounded = this.grounded;
    this.stepResult.attackProgress = attackProgress;
    this.stepResult.isAttackActiveHitWindow = isAttackActiveHitWindow;
    this.stepResult.hitReactionProgress =
      this.hitReactionTimer > 0 ? 1 - this.hitReactionTimer / 0.35 : 0;
    this.stepResult.isBlocking = isBlocking;
    this.stepResult.flightTiltX = flightTiltX;
    this.stepResult.flightRollZ = flightRollZ;

    return this.stepResult;
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
    isBlocking: boolean,
    horizSpeed: number,
    forwardInput: number,
    strafeInput: number,
    sprint: boolean
  ): CharacterLocomotionState {
    if (this.isDead) return 'Death';
    if (this.hitReactionTimer > 0) return 'HitReaction';
    if (this.dodgeTimer > 0) return 'Dodge';
    if (this.attackTimer > 0) return 'Attack';
    if (isBlocking) return 'Block';

    if (isFlying) {
      if (this.flightTakeoffTimer > 0) return 'FlightTakeoff';
      if (this.velocity.y > 2.2) return 'FlightAscend';
      if (this.velocity.y < -2.2) return 'FlightDescend';
      return horizSpeed > 1.8 ? 'FlightForward' : 'FlightHover';
    }
    if (this.flightLandTimer > 0) return 'FlightLand';

    if (this.pendingJump || (this.jumpStartHoldTimer > 0 && !this.grounded && this.velocity.y > 0.5)) {
      return 'JumpStart';
    }
    if (!this.grounded) {
      return this.velocity.y > 0.5 ? 'JumpLoop' : 'Fall';
    }
    if (this.landRecoveryTimer > 0) return 'Land';

    if (horizSpeed > 0.35) {
      if (forwardInput < 0 && strafeInput === 0) return 'WalkBackward';
      if (forwardInput === 0 && strafeInput < 0) return 'StrafeLeft';
      if (forwardInput === 0 && strafeInput > 0) return 'StrafeRight';
      if (sprint && horizSpeed > 2.0) return 'Sprint';
      if (this.startMovingTimer > 0 && horizSpeed < 3.0) return 'StartMoving';
      if (horizSpeed > 6.2) return 'Jog';
      return 'Walk';
    }

    if (this.stopMovingTimer > 0) return 'StopMoving';
    return hasWeapon ? 'CombatIdle' : 'Idle';
  }
}
