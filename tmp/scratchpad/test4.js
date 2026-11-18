const fs = require('fs');
global.window = {};
const store = {};
global.localStorage = { getItem: k => store[k]||null, setItem: (k,v)=>{store[k]=v;}, removeItem: k=>{delete store[k];} };
global.fetch = fetch;
eval(fs.readFileSync('/workspace/js/store.js','utf8'));
const S = global.window.BankStore;
(async () => {
  await S.pull();
  const reg = await S.register('ratetest2','1234');
  console.log('reg', reg.ok);
  const w1 = await S.workEarn(reg.key, 1);
  console.log('work1', w1.ok, w1.balance);
  // inspect via getUser
  console.log('after work1 lastWorkEarnAt?', S.getUser(reg.key) && S.getUser(reg.key).lastWorkEarnAt);
  const w2 = await S.workEarn(reg.key, 1);
  console.log('work2', w2.ok, w2.error);
  const adm = await S.login('admin','9898');
  await S.deleteUser('ratetest2');
  console.log('cleaned');
})();
