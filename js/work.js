(function () {
  'use strict';

  // Анти-автокликер: отбрасываем слишком быстрые и слишком ровные тапы.
  const MIN_INTERVAL = 95;          // мин. мс между тапами
  const MAX_TAPS_PER_SEC = 8;
  const REG_WINDOW = 10;
  const REG_VAR_THRESHOLD = 18;       // дисперсия интервалов (мс^2) ниже — подозрительно ровно
  const BLOCK_MS = 5000;
  const REG_SUSPICION_LIMIT = 3;

  function create() {
    const intervals = [];
    let lastTap = 0;
    let blockedUntil = 0;
    let strikes = 0;
    let suspicion = 0;
    let tapsInLastSec = [];

    return {
      tap(now) {
        now = (typeof now === 'number') ? now : Date.now();
        if (now < blockedUntil) {
          return { ok: false, reason: 'cooldown', remaining: blockedUntil - now };
        }
        if (lastTap) {
          const dt = now - lastTap;
          if (dt < MIN_INTERVAL) {
            strikes++;
            if (strikes >= 3) {
              blockedUntil = now + BLOCK_MS;
              strikes = 0;
              intervals.length = 0;
              suspicion = 0;
              return { ok: false, reason: 'autoclicker', remaining: BLOCK_MS };
            }
            return { ok: false, reason: 'too-fast', remaining: MIN_INTERVAL - dt };
          }
          strikes = Math.max(0, strikes - 1);
          intervals.push(dt);
          if (intervals.length > REG_WINDOW) intervals.shift();

          // проверка на ровность (бот)
          if (intervals.length >= REG_WINDOW) {
            const mean = intervals.reduce((a, b) => a + b, 0) / intervals.length;
            const variance = intervals.reduce((a, b) => a + (b - mean) ** 2, 0) / intervals.length;
            if (variance < REG_VAR_THRESHOLD) {
              suspicion++;
              if (suspicion >= REG_SUSPICION_LIMIT) {
                blockedUntil = now + BLOCK_MS + 2000;
                intervals.length = 0;
                suspicion = 0;
                return { ok: false, reason: 'autoclicker', remaining: BLOCK_MS + 2000 };
              }
            } else {
              suspicion = Math.max(0, suspicion - 1);
            }
          }

          // лимит тапов в секунду
          tapsInLastSec = tapsInLastSec.filter(t => now - t < 1000);
          tapsInLastSec.push(now);
          if (tapsInLastSec.length > MAX_TAPS_PER_SEC) {
            blockedUntil = now + 3000;
            tapsInLastSec.length = 0;
            return { ok: false, reason: 'autoclicker', remaining: 3000 };
          }
        }
        lastTap = now;
        return { ok: true };
      },
      isBlocked(now) {
        now = (typeof now === 'number') ? now : Date.now();
        return now < blockedUntil;
      },
      remainingMs(now) {
        now = (typeof now === 'number') ? now : Date.now();
        return Math.max(0, blockedUntil - now);
      },
      reset() {
        intervals.length = 0;
        tapsInLastSec.length = 0;
        lastTap = 0;
        blockedUntil = 0;
        strikes = 0;
        suspicion = 0;
      }
    };
  }

  window.WorkGuard = { create };
})();
