const fs = require('fs');
global.window = {};
const store = {};
global.localStorage = { getItem: k => store[k]||null, setItem: (k,v)=>{store[k]=v;}, removeItem: k=>{delete store[k];} };
global.fetch = fetch;
eval(fs.readFileSync('/workspace/js/store.js','utf8'));
const S = global.window.BankStore;
(async () => {
  await S.pull();
  const reg = await S.register('ratetest3','1234');
  console.log('reg', reg.ok);
  const w1 = await S.workEarn(reg.key, 1);
  console.log('work1', w1.ok, w1.balance);
  console.log('done - check remote db now');
})();
