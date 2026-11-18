const fs = require('fs');
global.window = {};
const store = {};
global.localStorage = { getItem: k => store[k]||null, setItem: (k,v)=>{store[k]=v;}, removeItem: k=>{delete store[k];} };
global.fetch = fetch;
eval(fs.readFileSync('/workspace/js/store.js','utf8'));
const S = global.window.BankStore;
(async () => {
  await S.pull();
  const reg = await S.register('ratetest4','1234');
  console.log('reg', reg.ok);
  const w1 = await S.workEarn(reg.key, 1);
  console.log('work1', w1.ok);
  // mimic work2: pull then inspect
  await S.pull();
  // access db via a hack: re-evaluate? Instead use getUser (publicUser) - but lastWorkEarnAt not exposed.
  // Call workEarn again immediately
  const w2 = await S.workEarn(reg.key, 1);
  console.log('work2', w2.ok, w2.error);
  const adm = await S.login('admin','9898');
  await S.deleteUser('ratetest4');
  console.log('cleaned');
})();
