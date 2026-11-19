/* Общая база MISHA BANK: своя валюта «@» (собаки). Все игроки читают и пишут одну общую базу,
   поэтому переводы идут между разными людьми и разными браузерами. Сервис textdb.online
   не требует регистрации и отдаёт CORS для GitHub Pages. */
(function () {
  'use strict';

  const STORAGE_KEY = 'misha-bank-v3';
  const SHARED_KEY = 'misha-bank-shared-v3-7a2c9e1d';
  const WRITE_URL = 'https://textdb.online/update';
  const READ_URL = 'https://textdb.online/' + SHARED_KEY;
  const STARTER_BALANCE = 1000;
  const DAILY_BONUS = 500;
  const DAY_MS = 24 * 60 * 60 * 1000;

  function createEmptyDb() {
    return { version: 3, rev: 0, users: {}, history: [], devices: {} };
  }

  function normalizeNick(nick) {
    return String(nick || '').trim().toLowerCase();
  }

  function normalizeUser(user, fallbackNick) {
    const nick = (user && typeof user.nick === 'string' && user.nick.trim()) ? user.nick.trim() : (fallbackNick || '');
    const key = normalizeNick(nick);
    if (!key) return null;
    const balance = Number(user && user.balance);
    return {
      nick: nick,
      pin: typeof user.pin === 'string' ? user.pin : '',
      createdAt: Number.isFinite(user && user.createdAt) ? user.createdAt : Date.now(),
      balance: Number.isFinite(balance) && balance >= 0 ? Math.floor(balance) : 0,
      lastDailyAt: Number.isFinite(user && user.lastDailyAt) ? user.lastDailyAt : 0,
      dailyEnabled: (user && typeof user.dailyEnabled === 'boolean') ? user.dailyEnabled : true,
      avatar: (user && typeof user.avatar === 'string' && !user.avatar.toLowerCase().startsWith('data')) ? [...user.avatar.trim()].slice(0, 4).join('') : '',
      lastWorkEarnAt: Number.isFinite(user && user.lastWorkEarnAt) ? user.lastWorkEarnAt : 0,
      workEarnHourStart: Number.isFinite(user && user.workEarnHourStart) ? user.workEarnHourStart : 0,
      workEarnedThisHour: Number.isFinite(user && user.workEarnedThisHour) ? user.workEarnedThisHour : 0,
      workLevel: (Number.isFinite(user && user.workLevel) && user.workLevel >= 1 && user.workLevel <= 5) ? Math.floor(user.workLevel) : 1,
      totalEarned: Number.isFinite(user && user.totalEarned) && user.totalEarned >= 0 ? Math.floor(user.totalEarned) : 0,
      totalTaps: Number.isFinite(user && user.totalTaps) && user.totalTaps >= 0 ? Math.floor(user.totalTaps) : 0,
      gamesPlayed: Number.isFinite(user && user.gamesPlayed) && user.gamesPlayed >= 0 ? Math.floor(user.gamesPlayed) : 0,
      gamesWon: Number.isFinite(user && user.gamesWon) && user.gamesWon >= 0 ? Math.floor(user.gamesWon) : 0,
      totalGambled: Number.isFinite(user && user.totalGambled) && user.totalGambled >= 0 ? Math.floor(user.totalGambled) : 0,
      biggestWin: Number.isFinite(user && user.biggestWin) && user.biggestWin >= 0 ? Math.floor(user.biggestWin) : 0,
      dailyCount: Number.isFinite(user && user.dailyCount) && user.dailyCount >= 0 ? Math.floor(user.dailyCount) : 0,
      achievements: Array.isArray(user && user.achievements) ? user.achievements.filter(v => typeof v === 'string').slice(0, 100) : [],
      questsDate: Number.isFinite(user && user.questsDate) ? user.questsDate : 0,
      questsProgress: (user && user.questsProgress && typeof user.questsProgress === 'object') ? {
        taps: Number.isFinite(user.questsProgress.taps) ? user.questsProgress.taps : 0,
        earned: Number.isFinite(user.questsProgress.earned) ? user.questsProgress.earned : 0,
        games: Number.isFinite(user.questsProgress.games) ? user.questsProgress.games : 0,
        wins: Number.isFinite(user.questsProgress.wins) ? user.questsProgress.wins : 0,
        upgrades: Number.isFinite(user.questsProgress.upgrades) ? user.questsProgress.upgrades : 0,
        daily: Number.isFinite(user.questsProgress.daily) ? user.questsProgress.daily : 0
      } : { taps:0, earned:0, games:0, wins:0, upgrades:0, daily:0 },
      questsClaimed: Array.isArray(user && user.questsClaimed) ? user.questsClaimed.filter(v => typeof v === 'string').slice(0, 20) : [],
       recentRecipients: Array.isArray(user && user.recentRecipients) ? user.recentRecipients.filter(v => typeof v === 'string').slice(0, 3) : [],
       deposit: Number.isFinite(user && user.deposit) && user.deposit >= 0 ? Math.floor(user.deposit) : 0,
       depositLastAccrual: Number.isFinite(user && user.depositLastAccrual) ? user.depositLastAccrual : 0,
       hourlyLevel: (Number.isFinite(user && user.hourlyLevel) && user.hourlyLevel >= 0 && user.hourlyLevel <= 5) ? Math.floor(user.hourlyLevel) : 0,
       hourlyRate: Number.isFinite(user && user.hourlyRate) && user.hourlyRate >= 0 ? Math.floor(user.hourlyRate) : 0,
       hourlyLastAccrual: Number.isFinite(user && user.hourlyLastAccrual) ? user.hourlyLastAccrual : 0
    };
  }

  function normalizeDb(value) {
    const raw = (value && typeof value === 'object' && value.data && typeof value.data === 'object') ? value.data : value;
    if (!raw || typeof raw !== 'object') return createEmptyDb();
    const db = createEmptyDb();
    db.rev = Number.isFinite(raw.rev) ? raw.rev : 0;
    if (!raw.users || typeof raw.users !== 'object') raw.users = {};
    for (const [, user] of Object.entries(raw.users)) {
      if (!user || typeof user !== 'object' || typeof user.nick !== 'string') continue;
      const normalizedKey = normalizeNick(user.nick);
      if (!normalizedKey) continue;
      // Мягкая миграция старых данных: если есть inventory, считаем искорки как @.
      let migratedUser = user;
      if (!Number.isFinite(user.balance) && user.inventory && typeof user.inventory === 'object') {
        // старые карточки: приблизительная конвертация не нужна — новая база пустая по ключу
      }
      const normalized = normalizeUser(migratedUser, user.nick);
      if (normalized) db.users[normalizedKey] = normalized;
    }
    db.history = Array.isArray(raw.history)
      ? raw.history.filter(item => item && typeof item === 'object').slice(-500).map(item => {
          const amt = Number(item.amount);
          // старый формат мог хранить cards; игнорируем, берём amount
          return {
            at: Number.isFinite(item.at) ? item.at : Date.now(),
            type: ['in', 'out', 'daily', 'mint'].includes(item.type) ? item.type : 'in',
            userKey: String(item.userKey || ''),
            peer: String(item.peer || ''),
            amount: Number.isFinite(amt) && amt > 0 ? Math.floor(amt) : 0,
            memo: typeof item.memo === 'string' ? item.memo.slice(0, 80) : '',
            message: typeof item.message === 'string' ? item.message.slice(0, 200) : ''
          };
        })
       : [];
    if (raw.devices && typeof raw.devices === 'object') {
      for (const [dev, nicks] of Object.entries(raw.devices)) {
        if (Array.isArray(nicks)) db.devices[dev] = nicks.filter(v => typeof v === 'string').slice(0, 10);
      }
    }
    return db;
  }

  let db = createEmptyDb();
  let online = false;
  let lastError = '';

  function saveLocal() { /* no-op: app is online-only */ }
  function loadLocal() { return null; }

  async function pull() {
    try {
      const res = await fetch(READ_URL + '?t=' + Date.now(), { cache: 'no-store' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const text = await res.text();
      if (!text || !text.trim()) {
        db = createEmptyDb();
        online = true;
        lastError = '';
        return true;
      }
      let json;
      try { json = JSON.parse(text); } catch (_) { throw new Error('Общая база вернула не JSON'); }
      db = normalizeDb(json);
      online = true;
      lastError = '';
      return true;
    } catch (e) {
      online = false;
      lastError = String(e && e.message || e);
      db = createEmptyDb();
      return false;
    }
  }

  async function push() {
    try {
      const body = new URLSearchParams();
      body.set('key', SHARED_KEY);
      body.set('value', JSON.stringify(db));
      const res = await fetch(WRITE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString()
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const json = await res.json();
      if (!json || json.status !== 1) {
        throw new Error((json && (json.error || json.message)) || 'Сервис отклонил запись');
      }
      online = true;
      lastError = '';
      saveLocal();
      return true;
    } catch (e) {
      online = false;
      lastError = String(e && e.message || e);
      saveLocal();
      return false;
    }
  }

  async function verifyWrite(expectedRev, tries) {
    tries = tries || 4;
    for (let i = 0; i < tries; i++) {
      await new Promise(resolve => setTimeout(resolve, 700 + i * 500));
      try {
        const res = await fetch(READ_URL + '?t=' + Date.now(), { cache: 'no-store' });
        if (!res.ok) continue;
        const text = await res.text();
        if (!text || !text.trim()) continue;
        const remote = normalizeDb(JSON.parse(text));
        if (remote.rev >= expectedRev) {
          db = remote;
          online = true;
          lastError = '';
          saveLocal();
          return true;
        }
      } catch (_) { /* пробуем ещё раз */ }
    }
    return false;
  }

  async function withLatest(mutator, attempts) {
    attempts = attempts || 3;
    for (let i = 0; i < attempts; i++) {
      await pull();
      let result;
      try { result = mutator(); } catch (e) { result = { ok: false, error: String(e && e.message || e) }; }
      if (!result || result.ok === false) {
        if (result && result.error) return result;
        return { ok: false, error: 'Не удалось выполнить действие.' };
      }
      db.rev = (db.rev || 0) + 1;
      const expectedRev = db.rev;
      const pushed = await push();
      if (!pushed) continue;
      const verified = await verifyWrite(expectedRev);
      if (verified) return result;
    }
    return { ok: false, error: 'Общая база не ответила. Проверь интернет и попробуй снова.' };
  }

  function total(value) {
    if (typeof value === 'number') return value;
    if (value && typeof value.balance === 'number') return value.balance;
    return 0;
  }

  function countCards(value) {
    // совместимость: количество «единиц» = сумма
    return total(value);
  }

  function addHistory(entry) {
    db.history.push({ ...entry, at: Date.now() });
    if (db.history.length > 500) db.history = db.history.slice(-500);
  }

  function publicUser(user) {
    return {
      nick: user.nick,
      createdAt: user.createdAt,
      balance: user.balance,
      lastDailyAt: user.lastDailyAt || 0,
      dailyEnabled: (typeof user.dailyEnabled === 'boolean') ? user.dailyEnabled : true,
      avatar: typeof user.avatar === 'string' ? user.avatar : '',
      workLevel: user.workLevel || 1,
      totalEarned: user.totalEarned || 0,
      totalTaps: user.totalTaps || 0,
      gamesPlayed: user.gamesPlayed || 0,
      gamesWon: user.gamesWon || 0,
      totalGambled: user.totalGambled || 0,
      biggestWin: user.biggestWin || 0,
      dailyCount: user.dailyCount || 0,
      achievements: Array.isArray(user.achievements) ? user.achievements.slice() : [],
      questsDate: user.questsDate || 0,
      questsProgress: user.questsProgress || { taps:0, earned:0, games:0, wins:0, upgrades:0, daily:0 },
      questsClaimed: Array.isArray(user.questsClaimed) ? user.questsClaimed.slice() : [],
       recentRecipients: Array.isArray(user.recentRecipients) ? user.recentRecipients.slice(0, 3) : [],
       deposit: user.deposit || 0,
       depositLastAccrual: user.depositLastAccrual || 0,
       hourlyLevel: user.hourlyLevel || 0,
       hourlyRate: user.hourlyRate || 0,
       hourlyLastAccrual: user.hourlyLastAccrual || 0
    };
  }

  function issueDaily(userKey) {
    const user = db.users[normalizeNick(userKey)];
    if (!user) return { ok: true, amount: 0, issued: 0, nextAt: 0 };
    if (user.dailyEnabled === false) {
      return { ok: true, amount: 0, issued: 0, nextAt: (user.lastDailyAt || 0) + DAY_MS };
    }
    if (user.lastDailyAt && Date.now() - user.lastDailyAt < DAY_MS) {
      return { ok: true, amount: 0, issued: 0, nextAt: user.lastDailyAt + DAY_MS };
    }
    user.balance += DAILY_BONUS;
    user.totalEarned = (user.totalEarned || 0) + DAILY_BONUS;
    user.dailyCount = (user.dailyCount || 0) + 1;
    user.lastDailyAt = Date.now();
    ensureQuestsDay(user);
    user.questsProgress.daily = (user.questsProgress.daily || 0) + 1;
    checkAchievements(user);
    addHistory({ type: 'daily', userKey, peer: '', amount: DAILY_BONUS, memo: 'Ежедневный бонус' });
    return { ok: true, amount: DAILY_BONUS, issued: DAILY_BONUS, nextAt: user.lastDailyAt + DAY_MS };
  }

  async function register(nick, pin, deviceId) {
    const clean = String(nick || '').trim();
    const key = normalizeNick(clean);
    if (!/^[a-zA-Z0-9_]{3,16}$/.test(clean)) {
      return { ok: false, error: 'Ник: 3–16 символов, только латиница, цифры и _.' };
    }
    if (!/^\d{4,6}$/.test(String(pin || ''))) return { ok: false, error: 'ПИН-код должен содержать 4–6 цифр.' };

    const dev = (typeof deviceId === 'string') ? deviceId.trim().slice(0, 64) : '';

    return withLatest(() => {
      if (db.users[key]) return { ok: false, error: 'Этот ник уже занят. Придумай другой.' };
      if (dev) {
        if (!db.devices[dev]) db.devices[dev] = [];
        if (db.devices[dev].length >= 2) {
          return { ok: false, error: 'С этого устройства можно создать не более 2 аккаунтов.' };
        }
      }
      const user = { nick: clean, pin: String(pin), createdAt: Date.now(), balance: STARTER_BALANCE, lastDailyAt: 0, dailyEnabled: true, avatar: '', recentRecipients: [], deviceId: dev, totalEarned: 0, totalSent: 0, totalTaps: 0, gamesPlayed: 0, gamesWon: 0, totalGambled: 0, biggestWin: 0, dailyCount: 0, workLevel: 1, lastWorkEarnAt: 0, workEarnHourStart: 0, workEarnedThisHour: 0, achievements: [], questsDay: 0, questsProgress: {}, questsClaimed: [] };
      db.users[key] = user;
      if (dev) db.devices[dev].push(key);
      addHistory({ type: 'mint', userKey: key, peer: '', amount: STARTER_BALANCE, memo: 'Стартовый баланс' });
      const daily = issueDaily(key);
      if (!daily.ok) return { ok: false, error: daily.error };
      return { ok: true, user: publicUser(user), key, daily };
    });
  }

  async function login(nick, pin) {
    const key = normalizeNick(nick);
    if (key === 'admin' && String(pin) === '9898') {
      return withLatest(() => {
        if (!db.users.admin) {
          db.users.admin = { nick: 'admin', pin: '9898', createdAt: Date.now(), balance: 0, lastDailyAt: Date.now(), dailyEnabled: false, avatar: '', recentRecipients: [] };
        } else {
          db.users.admin.pin = '9898';
          db.users.admin.nick = 'admin';
          if (!Array.isArray(db.users.admin.recentRecipients)) db.users.admin.recentRecipients = [];
          if (!Number.isFinite(db.users.admin.balance)) db.users.admin.balance = 0;
          if (typeof db.users.admin.dailyEnabled !== 'boolean') db.users.admin.dailyEnabled = false;
          if (typeof db.users.admin.avatar !== 'string') db.users.admin.avatar = '';
        }
        const admin = db.users.admin;
        return { ok: true, user: publicUser(admin), key: 'admin', daily: { ok: true, amount: 0, issued: 0, nextAt: admin.lastDailyAt + DAY_MS } };
      });
    }
    return withLatest(() => {
      const user = db.users[key];
      if (!user || user.pin !== String(pin)) return { ok: false, error: 'Неверный ник или ПИН-код.' };
      const daily = issueDaily(key);
      if (!daily.ok) return { ok: false, error: daily.error };
      return { ok: true, user: publicUser(user), key, daily };
    });
  }

  async function claimDaily(key) {
    return withLatest(() => {
      const user = db.users[normalizeNick(key)];
      if (!user) return { ok: false, error: 'Профиль не найден.' };
      const daily = issueDaily(key);
      if (!daily.ok) return { ok: false, error: daily.error };
      return { ok: true, user: publicUser(user), key, daily };
    });
  }

  function getUser(key) {
    const user = db.users[normalizeNick(key)];
    return user ? publicUser(user) : null;
  }

  function findUser(nick) {
    const key = normalizeNick(nick);
    const user = db.users[key];
    return user ? { key, ...publicUser(user) } : null;
  }

  function getStock() { return {}; }

  function getLeaderboard() {
    return Object.entries(db.users)
      .filter(([key]) => key !== 'admin')
      .map(([key, user]) => ({ key, nick: user.nick, value: user.balance, avatar: user.avatar || '' }))
      .sort((a, b) => b.value - a.value || a.nick.localeCompare(b.nick))
      .slice(0, 10);
  }

  function getHistory(key) {
    const normalized = normalizeNick(key);
    return db.history.filter(item => item.userKey === normalized).slice(-40).reverse();
  }

  async function transfer(fromKey, targetNick, amount, message) {
    const targetKey = normalizeNick(targetNick);
    const amt = Number(amount);
    if (!Number.isInteger(amt) || amt <= 0) return { ok: false, error: 'Укажи положительную сумму.' };
    return withLatest(() => {
      const sender = db.users[normalizeNick(fromKey)];
      const recipient = db.users[targetKey];
      if (!sender) return { ok: false, error: 'Не удалось найти твой профиль.' };
      if (!recipient) return { ok: false, error: 'Такого игрока нет. Проверь ник.' };
      if (targetKey === normalizeNick(fromKey)) return { ok: false, error: 'Нельзя перевести @ самому себе.' };
      if (sender.balance < amt) return { ok: false, error: 'Недостаточно @ на балансе.' };
      sender.balance -= amt;
      recipient.balance += amt;
      const msg = typeof message === 'string' ? message.trim().slice(0, 200) : '';
      addHistory({ type: 'out', userKey: normalizeNick(fromKey), peer: recipient.nick, amount: amt, memo: 'Перевод', message: msg });
      addHistory({ type: 'in', userKey: targetKey, peer: sender.nick, amount: amt, memo: 'Перевод', message: msg });
      if (!Array.isArray(sender.recentRecipients)) sender.recentRecipients = [];
      sender.recentRecipients = [recipient.nick, ...sender.recentRecipients.filter(n => normalizeNick(n) !== targetKey)].slice(0, 3);
      return { ok: true, recipient: recipient.nick, amount: amt };
    });
  }

  function accrueUser(user) {
    if (!user) return;
    const now = Date.now();
    // deposit interest: 0.03472% per hour
    if (user.deposit > 0) {
      if (!user.depositLastAccrual) user.depositLastAccrual = now;
      const hours = (now - user.depositLastAccrual) / 3600000;
      if (hours > 0) {
        const interest = Math.floor(user.deposit * 0.0003472 * hours);
        if (interest > 0) {
          user.deposit += interest;
          user.totalEarned = (user.totalEarned || 0) + interest;
        }
        user.depositLastAccrual = now;
      }
    } else {
      user.depositLastAccrual = now;
    }
    // passive hourly income
    if (user.hourlyRate > 0) {
      if (!user.hourlyLastAccrual) user.hourlyLastAccrual = now;
      const hours = (now - user.hourlyLastAccrual) / 3600000;
      if (hours > 0) {
        const earned = Math.floor(user.hourlyRate * hours);
        if (earned > 0) {
          user.balance += earned;
          user.totalEarned = (user.totalEarned || 0) + earned;
        }
        user.hourlyLastAccrual = now;
      }
    } else {
      user.hourlyLastAccrual = now;
    }
  }

  async function accruePassive(key) {
    const k = normalizeNick(key);
    return withLatest(() => {
      const user = db.users[k];
      if (!user) return { ok: false };
      accrueUser(user);
      return { ok: true, balance: user.balance, deposit: user.deposit, earned: 0 };
    });
  }

  async function depositMoney(key, amount) {
    const amt = Number(amount);
    if (!Number.isInteger(amt) || amt <= 0) return { ok: false, error: 'Укажи положительную сумму.' };
    const k = normalizeNick(key);
    return withLatest(() => {
      const user = db.users[k];
      if (!user) return { ok: false, error: 'Профиль не найден.' };
      accrueUser(user);
      if (user.balance < amt) return { ok: false, error: 'Недостаточно @ на балансе.' };
      user.balance -= amt;
      user.deposit = (user.deposit || 0) + amt;
      if (!user.depositLastAccrual) user.depositLastAccrual = Date.now();
      addHistory({ type: 'out', userKey: k, peer: 'депозит', amount: amt, memo: 'Пополнение депозита' });
      return { ok: true, amount: amt, balance: user.balance, deposit: user.deposit };
    });
  }

  async function withdrawDeposit(key, amount) {
    const amt = Number(amount);
    if (!Number.isInteger(amt) || amt <= 0) return { ok: false, error: 'Укажи положительную сумму.' };
    const k = normalizeNick(key);
    return withLatest(() => {
      const user = db.users[k];
      if (!user) return { ok: false, error: 'Профиль не найден.' };
      accrueUser(user);
      if ((user.deposit || 0) < amt) return { ok: false, error: 'Недостаточно на депозите.' };
      user.deposit -= amt;
      user.balance += amt;
      addHistory({ type: 'in', userKey: k, peer: 'депозит', amount: amt, memo: 'Снятие с депозита' });
      return { ok: true, amount: amt, balance: user.balance, deposit: user.deposit };
    });
  }

  const HOURLY_UPGRADE_COSTS = [0, 800, 2500, 7000, 18000, 45000];
  const HOURLY_UPGRADE_RATES = [0, 5, 15, 40, 100, 260];

  async function buyHourlyUpgrade(key) {
    const k = normalizeNick(key);
    return withLatest(() => {
      const user = db.users[k];
      if (!user) return { ok: false, error: 'Профиль не найден.' };
      accrueUser(user);
      const lvl = user.hourlyLevel || 0;
      if (lvl >= 5) return { ok: false, error: 'Максимальный уровень.' };
      const cost = HOURLY_UPGRADE_COSTS[lvl + 1];
      if (user.balance < cost) return { ok: false, error: 'Недостаточно @.' };
      user.balance -= cost;
      user.hourlyLevel = lvl + 1;
      user.hourlyRate = HOURLY_UPGRADE_RATES[user.hourlyLevel];
      if (!user.hourlyLastAccrual) user.hourlyLastAccrual = Date.now();
      user.questsProgress = user.questsProgress || { taps:0, earned:0, games:0, wins:0, upgrades:0, daily:0 };
      user.questsProgress.upgrades = (user.questsProgress.upgrades || 0) + 1;
      checkAchievements(user);
      addHistory({ type: 'out', userKey: k, peer: 'улучшение', amount: cost, memo: 'Покупка пассивного дохода ' + user.hourlyLevel + ' ур.' });
      return { ok: true, level: user.hourlyLevel, rate: user.hourlyRate, balance: user.balance, cost };
    });
  }

  async function purgeTestAccounts() {
    return withLatest(() => {
      const removed = [];
      for (const key of Object.keys(db.users)) {
        if (key === 'admin') continue;
        const user = db.users[key];
        const nick = (user && user.nick) ? user.nick : key;
        const isTest = /_test$/i.test(nick) || /^demo_/i.test(nick) ||
          key === 'admintest_user' || key === 'alice' || key === 'bob';
        if (isTest) {
          delete db.users[key];
          removed.push(nick);
        }
      }
      return { ok: true, removed };
    });
  }

  function getUsers() {
    return Object.entries(db.users)
      .filter(([key]) => key !== 'admin')
      .map(([key, user]) => ({
        key,
        nick: user.nick,
        createdAt: user.createdAt,
        balance: user.balance,
        sparks: user.balance,
        cards: 0,
        avatar: user.avatar || '',
        dailyEnabled: (typeof user.dailyEnabled === 'boolean') ? user.dailyEnabled : true
      })).sort((a, b) => a.nick.localeCompare(b.nick));
  }

  async function deleteUser(targetNick) {
    const key = normalizeNick(targetNick);
    if (key === 'admin') return { ok: false, error: 'Нельзя удалить администратора.' };
    return withLatest(() => {
      if (!db.users[key]) return { ok: false, error: 'Пользователь не найден.' };
      delete db.users[key];
      if (db.devices) {
        for (const dev of Object.keys(db.devices)) {
          db.devices[dev] = (db.devices[dev] || []).filter(n => n !== key);
        }
      }
      return { ok: true };
    });
  }

  async function grantBalance(target, amount) {
    const amt = Number(amount);
    if (!Number.isInteger(amt) || amt <= 0) return { ok: false, error: 'Укажи положительную сумму.' };
    return withLatest(() => {
      const targetKey = normalizeNick(target);
      const targets = (targetKey === 'all' || target === 'Всем' || target === 'all')
        ? Object.keys(db.users)
        : (db.users[targetKey] ? [targetKey] : null);
      if (!targets) return { ok: false, error: 'Пользователь не найден.' };
      for (const key of targets) {
        const user = db.users[key];
        if (!user) continue;
        if (!Number.isFinite(user.balance)) user.balance = 0;
        user.balance += amt;
        addHistory({ type: 'in', userKey: key, peer: 'admin', amount: amt, memo: 'Выдача от админа' });
      }
      return { ok: true, count: targets.length };
    });
  }

  async function adjustUserBalance(targetNick, amount, mode) {
    const requested = Number(amount);
    if (!Number.isInteger(requested) || requested <= 0) {
      return { ok: false, error: 'Укажи положительное число.' };
    }
    return withLatest(() => {
      const key = normalizeNick(targetNick);
      const user = db.users[key];
      if (!user) return { ok: false, error: 'Пользователь не найден.' };
      if (!Number.isFinite(user.balance)) user.balance = 0;
      if (mode === 'add') {
        user.balance += requested;
        addHistory({ type: 'in', userKey: key, peer: 'admin', amount: requested, memo: 'Выдача от админа' });
        return { ok: true, adjusted: requested, removedMax: false };
      }
      const removed = Math.min(requested, user.balance);
      if (removed <= 0) return { ok: false, error: 'У игрока нет средств.' };
      user.balance -= removed;
      addHistory({ type: 'out', userKey: key, peer: 'admin', amount: removed, memo: 'Изъятие админом' });
      return { ok: true, adjusted: removed, removedMax: removed < requested };
    });
  }

  // Алиасы для совместимости со старым кодом
  const adjustUserCards = adjustUserBalance;
  const grantCards = grantBalance;

  async function changePin(userKey, oldPin, newPin) {
    const key = normalizeNick(userKey);
    return withLatest(() => {
      const user = db.users[key];
      if (!user) return { ok: false, error: 'Профиль не найден.' };
      if (key === 'admin') return { ok: false, error: 'Пароль админа менять нельзя.' };
      if (user.pin !== String(oldPin || '')) return { ok: false, error: 'Старый ПИН-код неверен.' };
      if (!/^\d{4,6}$/.test(String(newPin || ''))) return { ok: false, error: 'Новый ПИН-код должен содержать 4–6 цифр.' };
      user.pin = String(newPin);
      return { ok: true };
    });
  }

  async function setAvatar(userKey, avatar) {
    const key = normalizeNick(userKey);
    let raw = (typeof avatar === 'string') ? avatar.trim() : '';
    if (raw.toLowerCase().startsWith('data:')) raw = '';
    let val = [...raw].slice(0, 4).join('');
    return withLatest(() => {
      const user = db.users[key];
      if (!user) return { ok: false, error: 'Профиль не найден.' };
      user.avatar = val;
      return { ok: true, avatar: val };
    });
  }

  async function setDailyEnabled(userKey, enabled) {
    const key = normalizeNick(userKey);
    return withLatest(() => {
      const user = db.users[key];
      if (!user) return { ok: false, error: 'Профиль не найден.' };
      if (key === 'admin') return { ok: false, error: 'Недоступно.' };
      user.dailyEnabled = Boolean(enabled);
      if (!user.dailyEnabled) {
        // не начисляем, но сохраняем lastDailyAt
      }
      return { ok: true, enabled: user.dailyEnabled };
    });
  }

  const WORK_UPGRADE_COSTS = [0, 500, 1500, 4000, 10000];
  const WORK_REWARDS = [1, 2, 3, 5, 8];
  function workRewardForLevel(lvl) { return WORK_REWARDS[Math.min(Math.max((lvl||1)-1,0),4)] || 1; }

  function ensureQuestsDay(user) {
    if (!user) return;
    const today = Math.floor(Date.now() / DAY_MS) * DAY_MS;
    if (user.questsDate !== today) {
      user.questsDate = today;
      user.questsProgress = { taps:0, earned:0, games:0, wins:0, upgrades:0, daily:0 };
      user.questsClaimed = [];
    }
    if (!user.questsProgress) user.questsProgress = { taps:0, earned:0, games:0, wins:0, upgrades:0, daily:0 };
  }

  const ACHIEVEMENTS = [
    { id:'first_earn', title:'Первые @', desc:'Заработать первые @', check: u => (u.totalEarned||0) >= 1 },
    { id:'tap_100', title:'Трудяга', desc:'Сделать 100 тапов', check: u => (u.totalTaps||0) >= 100 },
    { id:'tap_1000', title:'Машина', desc:'Сделать 1000 тапов', check: u => (u.totalTaps||0) >= 1000 },
    { id:'earn_1000', title:'Тысячник', desc:'Заработать 1000 @', check: u => (u.totalEarned||0) >= 1000 },
    { id:'earn_10000', title:'Миллионер', desc:'Заработать 10000 @', check: u => (u.totalEarned||0) >= 10000 },
    { id:'gambler', title:'Игрок', desc:'Сыграть 10 игр', check: u => (u.gamesPlayed||0) >= 10 },
    { id:'lucky', title:'Везунчик', desc:'Выиграть 5 игр', check: u => (u.gamesWon||0) >= 5 },
    { id:'rich', title:'Богач', desc:'Баланс 5000 @', check: u => (u.balance||0) >= 5000 },
    { id:'max_upgrade', title:'Мастер работы', desc:'Максимальный уровень работы', check: u => (u.workLevel||1) >= 5 },
    { id:'daily_7', title:'Постоянный', desc:'Получить бонус 7 дней', check: u => (u.dailyCount||0) >= 7 },
    { id:'gambler_big', title:'Хайроллер', desc:'Сыграть 50 игр', check: u => (u.gamesPlayed||0) >= 50 },
    { id:'jackpot', title:'Джекпот', desc:'Выиграть 1000 @ за раз', check: u => (u.biggestWin||0) >= 1000 }
  ];

  function checkAchievements(user) {
    if (!user.achievements) user.achievements = [];
    const newly = [];
    for (const a of ACHIEVEMENTS) {
      if (user.achievements.includes(a.id)) continue;
      try { if (a.check(user)) { user.achievements.push(a.id); newly.push(a.id); } } catch (_) {}
    }
    return newly;
  }

  async function workEarn(userKey, amount, taps) {
    const amt = Number(amount);
    if (!Number.isInteger(amt) || amt <= 0 || amt > 20) return { ok: false, error: 'Неверная сумма.' };
    const t = Number.isInteger(taps) && taps > 0 ? taps : 10;
    const key = normalizeNick(userKey);
    return withLatest(() => {
      const user = db.users[key];
      if (!user || key === 'admin') return { ok: false, error: 'Профиль не найден.' };
      const now = Date.now();
      if (user.lastWorkEarnAt && now - user.lastWorkEarnAt < 800) {
        return { ok: false, error: 'Слишком быстро. Анти-автокликер.' };
      }
      if (!user.workEarnHourStart || now - user.workEarnHourStart > 3600000) {
        user.workEarnHourStart = now;
        user.workEarnedThisHour = 0;
      }
      if ((user.workEarnedThisHour || 0) + amt > 60) {
        return { ok: false, error: 'Лимит заработка в час достигнут (60 @). Отдохни.' };
      }
      if (!Number.isFinite(user.balance)) user.balance = 0;
      user.balance += amt;
      user.totalEarned = (user.totalEarned || 0) + amt;
      user.totalTaps = (user.totalTaps || 0) + t;
      user.lastWorkEarnAt = now;
      user.workEarnedThisHour = (user.workEarnedThisHour || 0) + amt;
      ensureQuestsDay(user);
      user.questsProgress.taps = (user.questsProgress.taps || 0) + t;
      user.questsProgress.earned = (user.questsProgress.earned || 0) + amt;
      addHistory({ type: 'in', userKey: key, peer: 'работа', amount: amt, memo: 'Заработок в «Работе»' });
      const newAch = checkAchievements(user);
      return { ok: true, amount: amt, balance: user.balance, newAchievements: newAch };
    });
  }

  async function buyWorkUpgrade(userKey) {
    const key = normalizeNick(userKey);
    return withLatest(() => {
      const user = db.users[key];
      if (!user || key === 'admin') return { ok: false, error: 'Профиль не найден.' };
      if ((user.workLevel || 1) >= 5) return { ok: false, error: 'Максимальный уровень.' };
      const cost = WORK_UPGRADE_COSTS[user.workLevel || 1];
      if (user.balance < cost) return { ok: false, error: 'Недостаточно @.' };
      user.balance -= cost;
      user.workLevel = (user.workLevel || 1) + 1;
      ensureQuestsDay(user);
      user.questsProgress.upgrades = (user.questsProgress.upgrades || 0) + 1;
      const newAch = checkAchievements(user);
      addHistory({ type: 'out', userKey: key, peer: 'магазин', amount: cost, memo: 'Улучшение работы до уровня ' + user.workLevel });
      return { ok: true, level: user.workLevel, cost, newAchievements: newAch };
    });
  }

  async function playCoinFlip(userKey, amount, choice) {
    const amt = Number(amount);
    if (!Number.isInteger(amt) || amt < 1) return { ok: false, error: 'Неверная ставка.' };
    const key = normalizeNick(userKey);
    return withLatest(() => {
      const user = db.users[key];
      if (!user || key === 'admin') return { ok: false, error: 'Профиль не найден.' };
      if (user.balance < amt) return { ok: false, error: 'Недостаточно @.' };
      user.balance -= amt;
      const result = Math.random() < 0.5 ? 'heads' : 'tails';
      const win = result === choice;
      let payout = 0;
      if (win) { payout = Math.floor(amt * 1.9); user.balance += payout; user.gamesWon = (user.gamesWon||0)+1; if (payout > (user.biggestWin||0)) user.biggestWin = payout; }
      user.gamesPlayed = (user.gamesPlayed||0)+1;
      user.totalGambled = (user.totalGambled||0) + amt;
      ensureQuestsDay(user);
      user.questsProgress.games = (user.questsProgress.games||0)+1;
      if (win) user.questsProgress.wins = (user.questsProgress.wins||0)+1;
      const newAch = checkAchievements(user);
      addHistory({ type: win ? 'in' : 'out', userKey: key, peer: 'казино', amount: win ? payout : amt, memo: (win ? 'Выигрыш в монетке' : 'Проигрыш в монетке') });
      return { ok: true, result, win, payout, balance: user.balance, newAchievements: newAch };
    });
  }

  async function playDice(userKey, amount, guess) {
    const amt = Number(amount);
    const g = Number(guess);
    if (!Number.isInteger(amt) || amt < 1) return { ok: false, error: 'Неверная ставка.' };
    if (!Number.isInteger(g) || g < 1 || g > 6) return { ok: false, error: 'Выбери число 1-6.' };
    const key = normalizeNick(userKey);
    return withLatest(() => {
      const user = db.users[key];
      if (!user || key === 'admin') return { ok: false, error: 'Профиль не найден.' };
      if (user.balance < amt) return { ok: false, error: 'Недостаточно @.' };
      user.balance -= amt;
      const roll = 1 + Math.floor(Math.random() * 6);
      const win = roll === g;
      let payout = 0;
      if (win) { payout = amt * 5; user.balance += payout; user.gamesWon = (user.gamesWon||0)+1; if (payout > (user.biggestWin||0)) user.biggestWin = payout; }
      user.gamesPlayed = (user.gamesPlayed||0)+1;
      user.totalGambled = (user.totalGambled||0) + amt;
      ensureQuestsDay(user);
      user.questsProgress.games = (user.questsProgress.games||0)+1;
      if (win) user.questsProgress.wins = (user.questsProgress.wins||0)+1;
      const newAch = checkAchievements(user);
      addHistory({ type: win ? 'in' : 'out', userKey: key, peer: 'казино', amount: win ? payout : amt, memo: (win ? 'Выигрыш в кубике ('+roll+')' : 'Проигрыш в кубике (выпало '+roll+')') });
      return { ok: true, roll, win, payout, balance: user.balance, newAchievements: newAch };
    });
  }

  const QUEST_POOL = [
    { id:'earn100', title:'Заработай 100 @ в работе', target:100, field:'earned', reward:50 },
    { id:'taps50', title:'Сделай 50 тапов', target:50, field:'taps', reward:30 },
    { id:'games5', title:'Сыграй 5 игр в казино', target:5, field:'games', reward:40 },
    { id:'wins2', title:'Выиграй 2 раза в казино', target:2, field:'wins', reward:60 },
    { id:'upgrade1', title:'Купи улучшение работы', target:1, field:'upgrades', reward:100 },
    { id:'daily1', title:'Получи ежедневный бонус', target:1, field:'daily', reward:20 },
    { id:'earn500', title:'Заработай 500 @ в работе', target:500, field:'earned', reward:150 },
    { id:'games10', title:'Сыграй 10 игр в казино', target:10, field:'games', reward:80 }
  ];

  function getQuestsForDay(dayNum) {
    const arr = QUEST_POOL.slice().sort((a,b) => {
      const ha = (dayNum * 37 + a.id.charCodeAt(0)*13) % 997;
      const hb = (dayNum * 37 + b.id.charCodeAt(0)*13) % 997;
      return ha - hb;
    });
    return arr.slice(0, 3);
  }

  function getQuests(userKey) {
    const key = normalizeNick(userKey);
    const user = db.users[key];
    if (!user) return { ok: false, error: 'Профиль не найден.' };
    ensureQuestsDay(user);
    const dayNum = Math.floor(Date.now() / DAY_MS);
    const quests = getQuestsForDay(dayNum);
    return {
      ok: true,
      quests: quests.map(q => ({
        id: q.id,
        title: q.title,
        target: q.target,
        progress: Math.min((user.questsProgress[q.field]||0), q.target),
        reward: q.reward,
        claimed: (user.questsClaimed||[]).includes(q.id)
      }))
    };
  }

  async function claimQuest(userKey, questId) {
    const key = normalizeNick(userKey);
    return withLatest(() => {
      const user = db.users[key];
      if (!user) return { ok: false, error: 'Профиль не найден.' };
      ensureQuestsDay(user);
      const dayNum = Math.floor(Date.now() / DAY_MS);
      const quests = getQuestsForDay(dayNum);
      const q = quests.find(x => x.id === questId);
      if (!q) return { ok: false, error: 'Квест не найден.' };
      if ((user.questsClaimed||[]).includes(q.id)) return { ok: false, error: 'Уже получен.' };
      if ((user.questsProgress[q.field]||0) < q.target) return { ok: false, error: 'Квест не выполнен.' };
      user.balance += q.reward;
      user.totalEarned = (user.totalEarned||0) + q.reward;
      if (!user.questsClaimed) user.questsClaimed = [];
      user.questsClaimed.push(q.id);
      const newAch = checkAchievements(user);
      addHistory({ type:'in', userKey: key, peer:'квесты', amount: q.reward, memo: 'Награда за квест: ' + q.title });
      return { ok: true, reward: q.reward, balance: user.balance, newAchievements: newAch };
    });
  }

  // issueDaily update: increment dailyCount, quest progress daily
  // patch issueDaily below via replace separately

  async function clearHistory(userKey) {
    const key = normalizeNick(userKey);
    return withLatest(() => {
      const before = db.history.length;
      db.history = db.history.filter(item => item.userKey !== key);
      return { ok: true, removed: before - db.history.length };
    });
  }

  function exportData() {
    return JSON.stringify({ format: 'misha-bank-export', version: 3, data: db }, null, 2);
  }

  async function importData(text) {
    let parsed;
    try { parsed = JSON.parse(text); } catch (_) { return { ok: false, error: 'Файл не похож на JSON.' }; }
    const incoming = normalizeDb(parsed && parsed.data ? parsed.data : parsed);
    if (!Object.keys(incoming.users).length) return { ok: false, error: 'В файле не найдены игроки.' };
    db = incoming;
    const pushed = await push();
    if (!pushed) return { ok: false, error: 'Не удалось отправить данные в общую базу.' };
    saveLocal();
    return { ok: true };
  }

  const initial = loadLocal();
  if (initial) db = initial;

  window.BankStore = {
    register,
    login,
    claimDaily,
    getUser,
    findUser,
    getStock,
    getLeaderboard,
    getHistory,
    total,
    countCards,
    transfer,
    getUsers,
    purgeTestAccounts,
    deleteUser,
    adjustUserCards,
    adjustUserBalance,
    clearHistory,
    grantCards,
    grantBalance,
    changePin,
    setAvatar,
    setDailyEnabled,
    workEarn,
    buyWorkUpgrade,
    workRewardForLevel,
    accruePassive,
    depositMoney,
    withdrawDeposit,
    buyHourlyUpgrade,
    HOURLY_UPGRADE_COSTS,
    HOURLY_UPGRADE_RATES,
    playCoinFlip,
    playDice,
    getQuests,
    claimQuest,
    getAchievements: (key) => {
      const u = db.users[normalizeNick(key)];
      return u ? (u.achievements||[]) : [];
    },
    ACHIEVEMENTS,
    exportData,
    importData,
    pull,
    push,
    isOnline: () => online,
    lastError: () => lastError
  };
})();
