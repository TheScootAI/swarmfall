// End-to-end tests for Swarmfall in a phone-sized headless browser, in named groups.
//   cd tools && npm install
//   node smoke.js                          every group: about 10 minutes
//   node smoke.js --only core,intro        only these groups
//   node smoke.js --list                   the groups and what each covers
//   node smoke.js /tmp/shots [--only ...]  also save screenshots there
// Exits 1 if any check fails. Each group opens its own fresh browser (a new save) and drives the real game through
// its debug handle (window.__swarmfall), so groups can be run alone and in any order.
//
// Which to run: see "Testing" in CLAUDE.md. In short: `core` plus the groups for what you touched after a small,
// contained change; every group after a change to shared code (the loop, enemies, saving, the screens) and
// before anything is merged.
//
// The game loads three.js from vendor/three.min.js, so nothing is fetched. WebGL runs on SwiftShader, so it
// works without a GPU.
const { chromium, devices } = require('playwright');
const fs = require('fs'), path = require('path');
const GAME = path.join(__dirname, '..', 'index.html');
const ARGS = process.argv.slice(2), flag = name => { const i = ARGS.findIndex(a => a === name || a.startsWith(name + '=')); if (i < 0) return null; const a = ARGS[i]; return a.includes('=') ? a.split('=')[1] : ARGS[i + 1] || ''; };
const ONLY = flag('--only'), OUT = ARGS.find((a, i) => !a.startsWith('--') && ARGS[i - 1] !== '--only');

let failures = 0, browser = null;
const errors = [];
const check = (ok, label, detail = '') => { console.log((ok ? 'PASS ' : 'FAIL ') + label + (detail ? '  — ' + detail : '')); if (!ok) failures++; };

// A fresh phone-sized browser with a new save, on the game with the effects and the enemy introductions off
// (software rendering is slow, and an introduction would stop the game mid-test), and the helpers that drive it.
async function open(query = '?gfx=low&intro=off', device = 'iPhone 13') {
  const page = await (await browser.newContext({ ...devices[device] })).newPage();
  page.on('pageerror', e => errors.push(e.message + ' ' + ((e.stack || '').split('\n')[1] || '')));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.route('**/fonts.googleapis.com/**', r => r.fulfill({ body: '', contentType: 'text/css' }));
  const shot = async name => { if (OUT) { fs.mkdirSync(OUT, { recursive: true }); await page.screenshot({ path: path.join(OUT, name + '.png') }); } };

  const st = () => page.evaluate(() => { const s = window.__swarmfall; return { state: s.G.state, cut: s.G.cut && s.G.cut.kind, wave: s.G.wave, mods: s.meta.mods.join(','), scrap: s.meta.scrap }; });
  const waitFor = async (pred, ms = 30000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const s = await st(); if (pred(s)) return s; await page.waitForTimeout(40); } return st(); };
  // Destroys whatever is on screen (waiting for the Hive Core to finish its entrance) and keeps the ship safe.
  const clearWave = () => page.evaluate(() => { const s = window.__swarmfall; s.P.inv = 9; s.G.eb.length = 0; s.G.em.length = 0;
    if (s.G.wave % 6 === 0) { if (!s.G.boss || s.G.boss.intro > 0) return; } else s.G.queue.length = 0;
    for (const e of s.G.enemies) { e.z = 0; s.G.pb.push({ x: e.x, y: e.y, vx: 0, vy: 0, dmg: 1e7, pierce: 0, rico: 0, crit: false, kind: 0, hit: null, dead: false }); } });
  const playTo = async target => { for (let i = 0; i < 400; i++) { const s = await st(); if (target(s)) return s; if (s.state === 'play') await clearWave(); await page.waitForTimeout(120); } return st(); };
  await page.goto('file://' + GAME + query); await page.waitForTimeout(600);
  return { page, st, waitFor, clearWave, playTo, shot };
}

const GROUPS = {
  // A whole run: launch, the booster shuttle, a booster, the Hive Core and its death scene, docking, the station, death, reload.
  core: async () => {
    const { page, st, waitFor, clearWave, playTo, shot } = await open(); let s;
    // The main run has the effects off (?gfx=low): software rendering is slow, and these checks are about the game's rules.
    // The graphics checks at the end turn them on.
    await page.goto('file://' + GAME + '?gfx=low&intro=off'); await page.waitForTimeout(600);
    check(await page.evaluate(() => !!window.__swarmfall), 'game boots');
    s = await st();
    check(s.state === 'title' && s.mods === 'dmg,hull', 'new save: title screen, two station modules', JSON.stringify(s));
    await shot('01-title');

    await page.tap('#btnPlay');
    s = await waitFor(x => x.state === 'cut'); check(s.cut === 'launch', 'Launch opens the launch cutscene');
    s = await waitFor(x => x.state === 'play'); check(s.wave === 1, 'wave 1 starts after the launch');
    await page.waitForTimeout(400); await shot('02-wave1');
    s = await playTo(x => x.state === 'clear' && x.wave === 1);
    check((await page.textContent('#toast')).includes('Booster shuttle arrives in 2 waves'), 'countdown text after wave 1');
    // the quiet after a wave lasts 2 seconds (CLEAR.wave) before the next wave starts
    const gap = await page.evaluate(() => { const s = window.__swarmfall; return { set: s.CLEAR.wave, left: s.G.clearT }; });
    check(gap.set === 2 && gap.left > 1.3 && gap.left <= 2, 'the gap between waves is 2 seconds', 'CLEAR.wave ' + gap.set + ', ' + gap.left.toFixed(2) + ' s left when first seen');

    s = await playTo(x => x.state === 'cut' && x.cut === 'shuttle'); check(s.wave === 3, 'booster shuttle arrives after wave 3', 'wave ' + s.wave);
    await page.waitForTimeout(500); await page.touchscreen.tap(100, 500); await page.waitForTimeout(100);
    check((await st()).state === 'cut', 'a tap does not cut the shuttle scene short');
    const held = await page.evaluate(() => new Promise(res => { const s = window.__swarmfall; let x = s.SH.x, y = s.SH.y, stillFrom = null, dur = 0, last = 0;
      (function f() { const c = s.G.cut; if (!c) return res({ dur, stillFor: +(last - stillFrom).toFixed(2), state: s.G.state });
        dur = c.dur; last = c.t; if (Math.abs(s.SH.x - x) + Math.abs(s.SH.y - y) > 0.01) stillFrom = null; else if (stillFrom === null) stillFrom = c.t; x = s.SH.x; y = s.SH.y; requestAnimationFrame(f); })(); }));
    check(held.dur === 3.05 && held.stillFor > 0.6 && held.stillFor < 0.9 && held.state === 'draft', 'the shuttle holds beside the ship for three quarters of a second before the booster menu opens', 'still for ' + held.stillFor + ' s of a ' + held.dur + ' s scene');
    await shot('03-shuttle');
    s = await waitFor(x => x.state === 'draft'); check(s.state === 'draft', 'booster choice opens after the shuttle');
    check((await page.textContent('#draftEyebrow')).startsWith('Booster shuttle'), 'booster screen heading');
    await shot('04-booster');
    const side = await page.evaluate(() => { const s = window.__swarmfall; return { beside: Math.abs(s.SH.x - s.P.x) < 70 && Math.abs(s.SH.y - s.P.y) < 12, pod: s.SH.pod, on: s.SH.on }; });
    await page.tap('.card'); s = await waitFor(x => x.state === 'play'); check(s.wave === 4, 'wave 4 starts after picking a booster');
    const handOver = await page.evaluate(() => new Promise(res => { const s = window.__swarmfall, out = { crossed: false, gone: false }, t0 = performance.now();
      (function f() { if (s.SH.gift >= 0) { out.crossed = true; out.podLeftShuttle = !s.SH.pod; } if (out.crossed && s.SH.gift < 0 && !s.SH.on) { out.gone = true; return res(out); } if (performance.now() - t0 > 8000) return res(out); requestAnimationFrame(f); })(); }));
    check(side.beside && side.pod && side.on && handOver.crossed && handOver.podLeftShuttle && handOver.gone, 'the shuttle holds beside the ship, the chosen booster crosses over, and the shuttle drops back', JSON.stringify({ ...side, ...handOver }));

    await page.evaluate(() => { window.__swarmfall.G.run.scrap += 60; });
    // watch the Hive Core's death scene from inside the page: slowest game speed, closest camera, and hull lost during it
    await page.evaluate(() => { const s = window.__swarmfall, w = window.__fin = { slowest: 1, closest: 1, far: s.camera.position.z, hp: null, hurt: false };
      (function f() {
        if (s.FIN.on && !w.sps) { const rings = s.G.picks.filter(p => p.kind === 'scrap'); w.sps = rings.map(p => +p.sp.toFixed(2)); w.worth = rings.reduce((a, p) => a + p.worth, 0); }   // how fast each ring of the scrap shower will fly to the ship
        if (w.sps && s.G.run.scrap !== w.lastScrap) { w.lastScrap = s.G.run.scrap; w.gotLast = s.G.time; if (w.gotFirst === undefined) w.gotFirst = s.G.time; }
        if (s.FIN.on && !w.done) {   // a shot is dropped on the ship every frame, with its usual protection taken away
          w.slowest = Math.min(w.slowest, s.G.speed); w.closest = Math.min(w.closest, s.camera.position.z / w.far);
          if (w.hp === null) w.hp = s.P.hp; if (s.P.hp < w.hp || !s.P.alive) w.hurt = true;
          if (w.slowest < 0.3 && s.G.speed > 0.5) { w.done = true; s.G.eb.length = 0; }   // the scene is easing out: stop, so no test shot is left on the ship when it ends
          else { s.P.inv = 0; s.G.eb.push({ x: s.P.x, y: s.P.y, vx: 0, vy: 0, r: 5, kind: 0, dead: false }); }
        } else if (!s.FIN.on && w.done && w.grace === undefined) w.grace = s.P.inv;   // the first frame after the scene
        if (s.G.state !== 'station') requestAnimationFrame(f); })(); });
    s = await playTo(x => x.state === 'cut' && x.cut === 'dock'); check(s.wave === 6 && s.state === 'cut', 'Hive Core on wave 6 leads to docking', 'wave ' + s.wave + ' ' + s.state);
    const fin = await page.evaluate(() => { const s = window.__swarmfall; return { ...window.__fin, on: s.FIN.on, speed: s.G.speed, z: s.camera.position.z, picksLeft: s.G.picks.length }; });
    check(fin.slowest < 0.3 && fin.closest > 0.999, 'the Hive Core dies in slow motion, and the camera stays where it is', JSON.stringify(fin));
    check(!fin.hurt && fin.grace > 0.3, 'the ship cannot be hit during the core\'s death scene, nor for a moment after', 'grace ' + fin.grace);
    check(!fin.on && fin.speed === 1 && Math.abs(fin.z - fin.far) < 0.01, 'speed and camera are back to normal by the time docking starts', JSON.stringify(fin));
    check(fin.sps.length === 14 && fin.worth === 14 && new Set(fin.sps).size >= 10 && Math.max(...fin.sps) === 1 && Math.min(...fin.sps) < 0.6 && fin.gotLast - fin.gotFirst > 0.3 && fin.picksLeft === 0, 'the boss\'s scrap is a shower of 14 single rings, which fly to the ship at different speeds and are all in before docking', fin.sps.length + ' rings worth ' + fin.worth + ', speeds ' + Math.min(...fin.sps) + ' to 1, collected over ' + (fin.gotLast - fin.gotFirst).toFixed(2) + ' s of game time');
    s = await waitFor(x => x.state === 'station'); check(s.state === 'station' && s.mods === 'dmg,hull,shield', 'docked: Aegis Generator fitted', s.mods);
    check(s.scrap >= 60, 'docking banks the run\'s scrap', 'scrap ' + s.scrap);
    await shot('05-station');
    const hp0 = await page.evaluate(() => window.__swarmfall.S.maxHp);
    await page.locator('#shop .item', { hasText: 'Reinforced Hull' }).locator('button').tap();
    check(await page.evaluate(() => window.__swarmfall.S.maxHp) === hp0 + 1, 'a module bought while docked applies at once');
    await page.tap('#btnUndock'); s = await waitFor(x => x.state === 'draft');
    check((await page.textContent('#draftEyebrow')).includes('rare booster'), 'undocking offers the rare booster');
    await page.tap('.card'); s = await waitFor(x => x.state === 'cut'); check(s.cut === 'launch', 'the ship launches again after the rare booster');
    await page.waitForTimeout(300); await page.touchscreen.tap(195, 400); await page.waitForTimeout(500);
    check((await st()).state === 'cut', 'a tap does not skip the launch');
    s = await waitFor(x => x.state === 'play', 6000); check(s.state === 'play' && s.wave === 7, 'wave 7 starts when the launch has played out');

    const banked = (await st()).scrap;
    await page.evaluate(() => { const s = window.__swarmfall; s.P.inv = 0; s.P.hp = 1; s.P.shieldUp = false; s.P.shieldT = 99; /* the rare booster may have been a shield: keep it down */ s.G.revive = 0; s.G.eb.push({ x: s.P.x, y: s.P.y - 3, vx: 0, vy: 5, r: 6 }); });
    s = await waitFor(x => x.state === 'dead', 8000); check(s.state === 'dead', 'one hit with no hull to spare ends the run');
    check(s.scrap - banked < 60, 'scrap banked at the dock is not counted twice', banked + ' -> ' + s.scrap);
    await shot('06-dead');
    await page.tap('#btnDeadStation'); s = await waitFor(x => x.state === 'browse', 3000);
    check(s.state === 'browse', 'the dead screen opens the station');
    await page.reload(); await page.waitForTimeout(600);
    check((await st()).mods === 'dmg,hull,shield', 'station modules survive a reload');
    await page.tap('#btnStation'); s = await waitFor(x => x.state === 'browse', 3000);
    const fitted = await page.locator('#shop .item .nm').allTextContents();
    check(s.state === 'browse' && fitted.length === 3 && await page.isHidden('#btnUndock'), 'the title opens the station: fitted modules listed, no Undock', fitted.join(' | '));
    await shot('08-station-browse');
    await page.tap('#btnStationBack'); s = await waitFor(x => x.state === 'title', 3000); check(s.state === 'title', 'Back returns to the title');
    await page.tap('#btnStation'); await waitFor(x => x.state === 'browse', 3000);
    await page.tap('#btnStationLaunch'); s = await waitFor(x => x.state === 'cut', 3000); check(s.cut === 'launch', 'Launch from the station starts a run');
    await page.context().close();
  },
  // Which enemy arrives on which wave, how fast they fly in, and the order of the bosses.
  waves: async () => {
    const { page, st, waitFor, clearWave, playTo, shot } = await open(); let s;
    // When each enemy first appears: build every wave 1-20 many times and record the first wave each type shows up.
    await page.tap('#btnPlay'); await waitFor(x => x.state === 'cut'); await page.touchscreen.tap(195, 400); await waitFor(x => x.state === 'play');
    // The beetle: 13 hits on the wave it arrives, and its two missiles leave 0.8 seconds apart (ET.beetle).
    // This comes first: the wave-building below leaves thousands of models in the scene, and game time crawls after it.
    const bt = await page.evaluate(() => new Promise(done => { const s = window.__swarmfall, { G, P } = s;
      for (const e of G.enemies) e.dead = true; G.queue.length = 0; G.eb.length = 0; G.em.length = 0; G.wave = s.UNLOCK.beetle; G.state = 'play'; P.inv = 99;
      const e = s.spawnEnemy('beetle', 0, 0, { x: 70, y: 140 }), out = { hits: Math.ceil(e.hp / 10), gap: null, fired: 0, set: s.ET.beetle.missileGap }, t0 = performance.now();
      s.launchDive(e); e.x = 70; e.y = 250; e.vy = 60; let was = e.shots;   // it stops a little further down the screen
      const tick = () => { P.inv = 99; e.hp = e.maxHp; G.queue.length = 0;
        if (e.shots < was) { out.fired += was - e.shots; if (e.shots === 1) out.gap = e.shootT; was = e.shots; }
        if (e.shots === 0 || e.dead || performance.now() - t0 > 15000) { out.started = was; return done(out); }
        requestAnimationFrame(tick); };
      requestAnimationFrame(tick); }));
    check(bt.hits === 13, 'a beetle takes 13 hits on the wave it arrives', bt.hits + ' hits');
    check(bt.fired === 2 && bt.set === 0.8 && bt.gap > 0.7 && bt.gap <= 0.8, 'a beetle launches two missiles 0.8 seconds apart', JSON.stringify(bt));
    // Reinforcements (SWARM): from wave 2 a fresh flight fills the formation's empty places once it has been thinned; from wave 10, two.
    const rf = await page.evaluate(() => new Promise(done => { const s = window.__swarmfall, { G, P, SWARM } = s, out = { flights: {}, expect: {} };
      const gone = e => { e.dead = true; s.scene.remove(e.g); }, wipe = () => { for (const e of G.enemies) gone(e); G.queue.length = 0; G.eb.length = 0; G.em.length = 0; };
      const build = w => { wipe(); G.enemies.length = 0; G.wave = w - 1; s.nextWave(); }, fire = () => { for (const q of G.queue) q.fn(); G.queue.length = 0; };
      const holders = () => G.enemies.filter(e => e.c != null && !e.dead);
      for (const w of [1, 2, 6, 9, 10, 20]) { build(w); out.flights[w] = G.flights; out.expect[w] = w % 6 ? SWARM.flights.filter(x => w >= x).length : 0; }
      // wave 8: thin the formation to the trigger, and see one flight fill half of it
      build(8); fire(); const size = G.form.size, rows = G.form.rows, keep = Math.floor(size * SWARM.thin); out.size = size; out.built = holders().length;
      holders().slice(keep + 1).forEach(gone);   // one too many left: nothing must come yet
      let step = 0, frames = 0, total = 0, elites = 0, sawClear = false; const seen = new Set(), t0 = performance.now();
      const tick = () => { P.inv = 99; frames++;
        if (performance.now() - t0 > 25000) { out.timeout = step; return done(out); }
        if (step === 0 && frames > 6) { out.early = G.flights !== 1 || G.queue.length > 0; gone(holders()[0]); step = 1; }
        else if (step === 1 && G.queue.length) {
          out.left = G.flights; out.sent = G.queue.length; out.want = Math.round(size * SWARM.refill); out.toast = document.getElementById('toast').textContent; const before = new Set(G.enemies);
          fire(); const h = holders(), fresh = h.filter(e => !before.has(e));
          out.unique = new Set(h.map(e => e.r * 16 + e.c)).size === h.length; out.frontMites = fresh.every(e => e.r < rows - 2 || e.type === 'mite'); out.state = G.state;
          // wave 13: destroy everything the moment it appears, and count what the whole wave sends
          build(13); out.size13 = G.form.size; out.flights13 = G.flights; step = 2;
        } else if (step === 2) {
          fire(); for (const e of G.enemies) if (!seen.has(e)) { seen.add(e); if (e.c != null) total++; if (e.elite) elites++; }
          if (G.state === 'clear') { out.total13 = total; out.elites13 = elites; out.clearedEarly = sawClear; return done(out); }
          if (G.flights > 0 && G.state !== 'play') sawClear = true;
          for (const e of G.enemies) gone(e);
        }
        requestAnimationFrame(tick); };
      requestAnimationFrame(tick); }));
    check(JSON.stringify(rf.flights) === JSON.stringify(rf.expect) && rf.flights[1] === 0 && rf.flights[2] === 1 && rf.flights[10] === 2 && rf.flights[6] === 0, 'reinforcement flights: none on wave 1 or a boss wave, one from wave 2, two from wave 10', JSON.stringify(rf.flights));
    check(rf.built === rf.size && rf.early === false, 'no reinforcements while more than ' + '35% of the formation is left', JSON.stringify({ size: rf.size, built: rf.built, early: rf.early }));
    check(rf.sent === rf.want && rf.left === 0 && rf.toast.includes('Reinforcements') && rf.state === 'play', 'thinned to 35%, a flight half the size of the formation sets off', JSON.stringify({ size: rf.size, sent: rf.sent, want: rf.want, left: rf.left, toast: rf.toast, timeout: rf.timeout }));
    check(rf.unique === true && rf.frontMites === true, 'reinforcements take empty places only, and mites still hold the front two rows');
    check(rf.flights13 === 2 && rf.total13 === rf.size13 + 2 * Math.round(rf.size13 * 0.5) && rf.clearedEarly === false, 'wave 13 sends its formation and two flights before it counts as cleared', JSON.stringify({ size: rf.size13, total: rf.total13, timeout: rf.timeout }));
    check(rf.elites13 <= 3, 'at most three elites in a wave, reinforcements included', rf.elites13 + ' elites');
    const first = await page.evaluate(() => { const s = window.__swarmfall, first = {};
      for (let w = 1; w <= 31; w++) for (let k = 0; k < 30; k++) {
        for (const e of s.G.enemies) e.dead = true; s.G.enemies = []; s.G.wave = w - 1; s.nextWave(); for (const q of s.G.queue) q.fn(); s.G.queue.length = 0;
        for (const e of s.G.enemies) for (const t of [e.type, e.elite && 'elite']) if (t && !(t in first)) first[t] = w;
        if (k === 0) (first.flight || (first.flight = {}))[w] = +(s.G.enemies.find(e => e.type === 'mite') || { dur: 0 }).dur.toFixed(3);   // seconds a mite takes to fly into its place
      }
      return first; });
    // the game's UNLOCK table says when each enemy arrives; check the waves it builds agree
    const U = await page.evaluate(() => window.__swarmfall.UNLOCK);
    const expected = { mite: 1, wasp: U.wasp, weaver: U.weaver, splitter: U.splitter, elite: U.elite, beetle: U.beetle, triplet: U.triplet, lancer: U.lancer[0] };
    for (const [t, w] of Object.entries(expected)) check(first[t] === w, t + ' first appears on wave ' + w + ' (UNLOCK)', 'seen first on ' + first[t]);
    const lancersAt = await page.evaluate(L => L.map(w => { const s = window.__swarmfall; for (const e of s.G.enemies) e.dead = true; s.G.enemies = []; s.G.wave = w - 1; s.nextWave(); for (const q of s.G.queue) q.fn(); s.G.queue.length = 0; return s.G.enemies.filter(e => e.type === 'lancer').length; }), U.lancer);
    check(lancersAt.join() === '1,2,3', 'lancers: 1, 2 and 3 from waves ' + U.lancer.join(', '), 'got ' + lancersAt.join(','));
    // enemies fly into the formation 5% faster each wave: wave 1 takes 2.3 seconds, wave 11 two thirds of that, and it levels off at 2.5 times the pace
    const fl = first.flight; check(fl[1] === 2.3 && Math.abs(fl[11] - 2.3 / 1.5) < 0.002 && Math.abs(fl[2] - 2.3 / 1.05) < 0.002 && Math.abs(fl[31] - 0.92) < 0.002 && fl[29] > fl[31], 'enemies fly into the formation 5% faster each wave, up to 2.5 times', 'wave 1: ' + fl[1] + ' s, 2: ' + fl[2] + ', 11: ' + fl[11] + ', 31: ' + fl[31]);
    // the bosses take turns, in the order of the BOSSES table: one every 6th wave
    const order = await page.evaluate(() => window.__swarmfall.BOSSES.map(b => b.type));
    check(order.every((type, i) => first[type] === 6 * (i + 1)) && order.length === 5, 'bosses arrive in turn on waves 6, 12, 18, 24 and 30', order.map(type => type + ' ' + first[type]).join(', '));
    await page.context().close();
  },
  // The Fracture Cube, Beam Warden, Siege Beetle and Triad: every attack, their special rules, docking after each; the station's bottom bar.
  bosses: async () => {
    const { page, st, waitFor, clearWave, playTo, shot } = await open(); let s;
    // ---- the four bosses after the Hive Core ----
    // Each fight is watched for about 20 seconds of game time with the ship safe, to see every attack happen.
    // Then the boss is destroyed, which must end in the death scene, docking and a new module.
    for (const b of [{ wave: 12, type: 'cube', name: 'FRACTURE CUBE' }, { wave: 18, type: 'warden', name: 'BEAM WARDEN' }, { wave: 24, type: 'siege', name: 'SIEGE BEETLE' }, { wave: 30, type: 'triad', name: 'TRIAD' }]) {
      await page.reload(); await page.waitForTimeout(500);
      await page.tap('#btnPlay'); await waitFor(x => x.state === 'cut'); await page.touchscreen.tap(195, 400); await waitFor(x => x.state === 'play');
      const mods0 = (await st()).mods.split(',').length;
      const seen = await page.evaluate(wave => new Promise(res => { const s = window.__swarmfall, G = s.G, P = s.P; G.wave = wave - 1; s.nextWave();
        const w = { type: null, hud: '', balls: 0, darts: false, missiles: false, helpers: {}, beamFrames: 0, gapSafe: null, beamHurts: null, fans: {}, modes: {} }, g0 = G.time, t0 = performance.now(); let test = 0, hp0 = 0;
        (function f() {
          const e = G.boss, B = e && e.bm;
          if (e) { w.type = e.type; w.hud = document.getElementById('wave').textContent; }
          if (B && G.time - g0 > 16 && !w.hurtIt) { w.hurtIt = true; e.hp = e.maxHp * 0.3; }   // badly hurt: each fan must now be followed at once by the other
          if (B && B.again) { w.followUp = true; w.fans['again' + B.n] = true; }
          if (e && e.type === 'siege') {   // Siege Beetle: every part of its cycle, and how much of a 1000-point hit gets through shut and open
            P.fireT = 9; w.modes[e.mode] = true;
            const hit = k => { w.pend = { k, hp: e.hp, at: G.time }; G.pb.push({ x: e.x, y: e.y, vx: 0, vy: 0, dmg: 1000, pierce: 0, rico: 0, crit: false, kind: 0, hit: null, dead: false }); };
            if (w.pend) { if (G.time - w.pend.at > 0.2) { w[w.pend.k] = Math.round(w.pend.hp - e.hp); w.pend = null; } }
            else if (e.mode === 'guard' && e.intro <= 0 && e.open < 0.05 && w.shut === undefined) hit('shut');
            else if (e.mode === 'open' && e.open > 0.95 && w.wide === undefined) hit('wide');
            if (G.time - g0 > 24 && !w.hurtIt && e.mode === 'guard') { w.hurtIt = true; e.hp = e.maxHp * 0.3; }
            if (e.again) w.twice = true;
          }
          if (e && e.hub) { w.cores = Math.max(w.cores || 0, G.enemies.filter(o => !o.dead && o.def.boss).length); if (e.hub.wheel > 0) w.wheel = true; }
          w.balls = Math.max(w.balls, G.eb.filter(x => !x.kind).length); if (G.eb.some(x => x.kind === 1)) w.darts = true; if (G.em.length) w.missiles = true;
          for (const o of G.enemies) if (!o.def.boss) w.helpers[o.type] = true;
          w.triplets = Math.max(w.triplets || 0, G.enemies.filter(o => !o.dead && o.type === 'triplet').length);
          if (B && B.phase === 'fire') {   // stand in a gap between two beams, then on a beam, with the ship's protection off
            w.beamFrames++; w.fans[B.n] = true; G.eb.length = 0; G.em.length = 0;
            const ey = e.y + 26, at = a => e.x + Math.tan(a) * (P.y - ey);
            if (test === 0 && B.t > 0.9) { test = 1; P.x = (at(B.ang[0]) + at(B.ang[1])) / 2; P.inv = 0; P.shieldUp = false; P.hp = hp0 = 5; }
            else if (test === 1 && B.t < 0.8) { w.gapSafe = P.hp === hp0; test = 2; P.x = Math.max(14, Math.min(346, at(B.ang[1]))); P.inv = 0; }
            else if (test === 2 && B.t < 0.5) { w.beamHurts = P.hp < hp0; test = 3; }
            if (test === 1 || test === 2) { P.target = P.x; P.vx = 0; }
          } else { P.inv = 9; P.hp = Math.max(P.hp, 5); }
          G.revive = 1;
          if (G.time - g0 > ({ 18: 30, 24: 46 }[wave] || 21) || performance.now() - t0 > 150000) res(w); else requestAnimationFrame(f); })(); }), b.wave);
      check(seen.type === b.type && seen.hud === b.name, 'wave ' + b.wave + ' is the ' + b.name + ', named on the HUD', seen.type + ' / ' + seen.hud);
      if (b.type === 'cube') check(seen.balls >= 12 && seen.helpers.splitter, b.name + ': fans, rings and splitters all happen', JSON.stringify(seen));
      else if (b.type === 'siege') {
        const m = seen.modes;
        check(m.guard && m.aim && m.charge && m.back && m.open && seen.missiles && seen.balls >= 5, b.name + ': missiles, a fan, and a charge down and back all happen', JSON.stringify(seen));
        check(Math.abs(seen.shut - 400) < 5 && Math.abs(seen.wide - 1000) < 5, b.name + ': its shell stops most of a hit when shut and none when open', 'of 1000: ' + seen.shut + ' shut, ' + seen.wide + ' open');
        check(seen.twice === true, b.name + ': badly hurt, it charges twice before it rests');
        // the charge with the ship's protection off: beside the marked lane, then in it behind a shield
        const lane = await page.evaluate(() => new Promise(res => { const s = window.__swarmfall, G = s.G, P = s.P, e = G.boss, out = {}, t0 = performance.now(); let test = 0;
          const begin = shield => { e.hp = e.maxHp; e.again = false; e.mode = 'aim'; e.pt = 0.3; e.x = 180; e.y = 130; e.open = 0; P.inv = 0; P.hp = 1; G.revive = 0; P.shieldUp = shield; P.shieldT = 99; };
          begin(false);
          (function f() {
            G.eb.length = 0; G.em.length = 0; P.fireT = 9; P.vx = 0;
            if (test === 0) { P.x = P.target = 180 + 34 + 17; if (e.mode === 'open') { out.beside = P.alive && P.hp === 1; test = 1; begin(true); } }
            else { P.x = P.target = 180; if (e.mode === 'open') { out.shielded = P.alive && P.hp === 1 && !P.shieldUp; P.inv = 9; return res(out); } }
            if (!P.alive || performance.now() - t0 > 60000) { out.died = !P.alive; out.during = test ? 'in the lane' : 'beside the lane'; return res(out); }
            requestAnimationFrame(f); })(); }));
        check(lane.beside === true && lane.shielded === true, b.name + ': a ship beside the marked lane is untouched, and one in the lane behind a shield loses only the shield', JSON.stringify(lane));
      } else if (b.type === 'triad') check(seen.cores === 3 && seen.wheel && seen.balls >= 3 && seen.triplets >= 6, b.name + ': three cores, aimed fans, the pinwheel, and two triplets that each break into three', JSON.stringify(seen));
      else {
        check(seen.beamFrames > 20 && seen.fans[3] && seen.fans[2] && seen.darts && seen.missiles && seen.helpers.mite, b.name + ': both beam fans, darts, missiles and mites all happen', JSON.stringify(seen));
        check(seen.gapSafe === true && seen.beamHurts === true, b.name + ': the gap between two beams is safe and a beam is not', 'gap safe ' + seen.gapSafe + ', beam hurts ' + seen.beamHurts);
        check(seen.followUp === true, b.name + ': badly hurt, it follows a fan at once with the other one', JSON.stringify(seen.fans));
      }
      const bodies = () => page.evaluate(() => { const s = window.__swarmfall; return { n: s.G.enemies.filter(e => !e.dead && e.def.boss).length, bar: +(document.querySelector('#bossbar i').style.transform.match(/[\d.]+/) || [1])[0], down: s.G.bossDown }; });
      const smash = () => page.evaluate(() => { const s = window.__swarmfall; s.P.inv = 9; s.G.eb.length = 0; s.G.em.length = 0; for (const e of s.G.enemies) if (e.def.boss) s.G.pb.push({ x: e.x, y: e.y, vx: 0, vy: 0, dmg: 1e7, pierce: 0, rico: 0, crit: false, kind: 0, hit: null, dead: false }); });
      if (b.type === 'cube') {   // one body, then two halves, then four quarters; the bar falls as the health of the whole fight does
        const steps = [];
        for (const want of [2, 4]) { await smash(); await page.waitForFunction(n => window.__swarmfall.G.enemies.filter(e => !e.dead && e.def.boss).length === n, want, { timeout: 15000 }).catch(() => {}); await page.waitForTimeout(700); steps.push(await bodies()); }
        check(steps[0].n === 2 && steps[1].n === 4 && !steps[1].down, b.name + ': breaks into two halves, then four quarters', JSON.stringify(steps));
        check(Math.abs(steps[0].bar - 0.6) < 0.03 && Math.abs(steps[1].bar - 0.3) < 0.03, b.name + ': the bar shows the health left in all its pieces', steps.map(x => x.bar).join(' then '));
      }
      if (b.type === 'triad') {   // destroy one core at a time: the fight goes on, and the bar falls by a third each time
        const steps = [];
        for (const want of [2, 1]) {
          await page.evaluate(() => { const s = window.__swarmfall, e = s.G.enemies.find(e => !e.dead && e.def.boss); s.P.inv = 9; s.G.pb.push({ x: e.x, y: e.y, vx: 0, vy: 0, dmg: 1e7, pierce: 0, rico: 0, crit: false, kind: 0, hit: null, dead: false }); });
          await page.waitForFunction(n => window.__swarmfall.G.enemies.filter(e => !e.dead && e.def.boss).length === n, want, { timeout: 15000 }).catch(() => {}); await page.waitForTimeout(400); steps.push(await bodies());
        }
        // the ship's own fire has worn the cores down a little, so the bar sits somewhat under two thirds and one third
        check(steps[0].n === 2 && steps[1].n === 1 && !steps[1].down && steps[0].bar > 0.5 && steps[0].bar < 0.68 && steps[1].bar > 0.2 && steps[1].bar < 0.345, b.name + ': losing a core does not end the fight, and the bar falls by a third', JSON.stringify(steps));
      }
      await smash();
      s = await waitFor(x => x.state === 'cut' && x.cut === 'dock', 40000);
      const after = await bodies(); check(s.state === 'cut' && after.down && after.n === 0, b.name + ': destroying it leads to docking', s.state + ' ' + JSON.stringify(after));
      s = await waitFor(x => x.state === 'station', 20000);
      const left = await page.evaluate(() => window.__swarmfall.G.enemies.length);
      check(s.state === 'station' && s.mods.split(',').length === mods0 + 1 && left === 0, b.name + ': a new module is fitted and nothing is left on the field', s.mods + ', enemies left ' + left);
      if (b.type === 'triad') {   // by now the list of modules is far longer than the screen
        const bar = () => page.evaluate(() => { const el = document.getElementById('scrStation'), u = document.getElementById('btnUndock').getBoundingClientRect(); return { undockInView: u.top >= 0 && u.bottom <= innerHeight, more: !document.querySelector('#scrStation .more').hidden, toGo: el.scrollHeight - el.clientHeight - el.scrollTop }; });
        const top = await bar(); await page.tap('#scrStation .more'); await page.waitForTimeout(900); const mid = await bar();
        await page.evaluate(() => { const el = document.getElementById('scrStation'); el.scrollTop = el.scrollHeight; }); await page.waitForTimeout(300); const end = await bar();
        check(top.undockInView && top.more && top.toGo > 100 && mid.toGo < top.toGo && mid.undockInView && end.undockInView && !end.more, 'station: Undock stays on screen while the list scrolls, and "More below" shows until its end', JSON.stringify([top, mid, end]));
      }
      await shot('1' + (b.wave / 6 - 1) + '-after-' + b.type);
    }
    await page.context().close();
  },
  // Flame Cloud, Confusion Gas, and darts.
  clouds: async () => {
    const { page, st, waitFor, clearWave, playTo, shot } = await open(); let s;
    // ---- the cloud boosters and the darts ----
    await page.reload(); await page.waitForTimeout(500);
    await page.tap('#btnPlay'); await waitFor(x => x.state === 'cut'); await waitFor(x => x.state === 'play');
    const cl = await page.evaluate(() => new Promise(res => { const s = window.__swarmfall, G = s.G, P = s.P, C = s.CLOUD, out = {}, t0 = performance.now(); G.wave = 3; s.nextWave(); G.flights = 0;   // no reinforcements: this scene counts on the formation it built
      let step = 0, at = 0, A = null, B = null, hpB = 0, sum0 = 0, dart = null, last = G.time, hp0 = 0, T = null, tHp = 0, tMax = 1, count0 = 0, home = null, hx = 0, hy = 0, wasRam = false, gaveUp = 0;
      const hpSum = () => G.enemies.reduce((a, e) => a + (e.dead ? 0 : e.hp), 0), since = () => G.time - at, go = n => { step = n; at = G.time; };
      (function f() {
        const dt = G.time - last; last = G.time;
        if (step < 6) { P.inv = 9; P.x = P.target = 300; }
        P.fireT = 9; G.diveT = 99; G.shootT = 99;   // the ship does not fire and nothing dives: only the clouds act
        const formed = G.enemies.filter(e => !e.dead && e.state === 'form');
        if (step === 0 && G.waveT > 5 && formed.length >= 8) { B = formed[formed.length - 1]; hpB = B.hp; s.launchCloud(1, B.x, B.y, 1); go(1); }   // flame first, on its own
        else if (step === 1 && since() > 1.5) { out.burning = B.burn > 0; out.burnDrop = +(hpB - B.hp).toFixed(2); out.ofHp = +hpB.toFixed(1); go(2); }
        else if (step === 2 && since() > 7.5) {   // the cloud has gone and the burn is over: the enemy must have been weakened, not destroyed
          out.flameGone = !s.clouds.some(c => c.on); out.survived = !B.dead && B.burn <= 0; out.healthLeft = +(B.hp / B.maxHp).toFixed(2);
          A = formed[0]; sum0 = hpSum(); if (!A) return res(out); s.launchCloud(0, A.x, A.y, 1); go(3); }   // now gas, on an enemy at the other end
        else if (step === 3) {   // the confused enemy must break off, chase the enemy furthest from it and ram it
          if (A.state === 'ram' && !out.chased) { out.chased = true; T = A.ramAt; tHp = T.hp; tMax = T.maxHp; count0 = G.enemies.filter(e => !e.dead).length; }
          if (out.chased && A.dead && out.rammed === undefined) { out.rammed = true; out.targetLost = T.dead ? 1 : +((tHp - T.hp) / tMax).toFixed(2); }
          if (G.pb.some(b => b.kind === 3) || G.eb.length) out.newWeapon = true;   // it must not shoot: there is no such shot any more, and nobody else is firing
          if (since() > 7) {
            out.left = G.enemies.filter(e => !e.dead).length + ' of ' + count0; out.cleared = G.enemies.filter(e => !e.dead).length < count0 * 0.5;
            // one that runs out of time flies home from where it is
            const C2 = formed.find(e => e.c != null); if (C2) { s.launchCloud(0, C2.x, C2.y, 1); home = C2; } go(3.5);
          }
        } else if (step === 3.5) {
          if (home && home.state === 'ram' && !gaveUp) { home.conf = 0.02; hx = home.x; hy = home.y; wasRam = true; }   // cut its 5 seconds short
          else if (home && wasRam && ++gaveUp === 3) {   // three frames after it gave up: it should be flying home from where it was, not from the top of the screen
            out.wentHome = !home.dead && home.state === 'enter'; out.jump = +Math.hypot(home.x - hx, home.y - hy).toFixed(0);
            for (const c of s.clouds) { c.on = false; c.mesh.visible = false; }
          }
          if (since() > 4) { for (const c of s.clouds) { c.on = false; c.mesh.visible = false; } G.up.gas = 1; s.recalc(); P.gasT = 0.05; go(4); }
        } else if (step === 4) {
          const mine = s.clouds.find(c => c.on && c.kind === 0); if (mine) { out.auto = true; out.cloudAbove = +(P.y - mine.ty).toFixed(0); out.belowFormation = mine.ty > Math.max(...formed.map(e => e.y), 0) + 30; }
          if (since() > 1) { G.up.gas = 0; s.recalc(); dart = { x: 60, y: 100, vx: 0, vy: 240, r: 3.4, kind: 1, turn: s.DART.total, dead: false }; G.eb.push(dart); go(5); }   // a dart fired straight down, far to the ship's left
        } else if (step === 5 && since() > 1.5) {
          out.dartVx = +dart.vx.toFixed(1); out.dartLean = +Math.atan2(dart.vx, dart.vy).toFixed(3);
          // a dart aimed straight at the ship, which sidesteps 60 as it is fired and then holds still, with its protection off
          G.eb.length = 0; P.x = P.target = 120; P.inv = 0; P.shieldUp = false; P.shieldT = 99; P.hp = hp0 = 5; dart = { x: 120, y: 150, vx: 0, vy: 240, r: 3.4, kind: 1, turn: s.DART.total, dead: false }; G.eb.push(dart); P.x = P.target = 180; go(6);
        } else if (step === 6) { P.x = P.target = 180; if (dart.dead || since() > 5) { out.sidestepClears = P.hp === hp0 && P.alive; P.inv = 9; return res(out); } }
        if (performance.now() - t0 > 120000) { out.stuckAt = step; return res(out); }
        requestAnimationFrame(f); })(); }));
    check(cl.burning && cl.burnDrop > 0.1 && cl.burnDrop < cl.ofHp * 0.3 && cl.flameGone, 'Flame Cloud: an enemy in it burns, losing health slowly, and the cloud goes', JSON.stringify(cl));
    check(cl.survived === true && cl.healthLeft >= 0.1 && cl.healthLeft < 0.8, 'Flame Cloud weakens an enemy and never finishes it off', 'a mite that sat in the cloud for its whole life is left with ' + Math.round(cl.healthLeft * 100) + '% of its health');
    check(cl.chased && cl.rammed && cl.targetLost >= 0.45 && !cl.newWeapon, 'Confusion Gas: a confused enemy chases the enemy furthest from it and rams it, with no new weapon', 'the rammer was destroyed; its target lost ' + Math.round(cl.targetLost * 100) + '% of its health');
    check(cl.cleared === false, 'Confusion Gas: one cloud does not clear the swarm', cl.left + ' enemies left');
    check(cl.wentHome === true && cl.jump < 60, 'Confusion Gas: an enemy whose 5 seconds run out flies home from where it is', 'moved ' + cl.jump + ' in the frame it gave up');
    check(cl.auto === true && cl.belowFormation === true && cl.cloudAbove >= 150 && cl.cloudAbove <= 270, 'with the booster, the ship lobs a cloud into the open lanes below the formation', cl.cloudAbove + ' above the ship');
    check(cl.dartVx > 5 && cl.dartLean > 0.05 && cl.dartLean <= 0.105, 'a dart bends a little toward the ship, and only so far', 'lean after 1.5 s: ' + cl.dartLean + ' radians (the limit is 0.1)');
    check(cl.sidestepClears === true, 'a sidestep still clears a dart aimed at the ship');
    await page.context().close();
  },
  // Ships a boss releases: lanes first, then loose flights.
  released: async () => {
    const { page, st, waitFor, clearWave, playTo, shot } = await open(); let s;
    // ---- ships a boss releases: spread to lanes on their first pass, then each on its own line ----
    await page.reload(); await page.waitForTimeout(500);
    await page.tap('#btnPlay'); await waitFor(x => x.state === 'cut'); await waitFor(x => x.state === 'play');
    const loose = await page.evaluate(() => new Promise(res => { const s = window.__swarmfall, G = s.G, P = s.P, out = { lanes: [], back: [], wander: 0 }, t0 = performance.now(), seen = new Map(); G.wave = 5; s.nextWave(); const g0 = G.time;
      (function f() {
        P.inv = 9; P.fireT = 9; P.x = P.target = 180; G.eb.length = 0; G.em.length = 0;   // the ship does not fire, so the released ships live to come round again
        for (const e of G.enemies) {
          if (e.dead || e.def.boss) continue;
          let r = seen.get(e); if (!r) { r = { lane: e.lane, lastY: e.y, back: false }; seen.set(e, r); if (e.lane != null) out.lanes.push(Math.round(e.lane)); }
          if (!r.back && e.lane != null && e.y > 250) out.wander = Math.max(out.wander, Math.abs(e.x - e.lane - Math.max(-28, Math.min(28, P.x - e.lane))));   // how far it strays from its lane on the way down
          if (!r.back && r.lastY > 400 && e.y < 0) { r.back = true; out.back.push({ x: Math.round(e.x), laneKept: e.lane != null, pace: +e.pace.toFixed(2) }); }
          r.lastY = e.y;
        }
        if (out.back.length >= 5 || G.time - g0 > 40 || performance.now() - t0 > 150000) return res(out);
        requestAnimationFrame(f); })(); }));
    const bx = loose.back.map(b => b.x);
    check(loose.lanes.length >= 5 && new Set(loose.lanes).size >= 5, 'ships the Hive Core releases spread out to lanes of their own', 'lanes ' + loose.lanes.join(', '));
    check(loose.back.length >= 5 && loose.back.every(b => !b.laneKept) && new Set(bx).size >= 4 && Math.max(...bx) - Math.min(...bx) > 60 && new Set(loose.back.map(b => b.pace)).size >= 4 && loose.wander > 4,
      'after their first pass they come back from new places, at different speeds, and they weave on the way down', 'came back at x ' + bx.join(', ') + ' · strayed up to ' + Math.round(loose.wander) + ' from a lane');
    await page.context().close();
  },
  // Sentry satellites and the Laser Drone.
  sentry: async () => {
    const { page, st, waitFor, clearWave, playTo, shot } = await open(); let s;
    // ---- sentry satellites and the Laser Drone ----
    await page.reload(); await page.waitForTimeout(500);
    await page.tap('#btnPlay'); await waitFor(x => x.state === 'cut'); await waitFor(x => x.state === 'play');
    const sg = await page.evaluate(() => new Promise(res => { const s = window.__swarmfall, G = s.G, P = s.P, out = {}, t0 = performance.now(), light = s.sats[0], heavy = s.sats[1]; G.wave = 3; s.nextWave(); G.flights = 0;   // no reinforcements: this scene counts on the formation it built
      let step = 0, at = 0, sum0 = 0, seen3 = 0, lane = [], other = null, laneHp = 0, otherHp = 0;
      const hpSum = () => G.enemies.reduce((a, e) => a + (e.dead ? 0 : e.hp), 0), since = () => G.time - at, go = n => { step = n; at = G.time; };
      const ball = o => G.eb.push({ x: o.x, y: o.y - 1, vx: 0, vy: 1, r: 4.5, kind: 0, turn: 0, dead: false });
      (function f() {
        P.inv = 9; P.fireT = 9; G.diveT = 99; G.shootT = 99;   // the ship does not fire, and nothing dives or shoots
        const formed = G.enemies.filter(e => !e.dead && e.state === 'form'), fresh = G.pb.filter(b => b.kind === 3 && !b.counted); fresh.forEach(b => b.counted = true); seen3 = Math.max(seen3, fresh.length);
        if (step === 0 && G.waveT > 5 && formed.length >= 8) { P.x = P.target = 180; G.up.sentry = 1; s.recalc(); light.cool = 0.05; sum0 = G.run.kills; go(1); }
        else if (step === 1 && light.on && since() > 3) {   // the booster's satellite: set down ahead of the ship, firing on its own
          out.ahead = Math.round(P.y - light.ty); out.life = light.t > 5 && light.t < 9; out.hp = light.hp; out.oneBarrel = seen3 === 1; out.hurtSwarm = G.run.kills - sum0 + G.enemies.filter(e => !e.dead && e.hp < e.maxHp).length; ball(light); go(2); }   // enemies it has destroyed or damaged
        else if (step === 2 && since() > 0.3) { out.tookHit = light.on && light.hp === out.hp - 1 && !G.eb.length; ball(light); go(3); }   // a shot hits it and is stopped
        else if (step === 3 && since() > 0.3) { out.destroyed = !light.on; out.rest = Math.round(light.cool); light.cool = 0.05; go(4); }   // its last health: shot down
        else if (step === 4 && light.on) { light.t = 0.03; go(5); }
        else if (step === 5 && since() > 0.3) { out.ranOut = !light.on; G.up.sentry = 0; s.meta.up.sentry = 1; s.recalc(); heavy.cool = 0.05; seen3 = 0; go(6); }   // now the station module's
        else if (step === 6 && heavy.on && since() > 2.5) { out.heavyHp = heavy.hp; out.heavyLife = heavy.t > 10; out.twoBarrels = seen3 === 2; out.lightStaysAway = !light.on; s.meta.up.sentry = 0; s.recalc(); heavy.t = 0.03; go(7); }
        else if (step === 7 && since() > 0.5) {   // the Laser Drone: line its lane up with one column of the formation
          const E = formed[0]; if (!E) return res(out); P.x = P.target = Math.max(14, E.x - s.LASER.side); const bx = P.x + s.LASER.side;
          lane = formed.filter(e => Math.abs(e.x - bx) < e.rad + s.LASER.half); other = formed.find(e => Math.abs(e.x - bx) > 70); laneHp = lane.reduce((a, e) => a + e.hp, 0); otherHp = other ? other.hp : 0;
          G.up.beam = 1; s.recalc(); P.lasT = 0.05; go(8); }
        else if (step === 8) {
          if (P.lasOn > 0) out.fired = true;
          if (out.fired && P.lasOn <= 0) { out.laneLost = +(laneHp - lane.reduce((a, e) => a + (e.dead ? 0 : e.hp), 0)).toFixed(1); out.laneOf = +laneHp.toFixed(1); out.inLane = lane.length; out.otherUntouched = !!other && !other.dead && other.hp === otherHp; G.up.beam = 0; s.recalc(); return res(out); }
        }
        if (performance.now() - t0 > 120000) { out.stuckAt = step; return res(out); }
        requestAnimationFrame(f); })(); }));
    check(sg.ahead === 150 && sg.life && sg.hp === 2 && sg.oneBarrel && sg.hurtSwarm >= 2, 'Sentry Satellite: set down ahead of the ship, it fires at the swarm by itself', sg.hurtSwarm + ' enemies destroyed or damaged in 3 seconds · ' + JSON.stringify(sg));
    check(sg.tookHit && sg.destroyed && sg.rest === 9, 'Sentry Satellite: it stops an enemy shot, takes the damage, and is shot down when its health is gone');
    check(sg.ranOut === true, 'Sentry Satellite: it runs out when its time is up');
    check(sg.heavyHp === 5 && sg.heavyLife && sg.twoBarrels && sg.lightStaysAway, 'Sentry Platform (station module): a tougher satellite with twin guns that lasts longer', 'health ' + sg.heavyHp);
    check(sg.fired && sg.inLane > 0 && sg.laneLost > sg.laneOf * 0.5 && sg.otherUntouched, 'Laser Drone: its beam burns every enemy in its lane and nothing outside it', sg.inLane + ' in the lane lost ' + sg.laneLost + ' of ' + sg.laneOf);
    await page.context().close();
  },
  // Every booster at once on late waves; pause; the Graphics button.
  stress: async () => {
    const { page, st, waitFor, clearWave, playTo, shot } = await open(); let s;
    // Every system at once: all boosters on, late waves with lasers, missiles and triplets, while the ship
    // keeps firing. This exercises the effect pools (rings, lightning, particles), missiles being shot down,
    // shields and Reactive Nova clearing fire mid-loop, triplet splits and the lancer beam.
    await page.reload(); await page.waitForTimeout(500);   // a fresh page: the wave check above leaves its test enemies in the scene
    await page.tap('#btnPlay'); await waitFor(x => x.state === 'cut'); await page.touchscreen.tap(195, 400); await waitFor(x => x.state === 'play');
    const stress = await page.evaluate(() => new Promise(res => { const s = window.__swarmfall;
      for (const id of ['twin', 'pierce', 'rico', 'drone', 'crit', 'blast', 'missile', 'chain', 'nova', 'shield', 'gas', 'flame', 'sentry', 'beam']) s.G.up[id] = 2;
      s.recalc(); s.G.wave = 15; s.nextWave(); s.S.maxHp = 9; s.P.hp = 9;
      const seen = { kills: 0, maxShots: 0, maxMissiles: 0, splits: 0, beams: 0, waves: new Set() }; const t0 = performance.now(); let k0 = s.G.run.kills;
      (function f() { const G = s.G;
        if (G.state === 'draft') { document.querySelector('.card').click(); }
        if (G.state === 'play') { s.P.target = (s.G.enemies.find(e => e.z > -60) || { x: 180 }).x; if (s.P.hp < 3) s.P.hp = 9; s.G.revive = 1; }
        if (G.state === 'play' && !G.em.length && Math.random() < 0.01) s.fireMissile(40 + Math.random() * 280, 60);   // make sure missiles fly
        seen.maxShots = Math.max(seen.maxShots, G.eb.length); seen.maxMissiles = Math.max(seen.maxMissiles, G.em.length); seen.waves.add(G.wave);
        if (G.enemies.some(e => e.laser && e.laser.phase === 'fire')) seen.beams++;
        if (performance.now() - t0 > 25000) { seen.kills = s.G.run.kills - k0; seen.waves = [...seen.waves].join(','); seen.state = G.state; res(seen); } else requestAnimationFrame(f); })(); }));
    check(stress.kills > 40, 'stress run: the ship keeps destroying enemies with every booster on', JSON.stringify(stress));
    check(stress.maxMissiles > 0, 'stress run: missiles flew', 'laser frames ' + stress.beams);
    // a frame with Arc Coil lightning on screen, for the screenshot set
    await page.evaluate(() => new Promise(res => { const s = window.__swarmfall; const t0 = performance.now(); (function f() { const e = s.G.enemies.filter(e => e.z > -60); if (e.length > 2) { const h = e[0]; s.G.pb.push({ x: h.x, y: h.y, vx: 0, vy: 0, dmg: 1, pierce: 0, rico: 0, crit: false, kind: 0, hit: null, dead: false }); } if (performance.now() - t0 > 600) res(); else requestAnimationFrame(f); })(); }));
    await shot('07-arc-coil');
    await page.tap('#btnPause').catch(() => {}); await page.waitForTimeout(300);
    check(await page.evaluate(() => window.__swarmfall.G.state) === 'pause', 'pause works');
    await shot('09-paused');

    // ---- graphics ----
    await page.tap('#btnGfx'); await page.waitForTimeout(200);
    const gfxBtn = await page.evaluate(() => ({ label: document.getElementById('btnGfx').textContent, saved: JSON.parse(localStorage.getItem('swarmfall.v1')).gfx, mode: window.__swarmfall.GFX.mode }));
    check(gfxBtn.mode === 'auto' && gfxBtn.saved === 'auto' && /^Graphics: auto/.test(gfxBtn.label), 'the Graphics button on the pause screen steps low to auto and saves it', JSON.stringify(gfxBtn));
    await page.context().close();
  },
  // Every effect on: a picture reaches the screen; the automatic step-down on a slow device.
  gfx: async () => {
    // all effects on: the picture must actually arrive on screen (a broken post-processing chain shows black)
    const fx = await (await browser.newContext({ ...devices['iPhone 13'] })).newPage();
    fx.on('pageerror', e => errors.push('[gfx] ' + e.message)); fx.on('console', m => { if (m.type() === 'error') errors.push('[gfx] ' + m.text()); });
    await fx.route('**/fonts.googleapis.com/**', r => r.fulfill({ body: '', contentType: 'text/css' }));
    const startRun = async () => { await fx.tap('#btnPlay'); await fx.waitForTimeout(400); await fx.touchscreen.tap(195, 400); await fx.waitForFunction(() => window.__swarmfall.G.state === 'play', null, { timeout: 60000 }); };
    await fx.goto('file://' + GAME + '?gfx=high&intro=off'); await fx.waitForTimeout(600); await startRun();
    const pic = await fx.evaluate(() => new Promise(res => { const s = window.__swarmfall; let n = 0;
      (function f() { s.P.inv = 9; if (++n < 12 || (s.G.pb.length < 3 && n < 400)) return requestAnimationFrame(f);   // wait until the ship has shots in the air: they are the bright things looked for
        const gl = document.querySelector('canvas'), c = document.createElement('canvas'); c.width = 97; c.height = 211; const g = c.getContext('2d'); g.drawImage(gl, 0, 0, c.width, c.height);
        const d = g.getImageData(0, 0, c.width, c.height).data; let lit = 0, bright = 0; for (let i = 0; i < d.length; i += 4) { const m = Math.max(d[i], d[i + 1], d[i + 2]); if (m > 24) lit++; if (m > 180) bright++; }
        res({ q: s.GFX.q, lit, bright, of: d.length / 4 }); })(); }));
    check(pic.q === 2 && pic.lit > 200 && pic.bright > 3 && pic.lit < pic.of * 0.9, 'all effects on: level 2, and a picture reaches the screen', JSON.stringify(pic));
    if (OUT) await fx.screenshot({ path: path.join(OUT, '10-effects-on.png') });

    // auto: a device that cannot keep up (software rendering here) must step the effects down by itself
    await fx.goto('file://' + GAME + '?intro=off'); await fx.waitForTimeout(600);
    await fx.evaluate(() => { const s = window.__swarmfall; s.meta.gfx = 'auto'; s.meta.autoQ = 2; s.GFX.mode = 'auto'; window.dispatchEvent(new Event('resize')); });
    await startRun();
    const auto = await fx.evaluate(() => new Promise(res => { const s = window.__swarmfall, t0 = performance.now();
      (function f() { s.P.inv = 9; if (s.GFX.q < 2 || performance.now() - t0 > 30000) res({ q: s.GFX.q, ms: Math.round(s.GFX.ema), saved: s.meta.autoQ }); else requestAnimationFrame(f); })(); }));
    check(auto.q < 2 ? auto.saved === auto.q : auto.ms <= 38, 'auto: steps down when frames are slow, and remembers it', JSON.stringify(auto));
    await fx.context().close();
  },
  // The hidden test bench and test runs.
  bench: async () => {
    const { page, st, waitFor, clearWave, playTo, shot } = await open(); let s;
    // ---- the hidden test bench ----
    // some scrap in the save, so that the station's buy buttons are live and "nothing can be bought on a test run" means something
    await page.evaluate(() => { const m = window.__swarmfall.meta; m.scrap = 500; localStorage.setItem('swarmfall.v1', JSON.stringify(m)); });
    await page.reload(); await page.waitForTimeout(600);
    const saved = () => page.evaluate(() => { const m = window.__swarmfall.meta; return JSON.stringify({ scrap: m.scrap, best: m.best, runs: m.runs, mods: m.mods, stored: localStorage.getItem('swarmfall.v1') }); });
    const before = await saved();
    const lg = await page.locator('#logo').boundingBox(), tapLogo = () => page.touchscreen.tap(lg.x + lg.width / 2, lg.y + lg.height / 2);
    await tapLogo(); await tapLogo(); await tapLogo(); await page.waitForTimeout(3200); await tapLogo(); await tapLogo();   // three taps, a pause, two more: not five together
    check(await page.isHidden('#scrDebug'), 'test bench: stays hidden from ordinary taps on the title');
    await page.waitForTimeout(3200); for (let i = 0; i < 5; i++) await tapLogo();
    check(await page.isVisible('#scrDebug'), 'test bench: five taps on the title within three seconds open it');
    await page.tap('#dbgClear'); await page.tap('#dbgModNone'); await page.tap('#dbgMod [data-id="sentry"]'); await page.tap('#dbgMod [data-id="sentry"]'); await page.tap('#dbgMod [data-id="hull"]'); await page.tap('#dbgBoss [data-w="12"]'); await page.tap('#dbgUps [data-id="gas"]'); await page.tap('#dbgUps [data-id="flame"]'); await page.tap('#dbgUps [data-id="flame"]');
    if ((await page.textContent('#dbgGod')).endsWith('off')) await page.tap('#dbgGod');
    const bench = await page.evaluate(() => ({ wave: document.getElementById('dbgWave').textContent, god: document.getElementById('dbgGod').textContent, on: [...document.querySelectorAll('#dbgUps .chip.on')].map(c => c.textContent), mods: [...document.querySelectorAll('#dbgMod .chip.on')].map(c => c.textContent), offered: [...document.querySelectorAll('#dbgUps .chip')].map(c => c.textContent) }));
    check(bench.wave === 'Wave 12 · Fracture Cube' && bench.on.join() === 'Flame Cloud2,Confusion Gas1' && bench.god.endsWith('on'), 'test bench: a wave, boosters with levels and "cannot be hit" can be chosen', JSON.stringify(bench.on));
    check(bench.mods.join() === 'Reinforced Hull1,Sentry Platform2' && bench.offered.includes('Sentry Satellite') && bench.offered.includes('Laser Drone') && bench.offered.length === 23, 'test bench: station modules can be chosen for the test, and every booster is offered', bench.offered.length + ' boosters · modules: ' + bench.mods.join(', '));
    if (OUT) await page.screenshot({ path: path.join(OUT, '16-test-bench.png') });
    await page.tap('#dbgGo'); await waitFor(x => x.state === 'play', 15000);
    await page.waitForFunction(() => window.__swarmfall.G.boss, null, { timeout: 20000 });
    const run = await page.evaluate(() => { const s = window.__swarmfall; s.P.inv = 0; s.G.eb.push({ x: s.P.x, y: s.P.y - 3, vx: 0, vy: 5, r: 6, kind: 0, turn: 0, dead: false });
      return { wave: s.G.wave, boss: s.G.boss.type, up: JSON.stringify(s.G.up), gas: s.S.gas, flame: s.S.flame, test: s.G.test, platform: s.S.platform, maxHp: s.S.maxHp, shield: s.S.shield }; });
    await page.waitForTimeout(500);
    const hitless = await page.evaluate(() => { const s = window.__swarmfall; return s.P.alive && s.P.hp === s.S.maxHp && s.G.state === 'play'; });
    check(run.wave === 12 && run.boss === 'cube' && run.gas === 1 && run.flame === 2 && run.test && hitless, 'test run: starts on the chosen wave with the chosen boosters, and the ship cannot be hit', JSON.stringify(run) + ' unhurt ' + hitless);
    check(run.platform === 2 && run.maxHp === 2 && run.shield === 0, 'test run: uses the station modules chosen on the bench, not the save\'s', 'Sentry Platform ' + run.platform + ', hull ' + run.maxHp + ', shield ' + run.shield);
    await page.evaluate(() => { window.__swarmfall.G.run.scrap += 80; });
    for (let i = 0; i < 40 && (await st()).state !== 'station'; i++) { await page.evaluate(() => { const s = window.__swarmfall; s.G.eb.length = 0; s.G.em.length = 0; for (const e of s.G.enemies) if (e.def.boss) s.G.pb.push({ x: e.x, y: e.y, vx: 0, vy: 0, dmg: 1e7, pierce: 0, rico: 0, crit: false, kind: 0, hit: null, dead: false }); }); await page.waitForTimeout(700); }
    s = await st(); const note = await page.textContent('#stNote');
    await page.locator('#shop .item button').first().tap(); await page.waitForTimeout(200);
    check(s.state === 'station' && /saves nothing/.test(note) && await saved() === before, 'test run: destroying the boss docks, but fits no module, banks no scrap and sells nothing', s.state + ' · ' + note.split('\n')[0]);
    await page.tap('#btnUndock'); await page.tap('.card'); await waitFor(x => x.state === 'play', 15000);
    await page.tap('#btnPause'); await page.waitForTimeout(200); await page.tap('#btnQuit'); await waitFor(x => x.state === 'dead', 5000);
    const over = await page.evaluate(() => ({ eyebrow: document.getElementById('deadEyebrow').textContent, again: document.getElementById('btnAgain').textContent }));
    check(await saved() === before && /nothing saved/.test(over.eyebrow) && over.again === 'Test again', 'test run: ending it leaves scrap, records and modules as they were', JSON.stringify(over));
    await page.tap('#btnAgain'); s = await waitFor(x => x.state === 'play', 15000); check(s.wave === 12, '"Test again" repeats the same test', 'wave ' + s.wave);
    await page.goto('file://' + GAME + '?gfx=low&intro=off&debug'); await page.waitForTimeout(600);
    check(await page.isVisible('#scrDebug') && (await page.textContent('#dbgWave')).startsWith('Wave 12'), 'test bench: ?debug in the address opens it, with the last set-up remembered');
    await page.context().close();
  },
  // Enemy introductions.
  intro: async () => {
    // ---- enemy introductions (every other page here switches them off with ?intro=off) ----
    const ip = await (await browser.newContext({ ...devices['iPhone 13'] })).newPage();
    ip.on('pageerror', e => errors.push('[intro] ' + e.message)); ip.on('console', m => { if (m.type() === 'error') errors.push('[intro] ' + m.text()); });
    await ip.route('**/fonts.googleapis.com/**', r => r.fulfill({ body: '', contentType: 'text/css' }));
    await ip.goto('file://' + GAME + '?gfx=low'); await ip.waitForTimeout(600);
    const startIp = async () => { await ip.tap('#btnPlay'); await ip.waitForFunction(() => window.__swarmfall.G.state === 'play', null, { timeout: 30000 }); };
    // watches one introduction from the page: the speeds on the way in and out, whether time stood still, how long the card stayed
    const watchIntro = ms => ip.evaluate(ms => new Promise(res => { const s = window.__swarmfall, IN = s.IN, el = document.getElementById('intro'), out = { in: [], out: [], held: 0 }, t0 = performance.now(); let g0 = null;
      (function f() {
        if (IN.on) {
          out.started = true; out.key = IN.key; s.P.inv = 9;
          if (IN.phase === 'in') out.in.push(+s.G.speed.toFixed(2));
          else if (IN.phase === 'hold') { if (g0 === null) { g0 = s.G.time; out.name = document.getElementById('introName').textContent; out.kind = document.getElementById('introKind').textContent; out.text = document.getElementById('introA').textContent + ' / ' + document.getElementById('introB').textContent;
              const r = document.getElementById('introRing').getBoundingClientRect(), c = document.getElementById('introCard').getBoundingClientRect(); out.ring = Math.round(r.width); out.cardOnScreen = c.top >= 0 && c.bottom <= innerHeight && c.left >= 0 && c.right <= innerWidth; out.cardClearOfRing = c.top >= r.bottom || c.bottom <= r.top; out.button = !!el.querySelector('button'); out.prompt = document.getElementById('introGo').textContent;
              window.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'touch' })); }   // a touch landing just as the card appears must not clear it
            if (IN.t > 0.2 && IN.t < 0.34) out.earlyTouchIgnored = true;
            out.frozen = s.G.time === g0 && s.G.speed === 0; out.held = +IN.t.toFixed(2); out.shown = !el.hidden; }
          else out.out.push(+s.G.speed.toFixed(2));
        } else if (out.started) { out.after = s.G.speed; out.hidden = el.hidden; return res(out); }
        if (performance.now() - t0 > ms) return res(out);
        requestAnimationFrame(f); })(); }), ms);
    const ramps = a => a.length >= 3 && a.some(v => v > 0.1 && v < 0.9);
    const cardUpFor = t => ip.waitForFunction(t => { const I = window.__swarmfall.IN; return I.on && I.phase === 'hold' && I.t >= t; }, t, { timeout: 60000 });
    // an introduction stays until the player touches the screen afresh: wait well past the point, then tap
    const through = async wait => { const w = watchIntro(90000); await cardUpFor(wait); await ip.touchscreen.tap(200, 520); return w; };
    await startIp(); const i1 = await through(2.5);
    check(i1.started && i1.key === 'mite' && i1.name === 'Mite' && i1.kind === 'New enemy' && i1.shown && i1.ring > 20 && i1.cardOnScreen && i1.cardClearOfRing, 'a new enemy is introduced when it takes its place: a spotlight on it and a card with its name and what to do', JSON.stringify({ name: i1.name, text: i1.text, ring: i1.ring }));
    check(ramps(i1.in) && i1.in[0] > i1.in[i1.in.length - 1] && i1.frozen && ramps(i1.out) && i1.out[0] < i1.out[i1.out.length - 1] && i1.after === 1 && i1.hidden, 'the game slows quickly to a stop for it, then speeds quickly back up', 'in ' + i1.in.join(' ') + ' · out ' + i1.out.join(' '));
    check(!i1.button && i1.prompt === 'Tap to continue' && i1.earlyTouchIgnored && i1.held >= 2.5, 'the card stays until the player touches the screen afresh; a touch landing as it appears does not clear it', 'still up after ' + i1.held + ' s, cleared by a tap');
    await ip.evaluate(() => { const s = window.__swarmfall; for (const e of s.G.enemies) { e.dead = true; e.g.visible = false; } s.G.wave = 1; s.nextWave(); });
    const i2 = await through(0.6);
    const steers = await ip.evaluate(() => window.__swarmfall.G.state === 'play');
    const seenSaved = await ip.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('swarmfall.v1')).seen || {}).sort().join());
    check(i2.key === 'wasp' && i2.name === 'Wasp' && seenSaved === 'mite,wasp', 'the next new kind is introduced in its turn, and the save remembers which have been', 'saved as seen: ' + seenSaved);
    await ip.reload(); await ip.waitForTimeout(600); await startIp();
    const i3 = await watchIntro(9000);
    check(!i3.started, 'an enemy already introduced is not introduced again in a later run');
    // on the test bench: introductions can be switched on for a test run, which leaves the save's list alone
    await ip.goto('file://' + GAME + '?gfx=low&debug'); await ip.waitForTimeout(600);
    if ((await ip.textContent('#dbgIntro')).endsWith('off')) await ip.tap('#dbgIntro');
    await ip.tap('#dbgClear'); await ip.tap('#dbgBoss [data-w="6"]'); if ((await ip.textContent('#dbgGod')).endsWith('off')) await ip.tap('#dbgGod');
    await ip.tap('#dbgGo'); await ip.waitForFunction(() => window.__swarmfall.G.state === 'play', null, { timeout: 30000 });
    const i4 = await through(0.6);
    const seenAfter = await ip.evaluate(() => Object.keys(window.__swarmfall.meta.seen).sort().join());
    check(i4.key === 'boss' && i4.name === 'Hive Core' && i4.kind === 'New boss' && seenAfter === 'mite,wasp' && steers, 'test bench: "Introduce enemies" shows them on a test run (a boss here) without touching the save', i4.name + ' · save still has ' + seenAfter);
    await ip.context().close();
  },
  // A short phone: every screen keeps its main buttons on screen and says when there is more.
  small: async () => {
    // ---- a short phone: every screen keeps its main buttons on screen and says when there is more below ----
    const sm = await (await browser.newContext({ ...devices['iPhone SE'] })).newPage();
    sm.on('pageerror', e => errors.push('[small] ' + e.message));
    await sm.route('**/fonts.googleapis.com/**', r => r.fulfill({ body: '', contentType: 'text/css' }));
    await sm.goto('file://' + GAME + '?gfx=low&intro=off'); await sm.waitForTimeout(600);
    const barOf = id => sm.evaluate(id => { const el = document.getElementById(id), inView = [...el.querySelectorAll('.dockbar .btn')].filter(b => !b.hidden).every(b => { const r = b.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight; });
      return { scrolls: el.scrollHeight > el.clientHeight + 2, more: !el.querySelector('.more').hidden, inView }; }, id);
    const okBar = b => b.inView && b.more === b.scrolls;   // buttons on screen; the tab shows exactly when there is something to scroll to
    const small = { title: await barOf('scrTitle') };
    await sm.tap('#btnStation'); await sm.waitForTimeout(400); small.station = await barOf('scrStation');
    await sm.evaluate(() => { const el = document.getElementById('scrStation'); el.scrollTop = el.scrollHeight; }); await sm.waitForTimeout(300); const stEnd = await barOf('scrStation');
    await sm.tap('#btnStationLaunch'); await sm.waitForFunction(() => window.__swarmfall.G.state === 'play', null, { timeout: 60000 });
    await sm.evaluate(() => { const s = window.__swarmfall; for (const k of ['rapid', 'heavy', 'twin', 'pierce', 'shield', 'drone', 'crit', 'blast', 'missile', 'chain']) s.G.up[k] = 1; s.recalc(); s.P.inv = 99; });
    await sm.tap('#btnPause'); await sm.waitForTimeout(300); small.pause = await barOf('scrPause'); await sm.tap('#btnResume');
    await sm.evaluate(() => { const s = window.__swarmfall; s.G.wave = 2; s.nextWave(); s.G.queue.length = 0; s.G.flights = 0; for (const e of s.G.enemies) e.hp = 0; });
    await sm.waitForFunction(() => window.__swarmfall.G.state === 'draft', null, { timeout: 60000 }); await sm.waitForTimeout(300); small.booster = await barOf('scrDraft');
    check(Object.values(small).every(okBar) && small.station.scrolls && stEnd.inView && !stEnd.more, 'short phone: every screen keeps its main buttons on screen, with "More below" whenever there is more', JSON.stringify(small));
    if (OUT) await sm.screenshot({ path: path.join(OUT, '15-short-phone-booster.png') });
    await sm.context().close();
  },
};
const ABOUT = {
  core: 'a whole run: launch, shuttle, booster, Hive Core and its death scene, docking, station, death, reload',
  waves: 'which enemy arrives on which wave, how fast they fly in, the order of the bosses, the beetle\'s numbers, reinforcements',
  bosses: 'the four later bosses: attacks, special rules, docking; the station\'s bottom bar',
  clouds: 'Flame Cloud, Confusion Gas, darts',
  released: 'ships a boss releases',
  sentry: 'sentry satellites and the Laser Drone',
  stress: 'every booster at once on late waves; pause; the Graphics button',
  gfx: 'every effect on; the automatic step-down',
  bench: 'the test bench and test runs',
  intro: 'enemy introductions',
  small: 'a short phone: bottom bars and "More below" on every screen',
};

(async () => {
  const names = Object.keys(GROUPS);
  if (ARGS.includes('--list')) { for (const n of names) console.log(n.padEnd(9) + ABOUT[n]); return; }
  const want = ONLY ? ONLY.split(',').map(s => s.trim()).filter(Boolean) : names, unknown = want.filter(n => !GROUPS[n]);
  if (unknown.length) { console.error('no such group: ' + unknown.join(', ') + '. Groups: ' + names.join(', ')); process.exit(1); }
  browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const t0 = Date.now();
  for (const n of want) {
    const g0 = Date.now(), f0 = failures; console.log('--- ' + n + ': ' + ABOUT[n]);
    try { await GROUPS[n](); } catch (e) { check(false, n + ': the group ran to its end', String(e && e.message || e).split('\n')[0]); }   // one group breaking does not stop the rest
    console.log('    (' + n + ': ' + Math.round((Date.now() - g0) / 1000) + ' s' + (failures > f0 ? ', ' + (failures - f0) + ' failed' : '') + ')');
  }
  check(errors.length === 0, 'no page errors', errors.slice(0, 5).join(' | '));
  await browser.close();
  console.log((failures ? failures + ' check(s) failed' : 'all checks passed') + ' · ' + (ONLY ? 'groups: ' + want.join(', ') : 'every group') + ' · ' + Math.round((Date.now() - t0) / 1000) + ' s');
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
