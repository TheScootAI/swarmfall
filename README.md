# Swarmfall

A roguelite swarm shooter for phones and desktops, built with three.js in a single `index.html`.

Enemy formations fly in, hold, and dive at you. After every third wave you pick one of three upgrades. Every sixth wave is a Hive Core boss, and beating it gives a pick from the rarer upgrades. When your ship is destroyed, the scrap you collected carries over, and you spend it in the hangar on permanent upgrades for the next run.

## Play

Open `index.html` in a browser, or serve the folder with any static host (GitHub Pages works as is). There is no build step. three.js r128 loads from cdnjs.

- **Touch:** drag anywhere to steer. The ship fires on its own.
- **Mouse:** the ship follows the cursor.
- **Keyboard:** ← → or A D to steer, 1 2 3 to pick an upgrade, P to pause, M to mute.

## Feedback

The speech-bubble button in the top-right corner opens a box for a bug or an idea. "Open on GitHub" is a link to this repository's new-issue page with the note filled in, plus one line about the run. Nothing is sent from the game; the note is posted only when the player presses GitHub's own button. During a run the box also offers a screenshot of the playfield to copy and paste into the issue.

## How a run works

- **One hit ends the run.** A new ship has a single hull point. Hull Plate upgrades during a run and Reinforced Hull in the hangar let you take more hits, but armour is heavy: every hull point past the first cuts fire rate by 10% (`HULL_DRAG`). Stay light and kill fast, or build a tank that kills slower. Reinforced Hull can be sold back in the hangar for what it cost.
- **What to grab:** anything inside a pulsing blue halo. Gold rings are scrap; green crosses repair one hull. Everything else is a hit, and enemy shots are red dots.
- **Waves** grow in size and add enemy types: mites, wasps (shoot while diving), weavers (zigzag), splitters (break into two mites), beetles (armoured, fire spreads), and red-ringed elites (three times the health, extra scrap).
- **Upgrades** come in three rarities and stack: fire rate, damage, extra barrels, piercing, ricochet, shields, drones, homing missiles, chain lightning, and more.
- **Hangar** upgrades are permanent and saved in the browser's local storage: hull, damage, fire rate, scrap gain, pickup range, rerolls, a free starting upgrade, and a once-per-run revive.

## Tuning

All the numbers live near the top of the script in `index.html`: `ET` (enemy stats), `UP` (run upgrades), `SHOP` (hangar upgrades and costs), `recalc()` (how upgrades turn into ship stats), `buildWave()` (wave size and enemy mix), and `DRAFT_EVERY` / `BOSS_EVERY` (how often upgrades and bosses come).
