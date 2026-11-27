// Takes a fixed set of screenshots for judging the game's look by eye: colours, glow, readability.
//   cd tools && node shots.js <out-dir> [query] [bosses]      e.g.  node shots.js /tmp/look "gfx=high"
// The checks in smoke.js cannot see colour. Run this after any change to rendering and look at the pictures:
// enemy fire must read red, pickup halos blue, scrap gold, and nothing good may look red.
const { chromium, devices } = require('playwright');
const fs = require('fs'), path = require('path');
const OUT = process.argv[2] || path.join(__dirname, 'out', 'shots'), QUERY = '?intro=off' + (process.argv[3] ? '&' + process.argv[3] : '');   // enemy introductions off: they would stop the game mid-picture
const BOSSES_ONLY = process.argv[4] === 'bosses';   // only the pictures of the four bosses after the Hive Core, and of the clouds
const GAME = 'file://' + path.join(__dirname, '..', 'index.html') + QUERY;

(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const errors = [];
  fs.mkdirSync(OUT, { recursive: true });
  const open = async () => {
    const page = await (await browser.newContext({ ...devices['iPhone 13'] })).newPage();
    page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.route('**/fonts.googleapis.com/**', r => r.fulfill({ body: '', contentType: 'text/css' }));
    await page.goto(GAME); await page.waitForTimeout(700); return page;
  };
  const start = async page => { await page.tap('#btnPlay'); await page.waitForTimeout(400); await page.touchscreen.tap(195, 400); await page.waitForFunction(() => window.__swarmfall.G.state === 'play'); await page.evaluate(() => { window.__swarmfall.meta.runs = 9; }); };   // runs = 9: no first-time hint banners over the picture
  // runs the game for `ms` of game time (software rendering is slow, so the wall clock would give a different picture each run) with the ship safe and parked, calling window.__tick each frame if a scene set one
  const hold = (page, ms, x = 120) => page.evaluate(([ms, x]) => new Promise(r => { const s = window.__swarmfall, t0 = performance.now();
    const g0 = s.G.time;
    (function f() { s.P.inv = 0; s.P.hp = s.S.maxHp; s.G.revive = 9; s.P.target = x; if (window.__tick) window.__tick(s); if ((s.G.time - g0) * 1000 > ms || performance.now() - t0 > ms * 12) r(); else requestAnimationFrame(f); })(); }), [ms, x]);
  const snap = (page, name) => page.screenshot({ path: path.join(OUT, name + '.png') });

  let page;
  if (!BOSSES_ONLY) {
  page = await open();
  await snap(page, '1-title');
  await page.tap('#btnPlay'); await page.waitForTimeout(1300); await snap(page, '2-launch');

  // a late formation: every enemy type, an elite, darts and balls in flight
  page = await open(); await start(page);
  await page.evaluate(() => { const s = window.__swarmfall; s.G.up.shield = 1; s.G.up.drone = 2; s.recalc(); s.G.wave = 16; s.nextWave(); s.G.shootT = 0.5; window.__tick = s => { s.P.inv = 9; s.P.shieldUp = true; }; });
  await hold(page, 6500); await snap(page, '3-formation');

  // lasers: one firing, one charging; pickups on screen
  await page.evaluate(() => { const s = window.__swarmfall; const L = s.G.enemies.filter(e => e.laser); if (L[0]) { L[0].laser.phase = 'fire'; L[0].laser.t = 1.6; } s.spawnPick('scrap', 250, 380); s.spawnPick('scrap', 300, 300); s.spawnPick('heart', 200, 330); });
  await hold(page, 500); await snap(page, '4-laser-pickups');

  // Hive Core with its fan of shots, missiles homing, seekers and lightning from the ship
  page = await open(); await start(page);
  await page.evaluate(() => { const s = window.__swarmfall; s.G.up.missile = 1; s.G.up.chain = 3; s.G.up.blast = 1; s.G.up.twin = 1; s.recalc(); s.G.wave = 5; s.nextWave(); window.__tick = s => { s.P.inv = 9; }; });
  await hold(page, 6600, 190); await page.evaluate(() => { const s = window.__swarmfall; s.fireMissile(90, 220); s.fireMissile(280, 180); });
  await hold(page, 800, 190); await snap(page, '5-hive-core');
  // the kill: big explosion and scrap shower
  await page.evaluate(() => { const s = window.__swarmfall; s.G.boss.hp = 1; });
  await hold(page, 300, 190); await snap(page, '6-core-destroyed');   // 300 ms of game time is about 1.5 real seconds into the slow-motion death scene

  // a hit on the shield, then booster screen for UI over the scene
  page = await open(); await start(page);
  await page.evaluate(() => { const s = window.__swarmfall; s.G.wave = 2; s.nextWave(); s.G.queue.length = 0; for (const e of s.G.enemies) e.hp = 0; window.__tick = null; });
  await page.waitForFunction(() => window.__swarmfall.G.state === 'cut', null, { timeout: 90000 }); await page.waitForTimeout(4000); await snap(page, '7-shuttle');
  await page.waitForFunction(() => window.__swarmfall.G.state === 'draft', null, { timeout: 90000 }); await page.waitForTimeout(300); await snap(page, '8-booster');

  // the pause screen, where the graphics setting lives
  page = await open(); await start(page); await hold(page, 1500);
  await page.evaluate(() => { document.getElementById('btnPause').click(); }); await page.waitForTimeout(600); await snap(page, '9-pause');

  }

  // the Fracture Cube: whole and firing, then broken into quarters
  const safe = page => page.evaluate(() => { const s = window.__swarmfall; (function k() { s.P.inv = 9; s.P.target = 150; s.G.revive = 9; requestAnimationFrame(k); })(); });
  const smash = page => page.evaluate(() => { const s = window.__swarmfall; for (const e of s.G.enemies) if (e.def.boss) s.G.pb.push({ x: e.x, y: e.y, vx: 0, vy: 0, dmg: 1e7, pierce: 0, rico: 0, crit: false, kind: 0, hit: null, dead: false }); });
  const bodies = (page, n) => page.waitForFunction(n => window.__swarmfall.G.enemies.filter(e => !e.dead && e.def.boss).length === n, n, { timeout: 60000 });
  page = await open(); await start(page); await safe(page);
  await page.evaluate(() => { const s = window.__swarmfall; s.G.wave = 11; s.nextWave(); window.__tick = s => { s.P.inv = 9; }; });
  await hold(page, 9000, 150); await snap(page, '10-fracture-cube');
  await smash(page); await bodies(page, 2); await hold(page, 900, 150);
  await smash(page); await bodies(page, 4); await hold(page, 3200, 150); await snap(page, '11-cube-quarters');

  // the Beam Warden: its beams aimed (thin lines), then on
  page = await open(); await start(page); await safe(page);
  await page.evaluate(() => { const s = window.__swarmfall; s.G.wave = 17; s.nextWave(); });
  const phase = (ph, below) => page.waitForFunction(([ph, below]) => { const b = window.__swarmfall.G.boss; return b && b.bm && b.bm.phase === ph && b.bm.t < below; }, [ph, below], { timeout: 180000 });
  await phase('charge', 0.35); await snap(page, '12-warden-aim');
  await phase('fire', 0.9); await snap(page, '13-warden-beams');
  await phase('idle', 9); await phase('charge', 9); await phase('fire', 0.9); await snap(page, '14-warden-second-fan');

  // the Siege Beetle: shell shut with missiles out, its lane marked, mid-charge, and open at the top
  page = await open(); await start(page); await safe(page);
  await page.evaluate(() => { const s = window.__swarmfall; s.G.wave = 23; s.nextWave(); });
  const mode = (m, extra) => page.waitForFunction(([m, extra]) => { const b = window.__swarmfall.G.boss; return b && b.mode === m && (!extra || extra === 'missiles' && window.__swarmfall.G.em.length >= 2 || extra === 'low' && b.y > 380 || extra === 'late' && b.pt < 0.45 || extra === 'wide' && b.open > 0.95 && b.pt < 1.8); }, [m, extra], { timeout: 180000 });
  await mode('guard', 'missiles'); await snap(page, '15-siege-missiles');
  await mode('aim', 'late'); await snap(page, '16-siege-lane');
  await mode('charge', 'low'); await snap(page, '17-siege-charge');
  await mode('open', 'wide'); await snap(page, '18-siege-open');

  // the Triad: its pinwheel of shots, then with one core left
  page = await open(); await start(page); await safe(page);
  await page.evaluate(() => { const s = window.__swarmfall; s.G.wave = 29; s.nextWave(); });
  await page.waitForFunction(() => { const b = window.__swarmfall.G.boss; return b && b.hub && b.hub.wheel > 0 && b.hub.wheel < 0.5; }, null, { timeout: 180000 }); await snap(page, '19-triad-pinwheel');
  await page.evaluate(() => { const s = window.__swarmfall, o = s.G.enemies.filter(e => e.def.boss).slice(0, 2); for (const e of o) s.G.pb.push({ x: e.x, y: e.y, vx: 0, vy: 0, dmg: 1e7, pierce: 0, rico: 0, crit: false, kind: 0, hit: null, dead: false }); });
  await bodies(page, 1);
  await page.waitForFunction(() => { const b = window.__swarmfall.G.boss; return b && b.hub && b.hub.wheel > 0 && b.hub.wheel < 0.5; }, null, { timeout: 180000 }); await snap(page, '20-triad-last-core');

  // the cloud boosters: a flame cloud and a gas cloud on the formation, then burning and confused enemies
  page = await open(); await start(page); await safe(page);
  await page.evaluate(() => { const s = window.__swarmfall; s.G.wave = 8; s.nextWave(); (function k() { s.G.diveT = 9; s.P.fireT = 9; requestAnimationFrame(k); })(); });
  await page.waitForFunction(() => { const s = window.__swarmfall; return s.G.waveT > 4.5 && s.G.enemies.filter(e => e.state === 'form').length > 12; }, null, { timeout: 120000 });
  await page.evaluate(() => { const s = window.__swarmfall, f = s.G.enemies.filter(e => e.state === 'form'), a = f[1], b = f[f.length - 2]; s.launchCloud(1, a.x, a.y, 2); s.launchCloud(0, b.x, b.y, 2); });
  const gameWait = sec => page.evaluate(sec => new Promise(r => { const s = window.__swarmfall, g0 = s.G.time; (function f() { if (s.G.time - g0 > sec) r(); else requestAnimationFrame(f); })(); }), sec);
  await gameWait(0.45); await snap(page, '21-clouds-flying');
  await gameWait(1.6); await snap(page, '22-clouds-hanging');

  console.log('wrote 22 screenshots to', OUT, '| page errors:', errors.length, errors.slice(0, 3).join(' | '));
  await browser.close();
})();
