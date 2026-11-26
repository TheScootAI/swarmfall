// Renders a portrait of each enemy from the game itself, for the enemy guide (artifacts/enemy-guide/img).
// Run it after changing an enemy's model or colours:  cd tools && node portraits.js [out-dir]
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const GAME = path.join(__dirname, '..', 'index.html');
const OUT = process.argv[2] || path.join(__dirname, '..', 'artifacts', 'enemy-guide', 'img');
// name, model scale for the picture, spawn options
const SHOTS = [['mite', 4.2, {}], ['wasp', 3.6, {}], ['weaver', 4, {}], ['splitter', 3.6, {}], ['beetle', 3, {}], ['elite', 3, { elite: true }],
  ['triplet', 3.4, {}], ['lancer', 3, {}], ['boss', 1.4, { tint: 0xff4f8b }]];

(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })).newPage();
  await page.route('**/fonts.googleapis.com/**', r => r.fulfill({ body: '', contentType: 'text/css' }));
  await page.goto('file://' + GAME + '?gfx=high'); await page.waitForTimeout(500);   // every effect on, as a player on a good phone sees it
  await page.tap('#btnPlay'); await page.waitForTimeout(300); await page.touchscreen.tap(195, 400);
  await page.waitForFunction(() => window.__swarmfall.G.state === 'play');
  // hide the HUD, and the nebula and far rocks: a portrait sits on a plain dark ground
  await page.evaluate(() => { document.getElementById('ui').style.display = 'none'; for (const o of window.__swarmfall.scene.children) if (o.position.z < -800) o.visible = false; });
  fs.mkdirSync(OUT, { recursive: true });
  for (const [name, scale, opt] of SHOTS) {
    // one enemy alone, then freeze the game (pause draws one frame) and pose the model in the middle of the screen
    await page.evaluate(([name, opt]) => { const s = window.__swarmfall; s.G.state = 'play'; s.G.queue.length = 0;
      for (const e of s.G.enemies) { e.dead = true; e.g.visible = false; } s.G.enemies.length = 0; s.G.eb.length = 0; s.G.em.length = 0; s.G.pb.length = 0;
      s.P.inv = 99; s.G.form = { cols: 1, top: 96 }; const e = s.spawnEnemy(name === 'elite' ? 'wasp' : name, 0, 0, opt); e.state = 'form'; window.__e = e; }, [name, opt]);
    await page.waitForTimeout(120);
    await page.evaluate(sc => { const s = window.__swarmfall, e = window.__e; s.G.state = 'pause'; e.g.position.set(0, 0, 0); e.g.scale.setScalar(sc * (e.elite ? 1.25 : 1));
      if (e.type === 'boss') e.g.rotation.set(0, 0, 0); else e.g.rotation.set(0.25, e.type === 'mite' || e.type === 'weaver' ? 0.6 : 0.35, 0); }, scale);
    await page.waitForTimeout(250);
    const box = name === 'boss' ? 260 : 170;
    await page.screenshot({ path: path.join(OUT, name + '.png'), clip: { x: 195 - box / 2, y: 422 - box / 2, width: box, height: box } });
    // a paused frame is only drawn once, so unpause before the next pose
    await page.evaluate(() => { window.__swarmfall.G.state = 'play'; });
  }
  console.log('wrote', SHOTS.length, 'portraits to', OUT);
  await browser.close();
})();
