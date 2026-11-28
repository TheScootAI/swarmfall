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
async function open(query = '?gfx=low&intro=off&sim=off', device = 'iPhone 13') {   // device: a name Playwright knows, or a description of one
  const page = await (await browser.newContext(typeof device === 'string' ? { ...devices[device] } : device)).newPage();
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
  const playTo = async target => { for (let i = 0; i < 400; i++) { const s = await st(); if (target(s)) return s; if (s.state === 'play') await clearWave(); else if (s.state === 'draft') await page.evaluate(() => { const c = document.querySelector('#scrDraft .card'); if (c) c.click(); });   // a booster choice in the way: take the first
    await page.waitForTimeout(120); } return st(); };
  await page.goto('file://' + GAME + query); await page.waitForTimeout(600);
  return { page, st, waitFor, clearWave, playTo, shot };
}

const GROUPS = {
  // A whole run: launch, the booster shuttle, a booster, the Hive Core and its death scene, docking, the station, death, reload.
  core: async () => {
    const { page, st, waitFor, clearWave, playTo, shot } = await open(); let s;
    // The main run has the effects off (?gfx=low): software rendering is slow, and these checks are about the game's rules.
    // The graphics checks at the end turn them on.
    await page.goto('file://' + GAME + '?gfx=low&intro=off&sim=off'); await page.waitForTimeout(600);
    check(await page.evaluate(() => !!window.__swarmfall), 'game boots');
    s = await st();
    check(s.state === 'title' && s.mods === 'dmg,hull', 'new save: title screen, two station modules', JSON.stringify(s));
    await shot('01-title');

    await page.tap('#btnPlay');
    s = await waitFor(x => x.state === 'cut'); check(s.cut === 'launch', 'Launch opens the launch cutscene');
    s = await waitFor(x => x.state === 'play'); check(s.wave === 1, 'wave 1 starts after the launch');
    await page.waitForTimeout(400); await shot('02-wave1');
    // the second tap of a double tap on the playfield refuses the phone's own gesture (its text magnifier, a zoom); a first tap is left alone, since sound may only start from an ordinary tap; a button always keeps its tap
    const tch = await page.evaluate(() => new Promise(done => { const fire = (el, type = 'touchstart') => { const ev = new TouchEvent(type, { bubbles: true, cancelable: true }); el.dispatchEvent(ev); return ev.defaultPrevented; }, stage = document.getElementById('stage'), out = {};
      setTimeout(() => { out.first = fire(stage); fire(stage, 'touchend'); out.second = fire(stage); out.button = fire(document.getElementById('btnPause')); fire(stage, 'touchend');
        setTimeout(() => { out.later = fire(stage); done(out); }, 600); }, 600); }));
    check(tch.first === false && tch.second === true && tch.button === false && tch.later === false, 'only the second tap of a double tap on the playfield refuses the phone\'s own gesture; a first tap, a later tap and a button keep theirs', JSON.stringify(tch));
    s = await playTo(x => x.state === 'clear' && x.wave === 1);
    check((await page.textContent('#toast')).includes('Booster shuttle inbound'), 'the shuttle is announced after wave 1');
    // the quiet after a wave lasts 3 seconds (CLEAR.wave) before the next wave, or the shuttle
    const gap = await page.evaluate(() => { const s = window.__swarmfall; return { set: s.CLEAR.wave, left: s.G.clearT }; });
    check(gap.set === 3 && gap.left > 2.3 && gap.left <= 3, 'the gap between waves is 3 seconds', 'CLEAR.wave ' + gap.set + ', ' + gap.left.toFixed(2) + ' s left when first seen');

    s = await playTo(x => x.state === 'cut' && x.cut === 'shuttle'); check(s.wave === 1, 'booster shuttle arrives after wave 1', 'wave ' + s.wave);
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
    await page.tap('.card'); s = await waitFor(x => x.state === 'play'); check(s.wave === 2, 'wave 2 starts after picking a booster');
    const handOver = await page.evaluate(() => new Promise(res => { const s = window.__swarmfall, out = { crossed: false, gone: false }, t0 = performance.now();
      (function f() { if (s.SH.gift >= 0) { out.crossed = true; out.podLeftShuttle = !s.SH.pod; } if (out.crossed && s.SH.gift < 0 && !s.SH.on) { out.gone = true; return res(out); } if (performance.now() - t0 > 8000) return res(out); requestAnimationFrame(f); })(); }));
    check(side.beside && side.pod && side.on && handOver.crossed && handOver.podLeftShuttle && handOver.gone, 'the shuttle holds beside the ship, the chosen booster crosses over, and the shuttle drops back', JSON.stringify({ ...side, ...handOver }));

    await page.evaluate(() => { window.__swarmfall.G.run.scrap += 120; });   // enough to buy Reinforced Hull (90) at the station
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
    // the next shuttle comes after wave 4 (SHUTTLE), and the words after each wave count down to it
    s = await playTo(x => x.state === 'clear' && x.wave === 2); const toast2 = await page.textContent('#toast');
    s = await playTo(x => x.state === 'clear' && x.wave === 3); const toast3 = await page.textContent('#toast');
    check(toast2.includes('arrives in 2 waves') && toast3.includes('after the next wave'), 'the countdown to the next shuttle after waves 2 and 3', toast2 + ' | ' + toast3);
    s = await playTo(x => x.state === 'cut' && x.cut === 'shuttle'); check(s.wave === 4, 'the second shuttle arrives after wave 4', 'wave ' + s.wave);
    s = await playTo(x => x.state === 'cut' && x.cut === 'dock'); check(s.wave === 6 && s.state === 'cut', 'Hive Core on wave 6 leads to docking', 'wave ' + s.wave + ' ' + s.state);
    const fin = await page.evaluate(() => { const s = window.__swarmfall; return { ...window.__fin, on: s.FIN.on, speed: s.G.speed, z: s.camera.position.z, picksLeft: s.G.picks.length }; });
    check(fin.slowest < 0.3 && fin.closest > 0.999, 'the Hive Core dies in slow motion, and the camera stays where it is', JSON.stringify(fin));
    check(!fin.hurt && fin.grace > 0.3, 'the ship cannot be hit during the core\'s death scene, nor for a moment after', 'grace ' + fin.grace);
    check(!fin.on && fin.speed === 1 && Math.abs(fin.z - fin.far) < 0.01, 'speed and camera are back to normal by the time docking starts', JSON.stringify(fin));
    check(fin.sps.length === 14 && fin.worth === 14 && new Set(fin.sps).size >= 10 && Math.max(...fin.sps) === 1 && Math.min(...fin.sps) < 0.6 && fin.gotLast - fin.gotFirst > 0.3 && fin.picksLeft === 0, 'the boss\'s scrap is a shower of 14 single rings, which fly to the ship at different speeds and are all in before docking', fin.sps.length + ' rings worth ' + fin.worth + ', speeds ' + Math.min(...fin.sps) + ' to 1, collected over ' + (fin.gotLast - fin.gotFirst).toFixed(2) + ' s of game time');
    s = await waitFor(x => x.state === 'station'); check(s.state === 'station' && s.mods === 'dmg,hull,shield', 'docked: Aegis Generator fitted', s.mods);
    check(s.scrap >= 120, 'docking banks the run\'s scrap', 'scrap ' + s.scrap);
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
      let x0 = null, y0 = 0;
      const tick = () => { P.inv = 99; e.hp = e.maxHp; G.queue.length = 0; P.x = P.target = 250;
        if (e.shots < was) { out.fired += was - e.shots; if (e.shots === 1) out.gap = e.shootT; was = e.shots; if (e.shots === 0) { x0 = e.x; y0 = e.y; out.aside = 0; } }
        // after its last missile it must not fly over them: it slides to one side first, then dives on a diagonal
        if (x0 !== null && !e.dead) { if (e.y - y0 < 20) out.aside = Math.max(out.aside, Math.round(Math.abs(e.x - x0))); else if (e.y - y0 > 150 && out.slope === undefined) { out.slope = +(Math.abs(e.vx) / e.vy).toFixed(2); out.toward = Math.sign(e.vx) === Math.sign(P.x - x0); } }
        if (out.slope !== undefined || e.dead || performance.now() - t0 > 20000) { out.started = was; return done(out); }
        requestAnimationFrame(tick); };
      requestAnimationFrame(tick); }));
    check(bt.hits === 13, 'a beetle takes 13 hits on the wave it arrives', bt.hits + ' hits');
    check(bt.fired === 2 && bt.set === 0.8 && bt.gap > 0.7 && bt.gap <= 0.8, 'a beetle launches two missiles 0.8 seconds apart', JSON.stringify(bt));
    check(bt.aside >= 55 && bt.slope > 0.5 && bt.slope < 1.1 && bt.toward === true, 'after its missiles a beetle slides to one side, then dives on a diagonal, not straight down over them', JSON.stringify({ aside: bt.aside, slope: bt.slope, toward: bt.toward }));
    // Escorts (ESCORT): mites that leave the formation with a stronger enemy fly side by side just ahead of it. A beetle's three
    // make a wall in front of it while it stops to launch its missiles. With the beetle gone they carry on as ordinary divers.
    const es = await page.evaluate(() => new Promise(done => { const s = window.__swarmfall, { G, P } = s, E = s.ESCORT, out = { table: E.beetle.n + ' ' + E.beetle.chance + ' ' + E.wasp.n + ' ' + E.wasp.chance + ' from ' + E.from + ' ' + !!E.mite + !!E.triplet + !!E.lancer }, t0 = performance.now();
      for (const e of G.enemies) { e.dead = true; s.scene.remove(e.g); } G.eb.length = 0; G.em.length = 0; G.wave = s.UNLOCK.beetleTopRow - 1; s.nextWave(); G.flights = 0;
      for (const q of G.queue) q.fn(); G.queue.length = 0;
      let step = 0, b = null, esc = [], frames = 0;
      (function f() { P.inv = 99; P.fireT = 9; G.diveT = 99; G.shootT = 99; P.x = P.target = 180;   // mid-field: a beetle follows the ship, and one pulled against the edge has no room for its wall
         G.em.length = 0;
        if (performance.now() - t0 > 40000) { out.timeout = step; return done(out); }
        const formed = G.enemies.filter(e => !e.dead && e.state === 'form');
        if (step === 0 && formed.length >= G.form.size) { b = formed.filter(e => e.type === 'beetle').sort((p, q) => Math.abs(p.x - 180) - Math.abs(q.x - 180))[0] || s.spawnEnemy('beetle', null, null, { x: 180, y: 100 });   // the roll does not always leave a beetle in the formation: then the check brings its own
          s.launchDive(b); out.sent = s.sendEscort(b, E.beetle.n); esc = G.enemies.filter(e => e.lead === b); out.mites = esc.length === out.sent && esc.every(e => e.type === 'mite' && e.state === 'dive'); step = 1; }
        else if (step === 1 && b.shots === 1) {   // the beetle has stopped and launched its first missile: where is its escort?
          out.ahead = esc.map(m => Math.round(m.y - b.y)); out.across = esc.map(m => Math.round(m.x - b.x)).sort((p, q) => p - q); out.alive = esc.every(m => !m.dead && m.state === 'dive');
          b.dead = true; s.scene.remove(b.g); step = 2; }
        else if (step === 2 && ++frames > 5) { out.released = esc.every(m => m.lead === null && (m.dead || m.state === 'dive')); for (const e of G.enemies) { e.dead = true; s.scene.remove(e.g); } return done(out); }
        requestAnimationFrame(f); })(); }));
    check(es.table === '3 0.8 2 0.6 from 2 falsefalsefalse' && es.sent === 3 && es.mites === true, 'escorts: from wave 2; three of the nearest mites leave with a beetle, two with a wasp; mites, triplets and lancers get none', JSON.stringify(es));
    check(es.alive === true && es.ahead.every(d => d > 18 && d < 42) && es.across.length === 3 && Math.abs(es.across[0] + 24) < 9 && Math.abs(es.across[1]) < 9 && Math.abs(es.across[2] - 24) < 9, 'a beetle\'s escort holds a wall just in front of it while it launches its missiles', JSON.stringify({ ahead: es.ahead, across: es.across }));
    check(es.released === true, 'with the beetle gone, its escort carries on as ordinary divers');
    // Fire from the formation. Before wave 7 only wasps fire, and only darts: with no wasp sitting, nothing fires. From wave 7 the rest join in with slow balls.
    const ff = await page.evaluate(() => new Promise(done => { const s = window.__swarmfall, { G, P } = s, out = { early: { darts: 0, other: 0, quiet: 0 }, late: { darts: 0, other: 0 }, from: s.UNLOCK.formationFire }, t0 = performance.now();
      const build = w => { for (const e of G.enemies) { e.dead = true; s.scene.remove(e.g); } G.eb.length = 0; G.em.length = 0; G.wave = w - 1; s.nextWave(); G.flights = 0; for (const q of G.queue) q.fn(); G.queue.length = 0; };
      let step = 0, tries = 0; build(5);
      (function f() { P.inv = 99; P.fireT = 9; G.diveT = 99; G.em.length = 0; for (const e of G.enemies) if (e.def.latch) e.leap = 9;
        if (performance.now() - t0 > 60000) { out.timeout = step; return done(out); }
        const formed = G.enemies.filter(e => !e.dead && e.state === 'form');
        for (const b of G.eb) if (!b.seen) { b.seen = true; if (step === 1) { if (b.kind === 1) out.early.darts++; else out.early.other++; } else if (step === 2) out.early.quiet++; else if (step === 4) { if (b.kind === 1) out.late.darts++; else out.late.other++; } }
        if (step === 0 || step === 3) { G.shootT = 99; if (G.waveT > 2.6 && formed.length >= G.form.size) step++; }
        else if (step === 1) { G.shootT = 0; if (++tries >= 50) { for (const e of G.enemies) if (e.type === 'wasp') { e.dead = true; s.scene.remove(e.g); } tries = 0; step = 2; } }
        else if (step === 2) { G.shootT = 0; if (++tries >= 40) { tries = 0; build(9); step = 3; } }
        else if (step === 4) { G.shootT = 0; if (++tries >= 80) { for (const e of G.enemies) { e.dead = true; s.scene.remove(e.g); } G.eb.length = 0; return done(out); } }
        requestAnimationFrame(f); })(); }));
    check(ff.from === 7 && ff.early.darts >= 30 && ff.early.other === 0 && ff.early.quiet === 0, 'before wave 7 only wasps fire from the formation, and only darts; with no wasp sitting, nothing fires', JSON.stringify(ff.early));
    check(ff.late.darts > 0 && ff.late.other > 0, 'from wave 7 the rest of the formation fires too, with slow balls', JSON.stringify(ff.late));
    // In flight: before wave 7 only a wasp fires as it dives; from wave 7 a diving weaver and a diving splitter each fire one slow ball. A mite never does.
    const df = await page.evaluate(() => new Promise(done => { const s = window.__swarmfall, { G, P } = s, out = {}, t0 = performance.now();
      const dive = (wave, type) => { G.wave = wave; const e = s.spawnEnemy(type, null, null, { x: 180, y: 100 }); s.launchDive(e); const n = e.shots; e.dead = true; s.scene.remove(e.g); return n; };
      for (const e of G.enemies) { e.dead = true; s.scene.remove(e.g); } G.eb.length = 0; G.flights = 0;
      out.early = [dive(5, 'weaver'), dive(5, 'mite'), dive(5, 'wasp')].join(); out.late = [dive(9, 'weaver'), dive(9, 'splitter'), dive(9, 'mite'), dive(9, 'wasp')].join(); out.quiet = [dive(14, 'weaver'), dive(14, 'wasp')].join();
      G.wave = 9; G.eb.length = 0; const guard = s.spawnEnemy('mite', 0, 0); guard.hp = guard.maxHp = 1e12; const w = s.spawnEnemy('weaver', null, null, { x: 180, y: 100 }); s.launchDive(w); w.hp = w.maxHp = 1e12;
      (function f() { P.inv = 99; P.fireT = 9; G.diveT = 99; G.shootT = 99; guard.hp = 1e12;
        if (G.eb.length && out.ball === undefined) out.ball = G.eb[0].kind === 0;
        if (out.ball !== undefined || w.dead || performance.now() - t0 > 15000) { for (const e of G.enemies) { e.dead = true; s.scene.remove(e.g); } G.eb.length = 0; return done(out); }
        requestAnimationFrame(f); })(); }));
    check(df.early === '0,0,2' && df.late === '1,1,0,3' && df.quiet === '0,0' && df.ball === true, 'in flight: before wave 7 only a wasp fires; from wave 7 a diving weaver and splitter each fire one slow ball; a mite never does; nobody on a quiet wave', JSON.stringify(df));
    // (The diving wasp and beetle are the check's own: the formation's roll does not always hold a beetle.)
    // Quiet waves: on every 14th wave (never a boss wave) nothing fires. No darts from the formation or from a diving wasp, no missiles from a beetle, no laser.
    const qw = await page.evaluate(() => new Promise(done => { const s = window.__swarmfall, { G, P } = s, out = { which: [14, 28, 42, 13, 56].map(w => s.quietWave(w)).join() , shots: 0, missiles: 0, laser: false }, t0 = performance.now();
      for (const e of G.enemies) { e.dead = true; s.scene.remove(e.g); } G.eb.length = 0; G.em.length = 0; G.wave = 27; s.nextWave(); G.flights = 0; out.toast = document.getElementById('toast').textContent;
      for (const q of G.queue) q.fn(); G.queue.length = 0;
      let step = 0, at = 0, w = null, b = null;
      (function f() { P.inv = 99; P.fireT = 9; for (const e of G.enemies) { if (e.def.latch) e.leap = 9; if (e.laser) { e.laser.t = 0; if (e.laser.phase !== 'idle') out.laser = true; } }
        if (performance.now() - t0 > 40000) { out.timeout = step; return done(out); }
        out.shots = Math.max(out.shots, G.eb.length); out.missiles = Math.max(out.missiles, G.em.length);
        const formed = G.enemies.filter(e => !e.dead && e.state === 'form');
        if (step === 0) { G.shootT = 99; G.diveT = 99; if (G.waveT > 2.6 && formed.length >= G.form.size) { out.lancers = G.enemies.filter(e => e.laser).length; w = s.spawnEnemy('wasp', null, null, { x: 110, y: 130 }); b = s.spawnEnemy('beetle', null, null, { x: 250, y: 130 }); s.launchDive(w); s.launchDive(b); out.sent = 'wasp beetle'; out.waspShots = w && w.shots; out.beetleShots = b && b.shots; at = G.time; step = 1; } }
        else if (step === 1) { G.shootT = 0; G.diveT = 99; if (G.time - at > 4) { for (const e of G.enemies) { e.dead = true; s.scene.remove(e.g); } G.eb.length = 0; G.em.length = 0; return done(out); } }
        requestAnimationFrame(f); })(); }));
    check(qw.which === 'true,true,false,false,true' && qw.toast.includes('Quiet wave'), 'quiet waves: every 14th wave, but never a boss wave, and the player is told', JSON.stringify({ '14,28,42,13,56': qw.which, toast: qw.toast }));
    check(qw.sent === 'wasp beetle' && qw.lancers > 0 && qw.shots === 0 && qw.missiles === 0 && qw.laser === false && qw.waspShots === 0 && qw.beetleShots === 0, 'on a quiet wave nothing fires: no darts from the formation or a diving wasp, no missiles from a beetle, no laser', JSON.stringify(qw));
    // Drops. Every enemy's scrap chance is halved (SCRAP_RATE): a mite pays 15% of the time. An elite's ring is worth 3. Elites give at most two repair crosses a wave.
    const dr = await page.evaluate(() => new Promise(done => { const s = window.__swarmfall, { G, P, S } = s, real = Math.random, out = { rate: s.SCRAP_RATE, got: [] }, t0 = performance.now();
      for (const e of G.enemies) { e.dead = true; s.scene.remove(e.g); } G.queue.length = 0; G.flights = 0; G.repairs = 0; G.state = 'play';
      const guard = s.spawnEnemy('mite', 0, 0); guard.hp = guard.maxHp = 1e12;   // keeps the wave from counting as cleared
      const jobs = [{ roll: 0.2 }, { roll: 0.1 }, { roll: 0.2, elite: true }, { roll: 0, elite: true }, { roll: 0, elite: true }, { roll: 0, elite: true }, { roll: 0, elite: true }], seen = new Set(G.picks);
      let job = null, e = null, wait = 0, hearts = 0;
      (function f() { P.inv = 99; P.fireT = 9; G.diveT = 99; G.shootT = 99; S.maxHp = 3; P.hp = 1; guard.hp = 1e12;
        if (performance.now() - t0 > 20000) { Math.random = real; out.timeout = true; return done(out); }
        if (!job) { job = jobs.shift(); if (!job) { Math.random = real; out.hearts = hearts; out.repairs = G.repairs; guard.dead = true; s.scene.remove(guard.g); return done(out); }
          e = s.spawnEnemy('mite', 3, 1, { elite: !!job.elite }); wait = 3; }
        else if (wait > 0) { if (--wait === 0) { Math.random = () => job.roll; G.pb.push({ x: e.x, y: e.y, vx: 0, vy: 0, dmg: 1e7, pierce: 0, rico: 0, crit: false, kind: 0, hit: null, dead: false }); } }
        else if (e.dead) { Math.random = real; let worth = 0; for (const p of G.picks) if (!seen.has(p)) { seen.add(p); if (p.kind === 'scrap') worth += p.worth; else hearts++; } out.got.push(worth); job = null; }
        requestAnimationFrame(f); })(); }));
    check(dr.rate === 0.5 && dr.got[0] === 0 && dr.got[1] === 1, 'scrap drops are halved: a mite pays 15% of the time, not 30%', JSON.stringify(dr));
    check(dr.got[2] === 0 && dr.got[3] === 3 && dr.hearts === 2 && dr.repairs === 2, 'an elite\'s ring is worth 3 and drops as often as the enemy underneath pays; elites give at most two repair crosses a wave', JSON.stringify(dr));
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
    const first = await page.evaluate(() => { const s = window.__swarmfall, first = {};
      for (let w = 1; w <= 31; w++) for (let k = 0; k < 30; k++) {
        for (const e of s.G.enemies) e.dead = true; s.G.enemies = []; s.G.wave = w - 1; s.nextWave(); for (const q of s.G.queue) q.fn(); s.G.queue.length = 0;
        for (const e of s.G.enemies) for (const t of [e.type, e.elite && 'elite']) if (t && !(t in first)) first[t] = w;
        if (k === 0) (first.flight || (first.flight = {}))[w] = +(s.G.enemies.find(e => e.type === 'mite') || { dur: 0 }).dur.toFixed(3);   // seconds a mite takes to fly into its place
      }
      return first; });
    // the game's UNLOCK table says when each enemy arrives; check the waves it builds agree
    const U = await page.evaluate(() => window.__swarmfall.UNLOCK);
    const expected = { mite: 1, wasp: U.wasp, weaver: U.weaver, splitter: U.splitter, elite: U.elite, beetle: U.beetle, latcher: U.latcher, triplet: U.triplet, lancer: U.lancer[0] };
    for (const [t, w] of Object.entries(expected)) check(first[t] === w, t + ' first appears on wave ' + w + ' (UNLOCK)', 'seen first on ' + first[t]);
    const lancersAt = await page.evaluate(L => L.map(w => { const s = window.__swarmfall; for (const e of s.G.enemies) e.dead = true; s.G.enemies = []; s.G.wave = w - 1; s.nextWave(); for (const q of s.G.queue) q.fn(); s.G.queue.length = 0; return s.G.enemies.filter(e => e.type === 'lancer').length; }), U.lancer);
    check(lancersAt.join() === '1,2,3', 'lancers: 1, 2 and 3 from waves ' + U.lancer.join(', '), 'got ' + lancersAt.join(','));
    // Elites: none before wave 8, then a growing share of every wave, until every enemy is one on wave 40: triplets and lancers too.
    const el = await page.evaluate(() => { const s = window.__swarmfall, out = {};
      for (const w of [7, 8, 20, 40]) { let n = 0, k = 0, kinds = new Set();
        for (let i = 0; i < 15; i++) { for (const e of s.G.enemies) e.dead = true; s.G.enemies = []; s.G.wave = w - 1; s.nextWave(); for (const q of s.G.queue) q.fn(); s.G.queue.length = 0; s.G.flights = 0;
          for (const e of s.G.enemies) { n++; if (e.elite) { k++; kinds.add(e.type); } } }
        out[w] = { share: +(k / n).toFixed(3), want: +s.eliteShare(w).toFixed(2), kinds: [...kinds].sort().join() }; }
      for (const e of s.G.enemies) e.dead = true; s.G.enemies = [];
      out.after = []; for (let w = 1; w <= 40; w++) if (s.shuttleAfter(w)) out.after.push(w);
      return out; });
    check(el[7].share === 0 && el[8].share > 0 && el[8].share < 0.12 && Math.abs(el[20].share - 0.4) < 0.08 && el[40].share === 1 && el[40].want === 1, 'elites: none before wave 8, about 4% then, 40% on wave 20, every enemy on wave 40', JSON.stringify({ 7: el[7].share, 8: el[8].share, 20: el[20].share, 40: el[40].share }));
    check(el[40].kinds === 'beetle,lancer,latcher,mite,splitter,triplet,wasp,weaver', 'on wave 40 every kind of enemy is an elite, triplets and lancers too', el[40].kinds);
    check(el.after.join() === '1,4,9,14,19,29,34,39', 'the booster shuttle comes after waves 1, 4 and 9, then every 5th wave, but never after a boss wave (24)', el.after.join());
    // enemies fly into the formation 5% faster each wave: wave 1 takes 2.3 seconds, wave 11 two thirds of that, and it levels off at 2.5 times the pace
    const fl = first.flight; check(fl[1] === 2.3 && Math.abs(fl[11] - 2.3 / 1.5) < 0.002 && Math.abs(fl[2] - 2.3 / 1.05) < 0.002 && Math.abs(fl[31] - 0.92) < 0.002 && fl[29] > fl[31], 'enemies fly into the formation 5% faster each wave, up to 2.5 times', 'wave 1: ' + fl[1] + ' s, 2: ' + fl[2] + ', 11: ' + fl[11] + ', 31: ' + fl[31]);
    // the bosses take turns, in the order of the BOSSES table: one every 6th wave
    const order = await page.evaluate(() => window.__swarmfall.BOSSES.map(b => b.type));
    check(order.every((type, i) => first[type] === 6 * (i + 1)) && order.length === 5, 'bosses arrive in turn on waves 6, 12, 18, 24 and 30', order.map(type => type + ' ' + first[type]).join(', '));
    // A boss's sweep across the top: not the same line every time. Three sweeps are run a minute and a half each.
    const sw = await page.evaluate(() => { const s = window.__swarmfall, run = () => { const o = {}, xs = []; let fast = 0, last = null, min = 1e9, max = -1e9, first = 0;
        for (let i = 0; i < 5400; i++) { const x = s.bossSway(o, 1 / 60, 0.55, 116); if (last === null) first = x; else fast = Math.max(fast, Math.abs(x - last) * 60); last = x; min = Math.min(min, x); max = Math.max(max, x); if (i % 30 === 0) xs.push(x); }
        return { xs, fast, min, max, first }; };
      const a = run(), b = run(), c = run(), apart = (p, q) => Math.max(...p.xs.map((x, i) => Math.abs(x - q.xs[i])));
      return { first: [a, b, c].map(r => Math.round(r.first)), min: Math.round(Math.min(a.min, b.min, c.min)), max: Math.round(Math.max(a.max, b.max, c.max)), fast: Math.round(Math.max(a.fast, b.fast, c.fast)), apart: [apart(a, b), apart(a, c), apart(b, c)].map(Math.round), bothSides: [a, b, c].every(r => r.min < 160 && r.max > 200) }; });
    check(sw.first.every(x => Math.abs(x - 180) <= 2) && sw.min >= 64 && sw.max <= 296 && sw.fast < 120 && sw.bothSides, 'a boss\'s sweep starts from the middle, keeps to its own stretch of the top, visits both sides and never outruns the ship', JSON.stringify(sw));
    check(sw.apart.every(d => d > 60), 'and it is a different sweep every time: three of them end up far apart', JSON.stringify(sw.apart));
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
          // The second cloud's rammers finish off what was left of the formation, and the wave would end (in a shuttle, on wave 4).
          // So the rest of the scene gets a fresh formation of its own, on a wave no shuttle follows.
          if (since() > 2) { for (const c of s.clouds) { c.on = false; c.mesh.visible = false; } for (const e of G.enemies) { e.dead = true; s.scene.remove(e.g); } G.wave = 2; s.nextWave(); G.flights = 0; go(3.9); }
        } else if (step === 3.9) { if (G.waveT > 5 && formed.length >= 8) { G.up.gas = 1; s.recalc(); P.gasT = 0.05; go(4); }
        } else if (step === 4) {
          const mine = s.clouds.find(c => c.on && c.kind === 0); if (mine) { out.auto = true; out.cloudAbove = +(P.y - mine.ty).toFixed(0); out.belowFormation = mine.ty > Math.max(...formed.map(e => e.y), 0) + 30; }
          if (!out.auto) out.why = { state: G.state, gas: s.S.gas, gasT: +P.gasT.toFixed(2), alive: P.alive, enemies: G.enemies.length, on: s.clouds.filter(c => c.on).length, wave: G.wave };   // what stood in the way, if no cloud came
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
    check(cl.auto === true && cl.belowFormation === true && cl.cloudAbove >= 150 && cl.cloudAbove <= 270, 'with the booster, the ship lobs a cloud into the open lanes below the formation', cl.cloudAbove + ' above the ship' + (cl.auto ? '' : ' ' + JSON.stringify(cl.why)));
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
      let step = 0, at = 0, sum0 = 0, seen3 = 0, lasT = null, other = null, laneHp = 0, otherHp = 0, killAt = 0;
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
        else if (step === 7 && since() > 0.5) { P.x = P.target = 180; G.up.beam = 1; s.recalc(); P.lasT = 0.05; go(8); }   // the Laser Drone
        else if (step === 8) {   // with everything sitting in the formation it has nothing to aim at: it only takes enemies in flight
          if (P.las) out.tookSitter = true;
          if (since() > 1.2) { lasT = formed[formed.length - 1]; other = formed[0]; laneHp = lasT.hp; otherHp = other.hp; s.launchDive(lasT); out.stayed = true; go(9); }
        }
        else if (step === 9) {   // one leaves the formation: it locks on, sets it alight and stays on it until it is destroyed; nothing else is touched
          if (!lasT.dead) { if (P.las === lasT) out.locked = true; else if (out.locked) out.stayed = false; if (lasT.lit > 0 && lasT.hp < laneHp) out.burning = true; }
          else { out.killedIn = +since().toFixed(2); out.otherUntouched = !other.dead && other.hp === otherHp; killAt = G.time; go(10); }
          if (since() > 8) { out.laserTimeout = true; G.up.beam = 0; s.recalc(); return res(out); }
        }
        else if (step === 10 && since() > 0.3) { out.idleAgain = !P.las; const n = formed.find(e => e !== other); lasT = n; if (n) s.launchDive(n); go(11); }   // none in flight again: it waits; then the next to leave
        else if (step === 11 && (P.las === lasT || since() > 3)) { out.lockedNext = !!lasT && P.las === lasT; out.laserRest = +(G.time - killAt).toFixed(2); if (lasT) { lasT.dead = true; s.scene.remove(lasT.g); } go(12); }
        else if (step === 12 && since() > 0.3) {   // a latcher on its way is fair game; once it has clamped onto the ship the drone leaves it alone
          P.inv = 0; G.eb.length = 0; P.lasT = 0; lasT = s.spawnEnemy('latcher', null, null, { x: P.x + 6, y: P.y - 200 }); lasT.hp = lasT.maxHp = 1e9; s.launchDive(lasT); lasT.x = P.x + 6; lasT.y = P.y - 200; lasT.vx = 0; lasT.vy = 120; go(13); }
        else if (step === 13) { P.inv = 0; G.eb.length = 0;   // no protection, so that it can clamp on; and no stray darts from the wasp that dived a moment ago
          if (lasT.state === 'dive' && P.las === lasT) out.tookLeaper = true;
          if (lasT.state === 'latch') { if (out.clampedAt === undefined) out.clampedAt = G.time; else if (G.time - out.clampedAt > 0.3) { out.letGo = P.las !== lasT && !(lasT.lit > 0); lasT.dead = true; s.scene.remove(lasT.g); go(14); } }
          else if (since() > 6) { out.latcherTimeout = lasT.state + (P.alive ? '' : ', ship lost'); go(14); } }
        else if (step === 14) { for (const e of G.enemies) { e.dead = true; s.scene.remove(e.g); } G.eb.length = 0; G.em.length = 0; const g = s.spawnEnemy('mite', 0, 0); g.hp = g.maxHp = 1e12;   // a missile: the drone takes it and burns it out of the air
          P.lasT = 0; P.x = P.target = 60; s.fireMissile(300, 200); lasT = G.em[G.em.length - 1]; go(14.5); }
        else if (step === 14.5) { if (P.las === lasT) out.tookMissile = true; if (lasT.dead || since() > 3) { out.missileGone = lasT.dead; out.missileIn = +since().toFixed(2); out.shipUnhurt = P.alive; go(14.7); } }
        else if (step === 14.7) { for (const e of G.enemies) { e.dead = true; s.scene.remove(e.g); } G.wave = 5; s.nextWave(); P.lasT = 0; go(15); }   // a boss wave: the drone never takes the boss itself, only what the boss lets loose
        else if (step === 15) {
          if (P.las && P.las.def) { if (P.las.def.boss) out.tookBoss = true; else out.tookHelper = true; }   // (a missile has no def)
          if (G.boss && !(G.boss.intro > 0)) { if (out.bossAt === undefined) out.bossAt = G.time; else if (G.time - out.bossAt > 5) { out.bossWatched = true; G.up.beam = 0; s.recalc(); return res(out); } }
          if (since() > 14) { out.bossTimeout = true; G.up.beam = 0; s.recalc(); return res(out); } }
        if (performance.now() - t0 > 120000) { out.stuckAt = step; return res(out); }
        requestAnimationFrame(f); })(); }));
    check(sg.ahead === 150 && sg.life && sg.hp === 2 && sg.oneBarrel && sg.hurtSwarm >= 2, 'Sentry Satellite: set down ahead of the ship, it fires at the swarm by itself', sg.hurtSwarm + ' enemies destroyed or damaged in 3 seconds · ' + JSON.stringify(sg));
    check(sg.tookHit && sg.destroyed && sg.rest === 9, 'Sentry Satellite: it stops an enemy shot, takes the damage, and is shot down when its health is gone');
    check(sg.ranOut === true, 'Sentry Satellite: it runs out when its time is up');
    check(sg.heavyHp === 5 && sg.heavyLife && sg.twoBarrels && sg.lightStaysAway, 'Sentry Platform (station module): a tougher satellite with twin guns that lasts longer', 'health ' + sg.heavyHp);
    check(!sg.tookSitter && sg.locked === true && sg.stayed === true && sg.burning === true && sg.killedIn > 0.3 && sg.killedIn < 5 && sg.otherUntouched === true && sg.idleAgain === true && sg.lockedNext === true && sg.laserRest >= 1.95 && sg.laserRest < 2.4, 'Laser Drone: it leaves enemies in the formation alone; one in flight it locks onto, sets alight and holds until destroyed; after two seconds\' rest it takes the next to leave', JSON.stringify({ tookSitter: !!sg.tookSitter, locked: sg.locked, stayed: sg.stayed, burning: sg.burning, killedIn: sg.killedIn, otherUntouched: sg.otherUntouched, idleAgain: sg.idleAgain, lockedNext: sg.lockedNext, rest: sg.laserRest, timeout: sg.laserTimeout }));
    check(sg.tookLeaper === true && sg.letGo === true, 'Laser Drone: it takes a latcher on its way in, and lets go of one that has clamped onto the ship', JSON.stringify({ tookLeaper: sg.tookLeaper, letGo: sg.letGo, timeout: sg.latcherTimeout }));
    check(sg.tookMissile === true && sg.missileGone === true && sg.missileIn < 1.5, 'Laser Drone: it locks onto a missile and burns it out of the air', JSON.stringify({ took: sg.tookMissile, gone: sg.missileGone, seconds: sg.missileIn }));
    check(sg.bossWatched === true && !sg.tookBoss, 'Laser Drone: it never locks onto a boss', JSON.stringify({ watched: sg.bossWatched, tookBoss: !!sg.tookBoss, tookHelper: !!sg.tookHelper, timeout: sg.bossTimeout }));
    await page.context().close();
  },
  // The simulation: the holographic drill the station runs once the ship has docked after a boss.
  sim: async () => {
    let { page, st, waitFor, playTo, shot } = await open('?gfx=low&intro=off&debug'), s;   // the simulation is on here; every other group switches it off with ?sim=off
    // An aiming bot: it takes the holograms in the order they came out, leading each by the time a shot takes to get there. It also watches the rules.
    const drill = quick => page.evaluate(quick => new Promise(res => { const w = window.__swarmfall, { G, P, S, SIMS } = w, out = { fire: 0, hurt: false, paused: null, kills0: G.run.kills, scrap0: G.run.scrap, topHit: 1e9 }, t0 = performance.now(), seen = new Map(); let touched = 0, pausedAt = 0, moved = null;
      (function f() {
        if (performance.now() - t0 > 120000) { out.timeout = G.state; return res(out); }
        if (G.state === 'station') { out.early = true; return res(out); }   // it must not get here by itself: the result waits for a touch
        if (G.state === 'sim' && SIMS.ended) { const sc = +document.getElementById('scrap').textContent.replace(/\D/g, '');
          if (quick && out.hits !== undefined) return res(out);
          if (out.hudAtEnd === undefined) { out.hudAtEnd = sc; out.fireAtEnd = P.fireT; out.pb = G.pb.length; }
          document.getElementById('btnPause').click(); if (G.state === 'pause') out.pausedCard = true;   // no pausing while the result is up
          if (SIMS.step === 3 && out.hudAtPay === undefined) out.hudAtPay = sc;
          if (SIMS.step === 5) { out.hudAtGo = sc; return res(out); } }
        if (G.state === 'sim') {
          if (out.shots === undefined) { out.shots = S.shots + S.split;   // barrels, and Split Barrel's level
             out.drones = S.drones; out.beam = S.beam; out.station = w.ST.on; out.backdrop = w.backdrop.material.type; out.frame = !document.getElementById('simFx').hidden; out.pb0 = G.pb.length; out.warp0 = w.WARP.k; out.words = document.getElementById('toast').textContent; out.slow = document.getElementById('toast').classList.contains('slow'); out.hud = document.getElementById('wave').textContent; out.total = SIMS.total; out.hp0 = P.hp; }
          out.fire = Math.max(out.fire, G.eb.length + G.em.length);
          for (const [e, y] of seen) if (e.dead) { seen.delete(e); if (e.u < 1 && e !== moved) out.topHit = Math.min(out.topHit, y); }   // where each one was when it was shot
          // the first whole line: its ring is shown where the last hologram went, stays put for a second, then flies to the ship and is paid
          if (SIMS.lines >= 1 && !out.ring && G.picks.length) { const p = G.picks[0], el = document.getElementById('simPlus'); out.ring = { worth: p.worth, home: p.home, hold: +p.hold.toFixed(2), label: el.textContent, shown: el.classList.contains('go'), paidYet: +(G.run.scrap - out.scrap0).toFixed(2), x: p.x, y: p.y, at: G.waveT, moved: 0, from: Math.round(Math.hypot(p.x - P.x, p.y - P.y)) }; }
          if (out.ring && out.ring.took === undefined) { const p = G.picks[0]; if (p && p.hold > 0) out.ring.moved = Math.max(out.ring.moved, Math.hypot(p.x - out.ring.x, p.y - out.ring.y)); if (!p) { out.ring.took = +(G.waveT - out.ring.at).toFixed(2); out.ring.paid = +(G.run.scrap - out.scrap0).toFixed(2); } }
          let t = null; for (const e of G.enemies) if (!e.dead && e.holo) { seen.set(e, e.y); if (!t || e.u > t.u) t = e; }
          if (t && touched < 3 && G.waveT > 3) { t.u = t.u; touched++; out.touchAt = Math.hypot(t.x - P.x, t.y - P.y) < 400; const x = t.x, y = t.y; moved = t; t.x = P.x; t.y = P.y; requestAnimationFrame(() => { if (P.hp < out.hp0 || !P.alive) out.hurt = true; }); }   // a hologram put right on top of the ship: nothing must come of it
          if (t) P.target = Math.max(14, Math.min(346, t.x + t.vx * Math.max(0, P.y - t.y) / S.shotSpeed));
          if (SIMS.ended && out.hits === undefined) { out.hits = SIMS.hits; out.lines = SIMS.lines; out.reward = SIMS.reward; out.perfect = SIMS.perfect; out.took = +G.waveT.toFixed(1); out.paid = +(G.run.scrap - out.scrap0).toFixed(2); out.kills = G.run.kills - out.kills0; out.scrapShown0 = +document.getElementById('scrap').textContent.replace(/\D/g, ''); }
          if (out.paused === null && G.waveT > 6) { document.getElementById('btnPause').click(); out.paused = G.state === 'pause' ? document.getElementById('pauseWave').textContent : 'not paused'; pausedAt = performance.now(); }
        } else if (G.state === 'pause' && performance.now() - pausedAt > 400) { document.getElementById('btnResume').click(); out.resumedTo = G.state; }
        requestAnimationFrame(f); })(); }), quick);
    // straight in from the test bench, with boosters chosen: they must not fire in the drill
    await page.tap('#dbgClear'); await page.tap('#dbgBoss [data-w="6"]'); await page.tap('#dbgUps [data-id="twin"]'); await page.tap('#dbgUps [data-id="drone"]'); await page.tap('#dbgUps [data-id="beam"]');
    await page.tap('#dbgSim'); await page.waitForTimeout(120); await page.touchscreen.tap(195, 400); await page.keyboard.press('Space');
    const wi = await page.evaluate(() => { const w = window.__swarmfall; document.getElementById('btnPause').click(); return { state: w.G.state, kind: w.G.cut && w.G.cut.kind, station: w.ST.on, backdrop: w.backdrop.material.type, warp: w.WARP.k }; });
    check(wi.state === 'cut' && wi.kind === 'simIn' && wi.station === true && wi.backdrop === 'MeshBasicMaterial' && wi.warp > 0 && wi.warp < 1, 'test bench: Simulation starts at the station, with the screen going wavy; a touch, a key and Pause change nothing', JSON.stringify(wi));
    s = await waitFor(x => x.state === 'sim'); check(s.state === 'sim', 'and the wave ends in the simulation');
    // The opening card: what this is, and nothing starts until a fresh touch. Pause does nothing while it is up.
    const hello = () => page.evaluate(() => { const w = window.__swarmfall, g = id => document.getElementById(id), r = g('simHelloCard').getBoundingClientRect(); g('btnPause').click();
      return { up: !g('simHello').hidden && g('simHello').classList.contains('on'), name: g('simHelloName').textContent, go: g('simHelloGo').classList.contains('on'), fits: r.left >= 0 && r.top >= 44 && r.right <= innerWidth && r.bottom <= innerHeight,
        wait: w.SIMS.wait, state: w.G.state, queue: w.G.queue.length, holograms: w.G.enemies.length, shots: w.G.pb.length, station: w.ST.on, backdrop: w.backdrop.material.type, frame: !g('simFx').hidden, warp: +w.WARP.k.toFixed(2), hud: g('wave').textContent }; });
    const begin = async () => { for (let i = 0; i < 40 && await page.evaluate(() => window.__swarmfall.SIMS.wait); i++) { await page.touchscreen.tap(195, 420); await page.waitForTimeout(200); } };   // the card takes a touch a moment after it shows, in game time
    const h0 = await hello(); await page.waitForTimeout(4500); const h1 = await hello(); await shot('18a-training-card');
    check(h0.station === false && h0.backdrop === 'ShaderMaterial' && h0.frame === true && h0.warp > 0.5 && h0.shots === 0 && h0.hud === 'TRAINING', 'in the simulation the station is gone and the backdrop is the grid, swapped while the screen was at its waviest', JSON.stringify(h0));
    check(h1.up && h1.go && h1.fits && h1.name === 'Training simulation' && h1.wait && h1.state === 'sim' && h1.holograms === 0 && h1.queue === 0 && h1.shots === 0, 'it opens on a card that says what it is and waits for a touch: some seconds on, nothing has started, the ship holds its fire, and Pause does nothing', JSON.stringify(h1));
    await begin(); const h2 = await page.evaluate(() => { const w = window.__swarmfall; return { wait: w.SIMS.wait, card: document.getElementById('simHello').classList.contains('on'), queue: w.G.queue.length + w.G.enemies.length }; });
    check(h2.wait === false && h2.card === false && h2.queue === 40, 'a fresh touch starts the round: the card goes and forty holograms are on their way', JSON.stringify(h2));
    // What the result card says, whether it is all on screen, and what comes of touches: it stays until a fresh one, and
    // that touch (put where the station's Undock button will be) must not press anything on the station.
    const card = () => page.evaluate(() => { const g = id => document.getElementById(id), on = id => !g(id).hidden && g(id).classList.contains('on'), r = g('simCard').getBoundingClientRect(), w = window.__swarmfall;
      return { up: !g('simEnd').hidden && g('simEnd').classList.contains('on'), kind: g('simKind').textContent, hits: g('simHits').textContent, total: g('simTotal').textContent, lines: on('simLines') && g('simLineN').textContent + ' ' + g('simLineScrap').textContent, pay: on('simPay') && g('simScrap').textContent, perf: on('simPerf') && g('simBonus').textContent, miss: on('simMiss') && g('simMiss').textContent, go: on('simGo'),
        fits: r.left >= 0 && r.top >= 44 && r.right <= innerWidth && r.bottom <= innerHeight, step: w.SIMS.step, state: w.G.state, hud: +g('scrap').textContent.replace(/\D/g, ''), run: Math.floor(w.G.run.scrap) }; });
    const carryOn = async at => { const o = {}; await page.waitForTimeout(1500); o.held = (await st()).state;
      const b = at || await page.evaluate(() => ({ x: innerWidth / 2, y: innerHeight - 36 }));
      await page.touchscreen.tap(b.x, b.y); o.at = b; const t0 = Date.now(); await waitFor(x => x.state === 'cut', 8000); await page.waitForTimeout(150); await page.touchscreen.tap(b.x, b.y); await page.keyboard.press('Space');
      o.out = await page.evaluate(() => { const w = window.__swarmfall; document.getElementById('btnPause').click(); return { state: w.G.state, kind: w.G.cut && w.G.cut.kind, card: document.getElementById('simEnd').classList.contains('on') }; });
      await page.waitForFunction(() => { const w = window.__swarmfall; return w.G.cut && w.G.cut.kind === 'simBack'; }, null, { timeout: 5000 }).catch(() => {});
      o.back = await page.evaluate(() => { const w = window.__swarmfall; return { kind: w.G.cut && w.G.cut.kind, station: w.ST.on, backdrop: w.backdrop.material.type, frame: !document.getElementById('simFx').hidden, shipLow: w.P.y > w.ST.y, words: document.getElementById('toast').textContent, slow: document.getElementById('toast').classList.contains('slow') }; });
      await waitFor(x => x.state === 'station', 15000); o.ms = Date.now() - t0; await page.waitForTimeout(700); o.warp = await page.evaluate(() => window.__swarmfall.WARP.k);
      Object.assign(o, await page.evaluate(() => { const w = window.__swarmfall; return { state: w.G.state, cardGone: document.getElementById('simEnd').hidden, shots: w.S.shots + w.S.split, simOff: !w.G.sim && !w.SIMS.on && !w.SIMS.ended, undock: !document.getElementById('scrStation').hidden }; }));
      Object.assign(o, await page.evaluate(b => { const el = document.elementFromPoint(b.x, b.y), r = document.getElementById('btnUndock').getBoundingClientRect(); return { onUndock: !!(el && el.closest('#btnUndock')), undockAt: { x: r.left + r.width / 2, y: r.top + r.height / 2 } }; }, b)); return o; };
    const V = await page.evaluate(() => { const S = window.__swarmfall.SIM; return { line: S.line, per: S.per, perfect: S.perfect, all: 5 * S.line + Math.round(40 * S.per) + S.perfect }; });   // what it pays is read from the game's table, so a change of the numbers needs no change here
    const d1 = await drill(), c1 = await card(); await shot('18-simulation-result'); const e1 = await carryOn(); d1.afterShots = e1.shots; d1.simOff = e1.simOff;
    check(d1.station === false && d1.backdrop === 'ShaderMaterial' && d1.hud === 'TRAINING' && d1.total === 40, 'the round: forty holograms in five lines of eight, on the grid', JSON.stringify({ station: d1.station, backdrop: d1.backdrop, frame: d1.frame, warp: d1.warp0, shots: d1.pb0, hud: d1.hud, words: d1.words, total: d1.total }));
    check(d1.shots === 1 && d1.drones === 0 && d1.beam === 0 && d1.afterShots === 2 && d1.simOff === true, 'only the bare ship\'s own gun fires in it, whatever boosters are fitted; they are back afterwards', JSON.stringify({ shots: d1.shots, drones: d1.drones, beam: d1.beam, after: d1.afterShots }));
    check(d1.fire === 0 && d1.hurt === false && d1.touchAt !== undefined, 'nothing in it can hurt the ship: no fire, and a hologram on top of the ship does nothing', JSON.stringify({ fire: d1.fire, hurt: d1.hurt }));
    check(d1.hits === 40 && d1.perfect === true && d1.lines === 5 && d1.reward === Math.round(40 * V.per) + V.perfect && d1.paid === V.all && d1.kills === 0, 'a perfect score can be had with the bare ship: 40 of 40 pays for each of the five lines, for the holograms and for all of them (SIM.line, per and perfect), and none of it counts as kills', JSON.stringify({ pays: V, hits: d1.hits, lines: d1.lines, reward: d1.reward, paid: d1.paid, kills: d1.kills, seconds: d1.took }));
    const rg = d1.ring || {};
    check(rg.worth === V.line && rg.home === true && rg.hold > 0.8 && rg.label === '◆ +' + V.line && rg.shown === true && rg.paidYet === 0 && rg.moved < 1 && rg.took >= 1 && rg.took < 3 && rg.paid === V.line && rg.from > 40, 'a whole line hit: a ring shows where the last one went, with what it is worth beside it, stays put for a second, then flies to the ship from wherever it is and is paid', JSON.stringify(rg));
    check(c1.up && c1.fits && c1.kind === 'Perfect' && c1.hits === '40' && c1.total === '40' && c1.lines === '5 whole lines ◆ +' + 5 * V.line && c1.pay === '◆ +' + Math.round(40 * V.per) && c1.perf === '◆ +' + V.perfect && c1.miss === false && c1.go === true, 'when it ends a card counts up the result: 40 of 40 hit, the lines, the holograms, the perfect bonus, then "Tap to continue"', JSON.stringify(c1));
    check(d1.scrapShown0 === d1.hudAtEnd && d1.hudAtEnd === 5 * V.line && d1.hudAtPay === d1.hudAtEnd + Math.round(40 * V.per) && d1.hudAtGo === V.all && c1.run === c1.hud, 'the scrap counter at the top goes up as the card reaches each line', JSON.stringify({ atEnd: d1.hudAtEnd, atPay: d1.hudAtPay, atGo: d1.hudAtGo }));
    check(!d1.early && !d1.pausedCard && e1.held === 'sim', 'the result stays until a touch: it does not go by itself, and it cannot be paused', JSON.stringify({ early: !!d1.early, paused: !!d1.pausedCard, held: e1.held }));
    check(e1.out.state === 'cut' && e1.out.kind === 'simOut' && e1.out.card === false, 'a fresh touch carries on: the card goes and the screen goes wavy again; a touch, a key and Pause change nothing', JSON.stringify(e1.out));
    check(e1.back.kind === 'simBack' && e1.back.station === true && e1.back.backdrop === 'MeshBasicMaterial' && e1.back.frame === false && e1.back.shipLow === true && e1.back.words === 'TRAINING COMPLETE40 of 40 hit · ◆ +' + V.all && e1.back.slow, 'the wave settles back at the station: the grid gone, the ship at its port, and the words "Training complete" with the score', JSON.stringify(e1.back));
    check(e1.state === 'station' && e1.cardGone && e1.undock && e1.warp === 0 && e1.ms > 1500, 'then the station opens', JSON.stringify({ state: e1.state, warp: e1.warp, ms: e1.ms }));
    check(d1.topHit >= 30 && d1.topHit < 1e9, 'no hologram is shot before it has been seen: each was well inside the top edge when it was hit', 'the highest was hit ' + Math.round(d1.topHit) + ' units down');
    check(d1.paused === 'Training simulation' && d1.resumedTo === 'sim', 'pausing in the simulation and resuming goes back into it', JSON.stringify({ paused: d1.paused, resumedTo: d1.resumedTo }));
    // A perfect score must be possible on every stage: the other four, then one of them again on a tall phone, where the
    // field is longer and the lines reach further down.
    const others = [];
    for (const w of [12, 18, 24, 30]) { await page.reload(); await page.waitForTimeout(600); await page.tap('#dbgClear'); await page.tap('#dbgBoss [data-w="' + w + '"]'); await page.tap('#dbgSim'); await waitFor(x => x.state === 'sim'); await begin();
      const d = await drill(w !== 12); others.push({ wave: w, hits: d.hits, seconds: d.took });
      if (w === 12) { const e2 = await carryOn(e1.undockAt);   // this time the touch that carries on is put exactly where the station's Undock button will be
        check(e2.onUndock && e2.state === 'station' && e2.undock, 'the touch that carries on presses nothing at the station, even put right on Undock', JSON.stringify({ at: e2.at, onUndock: e2.onUndock, state: e2.state })); } }
    check(others.every(o => o.hits === 40), 'the other four stages can be cleared perfectly too', JSON.stringify(others));
    await page.context().close();
    const tall = await open('?gfx=low&intro=off&debug', { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }); page = tall.page; waitFor = tall.waitFor;
    await page.tap('#dbgClear'); await page.tap('#dbgBoss [data-w="18"]'); await page.tap('#dbgSim'); await waitFor(x => x.state === 'sim'); await begin();
    const dt = await drill(true); check(dt.hits === 40, 'and on a tall phone (the third stage)', JSON.stringify({ hits: dt.hits, seconds: dt.took }));
    // a run ended from the pause screen in the middle of a round leaves nothing of the simulation behind
    await page.reload(); await page.waitForTimeout(600); await page.tap('#dbgClear'); await page.tap('#dbgBoss [data-w="6"]'); await page.tap('#dbgSim'); await waitFor(x => x.state === 'sim'); await begin(); await page.waitForTimeout(1500);
    const quit = await page.evaluate(() => { const w = window.__swarmfall; document.getElementById('btnPause').click(); const paused = w.G.state; document.getElementById('btnQuit').click();
      return { paused, state: w.G.state, backdrop: w.backdrop.material.type, frame: !document.getElementById('simFx').hidden, sim: w.SIMS.on || w.G.sim, warp: w.WARP.k, holograms: w.G.enemies.filter(e => e.holo && !e.dead).length }; });
    check(quit.paused === 'pause' && quit.state !== 'sim' && quit.backdrop === 'MeshBasicMaterial' && quit.frame === false && quit.sim === false && quit.warp === 0 && quit.holograms === 0, 'ending the run from the pause screen in mid-round puts the backdrop back and leaves no hologram behind', JSON.stringify(quit));
    // In a real run, on a short phone, with no aiming: the Hive Core destroyed, the ship docks, the simulation runs, and
    // the ship sits still, so only some holograms are hit. The card says how many and what that paid; a touch while it
    // is still counting finishes the count and does not skip it; what it paid is banked at the station.
    await page.context().close();
    const o2 = await open('?gfx=low&intro=off', 'iPhone SE'); page = o2.page; st = o2.st; waitFor = o2.waitFor; playTo = o2.playTo; shot = o2.shot;
    await page.tap('#btnPlay'); await waitFor(x => x.state === 'play', 20000);
    await page.evaluate(() => { const w = window.__swarmfall, G = w.G; for (const e of G.enemies) { e.dead = true; w.scene.remove(e.g); } G.queue.length = 0; G.flights = 0; G.wave = 5; w.nextWave(); });
    s = await playTo(x => x.state === 'sim' || x.state === 'station'); check(s.state === 'sim' && s.wave === 6, 'in a run: the boss destroyed, the ship docks and the simulation starts', s.state + ' on wave ' + s.wave);
    await page.waitForTimeout(4500); const h3 = await hello(); await shot('18a-training-card-short'); check(h3.up && h3.go && h3.fits && h3.wait, 'its opening card fits a short phone and waits there too', JSON.stringify({ up: h3.up, go: h3.go, fits: h3.fits, wait: h3.wait })); await begin();
    const before = await page.evaluate(() => { const w = window.__swarmfall; return { run: Math.floor(w.G.run.scrap), banked: w.G.run.banked, meta: w.meta.scrap }; });
    await page.waitForFunction(() => window.__swarmfall.SIMS.step >= 1, null, { timeout: 60000 });
    await page.waitForTimeout(150); const mid = await card(); await shot('18b-result-counting');
    await page.touchscreen.tap(160, 300); await page.waitForTimeout(250); const c3 = await card(); await shot('18c-result-partial');
    const r3 = await page.evaluate(() => { const S = window.__swarmfall.SIMS; return { hits: S.hits, total: S.total, lines: S.lines, reward: S.reward, perfect: S.perfect }; });
    check(r3.hits > 0 && r3.hits < 40 && r3.reward === Math.round(r3.hits * V.per) && r3.lines < 5, 'a ship that only sits there hits some and not all, and is paid for those with no perfect bonus', JSON.stringify(r3));
    check(mid.up && mid.step < 5 && c3.state === 'sim' && c3.step === 5 && c3.up, 'a touch while the card is counting finishes the count and does not skip the card', JSON.stringify({ midStep: mid.step, midHits: mid.hits, after: c3.state, step: c3.step }));
    check(c3.fits && c3.kind === 'Training results' && c3.hits === '' + r3.hits && c3.pay === '◆ +' + r3.reward && c3.perf === false && /every one/.test(c3.miss || '') && c3.go === true && c3.lines === (r3.lines === 1 ? '1 whole line' : r3.lines + ' whole lines') + ' ◆ +' + r3.lines * V.line && c3.hud === before.run + r3.reward + r3.lines * V.line, 'a part score on a short phone: the card fits, says how many were hit and what that paid, and how to earn the perfect bonus', JSON.stringify(c3));
    for (let i = 0; i < 20 && !(await page.evaluate(() => window.__swarmfall.SIMS.leaving || window.__swarmfall.G.state !== 'sim')); i++) { await page.keyboard.press('Space'); await page.waitForTimeout(250); }   // the card takes a key a moment after its last line, in game time
    s = await waitFor(x => x.state === 'station', 15000);
    const after = await page.evaluate(() => { const w = window.__swarmfall; return { meta: w.meta.scrap, run: Math.floor(w.G.run.scrap) }; });
    check(s.state === 'station' && after.meta - before.meta === before.run - before.banked + r3.reward + r3.lines * V.line, 'a key carries on too, and the station banks what the simulation paid with the rest of the run\'s scrap', JSON.stringify({ before, after }));
    await page.context().close();
  },
  // The EMP Bomb: lobbed ahead of the ship, its ring knocks out what it reaches.
  emp: async () => {
    const { page, st, waitFor, shot } = await open(); let s;
    await page.tap('#btnPlay'); await waitFor(x => x.state === 'play', 20000);
    // Helpers in the page. hold(): the field kept quiet between trials. field(): everything cleared but a guard that keeps the wave going.
    await page.evaluate(() => { const w = window.__swarmfall, { G, P } = w, T = window.__t = { fire: false, x: 180 };
      T.field = wave => { for (const e of G.enemies) { e.dead = true; w.scene.remove(e.g); } G.queue.length = 0; G.flights = 0; G.eb.length = 0; G.em.length = 0; G.wave = wave || 3; for (const c of w.emps) { c.on = false; c.mesh.visible = false; }
        T.guard = w.spawnEnemy('mite', 7, 0); T.guard.hp = T.guard.maxHp = 1e12; P.empT = 99; };
      T.diver = (type, x, y, vx, vy) => { const e = w.spawnEnemy(type, null, null, { x, y }); w.launchDive(e); e.x = x; e.y = y; e.vx = vx; e.vy = vy; e.hp = e.maxHp = 1e9; return e; };
      T.pin = (things, secs) => { const at = things.map(o => [o.x, o.y, o.vx, o.vy]); return T.wait(secs, () => things.forEach((o, i) => { o.x = at[i][0]; o.y = at[i][1]; o.vx = at[i][2]; o.vy = at[i][3]; })); };   // held where they are, with the heading they have, until the bomb has got there
      T.wait = (secs, each) => new Promise(res => { const t0 = G.time; (function f() { if (each) each(); if (G.time - t0 >= secs) return res(); requestAnimationFrame(f); })(); });
      (function f() { G.diveT = 99; if (!T.fire) G.shootT = 99; P.fireT = 9; P.inv = 9; P.target = T.x; if (T.guard) T.guard.hp = 1e12; requestAnimationFrame(f); })(); });
    const A = await page.evaluate(() => window.__swarmfall.EMP);
    // 1. the booster lobs a bomb by itself; without it, none
    const auto = await page.evaluate(async () => { const w = window.__swarmfall, { G, P } = w, T = window.__t, out = {}; T.field(); G.up = {}; w.recalc(); P.empT = 0.2; await T.wait(1.2); out.none = w.emps.some(c => c.on);
      G.up = { emp: 1 }; w.recalc(); P.empT = 0.2; let seen = false, ahead = 0; await T.wait(1.2, () => { const c = w.emps.find(c => c.on); if (c) { seen = true; ahead = Math.max(ahead, P.y - c.y); } }); out.lobbed = seen; out.ahead = Math.round(ahead); out.next = +P.empT.toFixed(1); return out; });
    check(auto.none === false && auto.lobbed === true && auto.ahead > 100 && auto.next > A.every[0] - 2, 'EMP Bomb: with the booster the ship lobs one out at the enemy and waits for the next; without it, none', JSON.stringify(auto));
    // 2. divers: the one the ring reaches keeps its heading and holds its fire while the ship crosses the field; the one beyond it steers and fires as ever
    const dv = await page.evaluate(async () => { const w = window.__swarmfall, { G, P } = w, T = window.__t, out = {}; T.field(); T.x = 60; await T.wait(0.6);
      const near = T.diver('wasp', 120, 150, 40, 70), far = T.diver('wasp', 120 + w.EMP.r[0] + 60, 150, -40, 70); near.shots = far.shots = 3; near.shootT = far.shootT = 0.3;
      w.launchEmp(120, 160, 1); await T.pin([near, far], w.EMP.fly + 0.02); await T.wait(w.EMP.wave + 0.05);
      out.hit = near.emp > 0; out.missed = !(far.emp > 0); out.lightsOut = near.meshes.filter(m => m.userData.base.userData.glow).every(m => !m.visible) && far.meshes.filter(m => m.userData.base.userData.glow).every(m => m.visible);
      const v0 = [near.vx, near.vy], f0 = far.vx, shots0 = near.shots, t0 = G.time; T.x = 330; G.eb.length = 0; await T.wait(1.6);
      out.keptHeading = near.vx === v0[0] && near.vy === v0[1]; out.nearShots = shots0 - near.shots; out.farTurned = Math.round(far.vx - f0); out.farShots = 3 - far.shots;
      await T.wait(w.EMP.stun[0] - 1.6 + 0.3); out.over = !(near.emp > 0) && near.meshes.filter(m => m.userData.base.userData.glow).every(m => m.visible); out.lasted = +(G.time - t0).toFixed(1);
      const v1 = near.vx; await T.wait(0.6); out.steersAgain = near.vx !== v1 || near.y > w.G.form.top + 400; return out; });
    check(dv.hit && dv.missed && dv.lightsOut, 'the ring knocks out the enemy it reaches (its lights go out) and leaves the one beyond it alone', JSON.stringify(dv));
    check(dv.keptHeading && dv.nearShots === 0 && dv.farTurned > 20 && dv.farShots > 0, 'knocked out, a diver cannot steer or fire: it keeps the heading it had while the ship crosses the field; the other turns after the ship and fires', JSON.stringify({ kept: dv.keptHeading, itsShots: dv.nearShots, otherTurned: dv.farTurned, otherShots: dv.farShots }));
    check(dv.over && dv.steersAgain, 'it comes round after its time (' + A.stun[0] + ' seconds at level 1): lights on, steering again', JSON.stringify({ over: dv.over, afterSecs: dv.lasted, steers: dv.steersAgain }));
    // 3. in the formation: knocked out, nothing there fires or is picked to dive; afterwards it does
    const fm = await page.evaluate(async () => { const w = window.__swarmfall, { G, P } = w, T = window.__t, out = {}; T.field(3); T.x = 180; G.form = { cols: 8, rows: 2, top: 96, shape: 0, size: 16 };
      const ws = [2, 3, 4].map(c => { const e = w.spawnEnemy('wasp', c, 1); e.hp = e.maxHp = 1e9; return e; }); await T.wait(0.3);
      w.launchEmp(ws[1].x, ws[1].y, 1); await T.wait(w.EMP.fly + w.EMP.wave + 0.05); out.all = ws.every(e => e.emp > 0); G.eb.length = 0; T.fire = true;
      let fired = 0, dived = 0; await T.wait(1.5, () => { G.shootT = 0; G.diveT = 0; fired = Math.max(fired, G.eb.length); if (ws.some(e => e.state === 'dive')) dived++; }); out.firedOut = fired; out.divedOut = dived;
      await T.wait(w.EMP.stun[0]); G.eb.length = 0; fired = 0; await T.wait(1, () => { G.shootT = 0; fired = Math.max(fired, G.eb.length); }); out.firedAfter = fired; T.fire = false; return out; });
    check(fm.all && fm.firedOut === 0 && fm.divedOut === 0 && fm.firedAfter > 0, 'in the formation, knocked-out enemies neither fire nor leave to dive; once they come round they fire again', JSON.stringify(fm));
    // 4. a missile flies straight on; a latcher drifts past without clamping on; a boss is not touched
    const ms = await page.evaluate(async () => { const w = window.__swarmfall, { G, P } = w, T = window.__t, out = {}; T.field(); T.x = 60; await T.wait(0.5);
      w.fireMissile(200, 120); w.fireMissile(200 + w.EMP.r[0] + 80, 120); const [m, other] = G.em; await T.wait(0.5);
      w.launchEmp(m.x, m.y + 30, 1); await T.pin([m, other], w.EMP.fly + 0.02); await T.wait(w.EMP.wave + 0.05); out.hit = m.emp > 0 && !(other.emp > 0);
      const a0 = Math.atan2(m.vy, m.vx), b0 = Math.atan2(other.vy, other.vx); T.x = 330; await T.wait(1); out.turned = +Math.abs(Math.atan2(m.vy, m.vx) - a0).toFixed(3); out.otherTurned = +Math.abs(Math.atan2(other.vy, other.vx) - b0).toFixed(2);
      T.field(); T.x = 180; await T.wait(0.4); P.inv = 0; const hp0 = P.hp; const L = T.diver('latcher', 180, P.y - 150, 0, 150); L.emp = 0; w.launchEmp(180, P.y - 140, 1); await T.pin([L], w.EMP.fly + 0.02); await T.wait(w.EMP.wave + 0.05); out.latcherOut = L.emp > 0;
      let clamped = false, passed = false; await T.wait(1.6, () => { P.inv = 0; if (L.state === 'latch') clamped = true; if (L.y > P.y + 10) passed = true; }); out.clamped = clamped; out.passed = passed; out.hull = P.hp - hp0;
      T.field(5); G.up = {}; w.recalc(); w.nextWave(); await T.wait(3.4); const boss = G.enemies.find(e => e.def.boss); out.boss = !!boss; if (boss) { w.launchEmp(boss.x, boss.y, 3); await T.wait(w.EMP.fly + w.EMP.wave + 0.1); out.bossEmp = boss.emp || 0; }
      G.up = { emp: 2 }; G.sim = true; w.recalc(); out.inSim = w.S.emp; G.sim = false; w.recalc(); out.after = w.S.emp; return out; });
    check(ms.hit && ms.turned < 0.01 && ms.otherTurned > 0.2, 'a missile the ring reaches flies straight on, while one beyond it turns after the ship', JSON.stringify({ hit: ms.hit, turned: ms.turned, otherTurned: ms.otherTurned }));
    check(ms.latcherOut && ms.passed && !ms.clamped && ms.hull === 0, 'a knocked-out latcher drifts past the ship without clamping on', JSON.stringify({ out: ms.latcherOut, passed: ms.passed, clamped: ms.clamped, hull: ms.hull }));
    check(ms.boss && ms.bossEmp === 0 && ms.inSim === 0 && ms.after === 2, 'a boss is not touched by it, and the bare ship of the training simulation has none', JSON.stringify({ boss: ms.boss, bossEmp: ms.bossEmp, inSim: ms.inSim }));
    await page.context().close();
  },
  // The Arc Caster: short-range lightning from the ship that jumps from enemy to enemy.
  arc: async () => {
    const { page, st, waitFor, shot } = await open(); let s;
    await page.tap('#btnPlay'); await waitFor(x => x.state === 'play', 20000);
    // Each trial: the field cleared, the ship in the middle with its own gun held, enemies set down where the trial
    // wants them (as divers, held still), then what each has left after the first bolt (or after `wait` seconds if none comes).
    const trial = (level, spots, wait = 3.2) => page.evaluate(([level, spots, wait]) => new Promise(res => { const w = window.__swarmfall, { G, P, S } = w, t0 = performance.now();
      for (const e of G.enemies) { e.dead = true; w.scene.remove(e.g); } G.queue.length = 0; G.flights = 0; G.eb.length = 0; G.em.length = 0; G.wave = 1;
      const guard = w.spawnEnemy('mite', 0, 0); guard.hp = guard.maxHp = 1e12;   // keeps the wave from counting as cleared; it sits in the formation, far out of reach
      G.up = level ? { arc: level } : {}; w.recalc(); P.arcT = 0.4; P.x = 180; P.target = 180; const kills0 = G.run.kills;
      const es = spots.map(([dx, dy, type, state]) => { const e = w.spawnEnemy(type || 'mite', null, null, { x: P.x + dx, y: P.y + dy }); if (state) { e.state = state; e.side = 1; e.fuse = 9; } else w.launchDive(e); e.hx = P.x + dx; e.hy = P.y + dy; e.hp0 = e.hp; return e; });
      let frames = 0, hitAt = null, lines = 0;
      (function f() { G.diveT = 99; G.shootT = 99; G.eb.length = 0; P.fireT = 9; P.inv = 9; guard.hp = 1e12; P.target = 180;
        for (const e of es) if (!e.dead) { e.x = e.hx; e.y = e.hy; e.vx = e.vy = 0; if (e.state === 'latch') e.fuse = 9; }
        const struck = es.filter(e => e.dead || e.hp < e.hp0).length; if (struck && hitAt === null) { hitAt = (performance.now() - t0) / 1000; lines = w.scene.children.filter(o => o.isLine && o.visible).length; }
        if (hitAt !== null ? ++frames > 3 : performance.now() - t0 > wait * 1000) return res({ took: es.map(e => e.dead ? 'gone' : +(e.hp0 - e.hp).toFixed(1)), kills: G.run.kills - kills0, lines, dmg: S.dmg, guard: guard.hp === 1e12, state: G.state });
        requestAnimationFrame(f); })(); }), [level, spots, wait]);
    const A = await page.evaluate(() => window.__swarmfall.ARC);
    // five mites in a row beside the ship, 40 apart, the first 60 away; and one far up the field
    const row = [[60, -40], [100, -40], [140, -40], [180, -40], [220, -40], [0, -400]];
    const none = await trial(0, row);
    check(none.took.every(t => t === 0) && none.state === 'play', 'Arc Caster: without the booster nothing is struck', JSON.stringify(none.took));
    const l1 = await trial(1, row); await shot('19-arc-caster');
    check(l1.took.slice(0, 3).every(t => t === 'gone') && l1.took.slice(3).every(t => t === 0) && l1.kills === 3 && l1.lines >= 2, 'level 1: the bolt strikes the nearest and jumps on through the next two; three mites go at once, and the far one is left alone', JSON.stringify(l1));
    const l3 = await trial(3, row);
    check(l3.took.slice(0, 5).every(t => t === 'gone') && l3.took[5] === 0 && l3.kills === 5, 'level 3: five in a row go at once', JSON.stringify(l3));
    // tougher enemies take its damage and live; a gap wider than its jump stops the chain
    const tough = await trial(1, [[60, -40, 'beetle'], [100, -40, 'beetle'], [100 + A.jump + 30, -40, 'beetle']]);
    check(tough.took[0] === tough.dmg * A.dmg[0] && tough.took[1] === tough.took[0] && tough.took[2] === 0 && tough.kills === 0, 'each enemy struck takes 2.5 times a shot\'s damage, and a gap wider than its jump stops the chain', JSON.stringify(tough));
    // nothing within its short reach: it holds its charge, however long
    const far = await trial(1, [[0, -(A.range[0] + 40)], [80, -(A.range[0] + 20)]], 3);
    check(far.took.every(t => t === 0), 'an enemy just beyond its short reach is never struck', JSON.stringify({ reach: A.range[0], took: far.took }));
    // a latcher clamped onto the ship is not a target, and does not stop it striking another
    const lat = await trial(1, [[10, 0, 'latcher', 'latch'], [70, -50]]);
    check(lat.took[0] === 0 && lat.took[1] === 'gone', 'it never strikes a latcher that has clamped onto the ship', JSON.stringify(lat.took));
    const sim = await page.evaluate(() => { const w = window.__swarmfall; w.G.up = { arc: 2 }; w.G.sim = true; w.recalc(); const b = w.S.arc; w.G.sim = false; w.recalc(); return { inSim: b, after: w.S.arc }; });
    check(sim.inSim === 0 && sim.after === 2, 'the bare ship of the training simulation has none', JSON.stringify(sim));
    await page.context().close();
  },
  // Burst Thrusters: a flick of the thumb up or down lunges the ship forward or drops it back, and it drifts home.
  burst: async () => {
    const { page, st, waitFor } = await open(); let s;
    await page.tap('#btnPlay'); await waitFor(x => x.state === 'cut');
    // Touches are sent as a phone sends them: pointer events on the playfield. Each stroke is a list of [x, y, ms after the touch began].
    const stroke = pts => page.evaluate(pts => new Promise(res => { const el = document.getElementById('stage'), ev = (type, x, y) => el.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerId: 7, pointerType: 'touch', clientX: x, clientY: y }));
      let i = 0; const t0 = performance.now(); ev('pointerdown', pts[0][0], pts[0][1]);
      (function f() { while (i + 1 < pts.length && performance.now() - t0 >= pts[i + 1][2]) { i++; ev('pointermove', pts[i][0], pts[i][1]); } if (i + 1 >= pts.length) { ev('pointerup', pts[i][0], pts[i][1]); return res(); } setTimeout(f, 4); })(); }), pts);
    const up = [[195, 620, 0], [195, 600, 30], [196, 575, 60], [197, 548, 90]], down = [[195, 560, 0], [195, 580, 30], [194, 606, 60], [194, 632, 90]];
    const slanted = [[120, 640, 0], [150, 610, 30], [180, 580, 60], [210, 550, 90], [240, 520, 120]];                                             // steering up and across: as much sideways as up
    const shake = [[195, 620, 0], [255, 610, 45], [300, 618, 90], [240, 628, 135], [150, 616, 180], [100, 624, 225], [170, 632, 270], [260, 614, 315]];   // the latcher shake: wide and fast, bowing up and down as the thumb pivots
    const slow = [[195, 640, 0], [195, 620, 200], [195, 600, 400], [195, 580, 600], [195, 560, 800]];                                               // a slow slide up
    const dy = () => page.evaluate(() => { const w = window.__swarmfall; return { dy: +w.P.dy.toFixed(1), phase: w.P.bPhase, state: w.G.state }; });
    const far = (ms, sign) => page.evaluate(([ms, sign]) => new Promise(res => { const w = window.__swarmfall, t0 = performance.now(); let best = 0, home = null;
      (function f() { const d = w.P.dy * sign; if (d > best) best = d; if (best > 5 && w.P.bPhase === 0 && home === null) home = Math.round(performance.now() - t0); if (performance.now() - t0 > ms || home !== null) return res({ best: +best.toFixed(1), home }); requestAnimationFrame(f); })(); }), [ms, sign]);
    // a cutscene (the launch): the booster fitted, a flick does nothing
    await page.evaluate(() => { const w = window.__swarmfall; w.G.up.dash = 1; w.recalc(); });
    await stroke(up); const inCut = await dy(); check(inCut.state === 'cut' && inCut.dy === 0 && inCut.phase === 0, 'Burst Thrusters: a flick during a cutscene does nothing', JSON.stringify(inCut));
    await waitFor(x => x.state === 'play', 20000);
    await page.evaluate(() => { const w = window.__swarmfall, G = w.G; for (const e of G.enemies) { e.dead = true; w.scene.remove(e.g); } G.queue.length = 0; G.flights = 0; const g = w.spawnEnemy('mite', 0, 0); g.hp = g.maxHp = 1e12; window.__tick = setInterval(() => { G.diveT = 99; G.shootT = 99; G.eb.length = 0; w.P.inv = 9; g.hp = 1e12; }, 50); });
    // without the booster nothing happens
    await page.evaluate(() => { const w = window.__swarmfall; w.G.up = {}; w.recalc(); });
    await stroke(up); await page.waitForTimeout(150); const none = await dy(); check(none.dy === 0 && none.phase === 0, 'without the booster a flick does nothing', JSON.stringify(none));
    await page.evaluate(() => { const w = window.__swarmfall; w.G.up.dash = 1; w.recalc(); });
    // strokes that are not flicks
    const not = {}; for (const [name, pts] of [['slanted', slanted], ['shake', shake], ['slow', slow]]) { const w = far(pts[pts.length - 1][2] + 250, 1), w2 = far(pts[pts.length - 1][2] + 250, -1); await stroke(pts); not[name] = Math.max((await w).best, (await w2).best); await page.waitForTimeout(100); }
    check(not.slanted === 0 && not.shake === 0 && not.slow === 0, 'steering on a slant, the wide shake that throws a latcher off, and a slow slide never set it off', JSON.stringify(not));
    // a real flick up: forward, held, then home; a second flick while it is out is ignored
    const B = await page.evaluate(() => window.__swarmfall.BURST);
    let w1 = far(5000, -1); await stroke(up); await page.waitForTimeout(120);
    const hit = await page.evaluate(() => { const w = window.__swarmfall, P = w.P; return { dy: +P.dy.toFixed(1), atHome: w.shipHit(P.x, w.shipY(), 4), atShip: w.shipHit(P.x, P.y, 4), again: w.burstGo(1) }; });
    const f1 = await w1;
    check(Math.abs(f1.best - B.fwd) < 1 && f1.home !== null && f1.home > 600 && f1.home < 4000, 'a flick up bursts the ship forward by its reach, and it drifts home by itself', JSON.stringify({ reach: B.fwd, went: f1.best, homeAfterMs: f1.home }));
    check(hit.dy < -30 && hit.atHome === false && hit.atShip === true && hit.again === false, 'while it is forward the ship can be hit where it is and not where it was, and a second burst waits until it is home', JSON.stringify(hit));
    w1 = far(5000, 1); await stroke(down); const f2 = await w1;
    check(Math.abs(f2.best - B.back) < 1 && f2.home !== null, 'a flick down drops it back, by less, and it drifts home', JSON.stringify({ reach: B.back, went: f2.best, homeAfterMs: f2.home }));
    w1 = far(5000, -1); await page.keyboard.press('ArrowUp'); const f3 = await w1; check(Math.abs(f3.best - B.fwd) < 1, 'the up key does the same', JSON.stringify(f3));
    // not in the training simulation (the bare ship), and a restart in mid-burst starts at home
    const sim = await page.evaluate(() => { const w = window.__swarmfall; w.G.sim = true; w.recalc(); const b = w.S.burst; w.G.sim = false; w.recalc(); return { inSim: b, after: w.S.burst }; });
    check(sim.inSim === 0 && sim.after === 1, 'the bare ship of the training simulation has no burst', JSON.stringify(sim));
    await stroke(up); await page.waitForTimeout(100); const mid = await dy();
    await page.evaluate(() => { clearInterval(window.__tick); document.getElementById('btnPause').click(); document.getElementById('btnRestart').click(); }); await page.waitForTimeout(200);
    const fresh = await dy(); check(mid.dy < -20 && fresh.dy === 0 && fresh.phase === 0, 'a run restarted in mid-burst starts with the ship at home', JSON.stringify({ mid, fresh }));
    await page.context().close();
  },
  // The latcher: clamps onto the ship, goes off after 1.5 seconds, and is thrown off by flicks or by a slam into the edge.
  latcher: async () => {
    const { page, st, waitFor, clearWave, playTo, shot } = await open(); let s;
    await page.tap('#btnPlay'); await waitFor(x => x.state === 'cut'); await page.touchscreen.tap(195, 400); await waitFor(x => x.state === 'play');
    // The ship is steered through P.target, as a finger steers it. Each latcher is dropped just above the ship.
    const lt = await page.evaluate(() => new Promise(res => { const s = window.__swarmfall, { G, P, S, SHK } = s, out = {}, t0 = performance.now();
      for (const e of G.enemies) { e.dead = true; s.scene.remove(e.g); } G.queue.length = 0; G.flights = 0; G.wave = s.UNLOCK.latcher;
      const guard = s.spawnEnemy('mite', 0, 0); guard.hp = guard.maxHp = 1e12;   // keeps the wave from counting as cleared
      let step = 0, e = null, at = 0, hp0 = 0, kills0 = 0, seq = null, si = 0, was = false, lane = 1e9, lvx = 0, lvy = 0;
      const drop = dx => { e = s.spawnEnemy('latcher', null, null, { x: P.x + dx, y: P.y - 90 }); s.launchDive(e); e.x = P.x + dx; e.y = P.y - 90; e.vx = 0; e.vy = 220; hp0 = P.hp; kills0 = G.run.kills; was = false; };
      const since = () => G.time - at, go = n => { step = n; at = G.time; }, fresh = () => { P.hp = 3; P.inv = 0; P.shieldUp = false; };
      P.target = 180;
      (function f() { G.diveT = 99; G.shootT = 99; P.fireT = 9; G.eb.length = 0; S.maxHp = 3; guard.hp = 1e12; if (e && e.state === 'latch') was = true;
        if (performance.now() - t0 > 90000) { out.timeout = step; return res(out); }
        if (step === 0 && since() > 0.4 && Math.abs(P.x - 180) < 2) { fresh(); drop(6); go(1); }
        else if (step === 1 && (was || since() > 3)) { out.latched = e.state === 'latch'; out.side = e.side; out.toast = document.getElementById('toast').textContent; out.noHitYet = P.hp === hp0; go(2); }
        else if (step === 2 && (e.dead || since() > 4)) { out.fuse = +since().toFixed(2); out.hurt = hp0 - P.hp; out.noCredit = G.run.kills === kills0; go(3); }   // left alone: it goes off
        else if (step === 3 && since() > 2) { fresh(); drop(-6); go(4); }
        else if (step === 4 && (was || since() > 3)) { seq = [P.x + 20, P.x - 20, P.x + 20, P.x - 20, P.x + 20, P.x - 20, P.x + 40, P.x - 40, P.x + 40, P.x - 40, P.x + 40]; si = 0; P.target = seq[0]; go(5); }   // six narrow flicks (40 units each: too small), then wide ones (80 units)
        else if (step === 5) {   // shaken: the ship flicked from side to side
          if (Math.abs(P.x - seq[si]) < 2 && si < seq.length - 1) { if (si === 5) out.narrowHeld = !e.dead && e.state === 'latch'; P.target = seq[++si]; }
          if (e.dead || since() > 3) { out.shakeTime = +since().toFixed(2); out.shakeHurt = hp0 - P.hp; out.shakeKill = G.run.kills - kills0; out.turns = si; P.target = 180; go(6); }
        }
        else if (step === 6 && since() > 0.6 && Math.abs(P.x - 180) < 2) { fresh(); drop(6); go(7); }
        else if (step === 7 && (was || since() > 3)) { P.target = 14; go(8); }   // slammed: one run into the left edge
        else if (step === 8 && (e.dead || since() > 3)) { out.slamTime = +since().toFixed(2); out.slamHurt = hp0 - P.hp; out.slamAtEdge = P.x < 16; out.slamKill = G.run.kills - kills0; P.target = 180; go(9); }
        else if (step === 9 && since() > 0.6 && Math.abs(P.x - 180) < 2) { fresh(); P.shieldUp = true; drop(6); go(10); }   // with the shield up it clamps on all the same, and the shield takes the blast
        else if (step === 10 && (e.dead || since() > 4)) { out.shield = { latched: was, popped: !P.shieldUp, hurt: hp0 - P.hp }; P.target = 346; go(11); }
        else if (step === 11 && since() > 0.8 && P.x > 345) { fresh(); drop(-6); go(12); }
        else if (step === 12 && (was || since() > 3)) { go(13); }
        else if (step === 13) {   // pinned against the edge, a wiggling finger moves the ship nowhere and earns nothing
          P.target = Math.floor(since() * 12) % 2 ? 346 : 380;
          if (since() > 1.2) { out.pinned = { still: !e.dead && e.state === 'latch', flicks: SHK.n }; e.dead = true; s.scene.remove(e.g); P.target = 180; go(14); }
        }
        else if (step === 14 && since() > 0.6 && Math.abs(P.x - 180) < 2) { fresh(); P.inv = 3; drop(6); go(15); }   // a ship still blinking from a hit: it cannot clamp on, and touching does no harm
        else if (step === 15) { if (!e.dead && e.y > P.y + 40 || since() > 2) { out.blink = { latched: was, hurt: hp0 - P.hp, flewOn: !e.dead }; e.dead = true; s.scene.remove(e.g); go(16); } }
        else if (step === 16 && since() > 0.3) { fresh(); e = s.spawnEnemy('latcher', 2, 0); was = false; hp0 = P.hp; go(17); }   // one sitting in the formation: nothing picks it to dive (G.diveT is held), it leaps by itself
        else if (step === 17) { if (e.state === 'dive' && out.leapAfter === undefined) { out.leapAfter = +since().toFixed(2); at = G.time; lane = 1e9; }
          if (e.state === 'dive') { if (e.y > 320 && e.y < P.y - 60) lane = Math.min(lane, Math.abs(e.x - P.x)); if (e.y > P.y - 30) { lvx = Math.abs(e.vx); lvy = Math.abs(e.vy); } }   // how close it comes to the ship's line of fire on the way down, and how it is moving as it arrives
          if (was || since() > 8) { out.leap = { latched: was, flight: +since().toFixed(2), hurtByTouch: hp0 - P.hp, lane: Math.round(lane), sideways: lvx > lvy }; if (!e.dead) { e.dead = true; s.scene.remove(e.g); } return res(out); } }
        requestAnimationFrame(f); })(); }));
    check(lt.latched === true && Math.abs(lt.side) === 1 && lt.toast.includes('SHAKE IT OFF') && lt.noHitYet === true, 'a latcher that reaches the ship clamps onto its side, with no hit yet, and the player is told to shake it off', JSON.stringify({ latched: lt.latched, side: lt.side, toast: lt.toast, timeout: lt.timeout }));
    check(lt.fuse > 1.4 && lt.fuse < 1.7 && lt.hurt === 1 && lt.noCredit === true, 'left alone it goes off after 1.5 seconds: one hit to the ship, and no credit for it', JSON.stringify({ fuse: lt.fuse, hurt: lt.hurt, noCredit: lt.noCredit }));
    check(lt.narrowHeld === true && lt.shakeHurt === 0 && lt.shakeKill === 1 && lt.shakeTime < 1.45 && lt.turns >= 8, 'narrow flicks do not shift it; wide ones (50 units or more, three times) throw it off and destroy it, inside its 1.5 seconds', JSON.stringify({ narrowHeld: lt.narrowHeld, seconds: lt.shakeTime, turns: lt.turns, hurt: lt.shakeHurt, kills: lt.shakeKill }));
    check(lt.slamHurt === 0 && lt.slamKill === 1 && lt.slamAtEdge === true && lt.slamTime < 1.5, 'so does one run into the edge of the field', JSON.stringify({ seconds: lt.slamTime, hurt: lt.slamHurt, kills: lt.slamKill }));
    check(lt.shield && lt.shield.latched === true && lt.shield.popped === true && lt.shield.hurt === 0, 'with a shield up it clamps on all the same, and if it goes off the shield takes the blast', JSON.stringify(lt.shield));
    check(lt.blink && lt.blink.latched === false && lt.blink.hurt === 0 && lt.blink.flewOn === true, 'touching the ship never hurts by itself: a latcher that cannot clamp on flies on by', JSON.stringify(lt.blink));
    check(lt.leapAfter >= 1.4 && lt.leapAfter <= 5.2 && lt.leap && lt.leap.latched === true && lt.leap.flight < 3 && lt.leap.hurtByTouch === 0, 'a latcher in the formation leaps by itself within 5 seconds, fast, and catches a ship that stands still', JSON.stringify({ leapAfter: lt.leapAfter, ...lt.leap }));
    check(lt.leap && lt.leap.lane >= 55 && lt.leap.sideways === true, 'it stays out of the ship\'s line of fire on the way down, and comes in from the side', JSON.stringify({ lane: lt.leap && lt.leap.lane, sideways: lt.leap && lt.leap.sideways }));
    check(lt.pinned && lt.pinned.still === true && lt.pinned.flicks === 0, 'a ship pinned at the edge shakes nothing off', JSON.stringify(lt.pinned));
    await shot('17-latcher');
    await page.context().close();
  },
  // Every booster at once on late waves; pause; the Graphics button.
  stress: async () => {
    const { page, st, waitFor, clearWave, playTo, shot } = await open(); let s;
    // Every system at once: all boosters on, late waves with lasers, missiles and triplets, while the ship
    // keeps firing. This exercises the effect pools (rings, lightning, particles), missiles being shot down,
    // shields and Reactive Nova clearing fire mid-loop, triplet splits and the lancer beam.
    await page.tap('#btnPlay'); await waitFor(x => x.state === 'cut'); await page.touchscreen.tap(195, 400); await waitFor(x => x.state === 'play');
    // Volatile Payload: one enemy destroyed in the middle of a full formation hurts its neighbours and no more. The owner found
    // levels 2 and 3 cleared the top half of the screen: each blast destroyed the neighbours, and each of those set off another.
    // Whether a destroyed enemy explodes is a 1 in 4 chance (BLAST.chance), so the roll is fixed here: a blast at each level, then at level 3 a roll that gives none.
    const vp = await page.evaluate(() => new Promise(res => { const s = window.__swarmfall, { G, P } = s, real = Math.random, out = { chance: s.BLAST.chance }, t0 = performance.now(); let lv = 0, step = 0, at = 0, n0 = 0, pass = 0;
      const start = () => { for (const e of G.enemies) { e.dead = true; s.scene.remove(e.g); } G.wave = 3; s.nextWave(); G.flights = 0; G.up = { blast: lv }; s.recalc(); step = 0; };
      const alive = () => G.enemies.filter(e => !e.dead).length;
      lv = 1; start();
      (function f() { P.inv = 99; P.fireT = 9; G.diveT = 99; G.shootT = 99;
        if (performance.now() - t0 > 80000) { Math.random = real; out.timeout = lv; return res(out); }
        const formed = G.enemies.filter(e => !e.dead && e.state === 'form');
        if (step === 0 && !G.queue.length && formed.length === G.form.size) { n0 = formed.length; const e = formed.find(e => e.r === 1 && e.c === 2);
          Math.random = () => pass === 3 ? 0.5 : 0.1;   // under 0.25: it explodes; over: it does not
          G.pb.push({ x: e.x, y: e.y, vx: 0, vy: 0, dmg: 1e7, pierce: 0, rico: 0, crit: false, kind: 0, hit: null, dead: false }); step = 1; at = G.time; }
        else if (step === 1 && G.time - at > 1) { Math.random = real; const k = pass === 3 ? 'none' : 'lv' + lv, h = pass === 3 ? 'hurtNone' : 'hurt' + lv; out[k] = n0 - alive(); out[h] = G.enemies.filter(e => !e.dead && e.hp < e.maxHp).length; out.size = n0;
          if (pass === 3) return res(out); pass++; if (pass < 3) lv++; start(); }
        requestAnimationFrame(f); })(); }));
    check(vp.lv1 >= 1 && vp.lv1 <= 2 && vp.lv2 <= 5 && vp.lv3 <= 9 && vp.hurt1 + vp.lv1 > 1 && vp.hurt2 + vp.lv2 >= vp.hurt1 + vp.lv1 && vp.hurt3 + vp.lv3 >= vp.hurt2 + vp.lv2, 'Volatile Payload: one kill in a full formation destroys only a few neighbours at any level', JSON.stringify(vp));
    check(vp.chance === 0.25 && vp.none === 1 && vp.hurtNone === 0, 'Volatile Payload: a destroyed enemy explodes one time in four; on the other three nothing near it is touched', JSON.stringify({ chance: vp.chance, destroyed: vp.none, hurt: vp.hurtNone }));
    // Hull: two upgrades at the most, counting the station's Reinforced Hull and Hull Plate boosters together
    const hull = await page.evaluate(() => { const s = window.__swarmfall, was = s.meta.up.hull, plate = s.UP.find(u => u.id === 'plate'), out = {};
      for (const [m, b] of [[0, 2], [1, 1], [1, 2], [0, 1], [1, 0]]) { s.meta.up.hull = m; s.G.up = { plate: b }; s.recalc(); out[m + '+' + b] = s.S.maxHp + (plate.ok() ? ' more' : ' full'); }
      s.meta.up.hull = was; s.G.up = {}; s.recalc(); out.max = plate.max; const shopHull = s.SHOP.find(x => x.id === 'hull'); out.levels = shopHull.cost.length; out.price = shopHull.cost[0]; return out; });
    check(hull['0+2'] === '3 full' && hull['1+1'] === '3 full' && hull['1+2'] === '3 full' && hull['0+1'] === '2 more' && hull['1+0'] === '2 more' && hull.max === 2 && hull.levels === 1 && hull.price === 90, 'hull: at most 2 upgrades, of which the station sells one (for 90); Hull Plate is not offered past the two', JSON.stringify(hull));
    // Split Barrel: one extra shot on every third volley, then one extra on every volley, then two extra on every volley.
    // Each volley is counted by itself, on a ship with one barrel and on one with the Twin Mount's two.
    const sb = await page.evaluate(() => new Promise(res => { const s = window.__swarmfall, { G, P, S } = s, was = s.meta.up.twin, out = { state: G.state, text: s.UP.find(u => u.id === 'twin').d };
      for (const e of G.enemies) { e.dead = true; s.scene.remove(e.g); } G.queue.length = 0; G.flights = 0;
      const guard = s.spawnEnemy('mite', 0, 0); guard.hp = guard.maxHp = 1e12; P.target = 300;   // keeps the wave from counting as cleared, well away from the shots
      const runs = []; for (const mount of [0, 1]) for (let lv = 0; lv <= 3; lv++) runs.push([mount, lv]);
      let i = -1, n0 = 0, seen = null, t0 = performance.now();
      const next = () => { i++; if (i >= runs.length) { s.meta.up.twin = was; G.up = {}; s.recalc(); return res(out); } s.meta.up.twin = runs[i][0]; G.up = runs[i][1] ? { twin: runs[i][1] } : {}; s.recalc(); P.volley = 0; G.pb.length = 0; n0 = 0; seen = []; out[runs[i].join('+')] = seen; P.fireT = 0; };
      next();
      (function f() { G.diveT = 99; G.shootT = 99; G.eb.length = 0; P.inv = 9; guard.hp = 1e12;
        if (performance.now() - t0 > 20000) { out.timeout = i; return res(out); }
        if (G.pb.length > n0) { seen.push(G.pb.length - n0); n0 = G.pb.length; if (seen.length === 6) next(); else P.fireT = 0; }
        requestAnimationFrame(f); })(); }));
    const six = a => (a || []).join('');
    check(sb.state === 'play' && six(sb['0+0']) === '111111' && six(sb['0+1']) === '112112' && six(sb['0+2']) === '222222' && six(sb['0+3']) === '333333', 'Split Barrel: two shots on every third volley, then two on every volley, then three on every volley', JSON.stringify({ none: six(sb['0+0']), lv1: six(sb['0+1']), lv2: six(sb['0+2']), lv3: six(sb['0+3']) }));
    check(six(sb['1+0']) === '222222' && six(sb['1+1']) === '223223' && six(sb['1+2']) === '333333' && six(sb['1+3']) === '444444' && Array.isArray(sb.text) && sb.text.length === 3, 'with the Twin Mount its extra shots are added to two barrels; its card has a line for each level', JSON.stringify({ none: six(sb['1+0']), lv1: six(sb['1+1']), lv2: six(sb['1+2']), lv3: six(sb['1+3']) }));
    await page.reload(); await page.waitForTimeout(500);   // a fresh page for the next part
    await page.tap('#btnPlay'); await waitFor(x => x.state === 'cut'); await page.touchscreen.tap(195, 400); await waitFor(x => x.state === 'play');
    const stress = await page.evaluate(() => new Promise(res => { const s = window.__swarmfall;
      for (const id of ['dash', 'arc', 'emp', 'twin', 'pierce', 'rico', 'drone', 'crit', 'blast', 'missile', 'chain', 'nova', 'shield', 'gas', 'flame', 'sentry', 'beam']) s.G.up[id] = 2;
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
    await fx.goto('file://' + GAME + '?gfx=high&intro=off&sim=off'); await fx.waitForTimeout(600); await startRun();
    const pic = await fx.evaluate(() => new Promise(res => { const s = window.__swarmfall; let n = 0;
      (function f() { s.P.inv = 9; if (++n < 12 || (s.G.pb.length < 3 && n < 400)) return requestAnimationFrame(f);   // wait until the ship has shots in the air: they are the bright things looked for
        const gl = document.querySelector('canvas'), c = document.createElement('canvas'); c.width = 97; c.height = 211; const g = c.getContext('2d'); g.drawImage(gl, 0, 0, c.width, c.height);
        const d = g.getImageData(0, 0, c.width, c.height).data; let lit = 0, bright = 0; for (let i = 0; i < d.length; i += 4) { const m = Math.max(d[i], d[i + 1], d[i + 2]); if (m > 24) lit++; if (m > 180) bright++; }
        res({ q: s.GFX.q, lit, bright, of: d.length / 4 }); })(); }));
    check(pic.q === 2 && pic.lit > 200 && pic.bright > 3 && pic.lit < pic.of * 0.9, 'all effects on: level 2, and a picture reaches the screen', JSON.stringify(pic));
    if (OUT) await fx.screenshot({ path: path.join(OUT, '10-effects-on.png') });

    // auto: a device that cannot keep up (software rendering here) must step the effects down by itself
    await fx.goto('file://' + GAME + '?intro=off&sim=off'); await fx.waitForTimeout(600);
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
    const bench = await page.evaluate(() => ({ all: window.__swarmfall.UP.filter(u => u.id !== 'patch').length, wave: document.getElementById('dbgWave').textContent, god: document.getElementById('dbgGod').textContent, on: [...document.querySelectorAll('#dbgUps .chip.on')].map(c => c.textContent), mods: [...document.querySelectorAll('#dbgMod .chip.on')].map(c => c.textContent), offered: [...document.querySelectorAll('#dbgUps .chip')].map(c => c.textContent) }));
    check(bench.wave === 'Wave 12 · Fracture Cube' && bench.on.join() === 'Flame Cloud2,Confusion Gas1' && bench.god.endsWith('on'), 'test bench: a wave, boosters with levels and "cannot be hit" can be chosen', JSON.stringify(bench.on));
    check(bench.mods.join() === 'Reinforced Hull1,Sentry Platform2' && bench.offered.includes('Sentry Satellite') && bench.offered.includes('Laser Drone') && bench.offered.includes('Burst Thrusters') && bench.offered.length === bench.all, 'test bench: station modules can be chosen for the test, and every booster is offered', bench.offered.length + ' boosters · modules: ' + bench.mods.join(', '));
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
    check(s.state === 'station' && /saves nothing/.test(note) && /This run collected ◆ \d+\. A real run would bank it here\./.test(note) && await saved() === before, 'test run: destroying the boss docks, but fits no module, banks no scrap and sells nothing, and the station says what the run collected', s.state + ' · ' + note.split('\n')[0]);
    await page.tap('#btnUndock'); await page.tap('.card'); await waitFor(x => x.state === 'play', 15000);
    await page.tap('#btnPause'); await page.waitForTimeout(200); await page.tap('#btnQuit'); await waitFor(x => x.state === 'dead', 5000);
    const over = await page.evaluate(() => ({ eyebrow: document.getElementById('deadEyebrow').textContent, again: document.getElementById('btnAgain').textContent }));
    check(await saved() === before && /nothing saved/.test(over.eyebrow) && over.again === 'Test again', 'test run: ending it leaves scrap, records and modules as they were', JSON.stringify(over));
    await page.tap('#btnAgain'); s = await waitFor(x => x.state === 'play', 15000); check(s.wave === 12, '"Test again" repeats the same test', 'wave ' + s.wave);
    await page.goto('file://' + GAME + '?gfx=low&intro=off&sim=off&debug'); await page.waitForTimeout(600);
    check(await page.isVisible('#scrDebug') && (await page.textContent('#dbgWave')).startsWith('Wave 12'), 'test bench: ?debug in the address opens it, with the last set-up remembered');
    await page.context().close();
  },
  // Enemy introductions.
  intro: async () => {
    // ---- enemy introductions (every other page here switches them off with ?intro=off&sim=off) ----
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
    // scrap and missiles are introduced the same way; marked as seen here so that they do not cut in before their own checks below
    await ip.evaluate(() => { const s = window.__swarmfall; s.meta.seen.scrap = s.meta.seen.heart = s.meta.seen.missile = true; });
    await startIp(); const i1 = await through(2.5);
    check(i1.started && i1.key === 'mite' && i1.name === 'Mite' && i1.kind === 'New enemy' && i1.shown && i1.ring > 20 && i1.cardOnScreen && i1.cardClearOfRing, 'a new enemy is introduced when it takes its place: a spotlight on it and a card with its name and what to do', JSON.stringify({ name: i1.name, text: i1.text, ring: i1.ring }));
    check(ramps(i1.in) && i1.in[0] > i1.in[i1.in.length - 1] && i1.frozen && ramps(i1.out) && i1.out[0] < i1.out[i1.out.length - 1] && i1.after === 1 && i1.hidden, 'the game slows quickly to a stop for it, then speeds quickly back up', 'in ' + i1.in.join(' ') + ' · out ' + i1.out.join(' '));
    check(!i1.button && i1.prompt === 'Tap to continue' && i1.earlyTouchIgnored && i1.held >= 2.5, 'the card stays until the player touches the screen afresh; a touch landing as it appears does not clear it', 'still up after ' + i1.held + ' s, cleared by a tap');
    await ip.evaluate(() => { const s = window.__swarmfall; for (const e of s.G.enemies) { e.dead = true; e.g.visible = false; } s.G.wave = 1; s.nextWave(); });
    const i2 = await through(0.6);
    // the first scrap ring and the first missile get the same treatment (the owner asked): a spotlight on the thing itself and a card
    await ip.evaluate(() => { const s = window.__swarmfall; s.G.diveT = 99; s.G.shootT = 99; s.P.inv = 9; s.IN.cool = 0; delete s.meta.seen.scrap; const p = s.spawnPick('scrap', 180, 260); p.vx = 0; p.vy = 0; });
    const i5 = await through(0.6);
    await ip.evaluate(() => { const s = window.__swarmfall; s.G.diveT = 99; s.G.shootT = 99; s.P.inv = 9; s.IN.cool = 0; delete s.meta.seen.missile; s.P.fireT = 9; s.fireMissile(60, 160); });   // off to one side, and the ship holds its fire, so the missile lives to be introduced
    const i6 = await through(0.6);
    check(i5.key === 'scrap' && i5.name === 'Scrap' && i5.kind === 'Salvage' && i5.frozen && i5.ring > 20 && i5.cardOnScreen && i5.cardClearOfRing, 'the first scrap ring is introduced like a new enemy: the game stops, a spotlight on the ring, a card', JSON.stringify({ key: i5.key, name: i5.name, kind: i5.kind, text: i5.text, ring: i5.ring }));
    check(i6.key === 'missile' && i6.name === 'Missile' && i6.kind === 'New threat' && i6.frozen && i6.ring > 20 && i6.cardOnScreen && i6.cardClearOfRing, 'the first missile is introduced the same way', JSON.stringify({ key: i6.key, name: i6.name, kind: i6.kind, text: i6.text, ring: i6.ring }));
    await ip.evaluate(() => { const s = window.__swarmfall; s.G.diveT = 99; s.G.shootT = 99; s.P.inv = 9; s.IN.cool = 0; delete s.meta.seen.heart; const p = s.spawnPick('heart', 180, 260); p.vx = 0; p.vy = 0; });
    const i7 = await through(0.6);
    check(i7.key === 'heart' && i7.name === 'Repair Cross' && i7.kind === 'Repair' && i7.frozen && i7.ring > 20 && i7.cardOnScreen && i7.cardClearOfRing, 'the first repair cross is introduced the same way', JSON.stringify({ key: i7.key, name: i7.name, kind: i7.kind, text: i7.text, ring: i7.ring }));
    const steers = await ip.evaluate(() => window.__swarmfall.G.state === 'play');
    const seenSaved = await ip.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('swarmfall.v1')).seen || {}).sort().join());
    check(i2.key === 'wasp' && i2.name === 'Wasp' && seenSaved === 'heart,missile,mite,scrap,wasp', 'the next new kind is introduced in its turn, and the save remembers which have been', 'saved as seen: ' + seenSaved);
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
    check(i4.key === 'boss' && i4.name === 'Hive Core' && i4.kind === 'New boss' && seenAfter === 'heart,missile,mite,scrap,wasp' && steers, 'test bench: "Introduce enemies" shows them on a test run (a boss here) without touching the save', i4.name + ' · save still has ' + seenAfter);
    await ip.context().close();
  },
  // A short phone: every screen keeps its main buttons on screen and says when there is more.
  small: async () => {
    // ---- a short phone: every screen keeps its main buttons on screen and says when there is more below ----
    const sm = await (await browser.newContext({ ...devices['iPhone SE'] })).newPage();
    sm.on('pageerror', e => errors.push('[small] ' + e.message));
    await sm.route('**/fonts.googleapis.com/**', r => r.fulfill({ body: '', contentType: 'text/css' }));
    await sm.goto('file://' + GAME + '?gfx=low&intro=off&sim=off'); await sm.waitForTimeout(600);
    const barOf = id => sm.evaluate(id => { const el = document.getElementById(id), inView = [...el.querySelectorAll('.dockbar .btn')].filter(b => !b.hidden).every(b => { const r = b.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight; });
      return { scrolls: el.scrollHeight > el.clientHeight + 2, more: !el.querySelector('.more').hidden, inView }; }, id);
    const okBar = b => b.inView && b.more === b.scrolls;   // buttons on screen; the tab shows exactly when there is something to scroll to
    const small = { title: await barOf('scrTitle') };
    await sm.tap('#btnStation'); await sm.waitForTimeout(400); small.station = await barOf('scrStation');
    await sm.evaluate(() => { const el = document.getElementById('scrStation'); el.scrollTop = el.scrollHeight; }); await sm.waitForTimeout(300); const stEnd = await barOf('scrStation');
    await sm.tap('#btnStationLaunch'); await sm.waitForFunction(() => window.__swarmfall.G.state === 'play', null, { timeout: 60000 });
    await sm.evaluate(() => { const s = window.__swarmfall; for (const k of ['rapid', 'heavy', 'twin', 'pierce', 'shield', 'drone', 'crit', 'blast', 'missile', 'chain']) s.G.up[k] = 1; s.recalc(); s.P.inv = 99; });
    await sm.tap('#btnPause'); await sm.waitForTimeout(300); small.pause = await barOf('scrPause'); await sm.tap('#btnResume');
    await sm.evaluate(() => { const s = window.__swarmfall; s.G.wave = 3; s.nextWave(); s.G.queue.length = 0; s.G.flights = 0; for (const e of s.G.enemies) e.hp = 0; });   // wave 4: a shuttle follows it
    await sm.waitForFunction(() => window.__swarmfall.G.state === 'draft', null, { timeout: 60000 }); await sm.waitForTimeout(300); small.booster = await barOf('scrDraft');
    check(Object.values(small).every(okBar) && small.station.scrolls && stEnd.inView && !stEnd.more, 'short phone: every screen keeps its main buttons on screen, with "More below" whenever there is more', JSON.stringify(small));
    if (OUT) await sm.screenshot({ path: path.join(OUT, '15-short-phone-booster.png') });
    await sm.context().close();
  },
};
const ABOUT = {
  core: 'a whole run: launch, shuttle, booster, Hive Core and its death scene, docking, station, death, reload',
  waves: 'which enemy arrives on which wave, how fast they fly in, the order of the bosses, the beetle\'s numbers, escorts, reinforcements, a boss\'s sweep',
  bosses: 'the four later bosses: attacks, special rules, docking; the station\'s bottom bar',
  clouds: 'Flame Cloud, Confusion Gas, darts',
  released: 'ships a boss releases',
  sentry: 'sentry satellites and the Laser Drone',
  sim: 'the simulation after a boss: the wavy scenes in and out, the grid and no station, bare ship only, harmless, a perfect score on every stage, the reward, pause, the result card and the touch that carries on, a part score in a real run on a short phone',
  emp: 'the EMP Bomb: lobbed ahead, its ring knocks out what it reaches (no steering, no fire), for how long, in the formation, missiles, latchers, bosses',
  arc: 'the Arc Caster: short reach, the chain from enemy to enemy, its damage, what it will not strike',
  burst: 'Burst Thrusters: a flick up or down, what does not count as one, the drift home, the hit shape, the keys',
  latcher: 'the latcher: leaping by itself, clamping on, going off, shaken off, slammed off; the shield; no harm by touch',
  stress: 'Volatile Payload in a full formation; the hull cap; Split Barrel\'s three levels; every booster at once on late waves; pause; the Graphics button',
  gfx: 'every effect on; the automatic step-down',
  bench: 'the test bench and test runs',
  intro: 'enemy introductions, and the same for the first scrap ring, repair cross and missile',
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
    let stuck = null;   // a group that stops dead (a check waiting on something that never comes) fails after 7 minutes, and the run goes on
    try { await Promise.race([GROUPS[n](), new Promise((_, no) => { stuck = setTimeout(() => no(new Error('no result after 7 minutes: a check stopped dead')), 420000); })]); clearTimeout(stuck); } catch (e) { clearTimeout(stuck); check(false, n + ': the group ran to its end', String(e && e.message || e).split('\n')[0]); }   // one group breaking does not stop the rest
    console.log('    (' + n + ': ' + Math.round((Date.now() - g0) / 1000) + ' s' + (failures > f0 ? ', ' + (failures - f0) + ' failed' : '') + ')');
  }
  check(errors.length === 0, 'no page errors', errors.slice(0, 5).join(' | '));
  await browser.close();
  console.log((failures ? failures + ' check(s) failed' : 'all checks passed') + ' · ' + (ONLY ? 'groups: ' + want.join(', ') : 'every group') + ' · ' + Math.round((Date.now() - t0) / 1000) + ' s');
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
