const fs = require('fs');
global.window = {};
const store = {};
global.localStorage = { getItem: k => store[k]||null, setItem: (k,v)=>{store[k]=v;}, removeItem: k=>{delete store[k];} };
global.fetch = fetch;
eval(fs.readFileSync('/workspace/js/store.js','utf8'));
const S = global.window.BankStore;
(async () => {
  await S.pull();
  const r1 = await S.register('avtest1', '1111');
  const r2 = await S.register('avtest2', '2222');
  console.log('reg1', r1.ok, 'reg2', r2.ok);
  await S.setAvatar('avtest1', '🦊');
  console.log('avatar set');
  await S.pull();
  const fu = S.findUser('avtest1');
  console.log('findUser avatar:', JSON.stringify(fu && fu.avatar));
  const lb = S.getLeaderboard();
  const row = lb.find(x => x.nick === 'avtest1');
  console.log('leaderboard avatar:', JSON.stringify(row && row.avatar));
  // transfer with message
  const t = await S.transfer('avtest1', 'avtest2', 5, 'hello emoji');
  console.log('transfer', t.ok);
  await S.pull();
  const hist = S.getHistory('avtest2');
  console.log('in hist peer avatar? peer=', hist[0].peer);
  const pu = S.findUser(hist[0].peer);
  console.log('peer user avatar:', JSON.stringify(pu && pu.avatar));
  // cleanup
  await S.login('admin','9898');
  await S.purgeTestAccounts();
  console.log('DONE');
})();
