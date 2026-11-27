---
name: swarmfall-dev
description: How to make, test and ship a change to Swarmfall (the three.js swarm shooter in this repo). Use for any change to index.html, enemy timings or tuning, the enemy guide artifact, or when the owner leaves comments on either artifact.
---

# Making a change to Swarmfall

Read `CLAUDE.md` first. It has the code map, the owner's standing preferences and the conventions. This skill is the workflow.

## 1. Set up (once per session)

```
cd tools && npm install
```

This installs three.js and esbuild, which are only needed to rebuild `vendor/three.min.js`. The game and the tests load that bundled file, so nothing comes from a CDN. Playwright and Chromium are already on the machine.

## 2. Find the right place to change

- **When an enemy first appears:** edit the `UNLOCK` table only. `buildWave()` and the formation-fire code read it, and the smoke test checks the game follows it. Wave 6, 12, 18 and so on are boss waves with no regular enemies. If the owner asks for one of those, put the wave after it in `UNLOCK` (the smoke test checks the first wave each enemy is actually seen), and tell them why.
- **Enemy stats** (health, speed, scrap chance): `ET`. Behaviour is in `updateDive()`, `updateLancer()`, `updateBoss()` and `launchDive()`.
- **Bosses:** `BOSSES` sets their order, `ET` their health, `CUBE`, `WARDEN`, `SIEGE` and `TRIAD` the numbers of the four after the Hive Core. `CLAUDE.md` lists the rules a boss must follow and everything a new one needs.
- **Boosters** (in-run picks): `UP`, plus `recalc()` for how they change stats. Any one-off effect at the moment of picking goes in `applyUpgrade()`.
- **Station modules:** `SHOP` and `recalc()`. `UNLOCK_ORDER` sets which module each boss earns, and `START_MODS` sets what a new save starts with. A module bought while docked applies at once in the `#shop` click handler.
- **Cutscene timing:** `CUTS`. Choreography is in `updateCut()`. A boss's death scene (slow motion and follow-up blasts; no camera move, at the owner's request) is `FINALE` and the `finale…` functions.
- **Anything drawn** (materials, glow, lights, backdrop, effects): read the Graphics section of `CLAUDE.md` first. A three.js name missing from the bundle goes in `tools/three-entry.js`, then `node tools/build-three.js`.
- **Sounds:** the `SFX` table. Keep them short and quiet, and call them through `limited()` if they can fire many times a second.
- **New enemy type:** it needs an entry in each of these, or it will throw every frame:
  - `ET`
  - a model branch in `buildEnemy()`
  - a rotation branch in the per-frame chain in `updateEnemies()` (the final `else` there is the Hive Core)
  - a probability in `buildWave()` and an entry in `UNLOCK`
  - its introduction: two lines in `INTRO_TEXT` and its name in `INTRO_NAME`
  - a card in the enemy guide, and a portrait added to `tools/portraits.js`

## 3. Follow the conventions

These are in `CLAUDE.md`. The ones that bite most often:

- Removing things mid-frame. Flag `dead` and let `sweepDead()` remove them; never splice a live array.
- Allocating inside per-frame code.
- Colour: all enemy fire is `ENEMY_RED`, and nothing good may be red.
- Glow: only things meant to glow go on the `GLOW` layer, and big bright shapes never do.

## 4. Test

Choose the test groups to fit the change. Do not run everything for a small one: the owner asked for that, because it made every request wait eight minutes.

```
cd tools
node smoke.js --only core,bosses /tmp/shots   # the groups you need; screenshots land in /tmp/shots
node smoke.js /tmp/shots                      # every group, about 8 minutes
node smoke.js --list
```

- **Always `core`** (40 seconds). Add the groups for what you touched. The table and the rules for choosing are under "Testing" in `CLAUDE.md`.
- **Every group** after a change to shared code (the loop, enemy updates, damage and kills, saving, the screens, input), whenever you are unsure what a change can reach, and before a branch is merged.
- Say in your report which groups you ran.
- Every check must PASS. If you changed rendering, colours, HUD or any screen, also run `node shots.js <dir> "gfx=high"` and look at the pictures; the checks cannot see colour. Compare with the pictures from before your change.
- Frame rate on a phone cannot be measured in the sandbox. Tell the owner when a change could cost speed.
- For a balance change, tell the owner it is untested by a person, and how to reach it on the test bench (five taps on the title: pick the wave and boosters, Launch test).
- For a behaviour the tests do not cover, add a check to the right group in `smoke.js` (or a new group), not a throwaway script. Use `window.__swarmfall` (see `CLAUDE.md`) to set up the situation. A group must stand alone: it starts from `open()` with a new save.
- `node --check tools/smoke.js` catches a broken test script before a run. To check that the game's script parses without a browser:

```
node -e "const s=require('fs').readFileSync('index.html','utf8');new Function(s.match(/<script>\n([\s\S]*)<\/script>/)[1]);console.log('parses')"
```

## 5. Keep the docs in step

- `README.md` covers how a run works, the enemy list with arrival waves, and the tuning tables.
- `artifacts/upgrade-guide/index.html` lists every booster and station module. It is written by `node tools/upgrade-guide.js` from the game's tables; the sentence of numbers under each card is in `NOTES` in that script, so update the note when you change what an upgrade does. The script stops if a booster or module has no note.
- `artifacts/enemy-guide/index.html` covers the timeline stops, the wave strip, hit counts and the "What hurts you" list.
  - **Hit counts:** `ceil(hp × (1 + 0.05 × (wave − 1)) × 1.3^floor(wave / 12) / 10)` at the wave the enemy first appears.
  - **Triplet copies:** 0.45 × the parent's health.
  - **Elites:** 3 × the health of the enemy they are built on.
- If a model changed, run `node tools/portraits.js` to regenerate the pictures.

## 6. Ship

1. Commit on `main` with a message that says what changed for the player and why, then push. That is the deploy to https://thescootai.github.io/swarmfall/.
2. Run `node tools/artifact.js <scratchpad>/swarmfall.html`, then publish that file to https://claude.ai/artifact/WHbiJLyLcGYMiu2Bddz8s4 with `root` set to its folder and `files` mapping `vendor/three.min.js`.
   - **A trial for the owner** goes on a branch and a separate artifact, never the live one: build to a different file with a title (`node tools/artifact.js <scratchpad>/staging/index.html "Swarmfall Staging"`) and publish it as its own artifact.
3. If a booster or module changed, run `node tools/upgrade-guide.js`, copy `artifacts/upgrade-guide/index.html` to the scratchpad and publish it to https://claude.ai/artifact/EALugShxKLeMhoE6pxT3TC.
4. If the enemy guide changed, copy `artifacts/enemy-guide/` to the scratchpad and publish its `index.html` to https://claude.ai/artifact/18YkQbSpHhSxGimJ2GmKNq. Pass `root` set to that folder and `files` mapping each `img/*.png`. Publishing reads only from the working directory or the scratchpad.

## 7. Owner comments on an artifact

- Read the threads with `ArtifactComments` (`action: "read"`).
- A comment's `[location]` and `[on text]` lines tell you which card or wave marker it sits on. A comment on a wave marker ("Start at wave 8") applies to the enemies introduced at that stop, except any that have their own comment.
- Make the change in the game, then update the guide and republish both.
- Reply on each thread that was sent to Claude, saying what changed (and any interpretation you made), then resolve it.
- Threads not sent to Claude cannot be replied to. Tell the owner they are still open.
