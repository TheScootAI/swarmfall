# Swarmfall

A roguelite swarm shooter for phones and desktops, built with three.js in a single `index.html`.

Enemy formations fly in, hold, and dive at you. You launch from a space station. After every third wave a supply shuttle pulls alongside with a choice of three boosters. Every sixth wave is a Hive Core boss; destroy it and you fly back to the station, dock, and have a new module fitted. Scrap you collect upgrades those modules, and it carries over when your ship is destroyed.

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
- **Waves** grow in size and add enemy types: mites, wasps (fire fast darts while diving), weavers (zigzag), splitters (break into two mites), lancers (patrol above the top row from one side of the screen to the other, then stop, charge up and fire a laser beam down the screen that blocks a lane for a couple of seconds), beetles (armoured, launch homing missiles you can shoot down), and red-ringed elites (three times the health, extra scrap).
- **Boosters** last for one run. They come in three rarities and stack: fire rate, damage, extra barrels, piercing, ricochet, shields, drones, homing missiles, chain lightning, and more.
- **Station modules** are permanent, upgraded with scrap, and saved in the browser's local storage. A new game has two, Tuned Cannons and Reinforced Hull. Each Hive Core you destroy earns the next one (`UNLOCK_ORDER`), fitted when you dock. Modules fall under Weapons, Armor, Shields and Specials, plus Salvage. You can spend scrap at the station between runs or while docked after a boss.
- **Cutscenes** are short and a tap skips them: leaving the station at the start of a run, the shuttle arriving, and docking after a boss.

## Tuning

All the numbers live near the top of the script in `index.html`: `ET` (enemy stats), `UP` (boosters), `SHOP` (station modules and costs), `GROUPS` (module categories), `recalc()` (how upgrades turn into ship stats), `buildWave()` (wave size and enemy mix), and `DRAFT_EVERY` / `BOSS_EVERY` (how often boosters and bosses come).
