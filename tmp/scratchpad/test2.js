const fs = require('fs');
global.window = {};
const store = {};
global.localStorage = { getItem: k => store[k]||null, setItem: (k,v)=>{store[k]=v;}, removeItem: k=>{delete store[k];} };
global.fetch = fetch;
eval(fs.readFileSync('/workspace/js/store.js','utf8'));
const S = global.window.BankStore;
(async () => {
  await S.pull();
  const r = await S.register('tester2', '1234');
  console.log('register', r.ok, r.key);
  const key = 'tester2';
  const av = await S.setAvatar(key, '🦊');
  console.log('avatar', av.ok, av.avatar);
  const pin = await S.changePin(key, '1234', '9999');
  console.log('pin', pin.ok, pin.error);
  const loginOld = await S.login('tester2', '1234');
  console.log('login old', loginOld.ok);
  const loginNew = await S.login('tester2', '9999');
  console.log('login new', loginNew.ok);
  const dailyOff = await S.setDailyEnabled(key, false);
  console.log('daily off', dailyOff.ok, dailyOff.enabled);
  const before = S.getUser(key).balance;
  const daily = await S.claimDaily(key);
  console.log('daily when off amount', daily.daily.amount, 'balance', S.getUser(key).balance);
  const work = await S.workEarn(key, 2);
  console.log('work 2', work.ok, work.amount);
  // transfer with message
  await S.register('tester3', '1234');
  const t = await S.transfer(key, 'tester3', 5, 'спасибо за помощь!');
  console.log('transfer', t.ok);
  const hist = S.getHistory(key);
  console.log('hist msg', hist[0].message);
  const inHist = S.getHistory('tester3');
  console.log('in hist msg', inHist[0].message);
  // admin hidden
  const lb = S.getLeaderboard().map(x=>x.nick);
  console.log('leaderboard has admin?', lb.includes('admin'));
  const users = S.getUsers().map(x=>x.nick);
  console.log('users has admin?', users.includes('admin'));
  console.log('DONE');
  // cleanup
  await S.login('admin','9898');
  await S.purgeTestAccounts();
})();
