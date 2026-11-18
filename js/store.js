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
    return { version: 3, rev: 0, users: {}, history: [] };
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
      avatar: (user && typeof user.avatar === 'string') ? user.avatar.slice(0, 200000) : '',
      recentRecipients: Array.isArray(user && user.recentRecipients) ? user.recentRecipients.filter(v => typeof v === 'string').slice(0, 3) : []
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
      recentRecipients: Array.isArray(user.recentRecipients) ? user.recentRecipients.slice(0, 3) : []
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
    user.lastDailyAt = Date.now();
    addHistory({ type: 'daily', userKey, peer: '', amount: DAILY_BONUS, memo: 'Ежедневный бонус' });
    return { ok: true, amount: DAILY_BONUS, issued: DAILY_BONUS, nextAt: user.lastDailyAt + DAY_MS };
  }

  async function register(nick, pin) {
    const clean = String(nick || '').trim();
    const key = normalizeNick(clean);
    if (!/^[a-zA-Z0-9_]{3,16}$/.test(clean)) {
      return { ok: false, error: 'Ник: 3–16 символов, только латиница, цифры и _.' };
    }
    if (!/^\d{4,6}$/.test(String(pin || ''))) return { ok: false, error: 'ПИН-код должен содержать 4–6 цифр.' };

    return withLatest(() => {
      if (db.users[key]) return { ok: false, error: 'Этот ник уже занят. Придумай другой.' };
      const user = { nick: clean, pin: String(pin), createdAt: Date.now(), balance: STARTER_BALANCE, lastDailyAt: 0, dailyEnabled: true, avatar: '', recentRecipients: [] };
      db.users[key] = user;
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
    const val = (typeof avatar === 'string') ? avatar.slice(0, 200000) : '';
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

  async function workEarn(userKey, amount) {
    const amt = Number(amount);
    if (!Number.isInteger(amt) || amt <= 0 || amt > 10) return { ok: false, error: 'Неверная сумма.' };
    const key = normalizeNick(userKey);
    return withLatest(() => {
      const user = db.users[key];
      if (!user || key === 'admin') return { ok: false, error: 'Профиль не найден.' };
      if (!Number.isFinite(user.balance)) user.balance = 0;
      user.balance += amt;
      addHistory({ type: 'in', userKey: key, peer: 'работа', amount: amt, memo: 'Заработок в «Работе»' });
      return { ok: true, amount: amt, balance: user.balance };
    });
  }

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
    exportData,
    importData,
    pull,
    push,
    isOnline: () => online,
    lastError: () => lastError
  };
})();
