// Bundles three.js (the version in package.json) and the add-ons listed in three-entry.js into
// ../vendor/three.min.js: one minified classic script that defines a global THREE. The game loads that file,
// so it needs no CDN and works from disk, on GitHub Pages and inside the artifact.
//   cd tools && npm install && node build-three.js
const path = require('path');
require('esbuild').build({
  entryPoints: [path.join(__dirname, 'three-entry.js')], bundle: true, minify: true, format: 'iife', globalName: 'THREE',
  outfile: path.join(__dirname, '..', 'vendor', 'three.min.js'), legalComments: 'none',
  banner: { js: '/* three.js r' + require('fs').readFileSync(path.join(__dirname, 'node_modules/three/package.json'), 'utf8').match(/"version": "0\.(\d+)/)[1] + ' (MIT, threejs.org), bundled by tools/build-three.js */' },
}).then(() => console.log('wrote vendor/three.min.js')).catch(e => { console.error(e); process.exit(1); });
