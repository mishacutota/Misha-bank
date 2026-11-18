const fs = require('fs');
global.window = {};
eval(fs.readFileSync('/workspace/js/work.js','utf8'));
const g = window.WorkGuard.create();
let now = 1000;
// normal human taps ~150ms apart
for (let i=0;i<12;i++){ const r=g.tap(now); console.log(i, r.ok, r.reason||''); now+=150; }
console.log('--- bot: very regular 50ms ---');
const g2 = window.WorkGuard.create();
let n2=2000;
for (let i=0;i<15;i++){ const r=g2.tap(n2); console.log(i, r.ok, r.reason||''); n2+=50; }
