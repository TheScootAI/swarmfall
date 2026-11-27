# Swarmfall

A roguelite swarm shooter for phones and desktops, built with three.js in a single `index.html`.

Enemy formations fly in, hold, and dive at you. You launch from a space station. After every third wave a booster shuttle pulls alongside with a choice of three boosters. Every sixth wave is a boss; destroy it and you fly back to the station, dock, and have a new module fitted. Scrap you collect upgrades those modules, and it carries over when your ship is destroyed.

## Play

Open `index.html` in a browser, or serve the folder with any static host (GitHub Pages works as is). The game has no build step. three.js r187 and its post-processing add-ons are bundled into `vendor/three.min.js`, so it also runs straight from disk with no network.

- **Touch:** drag anywhere to steer. The ship fires on its own.
- **Mouse:** the ship follows the cursor.
- **Keyboard:** ← → or A D to steer, 1 2 3 to pick a booster, P to pause, M to mute.
- **Graphics:** the pause screen has a Graphics button: auto (turns effects down by itself on a slow device), high or low.

"Restart run" on the pause screen ends the current run and launches a new one. "Start over" on the title screen erases all saved progress after a second tap.

## Test bench

A hidden screen for trying things out. On the title screen, tap the SWARMFALL name five times within three seconds (or press the backquote key, or add `?debug` to the address). Choose the wave to start on, any boosters, and whether the ship can be hit, then press Launch test. A test run saves nothing: no scrap, no records, no modules.

## Feedback

The speech-bubble button in the top-right corner opens a box for a bug or an idea. "Open on GitHub" is a link to this repository's new-issue page with the note filled in, plus one line about the run. Nothing is sent from the game; the note is posted only when the player presses GitHub's own button. During a run the box also offers a screenshot of the playfield to copy and paste into the issue.

## How a run works

- **One hit ends the run.** A new ship has a single hull point. Everything that makes it stronger is a choice about where your scrap and booster picks go: weapons to kill faster, armor to take more hits, shields to block hits and recharge, or specials such as drones and homing missiles.
- **New enemies are introduced.** The first time each kind of enemy or boss appears, the game slows to a stop for a moment, puts a spotlight on it and tells you what it does and what to do about it, then waits for you to touch the screen again before it carries on.
- **What to grab:** anything inside a pulsing blue halo. Gold rings are scrap; green crosses repair one hull. Everything else is a hit, and all enemy fire is red: balls, darts, missiles and laser beams.
- **Waves** grow in size and add enemy types: mites (the pawns: the largest group in every wave, holding the front two rows), wasps (fire fast darts while diving), weavers (from wave 5; zigzag), splitters (from wave 8; break into two mites when destroyed), triplets (from wave 13, after the second boss; break into three smaller copies that fan out across the screen when they leave the formation, so shoot them while they sit), lancers (one from wave 15, two from 20, three from 25; patrol above the top row from one side of the screen to the other, then stop, charge up and fire a laser beam down the screen that blocks a lane for a couple of seconds), beetles (from wave 10, taking over the top row from wave 13; armoured, launch homing missiles you can shoot down), and red-ringed elites (from wave 8; three times the health, extra scrap).
- **Bosses** take turns, one every sixth wave, and come back tougher. Each is built on an enemy you have already met.
  - The **Hive Core** (waves 6, 36, 66) sweeps the top with fans and rings of shots, missiles and released ships.
  - The **Fracture Cube** (12, 42, 72) breaks into two halves when destroyed, and each half into two quarters; every piece shoots, and the fight ends with the last one.
  - The **Beam Warden** (18, 48, 78) stops and fires fans of angled laser beams; thin red lines show where they will be, and you stand between them while mites dive down your lane.
  - The **Siege Beetle** (24, 54, 84) is armoured: most of every shot bounces off its shell. It fires missile salvos, then marks a lane and charges down it, and for a few seconds afterwards its shell is open and shots count in full.
  - The **Triad** (30, 60, 90) is three cores circling one centre. They fire aimed fans in turn and a slow pinwheel of shots, and each core destroyed makes the others spin and fire faster.
- **Boosters** last for one run. They come in three rarities and stack: fire rate, damage, extra barrels, piercing, ricochet, shields, drones, homing missiles, chain lightning, a flame cloud that burns what flies through it, a gas cloud that turns enemies on each other, a sentry satellite, a drone with a solid laser, and more.
- **Station modules** are permanent, upgraded with scrap, and saved in the browser's local storage. A new game has two, Tuned Cannons and Reinforced Hull. Each boss you destroy earns the next one (`UNLOCK_ORDER`), fitted when you dock. Modules fall under Weapons, Armor, Shields and Specials, plus Salvage. You can spend scrap at the station between runs or while docked after a boss.
- **Cutscenes** are short: leaving the station at the start of a run, the booster shuttle arriving, and docking after a boss. None of them can be skipped. When a boss is destroyed, time slows for about two and a half seconds while it blows apart; the ship cannot be hit while that plays.

## Tuning

All the numbers live in the "game data" section of the script in `index.html`:

- `UNLOCK`: the wave each enemy, and each change to the formation, first appears.
- `ET`: enemy stats.
- `UP`: boosters.
- `SHOP`, `GROUPS`, `START_MODS` and `UNLOCK_ORDER`: station modules, their costs and the order they are earned.
- `DRAFT_EVERY` and `BOSS_EVERY`: how often boosters and bosses come.
- `BOSSES`: the bosses in the order they take turns. `CUBE`, `WARDEN`, `SIEGE` and `TRIAD`: each later boss's numbers.
- `SKIP_SCRAP`: scrap for passing up a booster.
- `ENTER`: how much faster enemies fly into the formation each wave, and the limit.
- `FINALE`: a boss's death scene (length, how slow, how often the follow-up blasts come).

`recalc()` turns upgrades into ship stats, and `buildWave()` builds each formation. Cutscene timings are in `CUTS`.

## Development

There is no build for the game. Edit `index.html` and open it in a browser.

```
cd tools && npm install
node smoke.js [screenshot-dir]   # every test group in a headless phone browser (about 8 minutes); exits 1 on failure
node smoke.js --only core,intro  # only some groups; --list names them
node shots.js <dir> "gfx=high"   # twenty fixed pictures for judging the look by eye
node artifact.js [out.html]      # the copy of the game published as a claude.ai artifact
node portraits.js                # re-renders the enemy pictures for the guide
node build-three.js              # rebuilds vendor/three.min.js (after changing three-entry.js or the three.js version)
node upgrade-guide.js            # rewrites the booster and station module guide from the game's tables
```

The picture is drawn with glow on chosen objects (bloom), glossy materials that mirror a small environment, a nebula backdrop, an energy-bubble shield and two moving lights, then tone-mapped. `CLAUDE.md` explains the drawing steps and the rules for adding to them.

- `artifacts/enemy-guide/` is the source of the enemy guide page.
- `artifacts/upgrade-guide/` is the booster and station module guide, written by `tools/upgrade-guide.js`. Do not edit it by hand.
- `CLAUDE.md` has the code map and conventions.
- `.claude/skills/swarmfall-dev/` has the change, test and publish workflow.
