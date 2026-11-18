const fs = require('fs');
global.window = {};
const store = {};
global.localStorage = { getItem: k => store[k]||null, setItem: (k,v)=>{store[k]=v;}, removeItem: k=>{delete store[k];} };
global.fetch = fetch;
eval(fs.readFileSync('/workspace/js/store.js','utf8'));
const S = global.window.BankStore;
(async () => {
  await S.pull();
  const reg = await S.register('ratetest','1234');
  console.log('reg', reg.ok, reg.key);
  const av = await S.setAvatar(reg.key, '🦊');
  console.log('avatar', av.ok, av.avatar);
  const av2 = await S.setAvatar(reg.key, 'data:image/png;base64,AAAA');
  console.log('avatar data rejected?', av2.ok, av2.avatar);
  const w1 = await S.workEarn(reg.key, 1);
  console.log('work1', w1.ok);
  const w2 = await S.workEarn(reg.key, 1);
  console.log('work2 too fast?', w2.ok, w2.error);
  // wait 900ms
  await new Promise(r=>setTimeout(r,900));
  const w3 = await S.workEarn(reg.key, 1);
  console.log('work3 after wait', w3.ok);
  const lb = S.getLeaderboard();
  console.log('lb avatar', lb.map(x=>x.nick+':'+x.avatar));
  const u = S.findUser('ratetest');
  console.log('findUser avatar', u && u.avatar);
  // cleanup
  const adm = await S.login('admin','9898');
  await S.deleteUser('ratetest');
  console.log('cleaned');
})();
