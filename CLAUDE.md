# Swarmfall

A roguelite swarm shooter played mostly on phones. The whole game is `index.html`: HTML, CSS and one inline script using three.js r128 (the UMD build from cdnjs, global `THREE`). There is no build step and no other source file.

- **Live:** https://thescootai.github.io/swarmfall/ (GitHub Pages serves `main` as is; a push is a deploy).
- **Game artifact:** https://claude.ai/artifact/WHbiJLyLcGYMiu2Bddz8s4 (the same game, built with `node tools/artifact.js`).
- **Enemy guide artifact:** https://claude.ai/artifact/18YkQbSpHhSxGimJ2GmKNq (source in `artifacts/enemy-guide/`).
- **Upgrade guide artifact:** https://claude.ai/artifact/EALugShxKLeMhoE6pxT3TC (every booster and station module; written by `node tools/upgrade-guide.js` into `artifacts/upgrade-guide/`).
- **Repo:** `TheScootAI/swarmfall`. `main` is the live game, and ordinary changes go straight onto it.
- **Branch `graphics-upgrade`:** a trial of new graphics on three.js r187 (glow, reflections, nebula, energy shield, lights), waiting for the owner's verdict. It is staged at https://claude.ai/artifact/TDjavC3eeknZRiZyJmQsWR. After a change to `main`, merge `main` into that branch and republish the staging artifact (that branch's `CLAUDE.md` says how). Do not merge the branch into `main` until the owner says so.

The `swarmfall-dev` skill (`.claude/skills/swarmfall-dev/`) has the step-by-step workflow for a change. Use it.

## What the owner wants from the game

These came from playtesting feedback; keep them unless the owner says otherwise.

- **Phone first.** Drag anywhere to steer and the ship fires on its own. Every screen must work at about 390px wide.
- **One hit ends a new ship's run.** Hull, shields and everything else are bought with scrap (station modules) or picked as boosters.
- **Colours carry meaning.** All enemy fire is the same red (`ENEMY_RED`), and nothing good is red. Anything good to grab sits in a pulsing blue halo: gold rings are scrap, green crosses repair hull.
- **Mites are the pawns.** They are the largest group in every wave and hold the front two rows. Stronger enemies sit behind them.
- **Pacing.** A booster shuttle comes after every 3rd wave (`DRAFT_EVERY`) and a Hive Core boss on every 6th (`BOSS_EVERY`). After each boss the ship docks and gets the next station module (`UNLOCK_ORDER`).
- **Cutscenes.** Only the launch can be skipped with a tap. The shuttle and docking scenes always play out, because a player steering by touch puts a finger down just as they start.
- **The Hive Core dies big.** Its death is a scene of about 2.5 seconds (`FINALE`): game time slows to a fifth, the camera pushes in on the core, smaller blasts follow the first, and a long deep boom plays (`SFX.core`). The ship cannot be hit during it, nor for a blink afterwards (`FINALE.grace`), because the camera may leave the ship out of view. The core's shots are not removed: they carry on afterwards.
- **Sound.** Firing is silent on purpose, since a constant shooting sound was annoying. New sounds should be short and soft. The one long sound is the Hive Core's death, which the owner asked to be longer and deeper.
- **How the owner tunes the game.** They leave comments on the guide artifacts ("start at wave 15"). When you change the game, update the tables, the guides and the README together.

## Where things are in `index.html`

The script is split into sections, each marked with a `// ---------- name ----------` comment.

| Section | What it holds |
|---|---|
| save | `meta`: scrap, records, mute, bought modules (`meta.up`) and fitted modules (`meta.mods`), all in localStorage. |
| audio | Web Audio synth: `tone()`, `noise()` and the `SFX` table. Phone unlock tricks are in `audioInit()`. |
| three.js stage | Renderer, `geo` and `M` (shared geometries and materials), stars, particles (`burst`), effect pools (`ringFx`, `zapFx`), instanced shots, the player ship, station and shuttle models, `resize()`. |
| game data | Every tuning table: `ET` (enemies), `UNLOCK` (when each enemy arrives), `UP` (boosters), `SHOP`, `GROUPS`, `START_MODS` and `UNLOCK_ORDER` (station modules), `SKIP_SCRAP`. |
| game state | `G` (the run), `P` (the ship), `S` (stats derived by `recalc()`). |
| enemies | Models, spawning, formation slots, entry paths, dives, missiles, lancers, the Hive Core, and `buildWave()`. |
| player | Ship hit shape (`shipHit`), shields, shots, seekers, picking up scrap. |
| cutscenes | `CUTS` (durations and which can be skipped), `startCut`, `updateCut`, docking at the station. The Hive Core's death scene is separate: `FINALE` (its numbers) and `finaleStart`, `finaleStep`, `finaleZoom`, next to `shake()`. |
| drawing | `syncScene()`: copies game state into the three.js scene once a frame. |
| UI | HUD, screens, booster choice (draft), the station shop, buttons. |
| feedback | The speech-bubble button that opens a prefilled GitHub issue. |
| input, loop | Keyboard, touch and mouse, then `frame()`. |

`G.state` is one of `title`, `browse` (the station between runs), `cut`, `play`, `clear` (the gap after a wave), `draft`, `station` (docked after a boss), `pause`, `dying` or `dead`.

## Conventions

- **Never remove from a live array mid-frame.** Set `dead = true` on enemies, shots and missiles. `sweepDead()` removes them once per frame. Code that runs inside a loop, such as a hit clearing nearby shots or a boss taking its swarm with it, must only set the flag.
- **No allocation in per-frame code.** Use the `parts`/`spareParts` particle pool, the ring and lightning pools, the shared `SLOT` from `slotPos()`, and colour constants such as `ENEMY_RED_RGB` and `HIT_RGB`. Never write colour arrays inline in a hot path. Share materials through `M` or a small cache; do not call `phong()` per spawn.
- **Use the existing helpers.**
  - `hint(key, runs, title, line)` shows a first-time tip.
  - `despawn(e)` removes an enemy without a kill; `killEnemy(e)` is a kill.
  - `diveToLane()` sends several divers out spread across the screen.
  - `repair(k)` restores hull; `clearEnemyFire()` and `clearShotsNear()` remove enemy fire.
  - `pick()`, `turnToward()` and `wrapAngle()` are small maths helpers.
- **Tuning belongs in the tables**, not as `n >= 12` thresholds scattered through the code.
- **Two clocks.** `frame()` passes game time (`dt`) to everything. It runs slow during the Hive Core's death scene (`G.speed` is below 1). Anything that must keep real pace, such as shake fading or a scene's own timer, uses `realDt`. The camera is placed afresh every frame in `syncScene()` from `camBase`; never set its position anywhere else.
- **three.js r128 quirk.** `InstancedMesh.setColorAt` sizes its colour buffer from the instance count at its first call. Give colours while the count is still the maximum (see `instanced()`), or that kind of shot renders black.
- **Debug handle.** `window.__swarmfall` exposes `G`, `P`, `S`, `meta`, `UNLOCK`, `FIN`, `camera`, `recalc`, `nextWave`, `spawnEnemy`, `launchDive`, `fireMissile` and `spawnPick` for tests and the browser console. The game itself never uses it.
- **Writing for players.** Plain words, phone-sized lines, and every new enemy gets a `hint()` the first time it appears.

## Testing

```
cd tools && npm install      # three.js for offline tests (the sandbox may block cdnjs)
node smoke.js [shots-dir]    # about 2 minutes; exits 1 on any failure
```

`smoke.js` uses headless Chromium in a phone viewport with software WebGL. It covers:

- A full run: launch, booster shuttle, Hive Core, docking, the station, death and reload.
- Checks that each enemy first appears on the wave `UNLOCK` says.
- A stress run with every booster on, and pause.
- The Hive Core's death scene: slow motion and the camera push happen, the ship cannot be hit during it, and speed and camera are normal again before docking.

Passing tests cannot see colour or layout. After a change to rendering or UI, save screenshots (pass a directory) and look at them.

## Publishing

1. Commit and push to `main`. GitHub Pages redeploys within a minute.
2. Rebuild and republish the game artifact: `node tools/artifact.js <out.html>`, then publish that file to the game artifact URL above.
3. If enemies, their timings or their numbers changed, update `artifacts/enemy-guide/index.html` and republish it with its `img/` files to the guide URL. Re-render the pictures with `node tools/portraits.js` if a model changed.
4. If a booster or station module changed (`UP`, `SHOP`, `UNLOCK_ORDER`, `START_MODS`, the odds in `rollCards()`, or what one does in `recalc()` and elsewhere), update its note in `tools/upgrade-guide.js` if its numbers changed, run `node tools/upgrade-guide.js`, and republish `artifacts/upgrade-guide/index.html` to the upgrade guide URL.
