/* Интерфейс MISHA BANK — своя валюта «@» (собаки). */
(function () {
  'use strict';

  const SESSION_KEY = 'misha-bank-session-v1';
  const store = window.BankStore;
  const el = (id) => document.getElementById(id);
  const state = { key: null, user: null, sendAmount: 0, adminTargetKey: '', adminAmount: 0, mode: 'login', nextDailyAt: 0, busy: false, isAdmin: false, lastRecipient: '', netDown: false, workTaps: 0, settingsOpen: false, pendingAvatar: '', sessionEarned: 0 };
  const number = (value) => new Intl.NumberFormat('ru-RU').format(value);
  let toastTimer = null;
  let dailyTimer = null;
  let syncTimer = null;
  let searchTimer = null;
  let lastSyncAt = 0;

  function toast(message, isError) {
    const node = el('toast');
    node.textContent = message;
    node.classList.toggle('error', Boolean(isError));
    node.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => node.classList.remove('show'), 2800);
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  }

  function setBusy(value) {
    state.busy = value;
    const submit = el('auth-submit');
    if (submit) submit.disabled = value;
    const send = el('btn-send');
    if (send) send.disabled = value || send.disabled;
  }

  function setMode(mode) {
    state.mode = mode;
    document.querySelectorAll('.switch-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.mode === mode));
    el('auth-submit').textContent = mode === 'login' ? 'Войти' : 'Создать счёт';
    el('auth-pin').value = '';
    el('auth-error').textContent = '';
  }

  async function handleAuth(event) {
    event.preventDefault();
    if (state.busy) return;
    const nick = el('auth-nick').value.trim();
    const pin = el('auth-pin').value.trim();
    setBusy(true);
    let deviceId = '';
  try { deviceId = localStorage.getItem('misha-bank-device') || ''; } catch (_) { /* ignore */ }
  if (!deviceId) {
    deviceId = 'dev-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
    try { localStorage.setItem('misha-bank-device', deviceId); } catch (_) { /* ignore */ }
  }
  const result = state.mode === 'login' ? await store.login(nick, pin) : await store.register(nick, pin, deviceId);
    setBusy(false);
    if (!result.ok) {
      el('auth-error').textContent = result.error;
      return;
    }
    try { localStorage.setItem(SESSION_KEY, result.key); } catch (_) { /* приватный режим */ }
    state.key = result.key;
    state.user = store.getUser(result.key);
    state.nextDailyAt = result.daily ? result.daily.nextAt : (state.user.lastDailyAt || 0) + 86400000;
    state.isAdmin = (result.key === 'admin');
    el('auth-pin').value = '';
    await enterGame();
    if (result.daily && result.daily.amount) {
      toast(`🎁 Ежедневный бонус: ${number(result.daily.amount)} @`);
    } else {
      toast(state.mode === 'register' ? `Добро пожаловать, ${result.user.nick}!` : `С возвращением, ${result.user.nick}!`);
    }
  }

  function logout() {
    try { localStorage.removeItem(SESSION_KEY); } catch (_) { /* ignore */ }
    clearInterval(dailyTimer);
    clearInterval(syncTimer);
    document.removeEventListener('visibilitychange', handleVisibility);
    lastSyncAt = 0;
    state.key = null;
    state.user = null;
    state.sendAmount = 0;
    state.isAdmin = false;
    el('screen-bank').classList.add('hidden');
    el('screen-auth').classList.remove('hidden');
    el('auth-pin').value = '';
    el('auth-error').textContent = '';
    setMode('login');
  }

  async function enterGame() {
    el('screen-auth').classList.add('hidden');
    el('screen-bank').classList.remove('hidden');
    state.sendAmount = 0;
    state.workTaps = 0;
    state.sessionEarned = 0;
    if (workGuard && typeof workGuard.reset === 'function') workGuard.reset();
    const amountInput = el('send-amount');
    if (amountInput) amountInput.value = '';
    const toNick = el('to-nick');
    if (toNick) toNick.value = '';
    const msgInput = el('send-message');
    if (msgInput) msgInput.value = '';
    updateAdminVisibility();
    if (state.isAdmin) {
      try { await store.purgeTestAccounts(); } catch (_) { /* ignore */ }
    }
    await syncFromServer(true);
    renderAll();
    switchTab('wallet');
    clearInterval(dailyTimer);
    dailyTimer = setInterval(() => { renderDaily(); tryAutoDaily(); if (state.key) { renderWork(); renderDeposit(); } }, 15000);
    clearInterval(syncTimer);
    syncTimer = setInterval(() => { if (document.visibilityState === 'visible') syncFromServer(false); }, 30000);
    document.removeEventListener('visibilitychange', handleVisibility);
    document.addEventListener('visibilitychange', handleVisibility);
  }

  function updateAdminVisibility() {
    const tabAdmin = el('tab-admin');
    if (tabAdmin) tabAdmin.classList.toggle('hidden', !state.isAdmin);
    const tabWork = el('tab-work');
    if (tabWork) tabWork.classList.toggle('hidden', state.isAdmin);
    const tabWallet = document.querySelector('.tab[data-tab="wallet"]');
    const tabSend = document.querySelector('.tab[data-tab="send"]');
    if (tabWallet) tabWallet.classList.toggle('hidden', state.isAdmin);
    if (tabSend) tabSend.classList.toggle('hidden', state.isAdmin);
    // bank tab always visible
    if (state.isAdmin) {
      const active = document.querySelector('.tab.active');
      if (active && (active.dataset.tab === 'wallet' || active.dataset.tab === 'send' || active.dataset.tab === 'work')) {
        switchTab('bank');
      }
    } else {
      if (document.querySelector('.tab.active') && document.querySelector('.tab.active').dataset.tab === 'admin') {
        switchTab('wallet');
      }
    }
    const dailyBanner = el('daily-banner');
    if (dailyBanner) dailyBanner.classList.toggle('hidden', state.isAdmin || !(state.user && state.user.dailyEnabled !== false));
  }

  function handleVisibility() {
    if (document.visibilityState === 'visible' && state.key) syncFromServer(false);
  }

  async function tryAutoDaily() {
    if (!state.key || state.busy) return;
    const user = store.getUser(state.key);
    if (!user) return;
    if (user.dailyEnabled === false) return;
    if (Date.now() - (user.lastDailyAt || 0) < 86400000) return;
    state.busy = true;
    const result = await store.claimDaily(state.key);
    state.busy = false;
    if (result && result.ok) {
      state.user = store.getUser(state.key);
      state.nextDailyAt = result.daily ? result.daily.nextAt : (state.user.lastDailyAt || 0) + 86400000;
      renderAll();
      if (result.daily && result.daily.amount) toast(`🎁 Новый ежедневный бонус: ${number(result.daily.amount)} @`);
    }
  }

  async function syncFromServer(force) {
    if (!state.key || state.busy) return;
    const now = Date.now();
    if (!force && now - lastSyncAt < 30000) return;
    lastSyncAt = now;
    const prevBalance = state.user ? store.total(state.user) : null;
    const ok = await store.pull();
    state.user = store.getUser(state.key);
    if (!ok) {
      state.netDown = true;
      updateOfflineState();
    } else {
      state.netDown = false;
      updateOfflineState();
    }
    if (state.user) {
      if (prevBalance !== null && store.total(state.user) !== prevBalance) {
        toast('✨ Баланс обновлён');
      }
      state.nextDailyAt = (state.user.lastDailyAt || 0) + 86400000;
      renderAll();
    } else {
      toast('Твой профиль удалён или не найден', true);
      logout();
    }
  }

  function switchTab(tab) {
    document.querySelectorAll('.tab').forEach(btn => btn.classList.toggle('active', btn.dataset.tab === tab));
    document.querySelectorAll('[data-panel]').forEach(panel => panel.classList.toggle('hidden', panel.dataset.panel !== tab));
    if (tab === 'admin') renderAdmin();
    if (tab === 'work') renderWork();
    if (tab === 'games') renderGames();
    if (tab === 'deposit') renderDeposit();
  }

  function renderHeader() {
    if (!state.user) return;
    el('user-nick').textContent = state.user.nick;
    const avatarNode = el('user-avatar');
    if (avatarNode) {
      const av = state.user.avatar || '';
      if (av.trim()) {
        avatarNode.textContent = av;
      } else {
        avatarNode.textContent = state.user.nick.slice(0, 1).toUpperCase();
      }
    }
    el('user-since').textContent = 'с нами с ' + new Date(state.user.createdAt).toLocaleDateString('ru-RU');
    const balance = store.total(state.user);
    el('top-balance').textContent = `${number(balance)} @`;
    el('wallet-balance').textContent = number(balance);
    const countEl = el('wallet-count');
    if (countEl) countEl.textContent = number(balance);
  }

  function renderDaily() {
    if (!state.user) return;
    const remaining = Math.max(0, state.nextDailyAt - Date.now());
    const canDrop = !remaining;
    el('daily-banner').classList.toggle('daily-ready', canDrop);
    el('daily-title').textContent = canDrop ? 'Ежедневный бонус готов!' : 'Следующий бонус скоро';
    el('daily-sub').textContent = canDrop ? 'Бонус начислится автоматически' : 'Бонус начисляется автоматически раз в 24 часа';
    if (canDrop) {
      el('daily-timer').textContent = '🎁 готово';
    } else {
      const hours = Math.floor(remaining / 3600000);
      const minutes = Math.floor((remaining % 3600000) / 60000);
      const seconds = Math.floor((remaining % 60000) / 1000);
      el('daily-timer').textContent = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }
  }

  function renderWallet() {
    if (!state.user) return;
    const balance = store.total(state.user);
    const grid = el('wallet-grid');
    if (grid) grid.innerHTML = `<div class="empty">Твой баланс: ${number(balance)} @</div>`;

    const history = store.getHistory(state.key);
    if (!history.length) {
      el('history-list').innerHTML = '<li class="hist-item"><div class="hist-main"><strong>Пока пусто</strong><small>Здесь появятся бонусы и переводы</small></div></li>';
      return;
    }
    el('history-list').innerHTML = history.map(item => {
      const amount = item.amount || 0;
      let label = item.memo;
      if (item.type === 'out') label = `→ ${item.peer}`;
      if (item.type === 'in') label = `← ${item.peer}`;
      if (item.type === 'daily') label = 'Ежедневный бонус';
      if (item.type === 'mint') label = 'Стартовый баланс';
      const sign = item.type === 'out' ? '−' : '+';
      const msg = item.message ? `<div class="hist-message">💬 ${escapeHtml(item.message)}</div>` : '';
      let peerAvatar = '';
      if (item.peer) {
        const pu = store.findUser(item.peer);
        const av = (pu && pu.avatar) ? pu.avatar : '';
        if (av.trim()) peerAvatar = escapeHtml(av);
        else if (pu) peerAvatar = escapeHtml((pu.nick || '?').slice(0,1).toUpperCase());
      }
      const avatarHtml = peerAvatar ? `<span class="hist-avatar">${peerAvatar}</span>` : '';
      return `
        <li class="hist-item ${item.type === 'out' ? 'out' : 'in'}">
          ${avatarHtml}
          <div class="hist-main">
            <strong>${escapeHtml(label)}</strong>
            <small>${new Date(item.at).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</small>
            ${msg}
          </div>
          <span class="hist-amount">${sign}${number(amount)} @</span>
        </li>`;
    }).join('');
  }

  function renderRecentRecipients() {
    const box = el('recent-recipients');
    if (!box) return;
    const list = (state.user && Array.isArray(state.user.recentRecipients)) ? state.user.recentRecipients : [];
    if (!list.length) { box.innerHTML = ''; box.classList.add('hidden'); return; }
    box.classList.remove('hidden');
    box.innerHTML = '<span class="recent-label">Недавние получатели:</span>' + list.map(nik =>
      `<button type="button" class="recent-chip" data-nick="${escapeHtml(nik)}">${escapeHtml(nik)}</button>`
    ).join('');
  }

  function renderNickSuggestions() {
    const box = el('nick-suggestions');
    if (!box) return;
    const raw = el('to-nick').value.trim().toLowerCase();
    if (!raw) { box.classList.add('hidden'); box.innerHTML = ''; return; }
    const users = store.getUsers().filter(u => u.key !== state.key);
    const matches = users.filter(u => u.nick.toLowerCase().startsWith(raw) || u.nick.toLowerCase().includes(raw)).slice(0, 8);
    if (!matches.length) { box.classList.add('hidden'); box.innerHTML = ''; return; }
    box.classList.remove('hidden');
    box.innerHTML = matches.map(u => {
      const av = u.avatar || '';
      const avHtml = av.trim() ? escapeHtml(av) : escapeHtml(u.nick.slice(0,1).toUpperCase());
      return `<li class="nick-suggestion" data-nick="${escapeHtml(u.nick)}"><span class="sug-avatar">${avHtml}</span>${escapeHtml(u.nick)}</li>`;
    }).join('');
  }

  function renderSend() {
    if (!state.user) return;
    renderRecentRecipients();
    updateSendTotals();
  }

  function renderWork() {
    if (!state.user) return;
    const remainder = state.workTaps % 10;
    const toNext = remainder === 0 ? 10 : 10 - remainder;
    const progEl = el('work-progress');
    if (progEl) progEl.textContent = toNext;
    const bar = el('work-bar-fill');
    if (bar) bar.style.width = (remainder / 10 * 100) + '%';
    const earnedEl = el('work-earned');
    if (earnedEl) earnedEl.textContent = `${number(state.sessionEarned || 0)} @`;

    const u = state.user;
    const limit = store.workHourlyLimit ? store.workHourlyLimit(u) : 60;
    const hourFresh = !u.workEarnHourStart || Date.now() - u.workEarnHourStart > 3600000;
    const earnedHour = Math.min(hourFresh ? 0 : (u.workEarnedThisHour || 0), limit);
    const hourEarnedEl = el('work-hour-earned');
    if (hourEarnedEl) hourEarnedEl.textContent = number(earnedHour);
    const hourLimitEl = el('work-hour-limit');
    if (hourLimitEl) hourLimitEl.textContent = number(limit);
    const hourBar = el('work-hour-bar-fill');
    if (hourBar) hourBar.style.width = Math.min(100, Math.round((earnedHour / limit) * 100)) + '%';
    const lvl = u.workLimitLevel || 1;
    const limitLvlEl = el('work-limit-level');
    if (limitLvlEl) limitLvlEl.textContent = lvl;
    const costs = store.WORK_LIMIT_COSTS || [0, 1000, 3000, 8000, 20000];
    const maxed = lvl >= costs.length;
    const limitCostEl = el('work-limit-cost');
    if (limitCostEl) limitCostEl.textContent = maxed ? 'макс' : number(costs[lvl] || 0);
    const btnLimit = el('btn-work-limit-upgrade');
    if (btnLimit) {
      btnLimit.disabled = state.busy || maxed || (u.balance || 0) < (maxed ? 0 : (costs[lvl] || 0));
      btnLimit.textContent = maxed ? 'Максимальный лимит' : 'Улучшить лимит';
    }
  }

  function achTitle(id) {
    const a = (store.ACHIEVEMENTS || []).find(x => x.id === id);
    return a ? a.title : id;
  }

  function renderGames() {
    if (!state.user) return;
    const u = state.user;
    const lvl = u.workLevel || 1;
    const lvlEl = el('work-level'); if (lvlEl) lvlEl.textContent = lvl;
    const rewEl = el('work-reward'); if (rewEl) rewEl.textContent = store.workRewardForLevel(lvl);
    const costs = [0,500,1500,4000,10000];
    const costEl = el('upgrade-cost');
    if (costEl) costEl.textContent = (lvl >= 5) ? 'макс' : number(costs[lvl]);
    const btnUp = el('btn-upgrade');
    if (btnUp) btnUp.disabled = state.busy || lvl >= 5 || (u.balance || 0) < (lvl < 5 ? costs[lvl] : 0);

    // quests
    const qres = store.getQuests(state.key);
    const qlist = el('quests-list');
    if (qlist && qres && qres.ok) {
      qlist.innerHTML = qres.quests.map(q => {
        const pct = Math.min(100, Math.round((q.progress / q.target) * 100));
        const done = q.progress >= q.target;
        return `<li class="quest-item ${q.claimed ? 'claimed' : (done ? 'done' : '')}">
          <div class="quest-main">
            <strong>${escapeHtml(q.title)}</strong>
            <small>${q.progress} / ${q.target}</small>
            <div class="quest-bar"><div class="quest-bar-fill" style="width:${pct}%"></div></div>
          </div>
          <div class="quest-side">
            <span class="quest-reward">+${number(q.reward)} @</span>
            ${q.claimed ? '<span class="muted small">получено</span>' : (done ? `<button class="btn primary small quest-claim" data-qid="${escapeHtml(q.id)}" type="button">Забрать</button>` : '')}
          </div>
        </li>`;
      }).join('') || '<li class="empty">Квесты обновятся завтра</li>';
      qlist.querySelectorAll('.quest-claim').forEach(b => {
        b.addEventListener('click', async () => {
          setBusy(true);
          const r = await store.claimQuest(state.key, b.dataset.qid);
          setBusy(false);
          if (r.ok) {
            state.user = store.getUser(state.key);
            renderHeader(); renderGames(); renderAll();
            toast('📜 +' + r.reward + ' @ за квест!');
            if (r.newAchievements && r.newAchievements.length) for (const a of r.newAchievements) toast('🏆 Достижение: ' + achTitle(a));
          } else toast(r.error, true);
        });
      });
    }

    // achievements
    const alist = el('achievements-list');
    if (alist) {
      const unlocked = new Set(u.achievements || []);
      const all = store.ACHIEVEMENTS || [];
      alist.innerHTML = all.map(a => {
        const on = unlocked.has(a.id);
        return `<div class="ach ${on ? 'unlocked' : 'locked'}" title="${escapeHtml(a.desc)}">
          <span class="ach-icon">${on ? '🏆' : '🔒'}</span>
          <span class="ach-title">${escapeHtml(a.title)}</span>
        </div>`;
      }).join('');
    }

    // stats
    const setStat = (id, val) => { const e = el(id); if (e) e.textContent = number(val || 0); };
    setStat('stat-earned', u.totalEarned);
    setStat('stat-taps', u.totalTaps);
    setStat('stat-games', u.gamesPlayed);
    setStat('stat-wins', u.gamesWon);
    setStat('stat-gambled', u.totalGambled);
    setStat('stat-best', u.biggestWin);
  }

  // Сколько уже накопилось с момента последнего начисления (то, что реально заберётся).
  function estimatePending(user) {
    const now = Date.now();
    let depositPending = user.depositPending || 0;
    const depositPerHour = (user.deposit || 0) * 0.0003472;
    const depositLast = user.depositLastAccrual || now;
    if (depositPerHour > 0 && now > depositLast) {
      depositPending += Math.floor(depositPerHour * (now - depositLast) / 3600000);
    }
    let hourlyPending = user.hourlyPending || 0;
    const hourlyRate = user.hourlyRate || 0;
    const hourlyLast = user.hourlyLastAccrual || now;
    if (hourlyRate > 0 && now > hourlyLast) {
      hourlyPending += Math.floor(hourlyRate * (now - hourlyLast) / 3600000);
    }
    return { depositPending, hourlyPending };
  }

  function renderDeposit() {
    if (!state.user) return;
    const u = state.user;
    const pending = estimatePending(u);
    const depEl = el('deposit-amount');
    if (depEl) depEl.textContent = number(u.deposit || 0);
    const depAccEl = el('deposit-accrued');
    if (depAccEl) depAccEl.textContent = number(pending.depositPending);
    const lvlEl = el('hourly-level');
    if (lvlEl) lvlEl.textContent = u.hourlyLevel || 0;
    const rateEl = el('hourly-rate');
    if (rateEl) rateEl.textContent = number(u.hourlyRate || 0);
    const costs = store.HOURLY_UPGRADE_COSTS || [0,800,2500,7000,18000,45000];
    const lvl = u.hourlyLevel || 0;
    const costEl = el('hourly-cost');
    if (costEl) costEl.textContent = (lvl >= 5) ? 'макс' : number(costs[lvl + 1] || 0);
    const btnUp = el('btn-hourly-upgrade');
    if (btnUp) btnUp.disabled = state.busy || lvl >= 5 || (u.balance || 0) < (lvl < 5 ? (costs[lvl+1]||0) : 0);
    const accEl = el('hourly-accrued');
    if (accEl) accEl.textContent = number(pending.hourlyPending);
    const btnClaim = el('btn-claim-hourly');
    if (btnClaim) btnClaim.disabled = state.busy || pending.hourlyPending <= 0;
    const btnClaimDep = el('btn-claim-deposit');
    if (btnClaimDep) btnClaimDep.disabled = state.busy || pending.depositPending <= 0;
  }

  function updateSendTotals() {
    const amountInput = el('send-amount');
    const amount = amountInput ? Number(amountInput.value) : 0;
    const balance = store.total(state.user);
    const validAmount = Number.isInteger(amount) && amount > 0;
    el('send-total-value').textContent = number(validAmount ? amount : 0);
    el('send-total-count').textContent = validAmount ? `${number(amount)} @` : 'укажи сумму';
    const recipient = store.findUser(el('to-nick').value.trim());
    const isAdminRecipient = recipient && recipient.key === 'admin';
    const canSend = validAmount && amount <= balance && recipient && recipient.key !== state.key && !isAdminRecipient;
    el('btn-send').disabled = state.busy || !canSend;
    updateRecipientHint(recipient, balance);
  }

  async function searchRecipient() {
    if (!state.key) return;
    const raw = el('to-nick').value.trim();
    if (!raw) { updateSendTotals(); return; }
    const hint = el('send-hint');
    let recipient = store.findUser(raw);
    if (!recipient) {
      if (hint) hint.textContent = 'Ищем игрока в общей базе…';
      await store.pull();
      state.user = store.getUser(state.key);
      recipient = store.findUser(raw);
    }
    if (recipient && recipient.key === 'admin') {
      if (hint) hint.textContent = 'Нельзя переводить администратору.';
      recipient = null;
    } else if (recipient && recipient.key !== state.key) {
      if (hint) hint.textContent = '';
    } else if (recipient && recipient.key === state.key) {
      if (hint) hint.textContent = 'Это твой счёт 🙂 Выбери другого игрока.';
    } else {
      if (hint) hint.textContent = 'Игрок с таким ником не найден.';
    }
    updateSendTotals();
  }

  function updateRecipientHint(recipient, balance) {
    const hint = el('send-hint');
    const note = el('send-note');
    const raw = el('to-nick').value.trim();
    if (!raw) { hint.textContent = ''; note.textContent = ''; return; }
    if (!recipient) {
      hint.textContent = 'Игрок с таким ником не найден.';
      note.textContent = 'Проверь ник. Переводы доступны всем игрокам.';
      return;
    }
    if (recipient.key === 'admin') {
      hint.textContent = 'Нельзя переводить администратору.';
      note.textContent = '';
      return;
    }
    if (recipient.key === state.key) {
      hint.textContent = 'Это твой счёт 🙂 Выбери другого игрока.';
      note.textContent = '';
      return;
    }
    hint.textContent = `${recipient.nick} · баланс ${number(store.total(recipient))} @`;
    note.textContent = '';
  }

  async function doTransfer() {
    if (state.busy) return;
    const raw = el('to-nick').value.trim();
    const amount = Number(el('send-amount').value);
    const message = (el('send-message') ? el('send-message').value : '').trim().slice(0, 200);
    if (!Number.isInteger(amount) || amount <= 0) { toast('Укажи сумму перевода', true); return; }
    if (raw.toLowerCase() === 'admin') { toast('Нельзя переводить администратору', true); return; }
    await store.pull();
    state.user = store.getUser(state.key);
    const recipient = store.findUser(raw);
    if (!recipient || recipient.key === state.key || recipient.key === 'admin') { toast('Проверь ник получателя', true); updateSendTotals(); return; }
    if (amount > store.total(state.user)) { toast('Недостаточно @', true); return; }
    state.lastRecipient = raw;
    setBusy(true);
    el('btn-send').disabled = true;
    const result = await store.transfer(state.key, raw, amount, message);
    setBusy(false);
    if (!result.ok) { toast(result.error, true); updateSendTotals(); return; }
    state.user = store.getUser(state.key);
    el('send-amount').value = '';
    el('to-nick').value = '';
    if (el('send-message')) el('send-message').value = '';
    renderAll();
    toast(`@ отправлены игроку ${recipient.nick}!`);
  }

  function renderBank() {
    const top = store.getLeaderboard();
    el('leaderboard').innerHTML = top.length
      ? top.map((row, index) => {
          const av = row.avatar || '';
          const avatarHtml = av.trim() ? escapeHtml(av) : escapeHtml(row.nick.slice(0,1).toUpperCase());
          return `
          <li class="${row.key === state.key ? 'me' : ''}">
            <span class="lb-rank">${index + 1}</span>
            <span class="lb-avatar">${avatarHtml}</span>
            <span class="lb-nick">${escapeHtml(row.nick)}</span>
            <span class="lb-sum">${number(row.value)} @</span>
          </li>`;
        }).join('')
      : '<li><span class="lb-nick muted">Пока один ты</span></li>';
  }

  function renderAdmin() {
    const users = store.getUsers().filter(u => u.key !== 'admin');
    const sel = el('admin-target');
    const prev = state.adminTargetKey;
    sel.innerHTML = '<option value="">— выбери игрока —</option>' +
      users.map(u => `<option value="${escapeHtml(u.key)}">${escapeHtml(u.nick)}</option>`).join('');
    if (prev && users.some(u => u.key === prev)) sel.value = prev;
    else if (users.length) { sel.value = users[0].key; state.adminTargetKey = users[0].key; }
    else { sel.value = ''; state.adminTargetKey = ''; }
    state.adminTargetKey = sel.value;

    const profile = el('admin-profile');
    const rows = el('admin-card-rows');
    if (!state.adminTargetKey) {
      profile.innerHTML = '<div class="empty">Выбери игрока, чтобы увидеть его счёт</div>';
      rows.innerHTML = '';
      return;
    }
    const user = store.getUser(state.adminTargetKey);
    if (!user) {
      profile.innerHTML = '<div class="empty">Игрок не найден</div>';
      rows.innerHTML = '';
      return;
    }
    profile.innerHTML = `
      <div class="admin-profile-card">
        <div class="admin-profile-main">
          <div class="avatar">${escapeHtml((user.avatar && user.avatar.trim()) ? user.avatar : user.nick.slice(0, 1).toUpperCase())}</div>
          <div class="admin-profile-meta">
            <strong>${escapeHtml(user.nick)}</strong>
            <span class="muted small">с нами с ${new Date(user.createdAt).toLocaleDateString('ru-RU')} · баланс ${number(store.total(user))} @</span>
          </div>
        </div>
        <button type="button" class="btn danger small" data-del-user="${escapeHtml(state.adminTargetKey)}">Удалить профиль</button>
      </div>`;

    const amount = state.adminAmount || 0;
    rows.innerHTML = `
      <div class="admin-card-row">
        <div class="send-info">
          <strong>Баланс игрока</strong>
          <small>сейчас: ${number(store.total(user))} @</small>
        </div>
        <div class="admin-actions">
          <input class="admin-amount" type="number" min="1" step="1" inputmode="numeric" value="${amount || ''}" placeholder="0" />
          <button type="button" class="btn primary small" data-act="add">Добавить</button>
          <button type="button" class="btn ghost small" data-act="remove">Забрать</button>
        </div>
      </div>`;
  }

  async function doDeleteUser(key) {
    if (state.busy) return;
    if (!window.confirm('Удалить этого игрока? Действие нельзя отменить.')) return;
    setBusy(true);
    const result = await store.deleteUser(key);
    setBusy(false);
    if (!result.ok) { toast(result.error, true); return; }
    toast('Пользователь удалён');
    if (state.adminTargetKey === key) state.adminTargetKey = '';
    state.adminAmount = 0;
    renderAdmin();
    renderBank();
  }

  async function doAdjustCard(mode) {
    if (state.busy) return;
    const input = document.querySelector('.admin-amount');
    const amount = Number(input ? input.value : 0);
    if (!Number.isInteger(amount) || amount <= 0) { toast('Укажи сумму', true); return; }
    const target = state.adminTargetKey;
    if (!target) { toast('Выбери игрока', true); return; }
    setBusy(true);
    const result = await store.adjustUserBalance(target, amount, mode);
    setBusy(false);
    if (!result.ok) { toast(result.error, true); return; }
    if (mode === 'remove' && result.removedMax) toast(`Забрано ${result.adjusted} (максимум)`);
    else toast(mode === 'add' ? '@ добавлены' : '@ забраны');
    state.adminAmount = 0;
    if (input) input.value = '';
    if (state.key) state.user = store.getUser(state.key);
    renderAdmin();
    renderBank();
  }

  async function doClearHistory() {
    if (state.busy || !state.key) return;
    if (!window.confirm('Очистить всю историю? Действие нельзя отменить.')) return;
    setBusy(true);
    const result = await store.clearHistory(state.key);
    setBusy(false);
    if (!result.ok) { toast(result.error, true); return; }
    toast('История очищена');
    renderWallet();
  }

  function renderAll() {
    renderHeader();
    renderWallet();
    renderSend();
    renderWork();
    renderGames();
    renderDeposit();
    renderBank();
    if (state.isAdmin && document.querySelector('[data-panel="admin"]:not(.hidden)')) renderAdmin();
    updateAdminVisibility();
  }

  function exportJson() {
    const blob = new Blob([store.exportData()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'misha-bank-backup.json';
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast('Резервная копия выгружена');
  }

  async function importJson(file) {
    const reader = new FileReader();
    reader.onload = async () => {
      setBusy(true);
      const result = await store.importData(String(reader.result || ''));
      setBusy(false);
      if (!result.ok) { toast(result.error, true); return; }
      const session = store.findUser(state.user ? state.user.nick : '');
      if (session) {
        state.key = session.key;
        state.user = store.getUser(session.key);
        renderAll();
        toast('Данные загружены');
      } else {
        logout();
        toast('Данные загружены. Войди под своим ником');
      }
    };
    reader.readAsText(file);
  }

  const AVATAR_EMOJIS = ['😀','😃','😄','😁','😆','😅','🤣','😂','🙂','😉','😍','🥰','😘','😎','🤓','🧐','🤖','👽','👻','💀','🧟','🧛','🧝','🧚','🧙','🥷','👑','🔥','⚡','🌟','✨','💫','⭐','💎','🎯','🚀','🎮','🎲','⚽','🏀','🏈','⚾','🎾','🏐','🏉','🎱','🏓','🥊','🥋','🏊','🚴','🏃','💃','🕺','🎵','🎶','🎸','🥁','🎺','🎻','🎹','🎤','🎧','🎨','🎭','🎪','🎢','🎡','🦊','🐱','🐶','🐼','🐯','🐸','🐵','🦄','🐙','🦀','🐝','🦋','🐢','🐍','🦑','🦈','🐳','🐬','🦅','🦉','🦇','🐺','🐗','🐴','🐮','🐷','🐰','🐹','🐭','🐨','🐻','🐉','🐲','🌵','🌴','🌸','🌺','🌻','🌹','🌷','🪷','🫧','🪻','🍁','🍂','🎄','🪴','🌵','🧊','❄️','🌈','☀️','🌙','⭐','🌟','💻','☠️','🍀','🍄‍🟫','🍎','🍏','🥐','🥞','🍳','☕','🍷','🍰'];

  function openSettings() {
    if (!state.key) return;
    state.settingsOpen = true;
    state.pendingAvatar = (state.user && state.user.avatar) ? state.user.avatar : '';
    const modal = el('settings-modal');
    if (modal) modal.classList.remove('hidden');
    renderSettings();
  }

  function closeSettings() {
    state.settingsOpen = false;
    const modal = el('settings-modal');
    if (modal) modal.classList.add('hidden');
  }

  function renderSettings() {
    if (!state.user) return;
    const preview = el('settings-avatar-preview');
    if (preview) {
    const av = state.pendingAvatar || state.user.avatar || '';
    if (av.trim()) {
      preview.textContent = av;
    } else {
      preview.textContent = state.user.nick.slice(0, 1).toUpperCase();
    }
    }
    const choices = el('avatar-choices');
    if (choices) {
      choices.innerHTML = AVATAR_EMOJIS.map(e =>
        `<button type="button" class="avatar-choice ${state.pendingAvatar === e ? 'selected' : ''}" data-emoji="${escapeHtml(e)}">${e}</button>`
      ).join('');
    }
    const toggle = el('settings-daily-toggle');
    if (toggle) toggle.checked = state.user.dailyEnabled !== false;
    const oldPin = el('settings-old-pin'); if (oldPin) oldPin.value = '';
    const newPin = el('settings-new-pin'); if (newPin) newPin.value = '';
  }

  async function saveAvatar() {
    if (state.busy || !state.key) return;
    setBusy(true);
    const result = await store.setAvatar(state.key, state.pendingAvatar);
    setBusy(false);
    if (!result.ok) { toast(result.error, true); return; }
    state.user = store.getUser(state.key);
    renderAll();
    renderSettings();
    toast('Аватар сохранён');
  }

  async function changePin() {
    if (state.busy || !state.key) return;
    const oldPin = el('settings-old-pin').value.trim();
    const newPin = el('settings-new-pin').value.trim();
    if (!oldPin || !newPin) { toast('Заполни оба поля', true); return; }
    setBusy(true);
    const result = await store.changePin(state.key, oldPin, newPin);
    setBusy(false);
    if (!result.ok) { toast(result.error, true); return; }
    toast('ПИН-код изменён');
    el('settings-old-pin').value = '';
    el('settings-new-pin').value = '';
  }

  async function saveDailySetting() {
    if (state.busy || !state.key) return;
    const enabled = el('settings-daily-toggle').checked;
    setBusy(true);
    const result = await store.setDailyEnabled(state.key, enabled);
    setBusy(false);
    if (!result.ok) { toast(result.error, true); return; }
    state.user = store.getUser(state.key);
    updateAdminVisibility();
    renderAll();
    toast(enabled ? 'Ежедневный бонус включён' : 'Ежедневный бонус выключен');
  }

  function bindSettings() {
    const btnSettings = el('btn-settings');
    if (btnSettings) btnSettings.addEventListener('click', openSettings);
    const btnClose = el('btn-close-settings');
    if (btnClose) btnClose.addEventListener('click', closeSettings);
    const modal = el('settings-modal');
    if (modal) modal.addEventListener('click', event => {
      if (event.target === modal) closeSettings();
    });

    const choices = el('avatar-choices');
    if (choices) choices.addEventListener('click', event => {
      const btn = event.target.closest('.avatar-choice');
      if (!btn) return;
      state.pendingAvatar = btn.dataset.emoji;
      renderSettings();
    });

    const btnSaveAvatar = el('btn-save-avatar');
    if (btnSaveAvatar) btnSaveAvatar.addEventListener('click', saveAvatar);
    const btnResetAvatar = el('btn-reset-avatar');
    if (btnResetAvatar) btnResetAvatar.addEventListener('click', () => { state.pendingAvatar = ''; renderSettings(); });

    const btnChangePin = el('btn-change-pin');
    if (btnChangePin) btnChangePin.addEventListener('click', changePin);
    const btnSaveDaily = el('btn-save-daily');
    if (btnSaveDaily) btnSaveDaily.addEventListener('click', saveDailySetting);
    const btnRefreshData = el('btn-refresh-data');
    if (btnRefreshData) btnRefreshData.addEventListener('click', () => syncFromServer(true));
  }

  // Work clicker with anti-autoclicker
  let workTapTimer = null;
  let workGuard = (window.WorkGuard && window.WorkGuard.create) ? window.WorkGuard.create() : null;
  function setWorkStatus(text, bad) {
    const node = el('work-status');
    if (!node) return;
    node.textContent = text;
    node.style.color = bad ? 'var(--red, #ff6b6b)' : '';
  }
  async function handleWorkTap() {
    if (state.busy || !state.key || state.isAdmin) return;
    if (!workGuard) workGuard = (window.WorkGuard && window.WorkGuard.create) ? window.WorkGuard.create() : { tap: () => ({ ok: true }) };
    const check = workGuard.tap(Date.now());
    if (!check.ok) {
      if (check.reason === 'autoclicker') {
        setWorkStatus('🚫 Обнаружен автокликер. Подожди немного и тапай руками.', true);
        toast('Анти-автокликер: слишком быстро/ровно. Подожди.', true);
      } else if (check.reason === 'too-fast') {
        // тихо игнорируем слишком быстрые тапы
      } else if (check.reason === 'cooldown') {
        setWorkStatus('⏳ Подожди ' + Math.ceil(check.remaining / 1000) + ' с...', true);
      }
      return;
    }
    setWorkStatus('Тапай честно — анти-автокликер следит за скоростью.', false);

    state.workTaps += 1;
    const remainder = state.workTaps % 10;
    const toNext = remainder === 0 ? 10 : 10 - remainder;
    const progEl = el('work-progress');
    if (progEl) progEl.textContent = toNext === 0 ? 10 : toNext;
    const bar = el('work-bar-fill');
    if (bar) bar.style.width = ((state.workTaps % 10) / 10 * 100) + '%';

    if (state.workTaps % 10 === 0) {
      const reward = store.workRewardForLevel(state.user && state.user.workLevel);
      setBusy(true);
      const result = await store.workEarn(state.key, reward, 10);
      setBusy(false);
      if (result.ok) {
        state.user = store.getUser(state.key);
        state.sessionEarned = (state.sessionEarned || 0) + reward;
        const earnedEl = el('work-earned');
        if (earnedEl) earnedEl.textContent = `${number(state.sessionEarned)} @`;
        renderHeader(); renderWork();
        toast('⛏️ +' + reward + ' @ заработано!');
        setWorkStatus('Отлично! +' + reward + ' @ начислено.', false);
        if (result.newAchievements && result.newAchievements.length) {
          for (const a of result.newAchievements) toast('🏆 Достижение: ' + achTitle(a));
        }
      } else {
        renderWork();
        toast(result.error, true);
        setWorkStatus(result.error, true);
      }
    }
  }

  function bindWork() {
    const btn = el('work-tap');
    if (btn) btn.addEventListener('click', handleWorkTap);
    const btnLimit = el('btn-work-limit-upgrade');
    if (btnLimit) btnLimit.addEventListener('click', async () => {
      if (state.busy || !state.key) return;
      setBusy(true);
      const r = await store.buyWorkLimitUpgrade(state.key);
      setBusy(false);
      if (r.ok) {
        state.user = store.getUser(state.key);
        renderHeader(); renderWork(); renderGames();
        toast('⛏️ Лимит работы: ' + number(r.limit) + ' @/час');
        if (r.newAchievements && r.newAchievements.length) for (const a of r.newAchievements) toast('🏆 Достижение: ' + achTitle(a));
      } else toast(r.error, true);
    });
  }

  function bindGames() {
    const btnUp = el('btn-upgrade');
    if (btnUp) btnUp.addEventListener('click', async () => {
      setBusy(true);
      const r = await store.buyWorkUpgrade(state.key);
      setBusy(false);
      if (r.ok) {
        state.user = store.getUser(state.key);
        renderHeader(); renderGames(); renderWork();
        toast('🛠 Уровень работы: ' + r.level);
        if (r.newAchievements && r.newAchievements.length) for (const a of r.newAchievements) toast('🏆 Достижение: ' + achTitle(a));
      } else toast(r.error, true);
    });

    const playCoin = async (choice) => {
      const amt = Number(el('coin-amount').value);
      setBusy(true);
      const r = await store.playCoinFlip(state.key, amt, choice);
      setBusy(false);
      const resEl = el('coin-result');
      if (r.ok) {
        state.user = store.getUser(state.key);
        renderHeader(); renderGames();
        if (resEl) resEl.textContent = (r.win ? '✅ Выпал ' + (r.result === 'heads' ? 'орёл' : 'решка') + ' — выигрыш ' + number(r.payout) + ' @' : '❌ Выпал ' + (r.result === 'heads' ? 'орёл' : 'решка') + ' — проигрыш');
        if (r.newAchievements && r.newAchievements.length) for (const a of r.newAchievements) toast('🏆 Достижение: ' + achTitle(a));
      } else {
        if (resEl) resEl.textContent = r.error;
        toast(r.error, true);
      }
    };
    const btnHeads = el('btn-coin-heads');
    if (btnHeads) btnHeads.addEventListener('click', () => playCoin('heads'));
    const btnTails = el('btn-coin-tails');
    if (btnTails) btnTails.addEventListener('click', () => playCoin('tails'));

    document.querySelectorAll('.dice-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const amt = Number(el('dice-amount').value);
        const guess = Number(btn.dataset.guess);
        setBusy(true);
        const r = await store.playDice(state.key, amt, guess);
        setBusy(false);
        const resEl = el('dice-result');
        if (r.ok) {
          state.user = store.getUser(state.key);
          renderHeader(); renderGames();
          if (resEl) resEl.textContent = (r.win ? '✅ Выпало ' + r.roll + ' — выигрыш ' + number(r.payout) + ' @' : '❌ Выпало ' + r.roll + ' — проигрыш');
          if (r.newAchievements && r.newAchievements.length) for (const a of r.newAchievements) toast('🏆 Достижение: ' + achTitle(a));
        } else {
          if (resEl) resEl.textContent = r.error;
          toast(r.error, true);
        }
      });
    });
   }

   function bindDeposit() {
     const depInput = el('deposit-input');
     const btnDep = el('btn-deposit');
     if (btnDep) btnDep.addEventListener('click', async () => {
       const amt = Number(depInput ? depInput.value : 0);
       setBusy(true);
       const r = await store.depositMoney(state.key, amt);
       setBusy(false);
       if (r.ok) {
         state.user = store.getUser(state.key);
         renderHeader(); renderDeposit(); renderAll();
         toast('🏦 Положено ' + number(r.amount) + ' @ на депозит');
       } else toast(r.error, true);
     });
     const btnWd = el('btn-withdraw');
     if (btnWd) btnWd.addEventListener('click', async () => {
       const amt = Number(depInput ? depInput.value : 0);
       setBusy(true);
       const r = await store.withdrawDeposit(state.key, amt);
       setBusy(false);
       if (r.ok) {
         state.user = store.getUser(state.key);
         renderHeader(); renderDeposit(); renderAll();
         toast('💸 Снято ' + number(r.amount) + ' @ с депозита');
       } else toast(r.error, true);
     });
     const btnClaimDep = el('btn-claim-deposit');
     if (btnClaimDep) btnClaimDep.addEventListener('click', async () => {
       setBusy(true);
       const r = await store.claimDepositInterest(state.key);
       setBusy(false);
       if (r.ok) {
         state.user = store.getUser(state.key);
         renderHeader(); renderDeposit();
         toast('🏦 +' + number(r.amount) + ' @ процентов на баланс');
       } else toast(r.error, true);
     });
     const btnHr = el('btn-hourly-upgrade');
     if (btnHr) btnHr.addEventListener('click', async () => {
       setBusy(true);
       const r = await store.buyHourlyUpgrade(state.key);
       setBusy(false);
       if (r.ok) {
         state.user = store.getUser(state.key);
         renderHeader(); renderDeposit(); renderGames();
         toast('⏱ Пассивный доход: ' + number(r.rate) + ' @/час');
       } else toast(r.error, true);
     });
     const btnClaimHr = el('btn-claim-hourly');
     if (btnClaimHr) btnClaimHr.addEventListener('click', async () => {
       setBusy(true);
       const r = await store.claimHourlyIncome(state.key);
       setBusy(false);
       if (r.ok) {
         state.user = store.getUser(state.key);
         renderHeader(); renderDeposit();
         toast('⏱ +' + number(r.amount) + ' @ дохода на баланс');
       } else toast(r.error, true);
     });
   }

   function bind() {
    document.querySelectorAll('.switch-btn').forEach(btn => btn.addEventListener('click', () => setMode(btn.dataset.mode)));
    el('auth-form').addEventListener('submit', handleAuth);
    el('btn-logout').addEventListener('click', logout);
    document.querySelectorAll('.tab').forEach(btn => btn.addEventListener('click', () => switchTab(btn.dataset.tab)));
    const toNick = el('to-nick');
    if (toNick) {
      toNick.addEventListener('input', event => {
        event.target.value = event.target.value.replace(/\s/g, '');
        renderNickSuggestions();
        updateSendTotals();
        clearTimeout(searchTimer);
        searchTimer = setTimeout(searchRecipient, 900);
      });
      toNick.addEventListener('focus', () => {
        store.pull().then(() => { state.user = store.getUser(state.key); renderNickSuggestions(); });
      });
      toNick.addEventListener('blur', () => {
        setTimeout(() => { const b = el('nick-suggestions'); if (b) b.classList.add('hidden'); }, 150);
      });
    }
    const amountInput = el('send-amount');
    if (amountInput) {
      amountInput.addEventListener('input', () => updateSendTotals());
    }
    el('btn-send').addEventListener('click', doTransfer);

    const sug = el('nick-suggestions');
    if (sug) sug.addEventListener('click', event => {
      const item = event.target.closest('.nick-suggestion');
      if (!item) return;
      el('to-nick').value = item.dataset.nick;
      const b = el('nick-suggestions'); if (b) { b.classList.add('hidden'); b.innerHTML = ''; }
      updateSendTotals();
      searchRecipient();
    });
    const recent = el('recent-recipients');
    if (recent) recent.addEventListener('click', event => {
      const chip = event.target.closest('.recent-chip');
      if (!chip) return;
      el('to-nick').value = chip.dataset.nick;
      updateSendTotals();
      searchRecipient();
    });

    const adminRows = el('admin-card-rows');
    if (adminRows) {
      adminRows.addEventListener('click', event => {
        const button = event.target.closest('button[data-act]');
        if (!button) return;
        doAdjustCard(button.dataset.act === 'add' ? 'add' : 'remove');
      });
      adminRows.addEventListener('input', event => {
        const input = event.target.closest('input.admin-amount');
        if (!input) return;
        const value = Math.max(0, parseInt(input.value, 10) || 0);
        state.adminAmount = value;
        if (String(value) !== input.value) input.value = value ? String(value) : '';
      });
    }

    const adminTarget = el('admin-target');
    if (adminTarget) adminTarget.addEventListener('change', () => {
      state.adminTargetKey = adminTarget.value;
      state.adminAmount = 0;
      renderAdmin();
    });

    const panelAdmin = el('panel-admin');
    if (panelAdmin) panelAdmin.addEventListener('click', event => {
      const button = event.target.closest('button[data-del-user]');
      if (button) doDeleteUser(button.dataset.delUser);
    });

    const btnClearHistory = el('btn-clear-history');
    if (btnClearHistory) btnClearHistory.addEventListener('click', doClearHistory);

    bindSettings();
    bindWork();
    bindGames();
    bindDeposit();

    const msgInput = el('send-message');
    if (msgInput) {
      msgInput.addEventListener('input', () => {
        const counter = el('send-message-count');
        if (counter) counter.textContent = `${msgInput.value.length} / 200`;
      });
    }

    // work tab progress init handled in render
  }

  let booted = false;
  let bound = false;

  function updateOfflineState() {
    const overlay = el('offline-overlay');
    if (!overlay) return;
    const online = navigator.onLine !== false && !state.netDown;
    overlay.classList.toggle('hidden', online);
  }

  async function boot() {
    if (navigator.onLine === false) {
      state.netDown = true;
      updateOfflineState();
      setTimeout(boot, 2000);
      return;
    }
    if (booted) return;
    if (!bound) { bound = true; bind(); }
    booted = true;
    setMode('login');
    const ok = await store.pull();

    if (!ok) {
      state.netDown = true;
      booted = false;
      updateOfflineState();
      setTimeout(boot, 3000);
      return;
    }
    state.netDown = false;
    updateOfflineState();
    let savedKey = null;
    try { savedKey = localStorage.getItem(SESSION_KEY); } catch (_) { /* ignore */ }
    const user = savedKey ? store.getUser(savedKey) : null;
    if (savedKey && user) {
      state.key = savedKey;
      state.isAdmin = (savedKey === 'admin');
      const result = await store.claimDaily(savedKey);
      state.user = store.getUser(savedKey);
      if (!state.user) { logout(); return; }
      state.nextDailyAt = (result && result.daily) ? result.daily.nextAt : (state.user.lastDailyAt || 0) + 86400000;
      await enterGame();
      if (result && result.daily && result.daily.amount) {
        toast(`🎁 Ежедневный бонус: ${number(result.daily.amount)} @`);
      }
    } else {
      el('screen-auth').classList.remove('hidden');
      el('screen-bank').classList.add('hidden');
    }
  }

  updateOfflineState();
  window.addEventListener('online', () => {
    state.netDown = false;
    updateOfflineState();
    if (!booted) boot();
    else if (state.key) syncFromServer(true);
  });
  window.addEventListener('offline', () => {
    state.netDown = true;
    updateOfflineState();
  });
  boot();
  setInterval(updateOfflineState, 3000);
})();
