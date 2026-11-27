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
- **Main buttons never scroll away, and a screen says when it has more.** Every screen ends in a bar holding its main buttons (`.dockbar`). When a screen is taller than the phone, the bar stays at the bottom while the rest scrolls under it, and a "More below" tab shows until the screen has been scrolled to its end (`fitScreens()`, `moreHint()`). The owner asked for this on every screen after twice missing things below the fold at the station. A new screen needs a `.dockbar` with a `.more` button in it, and its id in `screens`.
- **One hit ends a new ship's run.** Hull, shields and everything else are bought with scrap (station modules) or picked as boosters.
- **Colours carry meaning.** All enemy fire is the same red (`ENEMY_RED`), and nothing good is red. Anything good to grab sits in a pulsing blue halo: gold rings are scrap, green crosses repair hull.
- **New enemies are introduced.** The first time a kind of enemy (or a boss) takes its place, the game slows quickly to a stop, the field dims but for a white spotlight ring on that enemy, and a card gives its name, what it does and what to do (`INTRO`, `INTRO_TEXT`). It stays until the player touches the screen afresh (lifts the finger and puts it down again: the owner's "press fire to continue"), then the game speeds quickly back up and that touch steers as usual. Two earlier versions were turned down: a "Got it" button, and a card that went by itself after a second and a half. Once per kind per save (`meta.seen`). The ring is white because a blue one would read as a pickup's halo.
- **Mites are the pawns.** They are the largest group in every wave and hold the front two rows. Stronger enemies sit behind them.
- **Darts lean toward the ship** a little as they fly (`DART`), so they do not always come straight down. Each dart may turn about 6 degrees in all, so a sidestep still clears it.
- **A boss's scrap arrives in a line.** Each ring of the shower flies to the ship at its own speed (`sp` on the pickup), so they are collected one after another.
- **Clouds sit in the open lanes, and enemies have to fly through them.** A cloud is lobbed between the formation and the ship, never up among the parked enemies (the owner asked for this of the gas cloud; the flame cloud follows the same rule).
- **Confusion gives no new ability.** A confused enemy breaks off, chases the enemy furthest from it and rams it: the rammer is destroyed and its target loses half its health. The owner rejected an earlier version in which confused enemies shot at each other.
- **Flame Cloud weakens and never finishes an enemy off** (the owner: "just want it to weaken them slowly"). It takes a share of the enemy's own health, so it means the same on wave 3 and wave 30.
- **Sentry satellites come in two strengths**, as the owner asked: a simple one from a booster (Sentry Satellite) and a tougher, twin-gun one from a station module that levels up (Sentry Platform). Both can be out at once. A satellite can be shot down and runs out after a set time.
- **Your own beams and shots are never red.** The Laser Drone's beam is violet with a white core.
- **One richer ring, not several, mid-wave.** An elite or a beetle, which pay more than 1 scrap, drop a single ring worth more, a little larger with a gem at its centre (`worth` on the pickup): the owner found the field too full of rings. **A boss's scrap is the exception**: a shower of single rings, as many as it pays. The owner: "it is fine to have lots of scrap. Those should be single pieces because they do not get in the way."
- **Released ships must not fly in straight lines.** Ships a boss releases spread to lanes on their first pass, then each comes back from a new place, at its own pace, weaving, and aiming a little off the ship (`looseFlight`). The owner: "they need a little randomness to their flights".
- **Sound must survive a pause.** The owner lost sound after pausing. Two guards: the sound switch is no longer beside Resume on the pause screen, and `audioInit()` restarts audio that a phone stopped or left silently stuck while the page was away (`audioStale`). This cannot be tested without a real phone.
- **Waves gather faster as they go.** Enemies fly into the formation 5% faster each wave (`ENTER`), levelling off at 2.5 times the first wave's pace.
- **More enemies in a wave, as reinforcements (on trial on the `more-enemies` branch).** The owner asked to try levels with more enemies. The formation itself cannot usefully grow past 8 by 5: a ninth column leaves it no room to sway, and a sixth row reaches the lanes the clouds are lobbed into on a short phone. So from wave 2, when the formation is down to 35% of its places a fresh flight fills up to half of them, under the words "INCOMING: Reinforcements" (one long word would not fit a narrow phone); from wave 10 there are two flights (`SWARM`, `queueFlight`, `reinforce`). Wave 1 and boss waves have none. A flight is built by the same code as the formation, so `UNLOCK`, mites in the front two rows and three elites a wave all still hold. A wave is not cleared while a flight is still to come (`G.flights`).
- **Two seconds between waves.** After a wave's last enemy goes, the next wave waits 2 seconds (`CLEAR.wave`; the owner asked for 2, up from 1.1). `CLEAR.boss` is the same wait after a boss, before docking.
- **The beetle is a threat.** The owner asked for the ordinary beetle to be "a bit tougher" and to "shoot its missiles quicker": 85 health (13 hits on wave 10) and its two missiles 0.8 seconds apart (`missiles`, `missileGap` in `ET.beetle`).
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
| game data | Every tuning table: `ET` (enemies), `UNLOCK` (when each enemy arrives), `UP` (boosters), `SHOP`, `GROUPS`, `START_MODS` and `UNLOCK_ORDER` (station modules), `SKIP_SCRAP`, `SWARM` (formation size and reinforcements), `CLEAR` (the wait after a wave), `ENTER` (how fast enemies fly into formation), `DART`, `CLOUD` (the gas and flame cloud boosters), `SENTRY` (the satellites), `LASER` (the Laser Drone), `BOSSES` and each boss's table, `FINALE`. |
| game state | `G` (the run), `P` (the ship), `S` (stats derived by `recalc()`). |
| enemies | Models, spawning, formation slots, entry paths, reinforcement flights (`queueFlight`, `reinforce`), dives, missiles, lancers, the five bosses (`spawnBoss`, `updateBoss`, then `updateCore`, `updateCube`, `updateWarden`, `updateSiege`, `updateTriad`), and `buildWave()`. |
| player | Ship hit shape (`shipHit`), shields, shots, seekers, sentry satellites (`sats`, `updateSats`), the Laser Drone (`updateLaser`), the cloud boosters (`launchCloud`, `updateClouds`, `afflicted` for a burning enemy, `confuse` and `updateRam` for a confused one), picking up scrap. |
| cutscenes | `CUTS` (durations), `startCut`, `updateCut`, docking at the station. A boss's death scene is separate: `FINALE` (its numbers) and `finaleStart`, `finaleStep`, next to `shake()`. |
| drawing | `syncScene()`: copies game state into the three.js scene once a frame. |
| UI | HUD, screens, booster choice (draft), the station shop, buttons. |
| enemy introductions | `INTRO` (timings), `INTRO_TEXT` and `INTRO_NAME` (the words), `introScan`, `introShow`, `introStep`. |
| test bench | The hidden screen for trying things out (`DBG`, `drawDebug`, `openDebug`), and what makes a test run different (`G.test`, `G.god`). |
| feedback | The speech-bubble button that opens a prefilled GitHub issue. |
| input, loop | Keyboard, touch and mouse, then `frame()`. |

`G.state` is one of `title`, `browse` (the station between runs), `cut`, `play`, `clear` (the gap after a wave), `draft`, `station` (docked after a boss), `pause`, `dying` or `dead`.

## The test bench

A hidden screen the owner uses to try things on their phone. Open it from the title: tap SWARMFALL five times within three seconds, press the backquote key, or add `?debug` to the address.

- It sets the wave to start on (with one-tap choices for each boss), any boosters at any level, any station modules at any level (for the test only: `testMods` stands in for the save's levels through `mlv()`), "ship cannot be hit", and "Introduce enemies" (off by default, so testing is not interrupted; on, a test run introduces each kind the first time it appears in that run, whatever the save has seen).
- A run launched from it is a **test run** (`G.test`): nothing it earns is saved. No scrap is banked, no records change, a destroyed boss fits no module, and nothing can be bought while docked. "Test again" and "Restart run" repeat the same test.
- Three buttons on it do change the real save, and say so: add 1000 scrap, fit every module, and introduce every enemy again (clears `meta.seen`).
- What was chosen is remembered in localStorage under `swarmfall.debug`, apart from the save.
- **When you add something the owner will want to try** (a booster, a boss, an enemy), make sure the bench can reach it. Boosters, station modules and bosses appear on it by themselves, from `UP`, `SHOP` and `BOSSES`. Anything else new (an enemy, a setting) needs adding by hand, and the owner will ask whether it was.

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
- **Debug handle.** `window.__swarmfall` exposes `G`, `P`, `S`, `meta`, `ET`, `UNLOCK`, `BOSSES`, `CLEAR`, `SWARM`, `SIEGE`, `DART`, `CLOUD`, `SENTRY`, `LASER`, `SH`, `sats`, `clouds`, `launchCloud`, `GFX`, `FIN`, `camera`, `scene`, `recalc`, `nextWave`, `spawnEnemy`, `launchDive`, `fireMissile` and `spawnPick` for tests and the browser console. The game itself never uses it.
- **Writing for players.** Plain words, phone-sized lines. Every new enemy and boss gets an introduction: two short lines in `INTRO_TEXT` (what it does, then what to do about it), and for an ordinary enemy its name in `INTRO_NAME`. `hint()` is still used for things that are not enemies (scrap, repair, missiles).

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
cd tools && npm install              # three.js, esbuild; Playwright and Chromium are already on the machine
node smoke.js --only core,intro      # only these groups
node smoke.js                        # every group: about 8 minutes; exits 1 on any failure
node smoke.js --list                 # the groups
node shots.js <dir> "gfx=high"       # fixed pictures for judging the look by eye; add `bosses` for only the boss and cloud ones
```

`smoke.js` uses headless Chromium in a phone viewport with software WebGL. Its checks are in named groups. Each group opens its own fresh browser with a new save, so any group runs alone and in any order.

| Group | Seconds | What it covers |
|---|---|---|
| `core` | 45 | A whole run: launch, the 2-second wait between waves, the booster shuttle and its hold, a booster and the hand-over, the Hive Core and its death scene, the scrap shower, docking, the station, death, reload. |
| `waves` | 10 | Each enemy first appears on the wave `UNLOCK` says; how fast they fly in; the order of the bosses; the beetle's health and the time between its missiles; reinforcement flights. |
| `bosses` | 180 | The Fracture Cube, Beam Warden, Siege Beetle and Triad: each arrives on its wave, every attack happens, its special rules hold, and destroying it leads to docking and a new module. Also the station's bottom bar and "More below". |
| `clouds` | 40 | Flame Cloud weakens and never destroys; a confused enemy chases and rams, with no new weapon; clouds go into the lanes; a dart leans a little and a sidestep clears it. |
| `released` | 30 | Ships a boss releases: lanes on the first pass, then new places, paces and lines. |
| `sentry` | 20 | Sentry satellites (the booster's and the station module's) and the Laser Drone. |
| `stress` | 35 | Every booster at once on late waves; pause; the Graphics button. |
| `gfx` | 20 | Every effect on and a real picture on screen; `auto` steps down on a slow device. |
| `bench` | 40 | The test bench: the secret gesture, choosing a wave, boosters and modules, a test run leaving the save untouched, `?debug`. |
| `intro` | 50 | Enemy introductions: the slow-down and speed-up, the frozen game, the card staying until a fresh touch, once per kind per save, the bench's switch. |
| `small` | 15 | A short phone (iPhone SE size): every screen keeps its main buttons on screen and says when there is more. |

**Which groups to run.** The owner asked for the tests to be chosen to fit the change, since running everything every time made every small request wait eight minutes.

- **Always `core`.** It is 40 seconds and plays the whole loop.
- **A small, contained change** (wording, a number in a table, one booster, one boss, one screen's layout): `core` plus the groups for what you touched. A number in `CUBE` is `core,bosses`; a booster's numbers are `core,stress` and its own group if it has one; a screen's styles are `core,small`; an enemy's arrival wave is `core,waves`.
- **Every group**, when the change is to code everything shares: `frame()`, `updateGame()`, `updateEnemies()`, `damageEnemy()` and `killEnemy()`, saving and loading, `show()` and the screens' shared styles, input handling, the three.js stage. Also when you are not sure what a change can reach.
- **Every group before a branch is merged**, and after any change to `smoke.js` itself.
- When you ran only some groups, say which in your report, so the owner knows what was and was not checked.

A new feature gets its checks in the group it belongs to, or a new group (add it to `GROUPS` and `ABOUT` in `smoke.js`, and to the table above). A group must not depend on another having run: start from `open()`, and set up whatever the checks need.

Every test page but the `intro` group's switches enemy introductions off with `?intro=off`, as `shots.js` and `portraits.js` do, and all but the `gfx` group's use `?gfx=low`, because software rendering makes the effects very slow. Frame rate on a real phone cannot be measured here; say so when it matters.

Passing tests cannot see colour or layout. After a change to rendering or UI, save screenshots (pass a directory) and look at them.

## Publishing

1. Commit and push to `main`. GitHub Pages redeploys within a minute.
2. Rebuild and republish the game artifact: `node tools/artifact.js <dir>/swarmfall.html`, then publish that file to the game artifact URL above with `root` set to `<dir>` and `files` mapping `vendor/three.min.js` (the script writes it beside the page).
3. If enemies, their timings or their numbers changed, update `artifacts/enemy-guide/index.html` and republish it with its `img/` files to the guide URL. Re-render the pictures with `node tools/portraits.js` if a model changed.
4. If a booster or station module changed (`UP`, `SHOP`, `UNLOCK_ORDER`, `START_MODS`, the odds in `rollCards()`, or what one does in `recalc()` and elsewhere), update its note in `tools/upgrade-guide.js` if its numbers changed, run `node tools/upgrade-guide.js`, and republish `artifacts/upgrade-guide/index.html` to the upgrade guide URL.
