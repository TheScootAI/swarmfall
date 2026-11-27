// The training simulation, for whoever changes its lines (SIM.paths, SIM.stages) or how far they sit from the ship.
//
//   node sim-bot.js                 every stage three times: does an aiming bot hit all forty?
//   node sim-bot.js 30 6            the stage after wave 30, six times (add `low` for a bot that goes for the lowest hologram)
//   node sim-bot.js draw <out.png>  a picture of every stage's five lines, to judge their shapes by eye
//
// The bot takes the holograms in the order they came out, as a player would, and leads each by the time a shot takes
// to arrive. (Going for the lowest instead loses the rising lines: it keeps leaving one for the next to come in.) A stage it cannot clear
// every time is too hard to be the place for a perfect-score bonus. One run proves little: a stage can pass twice and
// still fail one time in three.
const { chromium, devices } = require('playwright'), path = require('path');
const GAME = path.join(__dirname, '..', 'index.html');
(async () => {
  const args = process.argv.slice(2), browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await (await browser.newContext({ ...devices['iPhone 13'] })).newPage(); page.on('pageerror', e => console.log('ERR', e.message));
  await page.route('**/fonts.googleapis.com/**', r => r.fulfill({ body: '', contentType: 'text/css' }));
  await page.goto('file://' + GAME + '?gfx=low&intro=off&debug'); await page.waitForTimeout(600);
  if (args[0] === 'draw') {
    await page.evaluate(() => { const w = window.__swarmfall, S = w.SIM, CW = 150, CH = 250, W = 360, H = 613 * 0 + Math.round(w.shipY() + 70), c = document.createElement('canvas'), k = CW / W;
      c.width = CW * 5 + 60; c.height = (CH + 26) * S.stages.length + 10; c.id = 'sheet'; c.style.cssText = 'position:fixed;left:0;top:0;z-index:99;background:#070818'; document.body.appendChild(c);
      const g = c.getContext('2d'), col = ['#7fd4ff', '#ffc857', '#c79bff', '#7dffb0', '#ff9a6b']; g.font = '11px sans-serif';
      S.stages.forEach((st, si) => st.forEach(([name, mirror, form], li) => { const x0 = 56 + li * CW, y0 = 8 + si * (CH + 26), sc = (CH - 10) / H;
        g.strokeStyle = '#2a2f66'; g.strokeRect(x0 + 2, y0, CW - 4, CH); g.fillStyle = '#aab'; g.fillText(name + (mirror ? ' ⇄' : '') + ' · ' + form, x0 + 6, y0 + CH + 14); if (!li) g.fillText('Stage ' + (si + 1), 4, y0 + CH / 2);
        g.save(); g.beginPath(); g.rect(x0 + 2, y0, CW - 4, CH); g.clip();
        const draw = (p, px, colr, t0) => { g.strokeStyle = colr; g.lineWidth = 1.5; g.beginPath(); for (let i = 0; i <= 160; i++) { const X = x0 + (p[i * 2] * W + px) * k, Y = y0 + w.simYAt(p[i * 2 + 1]) * sc; i ? g.lineTo(X, Y) : g.moveTo(X, Y); } g.stroke();
          g.fillStyle = colr; for (let n = 0; n < 4; n++) { const i = Math.round(160 * (0.3 + 0.07 * (n * 2 + t0))); g.beginPath(); g.arc(x0 + (p[i * 2] * W + px) * k, y0 + w.simYAt(p[i * 2 + 1]) * sc, 3.2, 0, 7); g.fill(); }
          g.beginPath(); g.arc(x0 + (p[0] * W + px) * k, y0 + Math.max(4, Math.min(CH - 4, w.simYAt(p[1]) * sc)), 2, 0, 7); g.fillStyle = '#fff'; g.fill(); };
        const a = w.simPath(name, mirror), b = w.simPath(name, !mirror);
        if (form === 'pair') { draw(a, -S.side, col[li], 0); draw(a, S.side, col[li], 0); } else if (form === 'split') { draw(a, 0, col[li], 0); draw(b, 0, '#8892c8', 1); } else { draw(a, 0, col[li], 0); draw(a, 0, col[li], 1); }
        g.fillStyle = '#5fe8ff'; g.beginPath(); g.moveTo(x0 + CW / 2, y0 + w.shipY() * sc - 7); g.lineTo(x0 + CW / 2 - 6, y0 + w.shipY() * sc + 6); g.lineTo(x0 + CW / 2 + 6, y0 + w.shipY() * sc + 6); g.fill(); g.restore(); })); });
    await (await page.$('#sheet')).screenshot({ path: args[1] || 'sim-lines.png' }); await browser.close(); return;
  }
  const waves = +args[0] ? [+args[0]] : [6, 12, 18, 24, 30], times = +args[1] || 3, pick = args[2] || 'old'; let bad = 0;   // pick: 'old' goes for the hologram that has been out longest, 'low' for the lowest
  for (const wave of waves) for (let i = 0; i < times; i++) {
    await page.goto('file://' + GAME + '?gfx=low&intro=off&debug'); await page.waitForTimeout(500);
    await page.tap('#dbgClear'); await page.tap('#dbgBoss [data-w="' + wave + '"]'); await page.tap('#dbgSim');
    const r = await page.evaluate(pick => new Promise(res => { const w = window.__swarmfall, { G, P, S, SIMS } = w, missed = [], seen = new Map(), t0 = performance.now();
      (function f() { if (G.state === 'sim') { if (SIMS.wait) { SIMS.waitT = 9; w.simBegin(); }
          for (const [e, line] of seen) if (e.dead) { seen.delete(e); if (e.u >= 1) missed.push('line ' + (line + 1) + ' at ' + G.waveT.toFixed(1) + 's'); }
          let t = null; for (const e of G.enemies) if (!e.dead && e.holo) { seen.set(e, e.line); if (!t || (pick === 'old' ? e.u > t.u : e.y > t.y)) t = e; }
          if (t) P.target = Math.max(14, Math.min(346, t.x + t.vx * Math.max(0, P.y - t.y) / S.shotSpeed));
          if (SIMS.ended) return res({ hits: SIMS.hits, lines: SIMS.lines, missed }); }
        if (performance.now() - t0 > 120000) return res({ timeout: true }); requestAnimationFrame(f); })(); }), pick);
    if (r.hits !== 40) bad++;
    console.log('after wave ' + wave + ': ' + (r.timeout ? 'did not finish' : r.hits + ' of 40, ' + r.lines + ' whole lines' + (r.missed.length ? ' · got away: ' + r.missed.join(', ') : '')));
  }
  console.log(bad ? bad + ' run(s) short of forty' : 'forty every time');
  await browser.close(); process.exit(bad ? 1 : 0);
})();
