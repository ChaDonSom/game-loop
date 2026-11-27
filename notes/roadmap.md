# Soapbox-car roadmap

Planned order for the next features. Saved 2026-11-24.

## Order

1. **Lighting.** Done. Merged in ChaDonSom/game-loop#5.
2. **Terrain.** Plan: `notes/plans/terrain.md`.
3. **Vehicle spec.**
4. **Models and colors.**

Each step depends on the step before it.

## 1. Lighting

Problem: ground `0x22222b` on background `0x1a1a24`. Dark grey on dark grey. Shadow camera covered only ±5 m.

Fix: sky color and fog, hemisphere light, a sun that follows the car with a ±40 m shadow area, a checker ground (shows speed and slope), lighter ramp and walls.

Do this first. Without it, you cannot see bumps, banking, or car shape.

## 2. Terrain

Bumps, ramps, tracks, off-road and on-road patches, banked ovals.

- Server and client both build the world from `shared/src/rapier/`. Static terrain needs no wire protocol change.
- Add colliders in `shared`. Add matching meshes in `vue-client/src/three/`.
- Terrain gives car tuning a purpose. Ride height, track width, and camber do nothing on a flat box.

Good first set: a few bumps, one banked turn, one rough off-road patch. Drive on them. Then decide which car parameters to expose.

## 3. Vehicle spec

Height, width, tire width, lift and lower, toe, camber, and more.

Today every car uses hard-coded constants in `shared/src/rapier/chassis.ts` and `wheels.ts`. The client draws remote cars with its own local wheel config (`vue-client/src/soapbox-init.ts`, remote mesh loop). Remote cars will look wrong when cars differ.

Needed:

- A `VehicleSpec` type in `shared/src/protocol.ts`.
- The client sends its spec at join. The server builds that player's physics from it.
- The server broadcasts each spec. Other clients render each car from its own spec.

Limits of Rapier's raycast vehicle (`DynamicRayCastVehicleController`):

| Parameter | Status |
| --- | --- |
| Ride height, wheel position, wheel radius | Direct |
| Suspension stiffness and travel | Direct |
| Friction | Direct |
| Toe | Fake it: constant steering offset per wheel |
| Camber | No real effect. No tire model. Approximate with grip changes |
| Tire width | No real effect. No contact patch. Approximate with grip changes |

Real camber and tire width need real wheel colliders. That is a much larger job.

## 4. Models and colors

'69 Beetle, '67 Corvette, original Mini Cooper, Shelby Cobra, and others. A simple way to pick one. Colors.

- Make each model a preset `VehicleSpec` plus a mesh. Real cars differ in wheelbase, track, and height, not only shape. One pick then sets physics and visuals.
- Color is one field in the spec. Add it at any step.
- Build stylized low-poly models from primitives. If you download models, check each license.

## Later

Saved for later. Not in the order above.

- **Remote cars in the client physics world.** Done for ChaDonSom/game-loop#13: each remote car is a dynamic proxy (no gravity, no wheels) in `vue-client/src/physics/remoteCar.ts`. It follows the server state, moved ahead to the local car's time, so the local car can hit it and push it. Found in `notes/plans/issue-12-flip-multiplayer-portrait.md` (M8).
