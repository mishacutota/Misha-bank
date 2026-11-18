const fs = require('fs');
global.window = {};
const store = {};
global.localStorage = { getItem: k => store[k]||null, setItem: (k,v)=>{store[k]=v;}, removeItem: k=>{delete store[k];} };
global.fetch = fetch;
eval(fs.readFileSync('/workspace/js/store.js','utf8'));
const S = global.window.BankStore;
(async () => {
  await S.pull();
  const r = await S.login('admin','9898');
  console.log('admin login', r.ok);
  const p = await S.purgeTestAccounts();
  console.log('purged', p);
})();
