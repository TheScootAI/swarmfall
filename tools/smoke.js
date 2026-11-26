// End-to-end smoke test for Swarmfall in a phone-sized headless browser.
//   cd tools && npm install && node smoke.js [screenshot-dir]
// Exits 1 if any check fails. Plays a real run with the game's own debug handle (window.__swarmfall):
// title -> launch -> waves 1-3 -> booster shuttle -> booster -> waves 4-6 -> Hive Core -> dock -> station
// -> undock -> rare booster -> launch -> death -> reload, then builds every wave 1-20 many times to check
// when each enemy first appears (as set by the game's UNLOCK table).
//
// three.js is served from tools/node_modules when it is installed (the sandbox may block cdnjs); otherwise
// the page loads it from cdnjs as normal. WebGL runs on SwiftShader, so it works without a GPU.
const { chromium, devices } = require('playwright');
const fs = require('fs'), path = require('path');
const GAME = path.join(__dirname, '..', 'index.html');
const OUT = process.argv[2];
const THREE_LOCAL = path.join(__dirname, 'node_modules/three/build/three.min.js');


let failures = 0;
const check = (ok, label, detail = '') => { console.log((ok ? 'PASS ' : 'FAIL ') + label + (detail ? '  — ' + detail : '')); if (!ok) failures++; };

(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await (await browser.newContext({ ...devices['iPhone 13'] })).newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message + ' ' + ((e.stack || '').split('\n')[1] || '')));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  if (fs.existsSync(THREE_LOCAL)) { const lib = fs.readFileSync(THREE_LOCAL); await page.route('**/three.min.js', r => r.fulfill({ body: lib, contentType: 'application/javascript' })); }
  await page.route('**/fonts.googleapis.com/**', r => r.fulfill({ body: '', contentType: 'text/css' }));
  const shot = async name => { if (OUT) { fs.mkdirSync(OUT, { recursive: true }); await page.screenshot({ path: path.join(OUT, name + '.png') }); } };

  const st = () => page.evaluate(() => { const s = window.__swarmfall; return { state: s.G.state, cut: s.G.cut && s.G.cut.kind, wave: s.G.wave, mods: s.meta.mods.join(','), scrap: s.meta.scrap }; });
  const waitFor = async (pred, ms = 30000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const s = await st(); if (pred(s)) return s; await page.waitForTimeout(40); } return st(); };
  // Destroys whatever is on screen (waiting for the Hive Core to finish its entrance) and keeps the ship safe.
  const clearWave = () => page.evaluate(() => { const s = window.__swarmfall; s.P.inv = 9; s.G.eb.length = 0; s.G.em.length = 0;
    if (s.G.wave % 6 === 0) { if (!s.G.boss || s.G.boss.intro > 0) return; } else s.G.queue.length = 0;
    for (const e of s.G.enemies) { e.z = 0; s.G.pb.push({ x: e.x, y: e.y, vx: 0, vy: 0, dmg: 1e7, pierce: 0, rico: 0, crit: false, kind: 0, hit: null, dead: false }); } });
  const playTo = async target => { for (let i = 0; i < 400; i++) { const s = await st(); if (target(s)) return s; if (s.state === 'play') await clearWave(); await page.waitForTimeout(120); } return st(); };

  await page.goto('file://' + GAME); await page.waitForTimeout(600);
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
  s = await playTo(x => x.state === 'cut' && x.cut === 'dock'); check(s.wave === 6, 'Hive Core on wave 6 leads to docking', 'wave ' + s.wave);
  s = await waitFor(x => x.state === 'station'); check(s.state === 'station' && s.mods === 'dmg,hull,shield', 'docked: Aegis Generator fitted', s.mods);
  check(s.scrap >= 60, 'docking banks the run\'s scrap', 'scrap ' + s.scrap);
  await shot('05-station');
  const hp0 = await page.evaluate(() => window.__swarmfall.S.maxHp);
  await page.locator('#shop .item', { hasText: 'Reinforced Hull' }).locator('button').tap();
  check(await page.evaluate(() => window.__swarmfall.S.maxHp) === hp0 + 1, 'a module bought while docked applies at once');
  await page.tap('#btnUndock'); s = await waitFor(x => x.state === 'draft');
  check((await page.textContent('#draftEyebrow')).includes('rare booster'), 'undocking offers the rare booster');
  await page.tap('.card'); s = await waitFor(x => x.state === 'cut'); check(s.cut === 'launch', 'the ship launches again after the rare booster');
  await page.touchscreen.tap(195, 400); s = await waitFor(x => x.state === 'play', 3000); check(s.state === 'play' && s.wave === 7, 'a tap skips the launch; wave 7 starts');

  const banked = (await st()).scrap;
  await page.evaluate(() => { const s = window.__swarmfall; s.P.inv = 0; s.P.hp = 1; s.P.shieldUp = false; s.P.shieldT = 99; /* the rare booster may have been a shield: keep it down */ s.G.revive = 0; s.G.eb.push({ x: s.P.x, y: s.P.y - 3, vx: 0, vy: 5, r: 6 }); });
  s = await waitFor(x => x.state === 'dead', 8000); check(s.state === 'dead', 'one hit with no hull to spare ends the run');
  check(s.scrap - banked < 60, 'scrap banked at the dock is not counted twice', banked + ' -> ' + s.scrap);
  await shot('06-dead');
  await page.reload(); await page.waitForTimeout(600);
  check((await st()).mods === 'dmg,hull,shield', 'station modules survive a reload');

  // When each enemy first appears: build every wave 1-20 many times and record the first wave each type shows up.
  await page.tap('#btnPlay'); await waitFor(x => x.state === 'cut'); await page.touchscreen.tap(195, 400); await waitFor(x => x.state === 'play');
  const first = await page.evaluate(() => { const s = window.__swarmfall, first = {};
    for (let w = 1; w <= 26; w++) for (let k = 0; k < 30; k++) {
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
  await page.tap('#btnPause').catch(() => {}); await page.waitForTimeout(300);
  check(await page.evaluate(() => window.__swarmfall.G.state) === 'pause', 'pause works');
  await shot('07-paused');

  check(errors.length === 0, 'no page errors', errors.slice(0, 5).join(' | '));
  await browser.close();
  console.log(failures ? failures + ' check(s) failed' : 'all checks passed');
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
