// Writes the copy of the game that is published as a claude.ai artifact.
// The artifact host wraps the page in its own <html>/<head>/<body>, so this keeps only what goes inside:
// the <title>, styles and font link from <head>, and everything in <body>. The charset and viewport metas
// are dropped because the host supplies its own.
//   node tools/artifact.js [out.html] [title]     (default: tools/out/swarmfall.html, title as in index.html)
// It also copies vendor/three.min.js next to the page. Publish that file with the page, as the supporting
// file "vendor/three.min.js", or the game has no three.js to run on.
// Give a title (for example "Swarmfall Staging") for a trial copy that must not be mistaken for the live one.
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
let head = src.match(/<head>([\s\S]*?)<\/head>/)[1].replace(/<meta charset[^>]*>\n/, '').replace(/<meta name="viewport"[^>]*>\n/, '');
if (process.argv[3]) head = head.replace(/<title>[^<]*<\/title>/, '<title>' + process.argv[3] + '</title>');
const body = src.match(/<body>([\s\S]*)<\/body>/)[1];
const out = process.argv[2] || path.join(__dirname, 'out', 'swarmfall.html');
fs.mkdirSync(path.join(path.dirname(out), 'vendor'), { recursive: true });
fs.writeFileSync(out, head.trim() + '\n' + body.trim() + '\n');
fs.copyFileSync(path.join(root, 'vendor', 'three.min.js'), path.join(path.dirname(out), 'vendor', 'three.min.js'));
console.log('wrote', out, 'and vendor/three.min.js beside it');
