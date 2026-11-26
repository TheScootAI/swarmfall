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

This installs three.js r128 so the tests run offline; the sandbox often blocks cdnjs. Playwright and Chromium are already on the machine.

## 2. Find the right place to change

- **When an enemy first appears:** edit the `UNLOCK` table only. `buildWave()` and the formation-fire code read it, and the smoke test checks the game follows it. Wave 6, 12, 18 and so on are Hive Core waves with no regular enemies. If the owner asks for one of those, put the wave after it in `UNLOCK` (the smoke test checks the first wave each enemy is actually seen), and tell them why.
- **Enemy stats** (health, speed, scrap chance): `ET`. Behaviour is in `updateDive()`, `updateLancer()`, `updateBoss()` and `launchDive()`.
- **Boosters** (in-run picks): `UP`, plus `recalc()` for how they change stats. Any one-off effect at the moment of picking goes in `applyUpgrade()`.
- **Station modules:** `SHOP` and `recalc()`. `UNLOCK_ORDER` sets which module each Hive Core earns, and `START_MODS` sets what a new save starts with. A module bought while docked applies at once in the `#shop` click handler.
- **Cutscene timing:** `CUTS`. Choreography is in `updateCut()`.
- **Sounds:** the `SFX` table. Keep them short and quiet, and call them through `limited()` if they can fire many times a second.
- **New enemy type:** it needs an entry in each of these, or it will throw every frame:
  - `ET`
  - a model branch in `buildEnemy()`
  - a rotation branch in the per-frame chain in `updateEnemies()` (the final `else` there is the boss)
  - a probability in `buildWave()` and an entry in `UNLOCK`
  - a `hint()` the first time it appears
  - a card in the enemy guide, and a portrait added to `tools/portraits.js`

## 3. Follow the conventions

These are in `CLAUDE.md`. The ones that bite most often:

- Removing things mid-frame. Flag `dead` and let `sweepDead()` remove them; never splice a live array.
- Allocating inside per-frame code.
- Colour: all enemy fire is `ENEMY_RED`, and nothing good may be red.
- The three.js r128 `setColorAt` buffer-size quirk.

## 4. Test

```
cd tools && node smoke.js /tmp/shots   # every check must PASS; screenshots land in /tmp/shots
```

- If you changed rendering, colours, HUD or any screen, open the screenshots and look at them; the checks cannot see colour.
- For a balance change, tell the owner it is untested by a person.
- For a behaviour the smoke test does not cover, add a check to `smoke.js`, not a throwaway script. Use `window.__swarmfall` (see `CLAUDE.md`) to set up the situation.
- `node --check tools/smoke.js` catches a broken test script before a 2-minute run. To check that the game's script parses without a browser:

```
node -e "const s=require('fs').readFileSync('index.html','utf8');new Function(s.match(/<script>\n([\s\S]*)<\/script>/)[1]);console.log('parses')"
```

## 5. Keep the docs in step

- `README.md` covers how a run works, the enemy list with arrival waves, and the tuning tables.
- `artifacts/enemy-guide/index.html` covers the timeline stops, the wave strip, hit counts and the "What hurts you" list.
  - **Hit counts:** `ceil(hp × (1 + 0.05 × (wave − 1)) × 1.3^floor(wave / 12) / 10)` at the wave the enemy first appears.
  - **Triplet copies:** 0.45 × the parent's health.
  - **Elites:** 3 × the health of the enemy they are built on.
- If a model changed, run `node tools/portraits.js` to regenerate the pictures.

## 6. Ship

1. Commit on `main` with a message that says what changed for the player and why, then push. That is the deploy to https://thescootai.github.io/swarmfall/.
2. Run `node tools/artifact.js <scratchpad>/swarmfall.html`, then publish that file to https://claude.ai/artifact/WHbiJLyLcGYMiu2Bddz8s4.
3. If the guide changed, copy `artifacts/enemy-guide/` to the scratchpad and publish its `index.html` to https://claude.ai/artifact/18YkQbSpHhSxGimJ2GmKNq. Pass `root` set to that folder and `files` mapping each `img/*.png`. Publishing reads only from the working directory or the scratchpad.

## 7. Owner comments on an artifact

- Read the threads with `ArtifactComments` (`action: "read"`).
- A comment's `[location]` and `[on text]` lines tell you which card or wave marker it sits on. A comment on a wave marker ("Start at wave 8") applies to the enemies introduced at that stop, except any that have their own comment.
- Make the change in the game, then update the guide and republish both.
- Reply on each thread that was sent to Claude, saying what changed (and any interpretation you made), then resolve it.
- Threads not sent to Claude cannot be replied to. Tell the owner they are still open.
