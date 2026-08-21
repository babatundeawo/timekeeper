/* ============================================================
   Timekeeper — app.js
   Vanilla JS, no build step. Organized by section:
   1. Shared helpers (dom, ring math, audio, toast, storage)
   2. Mode switcher
   3. Clock
   4. Countdown
   5. Stopwatch
   6. Pomodoro
   7. Alarms
   8. PWA install + service worker registration
   9. Boot
   ============================================================ */

(() => {
  'use strict';

  /* ---------- 1. Shared helpers ---------- */

  const $ = (id) => document.getElementById(id);
  const R = 138;
  const CIRC = 2 * Math.PI * R;

  const digitsEl = $('digits');
  const subLabelEl = $('subLabel');
  const ringProgress = $('ringProgress');
  const ringTick = $('ringTick');
  const transportEl = $('transport');
  const startBtn = $('startBtn');
  const resetBtn = $('resetBtn');
  const lapBtn = $('lapBtn');
  const sessionDotsEl = $('sessionDots');
  const toastEl = $('toast');

  ringProgress.style.strokeDasharray = String(CIRC);

  function pad(n) { return String(Math.floor(n)).padStart(2, '0'); }

  function fmtHMS(totalSeconds) {
    const s = Math.max(0, Math.round(totalSeconds));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return h > 0 ? `${pad(h)}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
  }

  function setRing(fraction, colorVar) {
    // fraction: 0 = empty, 1 = full
    const f = Math.min(1, Math.max(0, fraction));
    ringProgress.style.strokeDashoffset = String(CIRC * (1 - f));
    if (colorVar) ringProgress.style.stroke = colorVar;
  }

  function setTick(fraction) {
    const angle = Math.min(1, Math.max(0, fraction)) * 360;
    ringTick.style.transform = `rotate(${angle}deg)`;
  }

  let toastTimer = null;
  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2400);
  }

  const store = {
    get(key, fallback) {
      try {
        const v = localStorage.getItem('tk:' + key);
        return v === null ? fallback : JSON.parse(v);
      } catch { return fallback; }
    },
    set(key, value) {
      try { localStorage.setItem('tk:' + key, JSON.stringify(value)); } catch { /* storage unavailable */ }
    }
  };

  // Self-contained beep via Web Audio API — no external audio asset needed.
  let audioCtx = null;
  function beep({ count = 2, freq = 880, duration = 0.16, gap = 0.12 } = {}) {
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      const now = audioCtx.currentTime;
      for (let i = 0; i < count; i++) {
        const t0 = now + i * (duration + gap);
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0, t0);
        gain.gain.linearRampToValueAtTime(0.22, t0 + 0.02);
        gain.gain.linearRampToValueAtTime(0, t0 + duration);
        osc.connect(gain).connect(audioCtx.destination);
        osc.start(t0);
        osc.stop(t0 + duration + 0.02);
      }
    } catch { /* audio unavailable — visual pulse still signals completion */ }
  }

  function notify(title, body) {
    if ('Notification' in window && Notification.permission === 'granted') {
      try { new Notification(title, { body, icon: 'icons/icon-192.png' }); } catch { /* ignore */ }
    }
  }

  /* ---------- 2. Mode switcher ---------- */

  const modes = ['clock', 'countdown', 'stopwatch', 'pomodoro', 'alarms'];
  const switcherItems = Array.from(document.querySelectorAll('.switcher-item'));
  const indicator = $('switcherIndicator');
  let currentMode = store.get('mode', 'clock');

  function positionIndicator() {
    const active = switcherItems.find(b => b.dataset.mode === currentMode);
    if (!active) return;
    indicator.style.left = active.offsetLeft + 'px';
    indicator.style.width = active.offsetWidth + 'px';
  }

  let previousMode = null;
  function setMode(mode) {
    if (previousMode && controllers[previousMode]) controllers[previousMode].onExit?.();
    previousMode = mode;
    currentMode = mode;
    store.set('mode', mode);

    switcherItems.forEach(b => b.setAttribute('aria-selected', String(b.dataset.mode === mode)));
    document.querySelectorAll('.panel').forEach(p => { p.hidden = p.dataset.panel !== mode; });

    transportEl.hidden = mode === 'clock' || mode === 'alarms';
    lapBtn.hidden = mode !== 'stopwatch';
    sessionDotsEl.hidden = mode !== 'pomodoro';

    // Reset stage visuals to that mode's controller
    controllers[mode].onEnter();
    positionIndicator();
  }

  switcherItems.forEach(btn => btn.addEventListener('click', () => setMode(btn.dataset.mode)));
  window.addEventListener('resize', positionIndicator);

  startBtn.addEventListener('click', () => controllers[currentMode].onStart?.());
  resetBtn.addEventListener('click', () => controllers[currentMode].onReset?.());
  lapBtn.addEventListener('click', () => controllers.stopwatch.onLap());

  /* ---------- 3. Clock ---------- */

  const clock = (() => {
    let raf = null;
    const use24 = { val: store.get('clock24h', false) };
    $('clock24h').checked = use24.val;
    $('clock24h').addEventListener('change', (e) => {
      use24.val = e.target.checked;
      store.set('clock24h', use24.val);
      render();
    });

    function render() {
      const now = new Date();
      let h = now.getHours();
      const m = now.getMinutes();
      const s = now.getSeconds();
      let suffix = '';
      if (!use24.val) {
        suffix = h >= 12 ? ' PM' : ' AM';
        h = h % 12 || 12;
      }
      digitsEl.textContent = `${pad(h)}:${pad(m)}:${pad(s)}${suffix}`;
      subLabelEl.textContent = now.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
      setRing(s / 60, 'var(--brass)');
      setTick(s / 60);
      raf = setTimeout(render, 1000 - now.getMilliseconds());
    }

    return {
      onEnter() {
        digitsEl.classList.remove('pulse');
        render();
      },
      onExit() { clearTimeout(raf); }
    };
  })();

  /* ---------- 4. Countdown ---------- */

  const countdown = (() => {
    const DEFAULT_PRESETS = [5, 10, 15, 25, 45];
    let presets = store.get('countdownPresets', DEFAULT_PRESETS);
    let totalSec = 5 * 60;
    let remainingSec = totalSec;
    let running = false;
    let timer = null;
    let lastTick = null;

    const chipsEl = $('countdownChips');
    const hIn = $('cdHours'), mIn = $('cdMinutes'), sIn = $('cdSeconds');

    function renderChips() {
      chipsEl.innerHTML = '';
      presets.forEach((mins) => {
        const chip = document.createElement('button');
        chip.className = 'chip';
        chip.type = 'button';
        chip.textContent = mins >= 60 ? `${(mins / 60).toFixed(mins % 60 ? 1 : 0)} hr` : `${mins} min`;
        chip.addEventListener('click', () => {
          if (running) return;
          setDuration(mins * 60);
        });
        if (!DEFAULT_PRESETS.includes(mins)) {
          const rm = document.createElement('span');
          rm.className = 'chip-remove';
          rm.textContent = '✕';
          rm.addEventListener('click', (ev) => {
            ev.stopPropagation();
            presets = presets.filter(p => p !== mins);
            store.set('countdownPresets', presets);
            renderChips();
          });
          chip.classList.add('custom');
          chip.appendChild(rm);
        }
        chipsEl.appendChild(chip);
      });
    }

    function setDuration(sec) {
      totalSec = Math.max(1, sec);
      remainingSec = totalSec;
      const h = Math.floor(totalSec / 3600), m = Math.floor((totalSec % 3600) / 60), s = totalSec % 60;
      hIn.value = h; mIn.value = m; sIn.value = s;
      render();
    }

    function readInputs() {
      const h = Math.max(0, Math.min(23, Number(hIn.value) || 0));
      const m = Math.max(0, Math.min(59, Number(mIn.value) || 0));
      const s = Math.max(0, Math.min(59, Number(sIn.value) || 0));
      return h * 3600 + m * 60 + s;
    }

    [hIn, mIn, sIn].forEach(el => el.addEventListener('change', () => {
      if (running) return;
      totalSec = Math.max(1, readInputs());
      remainingSec = totalSec;
      render();
    }));

    $('savePresetBtn').addEventListener('click', () => {
      const sec = readInputs();
      if (sec <= 0) return;
      const mins = Math.round(sec / 60 * 10) / 10;
      if (presets.includes(mins)) { toast('Preset already saved'); return; }
      presets = [...presets, mins].sort((a, b) => a - b);
      store.set('countdownPresets', presets);
      renderChips();
      toast('Preset saved');
    });

    function render() {
      digitsEl.textContent = fmtHMS(remainingSec);
      subLabelEl.textContent = running ? 'Counting down' : 'Ready';
      setRing(remainingSec / totalSec, 'var(--brass)');
      startBtn.textContent = running ? 'Pause' : (remainingSec < totalSec ? 'Resume' : 'Start');
      startBtn.classList.toggle('is-running', running);
    }

    function tick() {
      const now = performance.now();
      const delta = (now - lastTick) / 1000;
      lastTick = now;
      remainingSec = Math.max(0, remainingSec - delta);
      render();
      if (remainingSec <= 0) {
        finish();
      } else {
        timer = requestAnimationFrame(tick);
      }
    }

    function finish() {
      running = false;
      digitsEl.classList.add('pulse');
      subLabelEl.textContent = 'Time\u2019s up';
      beep({ count: 3 });
      notify('Timekeeper', 'Countdown finished');
      startBtn.textContent = 'Start';
      startBtn.classList.remove('is-running');
    }

    return {
      onEnter() {
        if (!running) { totalSec = readInputs() || totalSec; remainingSec = totalSec; }
        digitsEl.classList.remove('pulse');
        renderChips();
        render();
      },
      onExit() { cancelAnimationFrame(timer); },
      onStart() {
        if (remainingSec <= 0) { remainingSec = totalSec = readInputs() || totalSec; }
        digitsEl.classList.remove('pulse');
        running = !running;
        if (running) { lastTick = performance.now(); timer = requestAnimationFrame(tick); }
        else cancelAnimationFrame(timer);
        render();
      },
      onReset() {
        running = false;
        cancelAnimationFrame(timer);
        digitsEl.classList.remove('pulse');
        remainingSec = totalSec = readInputs() || totalSec;
        render();
      }
    };
  })();

  /* ---------- 5. Stopwatch ---------- */

  const stopwatch = (() => {
    let elapsed = 0;
    let running = false;
    let raf = null;
    let lastTick = null;
    let laps = [];
    const lapsList = $('lapsList');

    function renderLaps() {
      lapsList.innerHTML = '';
      if (laps.length === 0) {
        const li = document.createElement('li');
        li.className = 'laps-empty';
        li.textContent = 'No laps yet';
        lapsList.appendChild(li);
        return;
      }
      laps.slice().reverse().forEach((l, i) => {
        const li = document.createElement('li');
        const num = laps.length - i;
        li.innerHTML = `<span>Lap ${num}</span><span>${fmtHMS(l)}</span>`;
        lapsList.appendChild(li);
      });
    }

    function render() {
      digitsEl.textContent = fmtHMS(elapsed);
      subLabelEl.textContent = running ? 'Running' : (elapsed > 0 ? 'Paused' : 'Ready');
      setRing((elapsed % 60) / 60, 'var(--focus-navy)');
      setTick((elapsed % 60) / 60);
      startBtn.textContent = running ? 'Pause' : (elapsed > 0 ? 'Resume' : 'Start');
      startBtn.classList.toggle('is-running', running);
    }

    function tick() {
      const now = performance.now();
      elapsed += (now - lastTick) / 1000;
      lastTick = now;
      render();
      raf = requestAnimationFrame(tick);
    }

    return {
      onEnter() { digitsEl.classList.remove('pulse'); renderLaps(); render(); },
      onExit() { cancelAnimationFrame(raf); },
      onStart() {
        running = !running;
        if (running) { lastTick = performance.now(); raf = requestAnimationFrame(tick); }
        else cancelAnimationFrame(raf);
        render();
      },
      onReset() {
        running = false;
        cancelAnimationFrame(raf);
        elapsed = 0;
        laps = [];
        renderLaps();
        render();
      },
      onLap() {
        if (!running) return;
        laps.push(elapsed);
        renderLaps();
      }
    };
  })();

  /* ---------- 6. Pomodoro ---------- */

  const pomodoro = (() => {
    const PHASES = ['focus', 'short', 'long'];
    const labels = { focus: 'Focus', short: 'Short break', long: 'Long break' };
    let phase = 'focus';
    let round = 1; // 1-indexed within the round cycle
    let totalSec = 25 * 60;
    let remainingSec = totalSec;
    let running = false;
    let timer = null;
    let lastTick = null;

    const focusIn = $('pomoFocus'), shortIn = $('pomoShort'), longIn = $('pomoLong'), roundsIn = $('pomoRounds');
    const saved = store.get('pomoSettings', null);
    if (saved) {
      focusIn.value = saved.focus; shortIn.value = saved.short; longIn.value = saved.long; roundsIn.value = saved.rounds;
    }

    function settings() {
      return {
        focus: Math.max(1, Number(focusIn.value) || 25),
        short: Math.max(1, Number(shortIn.value) || 5),
        long: Math.max(1, Number(longIn.value) || 15),
        rounds: Math.max(1, Number(roundsIn.value) || 4),
      };
    }

    [focusIn, shortIn, longIn, roundsIn].forEach(el => el.addEventListener('change', () => {
      store.set('pomoSettings', settings());
      if (!running) resetPhase();
    }));

    function phaseDuration(p) {
      const s = settings();
      return (p === 'focus' ? s.focus : p === 'short' ? s.short : s.long) * 60;
    }

    function renderDots() {
      const s = settings();
      sessionDotsEl.innerHTML = '';
      for (let i = 1; i <= s.rounds; i++) {
        const dot = document.createElement('span');
        dot.className = 'session-dot';
        if (i < round || (i === round && phase !== 'focus')) dot.classList.add('done');
        if (i === round && phase === 'focus') dot.classList.add('current');
        sessionDotsEl.appendChild(dot);
      }
    }

    function render() {
      digitsEl.textContent = fmtHMS(remainingSec);
      subLabelEl.textContent = `${labels[phase]} \u00b7 round ${round} of ${settings().rounds}`;
      setRing(remainingSec / totalSec, phase === 'focus' ? 'var(--brass)' : 'var(--focus-navy)');
      startBtn.textContent = running ? 'Pause' : (remainingSec < totalSec ? 'Resume' : 'Start');
      startBtn.classList.toggle('is-running', running);
      renderDots();
    }

    function resetPhase() {
      totalSec = phaseDuration(phase);
      remainingSec = totalSec;
      digitsEl.classList.remove('pulse');
      render();
    }

    function advancePhase() {
      const s = settings();
      if (phase === 'focus') {
        phase = (round >= s.rounds) ? 'long' : 'short';
      } else {
        if (phase === 'long') round = 1; else round += 1;
        phase = 'focus';
      }
      resetPhase();
    }

    function tick() {
      const now = performance.now();
      remainingSec = Math.max(0, remainingSec - (now - lastTick) / 1000);
      lastTick = now;
      render();
      if (remainingSec <= 0) {
        running = false;
        digitsEl.classList.add('pulse');
        beep({ count: phase === 'focus' ? 2 : 3, freq: phase === 'focus' ? 740 : 980 });
        notify('Timekeeper', `${labels[phase]} finished`);
        setTimeout(() => { digitsEl.classList.remove('pulse'); advancePhase(); }, 1200);
      } else {
        timer = requestAnimationFrame(tick);
      }
    }

    return {
      onEnter() { digitsEl.classList.remove('pulse'); resetPhase(); },
      onExit() { cancelAnimationFrame(timer); },
      onStart() {
        running = !running;
        if (running) { lastTick = performance.now(); timer = requestAnimationFrame(tick); }
        else cancelAnimationFrame(timer);
        render();
      },
      onReset() {
        running = false;
        cancelAnimationFrame(timer);
        phase = 'focus'; round = 1;
        resetPhase();
      }
    };
  })();

  /* ---------- 7. Alarms ---------- */

  const alarms = (() => {
    let list = store.get('alarms', []); // { id, time:'HH:MM', label, days:[0-6], enabled }
    let selectedDays = new Set();
    let checkTimer = null;
    let lastFiredMinute = null;

    const timeIn = $('alarmTime');
    const labelIn = $('alarmLabel');
    const dayButtons = Array.from(document.querySelectorAll('.day-chip'));
    const listEl = $('alarmsList');

    dayButtons.forEach(btn => btn.addEventListener('click', () => {
      const d = Number(btn.dataset.day);
      if (selectedDays.has(d)) { selectedDays.delete(d); btn.classList.remove('active'); }
      else { selectedDays.add(d); btn.classList.add('active'); }
    }));

    $('addAlarmBtn').addEventListener('click', () => {
      if (!timeIn.value) { toast('Pick a time first'); return; }
      const alarm = {
        id: Date.now(),
        time: timeIn.value,
        label: labelIn.value.trim(),
        days: Array.from(selectedDays).sort(),
        enabled: true,
      };
      list.push(alarm);
      store.set('alarms', list);
      labelIn.value = '';
      selectedDays.clear();
      dayButtons.forEach(b => b.classList.remove('active'));
      render();
      if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission();
      }
      toast('Alarm added');
    });

    function dayName(d) { return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d]; }

    function render() {
      listEl.innerHTML = '';
      if (list.length === 0) {
        const li = document.createElement('li');
        li.className = 'laps-empty';
        li.textContent = 'No alarms set';
        listEl.appendChild(li);
        return;
      }
      list.slice().sort((a, b) => a.time.localeCompare(b.time)).forEach(alarm => {
        const li = document.createElement('li');
        li.className = 'alarm-row' + (alarm.enabled ? '' : ' disabled');

        const info = document.createElement('div');
        info.className = 'alarm-info';
        const t = document.createElement('span');
        t.className = 'alarm-time';
        t.textContent = alarm.time;
        const lbl = document.createElement('span');
        lbl.className = 'alarm-label';
        lbl.textContent = alarm.label || (alarm.days.length ? alarm.days.map(dayName).join(', ') : 'One time');
        info.appendChild(t); info.appendChild(lbl);

        const controls = document.createElement('div');
        controls.className = 'alarm-controls';

        const sw = document.createElement('button');
        sw.className = 'switch' + (alarm.enabled ? ' on' : '');
        sw.type = 'button';
        sw.setAttribute('aria-label', 'Toggle alarm');
        sw.addEventListener('click', () => {
          alarm.enabled = !alarm.enabled;
          store.set('alarms', list);
          render();
        });

        const del = document.createElement('button');
        del.className = 'alarm-delete';
        del.type = 'button';
        del.textContent = '✕';
        del.setAttribute('aria-label', 'Delete alarm');
        del.addEventListener('click', () => {
          list = list.filter(a => a.id !== alarm.id);
          store.set('alarms', list);
          render();
        });

        controls.appendChild(sw);
        controls.appendChild(del);
        li.appendChild(info);
        li.appendChild(controls);
        listEl.appendChild(li);
      });
    }

    function checkAlarms() {
      const now = new Date();
      const key = now.getFullYear() + '-' + now.getMonth() + '-' + now.getDate() + '-' + now.getHours() + '-' + now.getMinutes();
      if (key === lastFiredMinute) return;
      const hhmm = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
      const day = now.getDay();
      list.forEach(alarm => {
        if (!alarm.enabled || alarm.time !== hhmm) return;
        if (alarm.days.length > 0 && !alarm.days.includes(day)) return;
        lastFiredMinute = key;
        beep({ count: 4, freq: 660, gap: 0.18 });
        notify('Timekeeper alarm', alarm.label || 'Alarm');
        toast(`\u23f0 ${alarm.label || 'Alarm'}`);
        if (alarm.days.length === 0) { alarm.enabled = false; store.set('alarms', list); render(); }
      });
    }

    checkTimer = setInterval(checkAlarms, 1000);

    return {
      onEnter() { render(); },
      onExit() { /* keep checking in background */ }
    };
  })();

  /* ---------- Controller registry ---------- */

  const controllers = { clock, countdown, stopwatch, pomodoro, alarms };

  /* ---------- 8. PWA install + service worker ---------- */

  let deferredPrompt = null;
  const installBtn = $('installBtn');

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    installBtn.hidden = false;
  });

  installBtn.addEventListener('click', async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
    installBtn.hidden = true;
  });

  window.addEventListener('appinstalled', () => { installBtn.hidden = true; });

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('service-worker.js').catch(() => { /* offline install still optional */ });
    });
  }

  /* ---------- 9. Boot ---------- */

  document.querySelectorAll('.panel').forEach(p => { p.hidden = p.dataset.panel !== currentMode; });
  setMode(currentMode);
})();
