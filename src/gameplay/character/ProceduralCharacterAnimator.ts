import * as THREE from 'three';
import { CharacterLocomotionState } from './CharacterStates';
import { CharacterStepResult } from './CharacterController';

type BoneRole =
  | 'hips'
  | 'spine'
  | 'spine1'
  | 'spine2'
  | 'neck'
  | 'head'
  | 'leftShoulder'
  | 'leftArm'
  | 'leftForeArm'
  | 'leftHand'
  | 'rightShoulder'
  | 'rightArm'
  | 'rightForeArm'
  | 'rightHand'
  | 'leftUpLeg'
  | 'leftLeg'
  | 'leftFoot'
  | 'leftToe'
  | 'rightUpLeg'
  | 'rightLeg'
  | 'rightFoot'
  | 'rightToe';

interface BoneEntry {
  bone: THREE.Bone;
  bindLocalQuat: THREE.Quaternion;
  worldBindQuat: THREE.Quaternion;
  worldBindQuatInv: THREE.Quaternion;
  targetLocalQuat: THREE.Quaternion;
}

const ROLE_PATTERNS: Array<[BoneRole, RegExp]> = [
  ['hips', /Hips(_\d+)?$/i],
  ['spine', /Spine(_\d+)?$/i],
  ['spine1', /Spine1(_\d+)?$/i],
  ['spine2', /Spine2(_\d+)?$/i],
  ['neck', /Neck(_\d+)?$/i],
  ['head', /Head(_\d+)?$/i],
  ['leftShoulder', /LeftShoulder(_\d+)?$/i],
  ['leftArm', /LeftArm(_\d+)?$/i],
  ['leftForeArm', /LeftForeArm(_\d+)?$/i],
  ['leftHand', /LeftHand(_\d+)?$/i],
  ['rightShoulder', /RightShoulder(_\d+)?$/i],
  ['rightArm', /RightArm(_\d+)?$/i],
  ['rightForeArm', /RightForeArm(_\d+)?$/i],
  ['rightHand', /RightHand(_\d+)?$/i],
  ['leftUpLeg', /LeftUpLeg(_\d+)?$/i],
  ['leftLeg', /LeftLeg(_\d+)?$/i],
  ['leftFoot', /LeftFoot(_\d+)?$/i],
  ['leftToe', /LeftToeBase(_\d+)?$/i],
  ['rightUpLeg', /RightUpLeg(_\d+)?$/i],
  ['rightLeg', /RightLeg(_\d+)?$/i],
  ['rightFoot', /RightFoot(_\d+)?$/i],
  ['rightToe', /RightToeBase(_\d+)?$/i],
];

/**
 * Procedural Mixamo-compatible skeletal animator used when a character GLB
 * lacks native locomotion clips (e.g. a single combat-idle Sketchfab export).
 *
 * Recovers the clean T-pose from `skeleton.boneInverses` and drives natural,
 * non-combat Idle/Walk/Run/Jump/Flight animations, reserving combat stances
 * strictly for when a weapon is equipped or an attack/block is active.
 */
export class ProceduralCharacterAnimator {
  private bones = new Map<BoneRole, BoneEntry>();
  private allSkeletonBones: Array<{
    bone: THREE.Bone;
    bindLocalQuat: THREE.Quaternion;
  }> = [];
  private hipsRestY = 0;
  private initialized = false;
  private walkPhase = 0;

  // Reusable scratch objects (zero per-frame allocations)
  private readonly tmpEuler = new THREE.Euler(0, 0, 0, 'XYZ');
  private readonly tmpCharQuat = new THREE.Quaternion();
  private readonly tmpLocalDelta = new THREE.Quaternion();
  private readonly tmpFootPos = new THREE.Vector3();

  public init(scene: THREE.Object3D): boolean {
    this.bones.clear();
    this.allSkeletonBones = [];
    this.initialized = false;

    let skeleton: THREE.Skeleton | null = null;
    scene.traverse((obj) => {
      if (!skeleton && (obj as THREE.SkinnedMesh).isSkinnedMesh) {
        skeleton = (obj as THREE.SkinnedMesh).skeleton;
      }
    });

    if (!skeleton) return false;
    const skel = skeleton as THREE.Skeleton;
    if (!skel.bones.length || !skel.boneInverses.length) return false;

    const worldBindMap = new Map<THREE.Object3D, THREE.Matrix4>();
    for (let i = 0; i < skel.bones.length; i++) {
      const worldBind = new THREE.Matrix4().copy(skel.boneInverses[i]).invert();
      worldBindMap.set(skel.bones[i], worldBind);
    }

    const parentInv = new THREE.Matrix4();
    const localM = new THREE.Matrix4();
    const pos = new THREE.Vector3();
    const quat = new THREE.Quaternion();
    const scl = new THREE.Vector3();
    const wPos = new THREE.Vector3();
    const wQuat = new THREE.Quaternion();
    const wScl = new THREE.Vector3();

    for (let i = 0; i < skel.bones.length; i++) {
      const bone = skel.bones[i];
      const worldBind = worldBindMap.get(bone);
      if (!worldBind) continue;

      const parentWorldBind = bone.parent ? worldBindMap.get(bone.parent) : undefined;
      if (parentWorldBind) {
        parentInv.copy(parentWorldBind).invert();
        localM.copy(parentInv).multiply(worldBind);
      } else {
        localM.copy(worldBind);
      }

      localM.decompose(pos, quat, scl);
      worldBind.decompose(wPos, wQuat, wScl);

      const bindLocalQuat = quat.clone().normalize();
      const worldBindQuat = wQuat.clone().normalize();

      this.allSkeletonBones.push({ bone, bindLocalQuat });

      for (const [role, pattern] of ROLE_PATTERNS) {
        if (!this.bones.has(role) && pattern.test(bone.name)) {
          this.bones.set(role, {
            bone,
            bindLocalQuat,
            worldBindQuat,
            worldBindQuatInv: worldBindQuat.clone().invert(),
            targetLocalQuat: bindLocalQuat.clone(),
          });
          break;
        }
      }
    }

    const hipsEntry = this.bones.get('hips');
    if (hipsEntry) {
      this.hipsRestY = hipsEntry.bone.position.y;
      hipsEntry.bone.position.x = 0;
      hipsEntry.bone.position.z = 0;
    }

    this.resetToBindPose();
    this.initialized = this.bones.size >= 8;
    return this.initialized;
  }

  public isInitialized(): boolean {
    return this.initialized;
  }

  public resetToBindPose(): void {
    for (const item of this.allSkeletonBones) {
      item.bone.quaternion.copy(item.bindLocalQuat);
    }
    for (const entry of this.bones.values()) {
      entry.targetLocalQuat.copy(entry.bindLocalQuat);
    }
  }

  private setTarget(role: BoneRole, rx: number, ry: number, rz: number): void {
    const entry = this.bones.get(role);
    if (!entry) return;
    this.tmpEuler.set(rx, ry, rz, 'XYZ');
    this.tmpCharQuat.setFromEuler(this.tmpEuler);
    this.tmpLocalDelta
      .copy(entry.worldBindQuatInv)
      .multiply(this.tmpCharQuat)
      .multiply(entry.worldBindQuat);
    entry.targetLocalQuat.copy(entry.bindLocalQuat).multiply(this.tmpLocalDelta);
  }

  /**
   * Returns the lowest foot/toe bone Y position in `relativeTo`'s local space,
   * or null if foot bones aren't mapped.
   */
  public getLowestFootLocalY(relativeTo: THREE.Object3D): number | null {
    const footRoles: BoneRole[] = ['leftToe', 'rightToe', 'leftFoot', 'rightFoot'];
    let minY = Infinity;
    for (const role of footRoles) {
      const entry = this.bones.get(role);
      if (!entry) continue;
      entry.bone.getWorldPosition(this.tmpFootPos);
      relativeTo.worldToLocal(this.tmpFootPos);
      if (this.tmpFootPos.y < minY) {
        minY = this.tmpFootPos.y;
      }
    }
    return minY < Infinity ? minY : null;
  }

  public update(
    dt: number,
    step: CharacterStepResult,
    hasWeapon: boolean,
    elapsedTime: number
  ): void {
    if (!this.initialized) return;

    const state: CharacterLocomotionState = step.state;
    const speed = step.horizSpeed;

    // Reset all targets to neutral T-pose before applying current state
    for (const entry of this.bones.values()) {
      entry.targetLocalQuat.copy(entry.bindLocalQuat);
    }

    // Advance gait phase proportionally to horizontal speed
    if (speed > 0.35 && step.grounded) {
      const dir = state === 'WalkBackward' ? -1 : 1;
      const freq = state === 'Sprint' ? 1.55 : state === 'Jog' ? 1.7 : 1.95;
      this.walkPhase += dir * speed * dt * freq;
    }

    // Base relaxed arm-down angles from A-pose (~35° down -> add ~48° to hang naturally)
    const armDown = 0.78;
    const breath = Math.sin(elapsedTime * 1.9);
    const subtleSway = Math.sin(elapsedTime * 0.95);

    let hipsOffsetY = 0;
    let blendSpeed = 14;

    switch (state) {
      case 'Idle':
      case 'StopMoving': {
        hipsOffsetY = breath * 0.6;
        this.setTarget('hips', 0, subtleSway * 0.03, 0);
        this.setTarget('spine', 0.02 + breath * 0.012, 0, 0);
        this.setTarget('spine2', -0.02 + breath * 0.018, 0, 0);
        this.setTarget('head', 0, subtleSway * 0.04, 0);

        this.setTarget('leftArm', 0.04, 0, -armDown);
        this.setTarget('leftForeArm', -0.18, 0, -armDown);
        this.setTarget('rightArm', 0.04, 0, armDown);
        this.setTarget('rightForeArm', -0.18, 0, armDown);

        this.setTarget('leftUpLeg', -0.02, 0.05, 0.03);
        this.setTarget('leftLeg', 0.04, 0, 0);
        this.setTarget('rightUpLeg', 0.02, -0.05, -0.03);
        this.setTarget('rightLeg', 0.04, 0, 0);
        blendSpeed = 10;
        break;
      }

      case 'CombatIdle': {
        hipsOffsetY = -5.5 + breath * 0.8;
        this.setTarget('hips', 0.06, -0.25, 0);
        this.setTarget('spine', 0.08, 0.12, 0);
        this.setTarget('spine2', 0.06 + breath * 0.02, 0.15, 0);
        this.setTarget('head', -0.05, 0, 0);

        // Left arm balanced, right arm holding summoned weapon forward-ready
        this.setTarget('leftArm', -0.22, 0.25, -0.52);
        this.setTarget('leftForeArm', -0.65, 0, -0.52);
        this.setTarget('rightArm', -0.55, -0.25, 0.55);
        this.setTarget('rightForeArm', -0.78, 0.15, 0.55);

        this.setTarget('leftUpLeg', -0.24, 0.12, 0.08);
        this.setTarget('leftLeg', 0.36, 0, 0);
        this.setTarget('leftFoot', -0.12, 0, 0);
        this.setTarget('rightUpLeg', 0.18, -0.15, -0.08);
        this.setTarget('rightLeg', 0.26, 0, 0);
        this.setTarget('rightFoot', -0.1, 0, 0);
        blendSpeed = 12;
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

        const s = Math.sin(this.walkPhase);
        const c = Math.cos(this.walkPhase);

        hipsOffsetY = -Math.abs(c) * (isSprint ? 5.5 : 3.2);
        this.setTarget('hips', lean * 0.3, s * 0.09, c * 0.03);
        this.setTarget('spine', lean * 0.4, -s * 0.08, 0);
        this.setTarget('spine2', lean * 0.3, -s * 0.12, 0);
        this.setTarget('head', -lean * 0.5, s * 0.05, 0);

        // Legs
        this.setTarget('leftUpLeg', -s * legAmp, 0, 0.02);
        this.setTarget('leftLeg', Math.max(0.05, (c + 0.35) * 0.5 * kneeAmp), 0, 0);
        this.setTarget('leftFoot', s * 0.22, 0, 0);

        this.setTarget('rightUpLeg', s * legAmp, 0, -0.02);
        this.setTarget('rightLeg', Math.max(0.05, (-c + 0.35) * 0.5 * kneeAmp), 0, 0);
        this.setTarget('rightFoot', -s * 0.22, 0, 0);

        // Arms counter-swing
        this.setTarget('leftArm', s * armAmp, 0, -armDown);
        this.setTarget('leftForeArm', -0.28 - Math.max(0, -s) * 0.45, 0, -armDown);

        if (hasWeapon) {
          this.setTarget('rightArm', -0.35 - s * 0.22, -0.15, 0.6);
          this.setTarget('rightForeArm', -0.55, 0.1, 0.6);
        } else {
          this.setTarget('rightArm', -s * armAmp, 0, armDown);
          this.setTarget('rightForeArm', -0.28 - Math.max(0, s) * 0.45, 0, armDown);
        }
        blendSpeed = 16;
        break;
      }

      case 'StrafeLeft':
      case 'StrafeRight': {
        const dir = state === 'StrafeLeft' ? 1 : -1;
        const s = Math.sin(this.walkPhase);
        hipsOffsetY = -Math.abs(Math.cos(this.walkPhase)) * 3.0;

        this.setTarget('hips', 0.05, 0, dir * 0.05);
        this.setTarget('spine2', 0.05, 0, -dir * 0.04);
        this.setTarget('leftUpLeg', -0.12, 0, 0.12 + s * 0.26);
        this.setTarget('leftLeg', 0.22, 0, 0);
        this.setTarget('rightUpLeg', -0.12, 0, -0.12 - s * 0.26);
        this.setTarget('rightLeg', 0.22, 0, 0);

        this.setTarget('leftArm', -0.15, 0, -0.62);
        this.setTarget('leftForeArm', -0.4, 0, -0.62);
        this.setTarget('rightArm', hasWeapon ? -0.45 : -0.15, 0, 0.62);
        this.setTarget('rightForeArm', hasWeapon ? -0.6 : -0.4, 0, 0.62);
        blendSpeed = 15;
        break;
      }

      case 'JumpStart':
      case 'JumpLoop':
      case 'Fall': {
        const rising = state === 'JumpStart' || state === 'JumpLoop';
        this.setTarget('hips', rising ? 0.08 : -0.05, 0, 0);
        this.setTarget('spine', rising ? 0.12 : 0.05, 0, 0);
        this.setTarget('leftUpLeg', rising ? -0.55 : -0.32, 0, 0.06);
        this.setTarget('leftLeg', rising ? 0.85 : 0.55, 0, 0);
        this.setTarget('rightUpLeg', rising ? -0.15 : -0.18, 0, -0.06);
        this.setTarget('rightLeg', rising ? 0.42 : 0.35, 0, 0);

        this.setTarget('leftArm', rising ? -0.55 : -0.25, 0, -0.42);
        this.setTarget('leftForeArm', -0.5, 0, -0.42);
        this.setTarget('rightArm', rising ? -0.55 : -0.25, 0, 0.42);
        this.setTarget('rightForeArm', -0.5, 0, 0.42);
        blendSpeed = 14;
        break;
      }

      case 'Land':
      case 'FlightLand': {
        hipsOffsetY = -14;
        this.setTarget('hips', 0.14, 0, 0);
        this.setTarget('spine2', 0.18, 0, 0);
        this.setTarget('leftUpLeg', -0.42, 0, 0.06);
        this.setTarget('leftLeg', 0.72, 0, 0);
        this.setTarget('leftFoot', -0.25, 0, 0);
        this.setTarget('rightUpLeg', -0.42, 0, -0.06);
        this.setTarget('rightLeg', 0.72, 0, 0);
        this.setTarget('rightFoot', -0.25, 0, 0);
        this.setTarget('leftArm', 0.15, 0, -0.55);
        this.setTarget('rightArm', 0.15, 0, 0.55);
        blendSpeed = 20;
        break;
      }

      case 'FlightTakeoff':
      case 'FlightHover':
      case 'FlightForward':
      case 'FlightAscend':
      case 'FlightDescend': {
        const isFwd = state === 'FlightForward' || state === 'FlightAscend';
        const hoverBob = Math.sin(elapsedTime * 2.6);
        hipsOffsetY = hoverBob * 2.0;

        this.setTarget('spine', isFwd ? -0.12 : 0.04, 0, 0);
        this.setTarget('head', isFwd ? -0.28 : 0, 0, 0);

        this.setTarget('leftUpLeg', isFwd ? 0.18 : -0.18, 0, 0.05);
        this.setTarget('leftLeg', isFwd ? 0.25 : 0.42, 0, 0);
        this.setTarget('rightUpLeg', isFwd ? 0.12 : -0.08, 0, -0.05);
        this.setTarget('rightLeg', isFwd ? 0.18 : 0.22, 0, 0);

        this.setTarget('leftArm', isFwd ? 0.55 : -0.1, 0, isFwd ? -0.55 : -0.45);
        this.setTarget('leftForeArm', -0.25, 0, -0.55);
        this.setTarget('rightArm', isFwd ? 0.55 : -0.1, 0, isFwd ? 0.55 : 0.45);
        this.setTarget('rightForeArm', -0.25, 0, 0.55);
        blendSpeed = 10;
        break;
      }

      case 'Attack': {
        const p = step.attackProgress;
        const swing = p < 0.24 ? -p / 0.24 : -1 + ((p - 0.24) / 0.76) * 2.3;
        hipsOffsetY = -6;
        this.setTarget('hips', 0.08, -0.25 + swing * 0.25, 0);
        this.setTarget('spine2', 0.12, swing * 0.38, 0);
        this.setTarget('rightArm', -0.95 + swing * 0.55, swing * 0.65, 0.45);
        this.setTarget('rightForeArm', -0.45, 0, 0.45);
        this.setTarget('leftArm', -0.2, 0, -0.55);
        this.setTarget('leftForeArm', -0.5, 0, -0.55);
        this.setTarget('leftUpLeg', -0.28, 0, 0.08);
        this.setTarget('leftLeg', 0.42, 0, 0);
        this.setTarget('rightUpLeg', 0.22, 0, -0.08);
        this.setTarget('rightLeg', 0.28, 0, 0);
        blendSpeed = 28;
        break;
      }

      case 'Block': {
        hipsOffsetY = -7;
        this.setTarget('hips', 0.08, -0.2, 0);
        this.setTarget('spine2', 0.1, 0.15, 0);
        this.setTarget('rightArm', -0.95, 0.45, 0.45);
        this.setTarget('rightForeArm', -1.1, -0.4, 0.45);
        this.setTarget('leftArm', -0.55, -0.2, -0.5);
        this.setTarget('leftForeArm', -0.8, 0, -0.5);
        this.setTarget('leftUpLeg', -0.28, 0, 0.08);
        this.setTarget('leftLeg', 0.44, 0, 0);
        this.setTarget('rightUpLeg', 0.22, 0, -0.08);
        this.setTarget('rightLeg', 0.3, 0, 0);
        blendSpeed = 20;
        break;
      }

      case 'Dodge': {
        hipsOffsetY = -16;
        this.setTarget('hips', 0.28, 0, 0);
        this.setTarget('spine2', 0.35, 0, 0);
        this.setTarget('leftUpLeg', -0.55, 0, 0.06);
        this.setTarget('leftLeg', 0.9, 0, 0);
        this.setTarget('rightUpLeg', 0.25, 0, -0.06);
        this.setTarget('rightLeg', 0.55, 0, 0);
        this.setTarget('leftArm', 0.45, 0, -0.65);
        this.setTarget('rightArm', 0.45, 0, 0.65);
        blendSpeed = 22;
        break;
      }

      case 'HitReaction': {
        const hitWave = Math.sin(step.hitReactionProgress * Math.PI);
        hipsOffsetY = -4 * hitWave;
        this.setTarget('spine', -0.25 * hitWave, 0, 0);
        this.setTarget('spine2', -0.3 * hitWave, 0, 0);
        this.setTarget('head', -0.35 * hitWave, 0, 0);
        this.setTarget('leftArm', -0.2 * hitWave, 0, -0.55);
        this.setTarget('rightArm', -0.2 * hitWave, 0, 0.55);
        blendSpeed = 24;
        break;
      }

      case 'Death': {
        hipsOffsetY = -110;
        this.setTarget('hips', 1.35, 0, 0);
        this.setTarget('spine2', 0.25, 0, 0);
        this.setTarget('leftUpLeg', -0.2, 0, 0.12);
        this.setTarget('leftLeg', 0.35, 0, 0);
        this.setTarget('rightUpLeg', -0.1, 0, -0.12);
        this.setTarget('rightLeg', 0.25, 0, 0);
        this.setTarget('leftArm', -0.4, 0, -0.35);
        this.setTarget('rightArm', -0.4, 0, 0.35);
        blendSpeed = 9;
        break;
      }
    }

    const slerpAlpha = 1 - Math.exp(-blendSpeed * dt);
    for (const entry of this.bones.values()) {
      entry.bone.quaternion.slerp(entry.targetLocalQuat, slerpAlpha);
    }

    const hipsEntry = this.bones.get('hips');
    if (hipsEntry) {
      hipsEntry.bone.position.x = 0;
      hipsEntry.bone.position.z = 0;
      hipsEntry.bone.position.y = THREE.MathUtils.lerp(
        hipsEntry.bone.position.y,
        this.hipsRestY + hipsOffsetY,
        slerpAlpha
      );
    }
  }
}
