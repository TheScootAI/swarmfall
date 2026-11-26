// Writes the copy of the game that is published as a claude.ai artifact.
// The artifact host wraps the page in its own <html>/<head>/<body>, so this keeps only what goes inside:
// the <title>, styles and font link from <head>, and everything in <body>. The charset and viewport metas
// are dropped because the host supplies its own.
//   node tools/artifact.js [out.html]      (default: tools/out/swarmfall.html)
const fs = require('fs'), path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const head = src.match(/<head>([\s\S]*?)<\/head>/)[1].replace(/<meta charset[^>]*>\n/, '').replace(/<meta name="viewport"[^>]*>\n/, '');
const body = src.match(/<body>([\s\S]*)<\/body>/)[1];
const out = process.argv[2] || path.join(__dirname, 'out', 'swarmfall.html');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, head.trim() + '\n' + body.trim() + '\n');
console.log('wrote', out);
