// Writes artifacts/upgrade-guide/index.html: every booster and every station module, with its numbers.
//   node tools/upgrade-guide.js
// Names, descriptions, levels, costs, the order modules are earned and the booster odds are read from the
// tables in index.html, so the page cannot list something the game does not have. The "numbers" line under
// each card is written by hand in NOTES below from recalc() and the code that uses each upgrade. When you
// change what an upgrade does, change its note here too, then run this again and republish the page.
const fs = require('fs'), path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const table = name => { const m = src.match(new RegExp('const ' + name + ' = (\\[[\\s\\S]*?\\n?\\]);')); if (!m) throw new Error('cannot find ' + name + ' in index.html'); return (0, eval)('(' + m[1] + ')'); };
globalThis.HULL_UPGRADES = +src.match(/\bHULL_UPGRADES = (\d+)/)[1];   // the UP table names it
const UP = table('UP'), SHOP = table('SHOP'), GROUPS = table('GROUPS'), START_MODS = table('START_MODS'), UNLOCK_ORDER = table('UNLOCK_ORDER'), RARITY = table('RARITY');
const CATEGORY = (0, eval)('(' + src.match(/const CATEGORY = (\{[^}]*\});/)[1] + ')');
const num = name => +src.match(new RegExp('\\b' + name + ' = (\\d+)'))[1];
const BOSS_EVERY = num('BOSS_EVERY'), SKIP_SCRAP = num('SKIP_SCRAP');
const SHUTTLE = (0, eval)('(' + src.match(/const SHUTTLE = (\{[^}]*\})/)[1] + ')');   // the waves the booster shuttle follows
// the odds line in rollCards(): [common, rare, prototype] weights for the booster after a boss, Head Start, and the shuttle
const W = src.match(/kind === 'boss' \? \[(\d+), (\d+), (\d+)\] : kind === 'head' \? \[(\d+), (\d+), (\d+)\] : \[(\d+), (\d+), (\d+) \+ Math\.min\((\d+), G\.wave\)\]/);
if (!W) throw new Error('the odds line in rollCards() has changed: update the pattern in tools/upgrade-guide.js');
const w = W.slice(1).map(Number), shuttleW = wave => [w[6], w[7], w[8] + Math.min(w[9], wave)];
const pct = ws => { const t = ws[0] + ws[1] + ws[2]; return ws.map(x => x ? Math.round(100 * x / t) + '%' : 'never'); };

// What each one does, in numbers. One entry for every id in UP and SHOP; the script stops if one is missing.
const NOTES = {
  // boosters
  rapid: 'Each level adds 20% of your base fire rate. A new ship fires 2.75 volleys a second; all 8 levels make that 7.2.',
  heavy: 'Each level adds 25% of your base damage. A shot does 10; all 8 levels make that 30.',
  thrust: 'Each level adds 15% steering speed. All 4 make the ship 60% quicker side to side.',
  plate: 'Each level adds 1 hull and repairs 1 on the spot. A ship can add 2 hull at the most, counting the station\'s Reinforced Hull: with that fitted, one Hull Plate is the limit; without it, two.',
  velocity: 'Each level adds 25% shot speed and 10% damage. All 4 double shot speed and add 40% damage.',
  magnet: 'Pickup reach grows from 42 to 102, 162, then 222: about five times as far at level 3.',
  patch: 'Repairs 2 hull now and nothing else. Only offered while your hull is damaged. No limit on how often.',
  twin: 'Level 1: every 3rd volley fires 1 extra shot. Level 2: every other volley fires 2 extra. Level 3: every volley fires 2 extra, so a one-barrel ship fires 3 shots a volley (4 with the Twin Mount module).',
  pierce: 'Each level lets a shot pass through 1 more enemy, up to 3. A shot bounces (Ricochet) only after its passes are used up.',
  shield: 'The first level gives a shield that absorbs one hit and comes back after 15 seconds. Each level after that takes 3.5 seconds off, as does owning the Aegis Generator module. Recharge never drops below 4 seconds.',
  drone: 'Each level adds 1 drone, up to 3 drones counting the Drone Bay module. A drone fires every 0.7 seconds for half your shot damage.',
  crit: 'Each level adds 15%: 60% of shots at level 4. A critical shot does 2.5× damage. Homing missiles never crit.',
  blast: 'One destroyed enemy in four explodes. The blast damages everything within 40, 45, then 50 units, for 50%, 60%, then 75% of your shot damage. An enemy destroyed by a blast does not explode itself, so one kill never sets off a chain.',
  rico: 'Each level is 1 bounce to another enemy, up to 2 bounces per shot.',
  flame: 'Every 7 seconds, then every 5.5, then every 4, the ship lobs a cloud of flame into the open lanes ahead of it, below the parked enemies. It hangs for 4.5 seconds. An enemy that flies through it burns while inside and for 3 seconds after, trailing flame and losing 6% of its full health a second (9% at level 2, 12% at level 3). Burning never takes an enemy below a tenth of its health: it weakens, your shots finish. Bosses burn at an eighth of that rate.',
  gas: 'Every 7 seconds, then every 5.5, then every 4, the ship lobs a gas cloud into the open lanes ahead of it, below the parked enemies. It hangs for 4.5 seconds. An enemy that flies through it is confused for 5 seconds: it gets no new weapon, but breaks off, chases the enemy furthest from it and rams it. The rammer is destroyed and its target loses half its health (3% for a boss). If the 5 seconds run out first it flies back to its place. Bosses and lancers cannot be confused.',
  sentry: 'The ship sets a satellite down 150 units ahead of it. It fires at the nearest enemy about twice a second (1.8, 2.2, then 2.6 shots a second) for 60% of your shot damage. It lasts 9, 11, then 13 seconds, takes 2, 3, then 4 enemy shots (a missile counts as two, and an enemy flying into it destroys it), and stops the shots that hit it. Nine seconds after it is gone, the next one deploys.',
  beam: 'A drone flies off your right wing. It only takes enemies in flight: one that has left the formation, or anything a boss lets loose. It takes missiles too, and burns one out of the air in about a third of a second. It never takes a boss, nor an enemy sitting in its place, and never a latcher that has clamped onto your ship. It picks the nearest and holds a thin yellow beam on it until that enemy is destroyed or goes back to its place, then rests for two seconds and moves to the next. The beam sets the enemy alight, and the fire does the damage: 0.9, 1.3, then 1.7 times your shot damage every second, and for 2 seconds more if the beam loses it.',
  scav: 'Each level adds 50%: double scrap at level 2. It multiplies with the Salvage Rig module.',
  missile: 'One missile every 1.7 seconds, then every 0.85, then every 0.57. Each does 2.5× your shot damage to its target and half of that to enemies close by.',
  chain: 'Each level adds 20%: 60% of hits at level 3. The lightning jumps to up to 2 enemies near the one you hit, for 70% of the shot\'s damage each.',
  over: 'Each level: +40% fire rate, +20% damage, and 1 less hull. Only offered while you have more than 1 hull.',
  slow: 'Each level slows enemy shots by 20%: 40% slower at level 2.',
  nova: 'When your hull takes a hit, every enemy shot on screen is wiped and every enemy takes 45 damage per level. A mite has 10 health on wave 1.',
  // station modules
  'm:dmg': '+10% damage per level: +50% with all 5.',
  'm:rate': '+6% fire rate per level: +30% with all 5.',
  'm:speed': '+8% bullet speed per level: +40% with all 5.',
  'm:twin': 'Every volley is 2 shots from the first wave. Split Barrel boosters add their extra shots to it.',
  'm:hull': '+1 hull: a new ship takes 1 hit and the 2nd ends the run. It has a single level. A ship can add 2 hull at the most, so one more can come from a Hull Plate booster.',
  'm:revive': 'The blow that would end the run leaves you on 1 hull instead, untouchable for 2.5 seconds, and blasts every enemy for 80 damage while wiping their shots.',
  'm:shield': 'The same shield as the Aegis Shell booster. With both, the recharge is 3.5 seconds shorter.',
  'm:charge': '2 seconds off the shield\'s recharge per level: 15 seconds down to 9 with all 3.',
  'm:sentry': 'A heavier satellite than the Sentry Satellite booster\'s, and both can be out together. Twin guns firing 2.6, 3, then 3.4 volleys a second at 90% of your shot damage each. It lasts 14, 17, then 20 seconds and takes 5, 7, then 9 enemy shots. Eight seconds after it is gone, the next one deploys.',
  'm:drone': 'One drone from the first wave. It fires every 0.7 seconds for half your shot damage. Wing Drone boosters add more, up to 3.',
  'm:missile': 'One homing missile every 1.7 seconds from the first wave. Seeker Pod boosters make them come faster.',
  'm:scrap': '+20% scrap per level: +60% with all 3.',
  'm:magnet': 'Pickup reach grows from 42 to 64, then 86.',
  'm:reroll': 'Each level is 1 more reroll per run. A reroll deals three new boosters of the same kind of offer.',
  'm:head': 'A free booster before the first wave. ' + (() => { const p = pct(w.slice(3, 6)); return p[0] + ' of the cards are common and ' + p[1] + ' rare; never a prototype.'; })(),
};
for (const u of UP) if (!NOTES[u.id]) throw new Error('no note for booster ' + u.id);
for (const m of SHOP) if (!NOTES['m:' + m.id]) throw new Error('no note for module ' + m.id);
for (const id of START_MODS.concat(UNLOCK_ORDER)) if (!SHOP.find(m => m.id === id)) throw new Error('unknown module in unlock order: ' + id);
if (START_MODS.length + UNLOCK_ORDER.length !== SHOP.length) throw new Error('START_MODS + UNLOCK_ORDER does not cover SHOP');

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const ord = n => n + (n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th');
const GROUP = {}; for (const g of GROUPS) GROUP[g[0]] = g[1];
const rarClass = ['common', 'rare', 'proto'];

const boosterCard = u => `
        <article class="item ${rarClass[u.r]}" id="booster-${u.id}">
          <div class="top"><h4>${esc(u.n)}</h4><span class="tag">${CATEGORY[u.c]}</span></div>
          <p class="says">${esc(Array.isArray(u.d) ? 'Extra shots on some volleys, then on all: see below.' : u.d)}</p>
          <div class="stats"><span>${RARITY[u.r]}</span><span>${u.max >= 99 ? 'No limit' : 'Up to <b>' + u.max + '</b> ' + (u.max === 1 ? 'level' : 'levels')}</span></div>
          <p class="detail">${esc(NOTES[u.id])}</p>
        </article>`;
const rarityBlurb = ['The everyday picks. Most cards you are offered are these.', 'New weapons and systems. These are what the booster after a boss is mostly made of.', 'The strongest and strangest. Rare early, a little more likely each wave.'];
const boosters = [0, 1, 2].map(r => { const list = UP.filter(u => u.r === r); return `
    <section class="band ${rarClass[r]}" aria-labelledby="h-r${r}">
      <div class="band-head"><h3 id="h-r${r}">${RARITY[r]}</h3><span>${list.length} boosters</span></div>
      <p class="note">${rarityBlurb[r]}</p>
      <div class="grid">${list.map(boosterCard).join('')}
      </div>
    </section>`; }).join('\n');

const order = START_MODS.map(id => ({ id, core: 0 })).concat(UNLOCK_ORDER.map((id, i) => ({ id, core: i + 1 })));
const moduleCard = ({ id, core }) => { const m = SHOP.find(x => x.id === id), total = m.cost.reduce((a, b) => a + b, 0); return `
      <div class="stop${core ? '' : ' start'}">
        <div class="rail"><div class="mark">${core ? '<small>BOSS</small>' + core : '<small>FROM THE</small>Start'}</div></div>
        <div class="body">
          <article class="item module" id="module-${m.id}">
            <div class="top"><h4>${esc(m.n)}</h4><span class="tag">${GROUP[m.g]}</span></div>
            <p class="says">${esc(m.d)}</p>
            <div class="stats"><span>${core ? 'Fitted after your <b>' + ord(core) + '</b> boss' : 'Fitted on a <b>new ship</b>'}</span><span>${m.cost.length === 1 ? '<b>1</b> level' : '<b>' + m.cost.length + '</b> levels'}</span><span class="gold">◆ <b>${total}</b>${m.cost.length > 1 ? ' in all' : ''}</span></div>
            ${m.cost.length > 1 ? '<ol class="levels" aria-label="Cost of each level">' + m.cost.map((c, i) => '<li><small>Level ' + (i + 1) + '</small>◆ ' + c + '</li>').join('') + '</ol>' : ''}
            <p class="detail">${esc(NOTES['m:' + m.id])}</p>
          </article>
        </div>
      </div>`; };
const allCost = SHOP.reduce((a, m) => a + m.cost.reduce((x, y) => x + y, 0), 0);
const lastSet = SHUTTLE.after[SHUTTLE.after.length - 1], shuttleWaves = [SHUTTLE.after[0], SHUTTLE.after[1], lastSet + SHUTTLE.every];   // the first two, and the first one past wave 10, where the odds stop moving
const oddsRow = (label, sub, ws) => `<tr><th scope="row">${label}<small>${sub}</small></th>${pct(ws).map((p, i) => '<td class="' + rarClass[i] + '">' + p + '</td>').join('')}</tr>`;

const html = `<title>Swarmfall Upgrade Guide</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Chakra+Petch:wght@500;700&family=Barlow:wght@400;500;600&display=swap">
<style>
/* Layout: one column in two halves. Boosters sit in three bands, one per rarity, coloured as their cards are in the game. Station modules hang off a rail in the order the bosses earn them. Written by tools/upgrade-guide.js: edit that, not this file. */
:root{
  --void:#080b1f; --panel:#121844; --panel-hi:#1b2260; --line:#2f3880;
  --ink:#eef0ff; --dim:#a8b0e2;
  --arc:#5fe8ff; --core:#ff4f8b; --gold:#ffc857; --violet:#c79bff;
  --display:'Chakra Petch','Trebuchet MS',system-ui,sans-serif;
  --body:'Barlow','Segoe UI',system-ui,sans-serif;
  color-scheme:dark;
}
*,*::before,*::after{box-sizing:border-box}
body{margin:0;background:var(--void);color:var(--ink);font:400 16px/1.5 var(--body);-webkit-font-smoothing:antialiased}
.wrap{max-width:760px;margin:0 auto;padding-block:40px 64px;padding-left:max(16px,env(safe-area-inset-left,0px));padding-right:max(16px,env(safe-area-inset-right,0px));display:flex;flex-direction:column;gap:40px}
h1,h2,h3,h4,p,ol{margin:0}
.eyebrow{font:700 .78rem/1 var(--display);letter-spacing:.2em;text-transform:uppercase;color:var(--arc)}
h1{font:700 clamp(2rem,8vw,3rem)/1 var(--display);letter-spacing:.04em;text-wrap:balance}
h1 b{color:var(--gold);font-weight:700}
h2{font:700 1.15rem/1.2 var(--display);letter-spacing:.12em;text-transform:uppercase}
.lede{color:var(--dim);max-width:60ch}
header,.part{display:flex;flex-direction:column;gap:14px}
.part{gap:22px}
.part-head{display:flex;flex-direction:column;gap:10px;border-top:2px solid var(--line);padding-top:22px}
.note{color:var(--dim);font-size:.95rem;max-width:62ch}
.note b{color:var(--ink);font-weight:600}

/* the two kinds, side by side */
.kinds{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:10px}
.kinds div{display:flex;flex-direction:column;gap:8px;padding:16px;background:var(--panel)}
.kinds h3{font:700 1.05rem/1.1 var(--display);letter-spacing:.06em;text-transform:uppercase}
.kinds .b h3{color:var(--arc)} .kinds .m h3{color:var(--gold)}
.kinds p{color:var(--dim);font-size:.95rem}
.kinds a{color:var(--ink)}

/* odds table */
.table-wrap{overflow-x:auto}
table{border-collapse:collapse;width:100%;font-variant-numeric:tabular-nums}
th,td{padding:10px 12px;text-align:right;border-bottom:1px solid var(--line)}
thead th{font:700 .72rem/1 var(--display);letter-spacing:.14em;text-transform:uppercase;color:var(--dim)}
th[scope=row]{text-align:left;font:600 1rem/1.25 var(--body)}
th small{display:block;font:400 .85rem/1.3 var(--body);color:var(--dim)}
td{font:700 1.05rem/1 var(--display)}
.common{--tone:var(--ink)} .rare{--tone:var(--arc)} .proto{--tone:var(--gold)}
td.common,td.rare,td.proto,thead th.common,thead th.rare,thead th.proto{color:var(--tone)}

/* rarity bands and cards */
.band{display:flex;flex-direction:column;gap:10px}
.band-head{display:flex;align-items:baseline;gap:12px;border-left:4px solid var(--tone);padding-left:10px}
.band-head h3{font:700 1.3rem/1 var(--display);letter-spacing:.08em;text-transform:uppercase;color:var(--tone)}
.band-head span{font:500 .8rem/1 var(--display);letter-spacing:.1em;text-transform:uppercase;color:var(--dim)}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,300px),1fr));gap:10px}
.item{display:flex;flex-direction:column;gap:9px;padding:14px;background:var(--panel);min-width:0}
.top{display:flex;align-items:baseline;justify-content:space-between;gap:10px}
.item h4{font:700 1.2rem/1.1 var(--display);letter-spacing:.03em;color:var(--tone,var(--ink))}
.tag{font:700 .66rem/1 var(--display);letter-spacing:.14em;text-transform:uppercase;color:var(--dim);white-space:nowrap}
.says{font-size:1rem}
.stats{display:flex;flex-wrap:wrap;gap:6px}
.stats span{padding:4px 8px;background:var(--panel-hi);font:500 .78rem/1.2 var(--display);letter-spacing:.04em;color:var(--dim);font-variant-numeric:tabular-nums}
.stats b{color:var(--ink);font-weight:700}
.stats .gold,.stats .gold b{color:var(--gold)}
.detail{color:var(--dim);font-size:.93rem;border-top:1px solid var(--line);padding-top:9px}

/* module rail */
.timeline{display:flex;flex-direction:column}
.stop{display:grid;grid-template-columns:72px minmax(0,1fr);gap:0 16px}
.rail{display:flex;flex-direction:column;align-items:center}
.mark{width:72px;padding:8px 0 7px;text-align:center;background:var(--core);color:#22061a;font:700 1.35rem/1 var(--display);font-variant-numeric:tabular-nums}
.mark small{display:block;margin-bottom:4px;font:700 .58rem/1 var(--display);letter-spacing:.16em}
.stop.start .mark{background:var(--panel-hi);color:var(--ink);font-size:1rem;letter-spacing:.06em;text-transform:uppercase}
.stop.start .mark small{color:var(--dim)}
.rail::after{content:"";flex:1;width:2px;background:var(--line);margin-top:6px}
.stop:last-child .rail::after{background:linear-gradient(var(--line),transparent)}
.body{padding-bottom:18px;min-width:0}
.module h4{color:var(--ink)}
.levels{list-style:none;padding:0;display:flex;flex-wrap:wrap;gap:6px}
.levels li{padding:6px 10px 7px;border:1px solid var(--line);font:700 .95rem/1 var(--display);color:var(--gold);font-variant-numeric:tabular-nums}
.levels small{display:block;margin-bottom:4px;font:500 .62rem/1 var(--display);letter-spacing:.12em;text-transform:uppercase;color:var(--dim)}

/* how they add up */
.sums{display:grid;grid-template-columns:auto minmax(0,1fr);gap:0 16px;margin:0}
.sums dt,.sums dd{padding:10px 0;border-bottom:1px solid var(--line);margin:0}
.sums dt{font:700 .78rem/1.5 var(--display);letter-spacing:.12em;text-transform:uppercase;color:var(--arc)}
.sums dd{color:var(--dim)} .sums dd b{color:var(--ink);font-weight:600}
footer{color:var(--dim);font-size:.85rem;border-top:1px solid var(--line);padding-top:16px}
a:focus-visible{outline:2px solid var(--gold);outline-offset:2px}

@media (max-width:480px){
  .stop{grid-template-columns:54px minmax(0,1fr);gap:0 12px}
  .mark{width:54px;font-size:1.15rem}
  .stop.start .mark{font-size:.8rem}
  .item{padding:12px}
  th,td{padding:10px 6px}
  thead th{letter-spacing:.06em;font-size:.66rem}
  td{font-size:.95rem}
  .sums{grid-template-columns:minmax(0,1fr)}
  .sums dt{border-bottom:0;padding-bottom:0}
  .sums dd{padding-top:2px}
}
</style>

<div class="wrap">
  <header>
    <p class="eyebrow">Swarmfall · field guide</p>
    <h1>Build the <b>ship</b></h1>
    <p class="lede">Everything that makes your ship stronger: all ${UP.length} boosters and all ${SHOP.length} station modules, with what each one really does in numbers.</p>
    <div class="kinds">
      <div class="b"><h3>Boosters</h3><p>Last for one run. A shuttle brings a choice of three after waves ${SHUTTLE.after.slice(0, -1).join(', ')} and ${lastSet}, then after every ${ord(SHUTTLE.every)} wave (${lastSet + SHUTTLE.every}, ${lastSet + 2 * SHUTTLE.every} and so on), and you get a stronger choice each time you leave the station after a boss. Passing on all three pays ◆ ${SKIP_SCRAP}.</p><p><a href="#boosters">${UP.length} boosters</a></p></div>
      <div class="m"><h3>Station modules</h3><p>Yours for good. A new ship has ${START_MODS.length}; each boss you destroy has the next one fitted. You raise their levels with scrap, at the station between runs or while docked.</p><p><a href="#modules">${SHOP.length} modules</a></p></div>
    </div>
  </header>

  <section class="part" id="boosters" aria-labelledby="h-boosters">
    <div class="part-head">
      <h2 id="h-boosters">Boosters</h2>
      <p class="note">Each of the three cards is drawn on its own, and the same booster never appears twice in one offer. A booster already at its top level is not offered again. If nothing of the drawn rarity is left, you get a card of another rarity.</p>
    </div>
    <div class="table-wrap">
      <table>
        <thead><tr><th scope="col" style="text-align:left">Chance for each card</th><th scope="col" class="common">${RARITY[0]}</th><th scope="col" class="rare">${RARITY[1]}</th><th scope="col" class="proto">${RARITY[2]}</th></tr></thead>
        <tbody>
          ${shuttleWaves.map((n, i) => oddsRow('Shuttle after wave ' + n + (i === shuttleWaves.length - 1 ? ' and later' : ''), i === 0 ? 'The first one you meet' : i === shuttleWaves.length - 1 ? 'Prototypes stop getting more likely here' : 'Prototypes are creeping up', shuttleW(n))).join('\n          ')}
          ${oddsRow('Leaving the station after a boss', 'After waves ' + BOSS_EVERY + ', ' + 2 * BOSS_EVERY + ', ' + 3 * BOSS_EVERY + ' and so on', w.slice(0, 3))}
          ${oddsRow('Head Start', 'The free pick before wave 1, if you own that module', w.slice(3, 6))}
        </tbody>
      </table>
    </div>
${boosters}
  </section>

  <section class="part" id="modules" aria-labelledby="h-modules">
    <div class="part-head">
      <h2 id="h-modules">Station modules</h2>
      <p class="note">In the order you get them. Bosses count across all your runs: the first one you ever destroy fits the first module, whichever boss and whichever wave it was. Buying every level of everything costs <b>◆ ${allCost.toLocaleString('en-US')}</b>.</p>
    </div>
    <div class="timeline">${order.map(moduleCard).join('')}
    </div>
  </section>

  <section class="part" aria-labelledby="h-sums">
    <div class="part-head">
      <h2 id="h-sums">How they add up</h2>
      <p class="note">Modules and boosters that raise the same thing multiply each other.</p>
    </div>
    <dl class="sums">
      <dt>Damage</dt><dd><b>10</b> a shot × Tuned Cannons × Heavy Rounds × Rail Coils × Overdrive</dd>
      <dt>Fire rate</dt><dd><b>2.75</b> volleys a second × Feed Mechanism × Rapid Feed × Overdrive</dd>
      <dt>Shot speed</dt><dd>Mass Driver × Rail Coils</dd>
      <dt>Hull</dt><dd><b>1</b> + Reinforced Hull + Hull Plate − Overdrive, never less than 1</dd>
      <dt>Shield</dt><dd><b>15</b> seconds to recharge, less 3.5 for each shield level past the first (Aegis Generator and Aegis Shell both count), less 2 for each Fast Recharge level, never under 4</dd>
      <dt>Scrap</dt><dd>Salvage Rig × Scavenger</dd>
      <dt>Shots per volley</dt><dd><b>1</b> + Twin Mount, plus Split Barrel's extra shots on the volleys its level gives them to</dd>
    </dl>
  </section>

  <footer>Taken from the game's own tables as of its latest version.</footer>
</div>
`;
const out = path.join(__dirname, '..', 'artifacts', 'upgrade-guide', 'index.html');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, html);
console.log('wrote', out, '·', UP.length, 'boosters,', SHOP.length, 'modules, ◆', allCost);
