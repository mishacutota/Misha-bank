const fs = require('fs');
global.window = {};
const store = {};
global.localStorage = { getItem: k => store[k]||null, setItem: (k,v)=>{store[k]=v;}, removeItem: k=>{delete store[k];} };
global.fetch = fetch;
eval(fs.readFileSync('/workspace/js/store.js','utf8'));
const S = global.window.BankStore;
(async () => {
  await S.pull();
  const adm = await S.login('admin','9898');
  console.log('admin', adm.ok);
  const users = S.getUsers().map(u=>u.nick);
  console.log('before', users);
  for (const u of users) {
    if (u !== 'admin') {
      await S.deleteUser(u);
      console.log('deleted', u);
    }
  }
  await S.pull();
  console.log('after', S.getUsers().map(u=>u.nick));
})();
