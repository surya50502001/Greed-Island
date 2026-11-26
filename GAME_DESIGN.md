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
- **Patrolling Enemies** (`src/components/Enemies.tsx`): 8 stalker golems that patrol around landmarks, chase the player within aggro range (`17` units) unless invisible, and respawn `14s` after being defeated.

## Controls
- **Ground Movement**: `WASD` move relative to camera, `Shift` sprint, `Space` jump, `Left-Click` attack (with Weapon summoned).
- **Camera**: Over-the-shoulder third-person follow camera; click canvas for Pointer Lock mouse orbit (or drag to orbit).
- **Flight Movement** (when `[1] Flight` is active): `WASD` fly in 3D camera direction, `Space` ascend, `C` descend, `Shift` high-speed air boost.

## 3-Card Hotbar (`1`, `2`, `3` Keys)
| Key | Card | Effect |
| --- | --- | --- |
| `[1]` | **Flight** | Toggles free 3D flight, activates glowing wind/aura rings, tilts character forward into a flying pose, and displays airborne key hints. |
| `[2]` | **Weapon** | Materializes a glowing 3D energy sword attached to `mixamorigRightHand` and enables `Left-Click` melee slash attacks with a swing trail. |
| `[3]` | **Invisibility** | Sets character mesh opacity to `0.25` for `8.0s` with a live HUD countdown timer; patrolling enemies immediately stop chasing while active. |

## Architecture
- `src/types/game.ts` — Shared constants (`ISLAND_RADIUS`, `WATER_LEVEL`, `INVISIBILITY_DURATION`, `LANDMARKS`).
- `src/world/terrain.ts` — Deterministic `getTerrainHeight`, `getTerrainColor`, and prop placement.
- `src/components/World.tsx` & `Landmarks.tsx` — Terrain mesh, ocean, sky/clouds, trees, rocks, and 4 landmarks.
- `src/components/Player.tsx` — Rigged `Soldier.glb` character (`useGLTF` + `useAnimations`), over-the-shoulder camera, ground/flight physics, weapon attachment & melee hit detection.
- `src/components/Enemies.tsx` — Patrol/chase AI and defeat/respawn loop.
- `src/components/HUD.tsx` — Minimal bottom-center 3-card hotbar, active badges, invisibility timer bar, and airborne flight hints.
- `src/App.tsx` — Canvas, lighting, `<Suspense>`, card state, and `1/2/3` keybindings.
