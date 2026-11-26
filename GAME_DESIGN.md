# Greed Island — Game Design & Architecture

## Overview
A stylized 3D open-world browser game built with **Vite + React + TypeScript** and **Three.js** (`@react-three/fiber`, `@react-three/drei`).

## World & Landmarks
- **Island Radius**: `135` units (`src/world/terrain.ts`), procedural heightmap with vertex-colored biomes (beach, grass, mossy ruins, mountain rock, frost peak) surrounded by an animated ocean (`WATER_LEVEL = -1.6`).
- **4 Distinct Landmarks** (`src/components/Landmarks.tsx`):
  1. **Starting Plaza** `(0, 0)` — Stone dais, runic ring, 4 obelisk pillars, floating beacon.
  2. **Ancient Ruins** `(-54, -46)` — Broken stone archway, columns, amber relic altar.
  3. **Crystal Peak** `(58, -50)` — High mountain peak with glowing crystals and orbiting shards.
  4. **Forest Shrine** `(0, 64)` — Torii gate, spirit lanterns, sacred ancient tree, orbiting wisps.
- **Patrolling Enemies** (`src/components/Enemies.tsx`): 8 stalker golems (`60 HP` each) that patrol around landmarks, chase the player within aggro range (`17` units) unless invisible or dead, deal `15` damage (`0.85s` player damage cooldown), take `25` damage with knockback & overhead HP bars, and respawn `14s` after being defeated.
- **Player Health & Revival** (`src/gameplay/combat/HealthSystem.ts`): Player starts with `100 HP`. Blocking (`F`) negates incoming damage; reaching `0 HP` triggers `Death`, disables actions/Grimoire, and opens the **Revive at Starting Plaza (`[R]`)** overlay.

## Controls
- **Ground Movement**: `WASD` move relative to camera, `Shift` sprint, `Space` jump, `Left-Click` attack (with Weapon summoned).
- **Camera**: Over-the-shoulder third-person follow camera; click canvas for Pointer Lock mouse orbit (or drag to orbit).
- **Flight Movement** (when `Flight` is active): `WASD` fly in 3D camera direction, `Space` ascend, `C` descend, `Shift` high-speed air boost.
- **Grimoire**: Press `G` to summon/dismiss the 3D Grimoire, or `Escape` to close without casting. Hover cards to preview and click to cast.

## Summonable Grimoire & Cards (`G` Key)
Instead of a permanent hotbar, pressing `G` materializes an ancient 3D Grimoire with glowing runes, swirling particles, animated cover & page turning, and 3 holographic cards arranged in an arc:

| Card | Category / Rarity | Effect |
| --- | --- | --- |
| **Flight** | Aerial Spell · Epic | Toggles free 3D flight, activates glowing wind/aura rings, tilts character forward into a flying pose, and shows airborne hints. |
| **Weapon** | Conjuration · Rare | Materializes a glowing 3D energy sword attached to `mixamorigRightHand` and enables `Left-Click` melee slash attacks with a swing trail. |
| **Invisibility** | Illusion · Mythic | Sets character mesh opacity to `0.25` for `8.0s` with a live HUD countdown pill; patrolling enemies immediately stop chasing while active. |

## Architecture
- `src/types/game.ts` — Shared constants (`ISLAND_RADIUS`, `WATER_LEVEL`, `INVISIBILITY_DURATION`, `LANDMARKS`, `CARD_DEFINITIONS`).
- `src/world/terrain.ts` — Deterministic `getTerrainHeight`, `getTerrainColor`, and prop placement.
- `src/components/World.tsx` & `Landmarks.tsx` — Terrain mesh, ocean, sky/clouds, trees, rocks, and 4 landmarks.
- `src/gameplay/character/` — Modular character system:
  - `CharacterStates.ts` — Configurable `DEFAULT_CHARACTER_MODEL_URL` (`/models/adventurer.glb`), 25 locomotion/combat/flight/death states (`CharacterLocomotionState`), and `resolveClipForState` (native clip matching + documented fallbacks).
  - `CharacterController.ts` — Grounded/airborne/flight physics, natural acceleration/deceleration, diagonal normalization, smooth turning, `JumpStart` -> `JumpLoop` -> `Fall` -> `Land` sync, flight landing transition, `Block` / `Dodge` / `Death` state handling, and Grimoire input freeze.
  - `CharacterAnimationController.ts` — Crossfaded `AnimationAction` state machine with `AnimationMixer` `finished` event handling, speed-matched `timeScale`, reverse playback bounds guarding, and one-shot vs. loop management.
- `src/components/Player.tsx` — Rigged humanoid character (`public/models/adventurer.glb` by default, replaceable via `modelUrl`), automatic height normalization, over-the-shoulder camera, weapon attachment to `mixamorig:RightHand_040`, active-window melee hit detection, and multi-touch camera orbit.
- `src/components/MobileControls.tsx` — Virtual analog joystick, action buttons (`Jump`/`Ascend`, `Descend`, `Sprint`, `Dodge`, `Attack`, `Block`, `Book`), and full input cleanup on hide/Grimoire/blur/cancel.
- `src/components/Grimoire.tsx` & `GrimoireCard.tsx` — 3D summonable book, animated cover/pages, particle/rune effects, and interactive holographic cards.
- `src/components/Enemies.tsx` — Patrol/chase AI, player hit callback, and defeat/respawn loop.
- `src/components/HUD.tsx` — Minimal active-status pills, airborne flight hints, and Grimoire summon prompt (no permanent 3-card hotbar).
- `src/App.tsx` — Canvas, lighting, `<Suspense>`, card state, and `G` / `Escape` keybindings.

## Animation Asset Status (`public/models/adventurer.glb`)
- **Source**: Sketchfab *Free Game Character - Ancient* (CC Attribution, 1k GLB, 92-joint Mixamo rig including `mixamorig:RightHand_040`).
- **Native clips in GLB (1 total)**: `"Armature|Armature|mixamo.com|Layer0.001"` (`4.367s`, 83 channels) — mapped to `Idle`.
- **Fallback states (24 total)**: `StartMoving`, `StopMoving`, `Walk`, `Jog`, `Sprint`, `WalkBackward`, `StrafeLeft`, `StrafeRight`, `JumpStart`, `JumpLoop`, `Fall`, `Land`, `CombatIdle`, `Attack`, `Block`, `Dodge`, `HitReaction`, `Death`, `FlightTakeoff`, `FlightHover`, `FlightForward`, `FlightAscend`, `FlightDescend`, `FlightLand` currently resolve to the embedded idle clip until dedicated Mixamo clips are combined into `public/models/adventurer.glb`.
