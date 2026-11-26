import * as THREE from 'three';
import { CharacterLocomotionState, resolveClipForState } from './CharacterStates';

export class CharacterAnimationController {
  private currentState: CharacterLocomotionState | null = null;
  private currentClipName: string | null = null;

  public update(
    state: CharacterLocomotionState,
    horizSpeed: number,
    actions: Record<string, THREE.AnimationAction | null>
  ): void {
    const available = Object.keys(actions).filter((k) => Boolean(actions[k]));
    if (available.length === 0) return;

    const resolved = resolveClipForState(state, available);
    const nextAction = actions[resolved.clipName];
    if (!nextAction) return;

    // Crossfade when target clip changes
    if (this.currentClipName !== resolved.clipName) {
      const prevAction = this.currentClipName ? actions[this.currentClipName] : null;
      const blendDuration = state === 'Attack' || state === 'JumpStart' ? 0.1 : 0.22;
      prevAction?.fadeOut(blendDuration);
      nextAction.reset().fadeIn(blendDuration).play();
      this.currentClipName = resolved.clipName;
    }

    this.currentState = state;

    // Match animation playback speed to ground movement speed to minimize foot sliding
    if (resolved.clipName === 'Walk') {
      const rate = THREE.MathUtils.clamp(horizSpeed / 4.6, 0.55, 1.4);
      nextAction.timeScale = resolved.reverse ? -rate : rate;
    } else if (resolved.clipName === 'Run') {
      const rate = THREE.MathUtils.clamp(horizSpeed / 9.8, 0.72, 1.45);
      nextAction.timeScale = rate;
    } else {
      nextAction.timeScale = 1.0;
    }
  }

  public getCurrentState(): CharacterLocomotionState | null {
    return this.currentState;
  }

  public dispose(actions: Record<string, THREE.AnimationAction | null>): void {
    Object.values(actions).forEach((action) => action?.stop());
    this.currentState = null;
    this.currentClipName = null;
  }
}
