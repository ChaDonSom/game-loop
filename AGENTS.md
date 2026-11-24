# Agent guide

Read this file first. Then follow `copilot-instructions.md` for communication style and reuse checks.

## Layout

npm workspaces. Build order: `shared` → `node-transport` → `vue-client`.

| Workspace        | Package name        | Role                                                                   |
| ---------------- | ------------------- | ---------------------------------------------------------------------- |
| `shared/`        | `@game-loop/shared` | Rapier physics world, controls, and wire protocol. Used by both sides. |
| `node-transport/`| `web-transport`     | WebTransport (HTTP/3) server. Runs the authoritative physics loop.     |
| `vue-client/`    | `vue`               | Vue 3 + Three.js client. Renders and predicts locally.                 |

## Wire protocol

- `shared/src/protocol.ts` owns every message type, the JSON codec, and the validators.
- Change a message shape there only. Do not define message shapes in the server or the client.
- Validate every incoming packet with a shared validator before you use it. Advance a `seq` only after validation.
- Known overlap: `type: "state"` has two shapes. Stream: `InitialPositionsMessage`. Datagram: `VehicleStateMessage`.

## Build and check

- Install: `npm ci --ignore-scripts`. The build does not need the native WebTransport install step.
- Build and type-check all: `npm run build`. CI (`.github/workflows/build.yml`) runs the same two commands on each PR.
- To run the server locally, you need the native step: use plain `npm ci`.

## Ship a change

1. Make a branch from `soapbox-car`. Do not push to `soapbox-car` directly: `deploy.sh` on the droplet runs `git pull`.
2. Open a PR against `soapbox-car`. Copilot reviews it.
3. Fix review findings. Reply to each thread and resolve it.
4. The owner merges and deploys with `deploy-local.sh`.

## Deploy (reference)

- `deploy-local.sh` connects with SSH to the droplet and runs `deploy.sh`.
- `deploy.sh`: `git pull`, `npm ci`, `npm run build`, then pm2 restarts `node-transport` (`ecosystem.config.cjs`).
- Nginx on the droplet handles the rest (per `deploy.sh`). Its config is not in this repo.

## Tool notes

- If `npx --yes jscpd` cannot run, say so in the report and use code search instead.
- In some sandboxes `gh pr create` fails (no GraphQL). Then use the REST API: `gh api repos/ChaDonSom/game-loop/pulls -f title=... -f head=... -f base=soapbox-car -F body=@file`.
