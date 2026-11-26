# Swarmfall

A roguelite swarm shooter played mostly on phones. The whole game is `index.html`: HTML, CSS and one inline script using three.js r187. three.js and its post-processing add-ons are bundled into `vendor/three.min.js` (a classic script that defines the global `THREE`), so nothing loads from a CDN. The game itself has no build step; only that bundle is built, and only when three.js or the list of names taken from it changes.

- **Live:** https://thescootai.github.io/swarmfall/ (GitHub Pages serves `main` as is; a push is a deploy).
- **Game artifact:** https://claude.ai/artifact/WHbiJLyLcGYMiu2Bddz8s4 (the same game, built with `node tools/artifact.js`).
- **Enemy guide artifact:** https://claude.ai/artifact/18YkQbSpHhSxGimJ2GmKNq (source in `artifacts/enemy-guide/`).
- **Upgrade guide artifact:** https://claude.ai/artifact/EALugShxKLeMhoE6pxT3TC (every booster and station module; written by `node tools/upgrade-guide.js` into `artifacts/upgrade-guide/`).
- **Repo:** `TheScootAI/swarmfall`. `main` is the live game, and ordinary changes go straight onto it.
- **Staging artifact:** https://claude.ai/artifact/TDjavC3eeknZRiZyJmQsWR. For a big change the owner should try before it goes live (the graphics upgrade was one), work on a branch, build with `node tools/artifact.js <out.html> "Swarmfall Staging"` and publish there. Merge into `main` only when the owner says so.

The `swarmfall-dev` skill (`.claude/skills/swarmfall-dev/`) has the step-by-step workflow for a change. Use it.

## What the owner wants from the game

These came from playtesting feedback; keep them unless the owner says otherwise.

- **Phone first.** Drag anywhere to steer and the ship fires on its own. Every screen must work at about 390px wide.
- **One hit ends a new ship's run.** Hull, shields and everything else are bought with scrap (station modules) or picked as boosters.
- **Colours carry meaning.** All enemy fire is the same red (`ENEMY_RED`), and nothing good is red. Anything good to grab sits in a pulsing blue halo: gold rings are scrap, green crosses repair hull.
- **Mites are the pawns.** They are the largest group in every wave and hold the front two rows. Stronger enemies sit behind them.
- **Pacing.** A booster shuttle comes after every 3rd wave (`DRAFT_EVERY`) and a boss on every 6th (`BOSS_EVERY`). After each boss the ship docks and gets the next station module (`UNLOCK_ORDER`).
- **Five bosses take turns** (`BOSSES`): the Hive Core on wave 6, the Fracture Cube on 12, the Beam Warden on 18, the Siege Beetle on 24, the Triad on 30, then round again, tougher. Each is built on an enemy the player has already met (splitter, lancer, beetle, triplet). The laser boss comes third because the owner set lancers to arrive at wave 15, so players have met lasers first.
- **Cutscenes always play out.** A touch or a key never skips the launch, the shuttle or the docking scene, because a player steering by touch has a finger on the screen as each one starts. (The launch could be skipped at first; the owner asked for that to stop.)
- **A boss dies big.** Its death is a scene of about 2.5 seconds (`FINALE`): game time slows to a fifth, smaller blasts follow the first, and a long deep boom plays (`SFX.core`). The camera does not move: a push-in on the boss was tried, and the owner said the slow motion is enough. The ship cannot be hit during the scene, nor for a blink afterwards (`FINALE.grace`), because it steers at a fifth of its speed while time is slow. The boss's shots are not removed: they carry on afterwards.
- **Sound.** Firing is silent on purpose, since a constant shooting sound was annoying. New sounds should be short and soft. The one long sound is a boss's death, which the owner asked to be longer and deeper.
- **How the owner tunes the game.** They leave comments on the guide artifacts ("start at wave 15"). When you change the game, update the tables, the guides and the README together.

## Where things are in `index.html`

The script is split into sections, each marked with a `// ---------- name ----------` comment.

| Section | What it holds |
|---|---|
| save | `meta`: scrap, records, mute, the graphics setting (`meta.gfx`, `meta.autoQ`), bought modules (`meta.up`) and fitted modules (`meta.mods`), all in localStorage. |
| audio | Web Audio synth: `tone()`, `noise()` and the `SFX` table. Phone unlock tricks are in `audioInit()`. |
| three.js stage | Renderer, lights and the reflection environment, `geo` and `M` (shared geometries and materials), the nebula backdrop, stars, particles (`burst`), effect pools (`ringFx`, `zapFx`), instanced shots, the player ship, station and shuttle models, post-processing (`draw()`, `GFX`), `resize()`. |
| game data | Every tuning table: `ET` (enemies), `UNLOCK` (when each enemy arrives), `UP` (boosters), `SHOP`, `GROUPS`, `START_MODS` and `UNLOCK_ORDER` (station modules), `SKIP_SCRAP`. |
| game state | `G` (the run), `P` (the ship), `S` (stats derived by `recalc()`). |
| enemies | Models, spawning, formation slots, entry paths, dives, missiles, lancers, the five bosses (`spawnBoss`, `updateBoss`, then `updateCore`, `updateCube`, `updateWarden`, `updateSiege`, `updateTriad`), and `buildWave()`. |
| player | Ship hit shape (`shipHit`), shields, shots, seekers, picking up scrap. |
| cutscenes | `CUTS` (durations), `startCut`, `updateCut`, docking at the station. A boss's death scene is separate: `FINALE` (its numbers) and `finaleStart`, `finaleStep`, next to `shake()`. |
| drawing | `syncScene()`: copies game state into the three.js scene once a frame. |
| UI | HUD, screens, booster choice (draft), the station shop, buttons. |
| feedback | The speech-bubble button that opens a prefilled GitHub issue. |
| input, loop | Keyboard, touch and mouse, then `frame()`. |

`G.state` is one of `title`, `browse` (the station between runs), `cut`, `play`, `clear` (the gap after a wave), `draft`, `station` (docked after a boss), `pause`, `dying` or `dead`.

## Conventions

- **Never remove from a live array mid-frame.** Set `dead = true` on enemies, shots and missiles. `sweepDead()` removes them once per frame. Code that runs inside a loop, such as a hit clearing nearby shots or a boss taking its swarm with it, must only set the flag.
- **No allocation in per-frame code.** Use the `parts`/`spareParts` particle pool, the ring and lightning pools, the shared `SLOT` from `slotPos()`, and colour constants such as `ENEMY_RED_RGB` and `HIT_RGB`. Never write colour arrays inline in a hot path. Share materials through `M` or a small cache; do not call `pbr()` per spawn.
- **Use the existing helpers.**
  - `hint(key, runs, title, line)` shows a first-time tip.
  - `despawn(e)` removes an enemy without a kill; `killEnemy(e)` is a kill.
  - `diveToLane()` sends several divers out spread across the screen.
  - `repair(k)` restores hull; `clearEnemyFire()` and `clearShotsNear()` remove enemy fire.
  - `pick()`, `turnToward()` and `wrapAngle()` are small maths helpers.
- **Tuning belongs in the tables**, not as `n >= 12` thresholds scattered through the code.
- **Bosses.** A boss is any enemy type whose `ET` entry has `boss: true`; test `e.def.boss`, never the type name.
  - A fight may have several bodies (the Fracture Cube's pieces, the Triad's three cores, which share one `hub` record for position, spin and attack timers). `G.boss` is any one live body, `bossLeft()` adds up the health of the whole fight for the bar, and `killEnemy()` runs the death scene, the scrap shower and `G.bossDown` only when the last body goes.
  - `bossLv(e)` is 0 the first time a boss is met, 1 the second, and so on: scale attacks by it, not by `e.tier`, which is already 2 or 3 at a later boss's first meeting. Health scales by tier.
  - A first-time `hint()` never shows on a late wave (nobody reaches wave 12 in their first runs). Put the one-line tip in the boss's `tip` in `BOSSES`; it shows under the name when the boss arrives.
  - How hard: the owner found the Fracture Cube and Beam Warden "a touch too easy" on first meeting, asked for mites to come down while the Warden's beams are on, and for bosses to do more each time they are met. First-meeting numbers and their growth per visit are in `CUBE`, `WARDEN`, `SIEGE` and `TRIAD`.
  - Design rules the owner's preferences imply: one attack of the boss's own to read at a time (its helpers may fly meanwhile); every attack leaves a safe place reachable within its warning time at base steering speed (240 a second); gaps between beams must clear the ship and its shield (`BEAM_HALF + SHIELD_R` each side); bodies stay out of the ship's rows unless the lane is marked first (the Siege Beetle's charge: two thin red lines, and it stops following the ship before it drops); the model must look as wide as its hit circle (`e.rad`).
  - A glowing part cannot be hidden behind another part: the glow pass draws glowing things alone. Hide it with `visible` (the Siege Beetle's core while its shell is shut).
  - A new boss needs: an `ET` entry, a line in `BOSSES`, a model branch in `buildEnemy()`, set-up in `spawnBoss()`, an `update…` function called from `updateBoss()`, a branch in the model-motion chain in `updateEnemies()`, checks in `smoke.js`, pictures in `shots.js`, a portrait, and a card in the enemy guide.
  - The Beam Warden's beams are `e.bm` and `e.beams`, not `e.laser`: that field marks a lancer everywhere.
- **Two clocks.** `frame()` passes game time (`dt`) to everything. It runs slow during a boss's death scene (`G.speed` is below 1). Anything that must keep real pace, such as shake fading or a scene's own timer, uses `realDt`. The camera is placed afresh every frame in `syncScene()` from `camBase`; never set its position anywhere else.
- **Graphics.** See the next section before touching anything that is drawn.
- **Debug handle.** `window.__swarmfall` exposes `G`, `P`, `S`, `meta`, `UNLOCK`, `BOSSES`, `SIEGE`, `GFX`, `FIN`, `camera`, `scene`, `recalc`, `nextWave`, `spawnEnemy`, `launchDive`, `fireMissile` and `spawnPick` for tests and the browser console. The game itself never uses it.
- **Writing for players.** Plain words, phone-sized lines, and every new enemy gets a `hint()` the first time it appears.

## Graphics

How a frame is drawn (`draw()`, the only place that renders; the loop, the paused frame and the feedback screenshot all call it):

1. Everything on the `GLOW` layer is drawn alone into a half-size buffer and blurred by the bloom pass.
2. The whole scene is drawn into a high-range buffer.
3. One last pass (`MIX_SHADER`) adds the blurred halos, a slight colour fringe that pulses with screen shake and darkened corners, then tone-maps to the screen.

Rules that follow from it:

- **Glow is chosen, not automatic.** A mesh glows if its material was made with `glowMat()` or wrapped in `glowing()` and the mesh was built with `part()`. Shots, sparks and lightning are put on the layer where they are created. Big bright shapes must not glow: blurred, they flood the screen and wash out the colours that carry meaning. That is why the laser's white core (`addMat`) has no halo and shockwave rings are a thin shader band.
- **Colour rules still decide everything.** After any change here, run `node tools/shots.js <dir> "gfx=high"` and look: enemy fire red, halos blue, scrap gold, nothing good red. The backdrop stays in blues, violets and teals.
- **Quality levels (`GFX.q`).** 2 is every effect, 1 is the same at a lower resolution, 0 is plain drawing with no post-processing. The player's setting is `meta.gfx` (`auto`, `high` or `low`, on the pause screen). On `auto`, `gfxWatch()` steps down when frames stay slower than about 26 a second and remembers it in `meta.autoQ`. It never steps up by itself. A phone in low-power mode runs at a steady 30, which must not count as slow. `?gfx=high` or `?gfx=low` in the address pins the level.
- **Level 0 must always work.** If the device cannot draw into high-range buffers, or setting up the effects throws, the game falls back to it.
- **Lights are fixed.** `ambient`, `sun`, `shipLight` and `flashLight` are always in the scene, on both layers. Adding or removing a light recompiles every material and stalls a frame. For an explosion call `flash(x, y, power)`.
- **Materials.** `pbr(colour, glowColour, metalness, roughness)` for solid faceted surfaces; they mirror `scene.environment`. `basic()` for flat colour, `addMat()` for light added to what is behind it, `glowMat()` for the same with a halo.
- **Your own shaders** must end with `#include <tonemapping_fragment>` and `#include <colorspace_fragment>`, or they come out wrong at level 0.
- **Colours.** three.js converts colours given as numbers or `Color` objects from screen colour to its working colour. Numbers written straight into a buffer (particles, stars) are not converted: pass them through `lin()` first.
- **A three.js name that is not in the bundle** (`THREE.Something is not a constructor`): add it to `tools/three-entry.js`, then `cd tools && node build-three.js`, and commit the new `vendor/three.min.js`.
- **Instanced shots:** set `im.count` and upload with `commitInst()`; other buffers with `uploadFirst()`.

Not done, on purpose: the WebGPU renderer and node materials. They cannot be run in the test sandbox, and phone support is still uneven.

## Testing

```
cd tools && npm install          # three.js, esbuild; Playwright and Chromium are already on the machine
node smoke.js [shots-dir]        # about 8 minutes; exits 1 on any failure
node shots.js <dir> "gfx=high"   # twenty fixed pictures for judging the look by eye; add `bosses` for only the boss ones
```

`smoke.js` uses headless Chromium in a phone viewport with software WebGL. It covers:

- A full run: launch, booster shuttle, Hive Core, docking, the station, death and reload.
- The four bosses after the Hive Core: each arrives on its wave, every attack happens, and destroying each leads to docking and a new module. Also: the cube breaks 1 to 2 to 4 with the bar following; a gap between the Warden's beams is safe and a beam is not; the Siege Beetle's shell lets 40% of a hit through shut and all of it open; losing a Triad core does not end the fight.
- Checks that each enemy first appears on the wave `UNLOCK` says.
- A stress run with every booster on, and pause.
- A boss's death scene: slow motion happens and the camera stays put, the ship cannot be hit during it, and speed is normal again before docking.
- Graphics: the setting button, that a real picture reaches the screen with every effect on, and that `auto` steps down on a slow device.

The main run uses `?gfx=low`, because software rendering makes the effects very slow. Frame rate on a real phone cannot be measured here; say so when it matters.

Passing tests cannot see colour or layout. After a change to rendering or UI, save screenshots (pass a directory) and look at them.

## Publishing

1. Commit and push to `main`. GitHub Pages redeploys within a minute.
2. Rebuild and republish the game artifact: `node tools/artifact.js <dir>/swarmfall.html`, then publish that file to the game artifact URL above with `root` set to `<dir>` and `files` mapping `vendor/three.min.js` (the script writes it beside the page).
3. If enemies, their timings or their numbers changed, update `artifacts/enemy-guide/index.html` and republish it with its `img/` files to the guide URL. Re-render the pictures with `node tools/portraits.js` if a model changed.
4. If a booster or station module changed (`UP`, `SHOP`, `UNLOCK_ORDER`, `START_MODS`, the odds in `rollCards()`, or what one does in `recalc()` and elsewhere), update its note in `tools/upgrade-guide.js` if its numbers changed, run `node tools/upgrade-guide.js`, and republish `artifacts/upgrade-guide/index.html` to the upgrade guide URL.
