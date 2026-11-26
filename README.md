# Swarmfall

A roguelite swarm shooter for phones and desktops, built with three.js in a single `index.html`.

Enemy formations fly in, hold, and dive at you. You launch from a space station. After every third wave a booster shuttle pulls alongside with a choice of three boosters. Every sixth wave is a Hive Core boss; destroy it and you fly back to the station, dock, and have a new module fitted. Scrap you collect upgrades those modules, and it carries over when your ship is destroyed.

## Play

Open `index.html` in a browser, or serve the folder with any static host (GitHub Pages works as is). There is no build step. three.js r128 loads from cdnjs.

- **Touch:** drag anywhere to steer. The ship fires on its own.
- **Mouse:** the ship follows the cursor.
- **Keyboard:** ← → or A D to steer, 1 2 3 to pick a booster, P to pause, M to mute.

"Restart run" on the pause screen ends the current run and launches a new one. "Start over" on the title screen erases all saved progress after a second tap.

## Feedback

The speech-bubble button in the top-right corner opens a box for a bug or an idea. "Open on GitHub" is a link to this repository's new-issue page with the note filled in, plus one line about the run. Nothing is sent from the game; the note is posted only when the player presses GitHub's own button. During a run the box also offers a screenshot of the playfield to copy and paste into the issue.

## How a run works

- **One hit ends the run.** A new ship has a single hull point. Everything that makes it stronger is a choice about where your scrap and booster picks go: weapons to kill faster, armor to take more hits, shields to block hits and recharge, or specials such as drones and homing missiles.
- **What to grab:** anything inside a pulsing blue halo. Gold rings are scrap; green crosses repair one hull. Everything else is a hit, and all enemy fire is red: balls, darts, missiles and laser beams.
- **Waves** grow in size and add enemy types: mites (the pawns: the largest group in every wave, holding the front two rows), wasps (fire fast darts while diving), weavers (from wave 5; zigzag), splitters (from wave 8; break into two mites when destroyed), triplets (from wave 13, after the second Hive Core; break into three smaller copies that fan out across the screen when they leave the formation, so shoot them while they sit), lancers (one from wave 15, two from 20, three from 25; patrol above the top row from one side of the screen to the other, then stop, charge up and fire a laser beam down the screen that blocks a lane for a couple of seconds), beetles (from wave 10, taking over the top row from wave 13; armoured, launch homing missiles you can shoot down), and red-ringed elites (from wave 8; three times the health, extra scrap).
- **Boosters** last for one run. They come in three rarities and stack: fire rate, damage, extra barrels, piercing, ricochet, shields, drones, homing missiles, chain lightning, and more.
- **Station modules** are permanent, upgraded with scrap, and saved in the browser's local storage. A new game has two, Tuned Cannons and Reinforced Hull. Each Hive Core you destroy earns the next one (`UNLOCK_ORDER`), fitted when you dock. Modules fall under Weapons, Armor, Shields and Specials, plus Salvage. You can spend scrap at the station between runs or while docked after a boss.
- **Cutscenes** are short: leaving the station at the start of a run (a tap skips it), the booster shuttle arriving, and docking after a boss. When a Hive Core is destroyed, time slows and the camera pushes in on the explosion for about two and a half seconds; the ship cannot be hit while that plays.

## Tuning

All the numbers live in the "game data" section of the script in `index.html`:

- `UNLOCK`: the wave each enemy, and each change to the formation, first appears.
- `ET`: enemy stats.
- `UP`: boosters.
- `SHOP`, `GROUPS`, `START_MODS` and `UNLOCK_ORDER`: station modules, their costs and the order they are earned.
- `DRAFT_EVERY` and `BOSS_EVERY`: how often boosters and bosses come.
- `SKIP_SCRAP`: scrap for passing up a booster.
- `FINALE`: the Hive Core's death scene (length, how slow, how far the camera pushes in).

`recalc()` turns upgrades into ship stats, and `buildWave()` builds each formation. Cutscene timings are in `CUTS`.

## Development

There is no build. Edit `index.html` and open it in a browser.

```
cd tools && npm install
node smoke.js [screenshot-dir]   # plays a full run in a headless phone browser; exits 1 on failure
node artifact.js [out.html]      # the copy of the game published as a claude.ai artifact
node portraits.js                # re-renders the enemy pictures for the guide
node upgrade-guide.js            # rewrites the booster and station module guide from the game's tables
```

- `artifacts/enemy-guide/` is the source of the enemy guide page.
- `artifacts/upgrade-guide/` is the booster and station module guide, written by `tools/upgrade-guide.js`. Do not edit it by hand.
- `CLAUDE.md` has the code map and conventions.
- `.claude/skills/swarmfall-dev/` has the change, test and publish workflow.
