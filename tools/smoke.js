// End-to-end smoke test for Swarmfall in a phone-sized headless browser.
//   cd tools && npm install && node smoke.js [screenshot-dir]
// Exits 1 if any check fails. Plays a real run with the game's own debug handle (window.__swarmfall):
// title -> launch -> waves 1-3 -> booster shuttle -> booster -> waves 4-6 -> Hive Core -> dock -> station
// -> undock -> rare booster -> launch -> death -> reload, then builds every wave 1-20 many times to check
// when each enemy first appears (as set by the game's UNLOCK table).
//
// The game loads three.js from vendor/three.min.js, so nothing is fetched. WebGL runs on SwiftShader, so it
// works without a GPU.
const { chromium, devices } = require('playwright');
const fs = require('fs'), path = require('path');
const GAME = path.join(__dirname, '..', 'index.html');
const OUT = process.argv[2];


let failures = 0;
const check = (ok, label, detail = '') => { console.log((ok ? 'PASS ' : 'FAIL ') + label + (detail ? '  — ' + detail : '')); if (!ok) failures++; };

(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await (await browser.newContext({ ...devices['iPhone 13'] })).newPage();
  const errors = [];
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

  // The main run has the effects off (?gfx=low): software rendering is slow, and these checks are about the game's rules.
  // The graphics checks at the end turn them on.
  await page.goto('file://' + GAME + '?gfx=low'); await page.waitForTimeout(600);
  check(await page.evaluate(() => !!window.__swarmfall), 'game boots');
  let s = await st();
  check(s.state === 'title' && s.mods === 'dmg,hull', 'new save: title screen, two station modules', JSON.stringify(s));
  await shot('01-title');

  await page.tap('#btnPlay');
  s = await waitFor(x => x.state === 'cut'); check(s.cut === 'launch', 'Launch opens the launch cutscene');
  s = await waitFor(x => x.state === 'play'); check(s.wave === 1, 'wave 1 starts after the launch');
  await page.waitForTimeout(400); await shot('02-wave1');
  s = await playTo(x => x.state === 'clear' && x.wave === 1);
  check((await page.textContent('#toast')).includes('Booster shuttle arrives in 2 waves'), 'countdown text after wave 1');

  s = await playTo(x => x.state === 'cut' && x.cut === 'shuttle'); check(s.wave === 3, 'booster shuttle arrives after wave 3', 'wave ' + s.wave);
  await page.waitForTimeout(500); await page.touchscreen.tap(100, 500); await page.waitForTimeout(100);
  check((await st()).state === 'cut', 'a tap does not cut the shuttle scene short');
  await shot('03-shuttle');
  s = await waitFor(x => x.state === 'draft'); check(s.state === 'draft', 'booster choice opens after the shuttle');
  check((await page.textContent('#draftEyebrow')).startsWith('Booster shuttle'), 'booster screen heading');
  await shot('04-booster');
  await page.tap('.card'); s = await waitFor(x => x.state === 'play'); check(s.wave === 4, 'wave 4 starts after picking a booster');

  await page.evaluate(() => { window.__swarmfall.G.run.scrap += 60; });
  // watch the Hive Core's death scene from inside the page: slowest game speed, closest camera, and hull lost during it
  await page.evaluate(() => { const s = window.__swarmfall, w = window.__fin = { slowest: 1, closest: 1, far: s.camera.position.z, hp: null, hurt: false };
    (function f() {
      if (s.FIN.on && !w.done) {   // a shot is dropped on the ship every frame, with its usual protection taken away
        w.slowest = Math.min(w.slowest, s.G.speed); w.closest = Math.min(w.closest, s.camera.position.z / w.far);
        if (w.hp === null) w.hp = s.P.hp; if (s.P.hp < w.hp || !s.P.alive) w.hurt = true;
        if (w.slowest < 0.3 && s.G.speed > 0.5) { w.done = true; s.G.eb.length = 0; }   // the scene is easing out: stop, so no test shot is left on the ship when it ends
        else { s.P.inv = 0; s.G.eb.push({ x: s.P.x, y: s.P.y, vx: 0, vy: 0, r: 5, kind: 0, dead: false }); }
      } else if (!s.FIN.on && w.done && w.grace === undefined) w.grace = s.P.inv;   // the first frame after the scene
      if (s.G.state !== 'station') requestAnimationFrame(f); })(); });
  s = await playTo(x => x.state === 'cut' && x.cut === 'dock'); check(s.wave === 6 && s.state === 'cut', 'Hive Core on wave 6 leads to docking', 'wave ' + s.wave + ' ' + s.state);
  const fin = await page.evaluate(() => { const s = window.__swarmfall; return { ...window.__fin, on: s.FIN.on, speed: s.G.speed, z: s.camera.position.z }; });
  check(fin.slowest < 0.3 && fin.closest > 0.999, 'the Hive Core dies in slow motion, and the camera stays where it is', JSON.stringify(fin));
  check(!fin.hurt && fin.grace > 0.3, 'the ship cannot be hit during the core\'s death scene, nor for a moment after', 'grace ' + fin.grace);
  check(!fin.on && fin.speed === 1 && Math.abs(fin.z - fin.far) < 0.01, 'speed and camera are back to normal by the time docking starts', JSON.stringify(fin));
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
  await page.reload(); await page.waitForTimeout(600);

  // When each enemy first appears: build every wave 1-20 many times and record the first wave each type shows up.
  await page.tap('#btnPlay'); await waitFor(x => x.state === 'cut'); await page.touchscreen.tap(195, 400); await waitFor(x => x.state === 'play');
  const first = await page.evaluate(() => { const s = window.__swarmfall, first = {};
    for (let w = 1; w <= 31; w++) for (let k = 0; k < 30; k++) {
      for (const e of s.G.enemies) e.dead = true; s.G.enemies = []; s.G.wave = w - 1; s.nextWave(); for (const q of s.G.queue) q.fn(); s.G.queue.length = 0;
      for (const e of s.G.enemies) for (const t of [e.type, e.elite && 'elite']) if (t && !(t in first)) first[t] = w;
    }
    return first; });
  // the game's UNLOCK table says when each enemy arrives; check the waves it builds agree
  const U = await page.evaluate(() => window.__swarmfall.UNLOCK);
  const expected = { mite: 1, wasp: U.wasp, weaver: U.weaver, splitter: U.splitter, elite: U.elite, beetle: U.beetle, triplet: U.triplet, lancer: U.lancer[0] };
  for (const [t, w] of Object.entries(expected)) check(first[t] === w, t + ' first appears on wave ' + w + ' (UNLOCK)', 'seen first on ' + first[t]);
  const lancersAt = await page.evaluate(L => L.map(w => { const s = window.__swarmfall; for (const e of s.G.enemies) e.dead = true; s.G.enemies = []; s.G.wave = w - 1; s.nextWave(); for (const q of s.G.queue) q.fn(); s.G.queue.length = 0; return s.G.enemies.filter(e => e.type === 'lancer').length; }), U.lancer);
  check(lancersAt.join() === '1,2,3', 'lancers: 1, 2 and 3 from waves ' + U.lancer.join(', '), 'got ' + lancersAt.join(','));
  // the bosses take turns, in the order of the BOSSES table: one every 6th wave
  const order = await page.evaluate(() => window.__swarmfall.BOSSES.map(b => b.type));
  check(order.every((type, i) => first[type] === 6 * (i + 1)) && order.length === 5, 'bosses arrive in turn on waves 6, 12, 18, 24 and 30', order.map(type => type + ' ' + first[type]).join(', '));

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
      const bar = () => page.evaluate(() => { const el = document.getElementById('scrStation'), u = document.getElementById('btnUndock').getBoundingClientRect(); return { undockInView: u.top >= 0 && u.bottom <= innerHeight, more: !document.getElementById('stMore').hidden, toGo: el.scrollHeight - el.clientHeight - el.scrollTop }; });
      const top = await bar(); await page.tap('#stMore'); await page.waitForTimeout(900); const mid = await bar();
      await page.evaluate(() => { const el = document.getElementById('scrStation'); el.scrollTop = el.scrollHeight; }); await page.waitForTimeout(300); const end = await bar();
      check(top.undockInView && top.more && top.toGo > 100 && mid.toGo < top.toGo && mid.undockInView && end.undockInView && !end.more, 'station: Undock stays on screen while the list scrolls, and "More below" shows until its end', JSON.stringify([top, mid, end]));
    }
    await shot('1' + (b.wave / 6 - 1) + '-after-' + b.type);
  }

  // Every system at once: all boosters on, late waves with lasers, missiles and triplets, while the ship
  // keeps firing. This exercises the effect pools (rings, lightning, particles), missiles being shot down,
  // shields and Reactive Nova clearing fire mid-loop, triplet splits and the lancer beam.
  await page.reload(); await page.waitForTimeout(500);   // a fresh page: the wave check above leaves its test enemies in the scene
  await page.tap('#btnPlay'); await waitFor(x => x.state === 'cut'); await page.touchscreen.tap(195, 400); await waitFor(x => x.state === 'play');
  const stress = await page.evaluate(() => new Promise(res => { const s = window.__swarmfall;
    for (const id of ['twin', 'pierce', 'rico', 'drone', 'crit', 'blast', 'missile', 'chain', 'nova', 'shield']) s.G.up[id] = 2;
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

  // all effects on: the picture must actually arrive on screen (a broken post-processing chain shows black)
  const fx = await (await browser.newContext({ ...devices['iPhone 13'] })).newPage();
  fx.on('pageerror', e => errors.push('[gfx] ' + e.message)); fx.on('console', m => { if (m.type() === 'error') errors.push('[gfx] ' + m.text()); });
  await fx.route('**/fonts.googleapis.com/**', r => r.fulfill({ body: '', contentType: 'text/css' }));
  const startRun = async () => { await fx.tap('#btnPlay'); await fx.waitForTimeout(400); await fx.touchscreen.tap(195, 400); await fx.waitForFunction(() => window.__swarmfall.G.state === 'play', null, { timeout: 60000 }); };
  await fx.goto('file://' + GAME + '?gfx=high'); await fx.waitForTimeout(600); await startRun();
  const pic = await fx.evaluate(() => new Promise(res => { const s = window.__swarmfall; let n = 0;
    (function f() { s.P.inv = 9; if (++n < 12) return requestAnimationFrame(f);
      const gl = document.querySelector('canvas'), c = document.createElement('canvas'); c.width = 97; c.height = 211; const g = c.getContext('2d'); g.drawImage(gl, 0, 0, c.width, c.height);
      const d = g.getImageData(0, 0, c.width, c.height).data; let lit = 0, bright = 0; for (let i = 0; i < d.length; i += 4) { const m = Math.max(d[i], d[i + 1], d[i + 2]); if (m > 24) lit++; if (m > 180) bright++; }
      res({ q: s.GFX.q, lit, bright, of: d.length / 4 }); })(); }));
  check(pic.q === 2 && pic.lit > 200 && pic.bright > 3 && pic.lit < pic.of * 0.9, 'all effects on: level 2, and a picture reaches the screen', JSON.stringify(pic));
  if (OUT) await fx.screenshot({ path: path.join(OUT, '10-effects-on.png') });

  // auto: a device that cannot keep up (software rendering here) must step the effects down by itself
  await fx.goto('file://' + GAME); await fx.waitForTimeout(600);
  await fx.evaluate(() => { const s = window.__swarmfall; s.meta.gfx = 'auto'; s.meta.autoQ = 2; s.GFX.mode = 'auto'; window.dispatchEvent(new Event('resize')); });
  await startRun();
  const auto = await fx.evaluate(() => new Promise(res => { const s = window.__swarmfall, t0 = performance.now();
    (function f() { s.P.inv = 9; if (s.GFX.q < 2 || performance.now() - t0 > 30000) res({ q: s.GFX.q, ms: Math.round(s.GFX.ema), saved: s.meta.autoQ }); else requestAnimationFrame(f); })(); }));
  check(auto.q < 2 ? auto.saved === auto.q : auto.ms <= 38, 'auto: steps down when frames are slow, and remembers it', JSON.stringify(auto));

  check(errors.length === 0, 'no page errors', errors.slice(0, 5).join(' | '));
  await browser.close();
  console.log(failures ? failures + ' check(s) failed' : 'all checks passed');
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
