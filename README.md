# Swarmfall

A roguelite swarm shooter for phones and desktops, built with three.js in a single `index.html`.

Enemy formations fly in, hold, and dive at you. After every third wave you pick one of three upgrades. Every sixth wave is a Hive Core boss, and beating it gives a pick from the rarer upgrades. When your ship is destroyed, the scrap you collected carries over, and you spend it in the hangar on permanent upgrades for the next run.

## Play

Open `index.html` in a browser, or serve the folder with any static host (GitHub Pages works as is). There is no build step. three.js r128 loads from cdnjs.

- **Touch:** drag anywhere to steer. The ship fires on its own.
- **Mouse:** the ship follows the cursor.
- **Keyboard:** ← → or A D to steer, 1 2 3 to pick an upgrade, P to pause, M to mute.

## How a run works

- **Waves** grow in size and add enemy types: mites, wasps (shoot while diving), weavers (zigzag), splitters (break into two mites), beetles (armoured, fire spreads), and gold-ringed elites.
- **Upgrades** come in three rarities and stack: fire rate, damage, extra barrels, piercing, ricochet, shields, drones, homing missiles, chain lightning, and more.
- **Hangar** upgrades are permanent and saved in the browser's local storage: hull, damage, fire rate, scrap gain, pickup range, rerolls, a free starting upgrade, and a once-per-run revive.

## Tuning

All the numbers live near the top of the script in `index.html`: `ET` (enemy stats), `UP` (run upgrades), `SHOP` (hangar upgrades and costs), `recalc()` (how upgrades turn into ship stats), `buildWave()` (wave size and enemy mix), and `DRAFT_EVERY` / `BOSS_EVERY` (how often upgrades and bosses come).
