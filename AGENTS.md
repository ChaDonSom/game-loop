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
- Build and type-check all: `npm run build`. Run both commands before you push.
- CI (`.github/workflows/build.yml`) runs `npm ci --ignore-scripts` and `npm run build` on each PR and on each push to `soapbox-car` and `master`.
- To run the server locally, you need the native step: use plain `npm ci`.

## Ship a change

`soapbox-car` is a permanent branch off `master`. It is the base for all soapbox-car work. Do not target `master`.

1. Make a branch from `soapbox-car`. Do not push to `soapbox-car` directly: `deploy.sh` on the droplet runs `git pull`.
2. Open a PR against `soapbox-car`. Copilot reviews it.
3. Fix review findings. Reply to each thread and resolve it.
4. The owner merges into `soapbox-car`. An agent's work ends at a merge-ready PR.
5. Deploy is a separate step. The owner deploys by hand over SSH.

## Work with the owner

The owner wants to learn the code by making the real choices, not by reading diffs. Agents remove the plumbing friction. The owner keeps the choose-plug-run friction.

1. **Plan first, in a draft PR.** Before code, open a draft PR against `soapbox-car`. It holds only `notes/plans/<topic>.md`. The owner reviews it with a batched GitHub review ("Start a review", then "Submit review"). Revise the plan. Reply in each thread. Repeat until the owner approves the plan.
2. **Scaffold, then slots.** Push code that builds and runs: functions in the correct module, wired into the loop, typed, exported. Leave the real decisions as marked slots:
   - Mark each slot `// YOUR CHOICE: <decision>. <where to look>`.
   - Tell the owner what to decide and where to look. Do not give the answer.
   - A slot is a real design or tuning decision. Wiring, imports, and scope are never slots.
   - Each slot must build and run with a placeholder value.
3. **Review the owner's choices.** When a result "works but is not what the owner expected", explain why. These cases are the point.
4. **Questions at any time.** The owner can ask in a review thread or in the session. Answer in the same place.

### Diagrams

- Follow `notes/diagram-legend.md`. Use the same visual for the same thing every time.
- Show only what is new. Grey out existing context. Show only the context the new code touches.
- 8 nodes or fewer. If you need more, split the change.

### PR descriptions

Each PR description has:

- **Read in this order:** a numbered file list.
- **How this fits:** a short paragraph.
- **What's new:** a diagram that follows the legend.
- **Test:** what you ran and what you did not run.

## Deploy (reference)

Agents do not deploy.

- `deploy-local.sh` connects with SSH to the droplet and runs `deploy.sh`.
- `deploy.sh`: `git pull`, `npm ci`, `npm run build`, then pm2 restarts `node-transport` (`ecosystem.config.cjs`).
- Nginx on the droplet handles the rest (per `deploy.sh`). Its config is not in this repo.

## Tool notes

- If `npx --yes jscpd` cannot run, say so in the report and use code search instead.
- In some sandboxes `gh pr create` fails (no GraphQL). Then use the REST API: `gh api repos/ChaDonSom/game-loop/pulls -f title=... -f head=... -f base=soapbox-car -F body=@file`.
