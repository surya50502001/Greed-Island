import * as THREE from 'three';
import { CharacterLocomotionState, resolveClipForState } from './CharacterStates';

export class CharacterAnimationController {
  private currentState: CharacterLocomotionState | null = null;
  private currentClipName: string | null = null;
  private currentReverse = false;
  private currentIsOneShot = false;
  private activeOneShotAction: THREE.AnimationAction | null = null;
  private activeOneShotState: CharacterLocomotionState | null = null;

  private boundMixer: THREE.AnimationMixer | null = null;
  private onOneShotFinishedCb: ((state: CharacterLocomotionState) => void) | null = null;

  private readonly handleMixerFinished = (event: { action: THREE.AnimationAction }) => {
    if (
      this.activeOneShotAction &&
      event.action === this.activeOneShotAction &&
      this.activeOneShotState
    ) {
      const finishedState = this.activeOneShotState;
      this.activeOneShotAction = null;
      this.activeOneShotState = null;
      this.onOneShotFinishedCb?.(finishedState);
    }
  };

  public bindMixer(
    mixer: THREE.AnimationMixer,
    onOneShotFinished: (state: CharacterLocomotionState) => void
  ): void {
    if (this.boundMixer === mixer) {
      this.onOneShotFinishedCb = onOneShotFinished;
      return;
    }
    this.unbindMixer();
    this.boundMixer = mixer;
    this.onOneShotFinishedCb = onOneShotFinished;
    mixer.addEventListener('finished', this.handleMixerFinished);
  }

  public unbindMixer(): void {
    if (this.boundMixer) {
      this.boundMixer.removeEventListener('finished', this.handleMixerFinished);
      this.boundMixer = null;
    }
    this.onOneShotFinishedCb = null;
    this.activeOneShotAction = null;
    this.activeOneShotState = null;
  }

  public update(
    state: CharacterLocomotionState,
    horizSpeed: number,
    actions: Record<string, THREE.AnimationAction | null>
  ): void {
    const available = Object.keys(actions).filter((k) => Boolean(actions[k]));
    if (available.length === 0) return;

    const resolved = resolveClipForState(state, available);
    if (!resolved.clipName) return;
    const nextAction = actions[resolved.clipName];
    if (!nextAction) return;

    const clipChanged = this.currentClipName !== resolved.clipName;
    const stateChanged = this.currentState !== state;
    const isOneShot = Boolean(resolved.loopOnce && resolved.isNativeClip);
    const reverse = Boolean(resolved.reverse);

    // Update loop & clamp settings whenever logical state OR clip changes,
    // so looping states never stay clamped after a one-shot on a shared clip.
    if (clipChanged || stateChanged || this.currentIsOneShot !== isOneShot) {
      if (isOneShot) {
        nextAction.setLoop(THREE.LoopOnce, 1);
        nextAction.clampWhenFinished = true;
        this.activeOneShotAction = nextAction;
        this.activeOneShotState = state;
      } else {
        nextAction.setLoop(THREE.LoopRepeat, Infinity);
        nextAction.clampWhenFinished = false;
        nextAction.paused = false;
        this.activeOneShotAction = null;
        this.activeOneShotState = null;
      }
      this.currentIsOneShot = isOneShot;
    }

    // Only crossfade & reset when the underlying clip actually changes
    // (or when re-entering the same native one-shot state).
    if (clipChanged || (stateChanged && isOneShot)) {
      const prevAction = this.currentClipName ? actions[this.currentClipName] : null;
      const isFlight =
        state === 'FlightHover' ||
        state === 'FlightForward' ||
        state === 'FlightAscend' ||
        state === 'FlightDescend' ||
        state === 'FlightTakeoff' ||
        state === 'FlightLand';
      const isFastOneShot =
        state === 'Attack' ||
        state === 'Attack1' ||
        state === 'Attack2' ||
        state === 'Attack3' ||
        state === 'Attack4' ||
        state === 'JumpStart' ||
        state === 'HitReaction';
      const blendDuration = isFastOneShot ? 0.09 : isFlight ? 0.28 : 0.2;

      if (prevAction && prevAction !== nextAction) {
        prevAction.fadeOut(blendDuration);
      }

      nextAction.reset();
      nextAction.enabled = true;
      nextAction.setEffectiveWeight(1);

      if (reverse) {
        const dur = nextAction.getClip().duration;
        nextAction.time = dur > 0 ? dur : 0;
      }

      nextAction.fadeIn(blendDuration).play();
      this.currentClipName = resolved.clipName;
    }

    this.currentState = state;
    this.currentReverse = reverse;

    // Guard negative timeScale playback against invalid/negative time positions
    if (reverse && !isOneShot) {
      const dur = nextAction.getClip().duration;
      if (dur > 0 && (nextAction.time <= 0 || nextAction.time > dur)) {
        nextAction.time = dur;
      }
    }

    // Match animation playback speed to ground movement speed to reduce foot sliding
    if (resolved.clipName === 'Walk') {
      const rate = THREE.MathUtils.clamp(horizSpeed / 4.6, 0.55, 1.4);
      nextAction.timeScale = this.currentReverse ? -rate : rate;
    } else if (resolved.clipName === 'Run') {
      const rate = THREE.MathUtils.clamp(horizSpeed / 9.8, 0.72, 1.45);
      nextAction.timeScale = rate;
    } else if (resolved.clipName === 'StrafeLeft' || resolved.clipName === 'StrafeRight') {
      nextAction.timeScale = THREE.MathUtils.clamp(horizSpeed / 4.4, 0.65, 1.35);
    } else {
      nextAction.timeScale = this.currentReverse ? -1.0 : 1.0;
    }
  }

  public getCurrentState(): CharacterLocomotionState | null {
    return this.currentState;
  }

  public dispose(actions: Record<string, THREE.AnimationAction | null>): void {
    this.unbindMixer();
    Object.values(actions).forEach((action) => {
      if (action) {
        action.stop();
        action.enabled = false;
      }
    });
    this.currentState = null;
    this.currentClipName = null;
    this.currentReverse = false;
    this.currentIsOneShot = false;
  }
}
