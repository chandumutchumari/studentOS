/* StudentOS — app logic */
(() => {
  const LS_KEY = 'studentos:v1';
  const state = load();

  function load() {
    try {
      const raw = JSON.parse(localStorage.getItem(LS_KEY) || '{}');
      return {
        tasks: raw.tasks || [],
        goals: raw.goals || [],
        prefs: raw.prefs || { theme: 'dark', accent: '#7c5cff' },
        focus: raw.focus || { date: today(), minutes: 0 },
        history: raw.history || {}, // {date: completedCount}
        streak: raw.streak || { count: 0, lastDate: null },
      };
    } catch { return { tasks: [], goals: [], prefs: { theme: 'dark', accent: '#7c5cff' }, focus: { date: today(), minutes: 0 }, history: {}, streak: { count: 0, lastDate: null } }; }
  }
  function save() { localStorage.setItem(LS_KEY, JSON.stringify(state)); }
  function today() { return new Date().toISOString().slice(0, 10); }
  function uid() { return Math.random().toString(36).slice(2, 10); }

  // reset focus daily
  if (state.focus.date !== today()) { state.focus = { date: today(), minutes: 0 }; save(); }

  /* ---------- Theme & Prefs ---------- */
  function applyPrefs() {
    document.documentElement.dataset.theme = state.prefs.theme;
    document.documentElement.style.setProperty('--accent', state.prefs.accent);
    // recompute gradient
    document.documentElement.style.setProperty('--grad', `linear-gradient(135deg, ${state.prefs.accent}, var(--accent-2))`);
    document.querySelectorAll('[data-theme-set]').forEach(b => b.classList.toggle('active', b.dataset.themeSet === state.prefs.theme));
    document.querySelectorAll('.swatch').forEach(s => s.classList.toggle('active', s.dataset.accent === state.prefs.accent));
  }
  document.getElementById('themeToggle').onclick = () => {
    state.prefs.theme = state.prefs.theme === 'dark' ? 'light' : 'dark';
    save(); applyPrefs(); rerenderCharts();
  };
  document.querySelectorAll('[data-theme-set]').forEach(b => b.onclick = () => { state.prefs.theme = b.dataset.themeSet; save(); applyPrefs(); rerenderCharts(); });
  document.querySelectorAll('.swatch').forEach(s => s.onclick = () => { state.prefs.accent = s.dataset.accent; save(); applyPrefs(); rerenderCharts(); });

  /* ---------- Routing ---------- */
  const views = document.querySelectorAll('.view');
  function go(route) {
    document.querySelectorAll('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.route === route));
    views.forEach(v => v.classList.toggle('hidden', v.dataset.view !== route));
    if (route === 'analytics') renderAnalytics();
    if (route === 'dashboard') renderDashboard();
    document.querySelector('.sidebar').classList.remove('open');
  }
  document.querySelectorAll('[data-route]').forEach(n => n.addEventListener('click', e => { e.preventDefault(); go(n.dataset.route); }));
  document.getElementById('menuBtn').onclick = () => document.querySelector('.sidebar').classList.toggle('open');

  /* ---------- Modals ---------- */
  const taskModal = document.getElementById('taskModal');
  const goalModal = document.getElementById('goalModal');
  let editingTask = null, editingGoal = null;

  function openTask(t = null) {
    editingTask = t;
    document.getElementById('taskModalTitle').textContent = t ? 'Edit Task' : 'New Task';
    document.getElementById('tTitle').value = t?.title || '';
    document.getElementById('tNotes').value = t?.notes || '';
    document.getElementById('tDue').value = t?.due || '';
    document.getElementById('tPriority').value = t?.priority || 'medium';
    document.getElementById('tCategory').value = t?.category || 'Study';
    taskModal.classList.remove('hidden');
  }
  function openGoal(g = null) {
    editingGoal = g;
    document.getElementById('goalModalTitle').textContent = g ? 'Edit Goal' : 'New Goal';
    document.getElementById('gTitle').value = g?.title || '';
    document.getElementById('gTarget').value = g?.target || 10;
    document.getElementById('gCurrent').value = g?.current || 0;
    document.getElementById('gCategory').value = g?.category || 'Study';
    goalModal.classList.remove('hidden');
  }
  document.querySelectorAll('[data-close]').forEach(el => el.addEventListener('click', () => { taskModal.classList.add('hidden'); goalModal.classList.add('hidden'); }));
  document.querySelectorAll('[data-quick]').forEach(b => b.addEventListener('click', () => { b.dataset.quick === 'task' ? openTask() : openGoal(); }));

  document.getElementById('saveTask').onclick = () => {
    const title = document.getElementById('tTitle').value.trim();
    if (!title) { toast('Title required'); return; }
    const data = {
      title, notes: document.getElementById('tNotes').value.trim(),
      due: document.getElementById('tDue').value,
      priority: document.getElementById('tPriority').value,
      category: document.getElementById('tCategory').value,
    };
    if (editingTask) Object.assign(editingTask, data);
    else state.tasks.unshift({ id: uid(), ...data, done: false, created: Date.now() });
    save(); taskModal.classList.add('hidden'); renderAll(); toast(editingTask ? 'Task updated' : 'Task added');
  };
  document.getElementById('saveGoal').onclick = () => {
    const title = document.getElementById('gTitle').value.trim();
    if (!title) { toast('Title required'); return; }
    const data = {
      title, target: +document.getElementById('gTarget').value || 1,
      current: +document.getElementById('gCurrent').value || 0,
      category: document.getElementById('gCategory').value,
    };
    if (editingGoal) Object.assign(editingGoal, data);
    else state.goals.unshift({ id: uid(), ...data, created: Date.now() });
    save(); goalModal.classList.add('hidden'); renderAll(); toast(editingGoal ? 'Goal updated' : 'Goal added');
  };

  /* ---------- Tasks ---------- */
  function toggleTask(id) {
    const t = state.tasks.find(x => x.id === id);
    if (!t) return;
    t.done = !t.done;
    if (t.done) {
      const d = today();
      state.history[d] = (state.history[d] || 0) + 1;
      updateStreak();
    }
    save(); renderAll();
  }
  function delTask(id) { state.tasks = state.tasks.filter(t => t.id !== id); save(); renderAll(); toast('Task deleted'); }

  function updateStreak() {
    const d = today();
    if (state.streak.lastDate === d) return;
    const y = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    state.streak.count = state.streak.lastDate === y ? state.streak.count + 1 : 1;
    state.streak.lastDate = d;
  }

  function filteredTasks() {
    const q = (document.getElementById('taskSearch')?.value || '').toLowerCase();
    const p = document.getElementById('filterPriority')?.value;
    const c = document.getElementById('filterCategory')?.value;
    const s = document.getElementById('filterStatus')?.value;
    const sort = document.getElementById('sortBy')?.value || 'date';
    let arr = state.tasks.filter(t =>
      (!q || t.title.toLowerCase().includes(q) || (t.notes || '').toLowerCase().includes(q)) &&
      (!p || t.priority === p) && (!c || t.category === c) &&
      (!s || (s === 'done' ? t.done : !t.done))
    );
    const pri = { high: 0, medium: 1, low: 2 };
    if (sort === 'date') arr.sort((a, b) => (a.due || '9999').localeCompare(b.due || '9999'));
    if (sort === 'created') arr.sort((a, b) => b.created - a.created);
    if (sort === 'priority') arr.sort((a, b) => pri[a.priority] - pri[b.priority]);
    return arr;
  }

  function taskHTML(t) {
    const due = t.due ? new Date(t.due).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : 'No due date';
    return `<div class="task ${t.done ? 'done' : ''}" data-id="${t.id}">
      <div class="check ${t.done ? 'checked' : ''}" data-act="toggle"></div>
      <div class="task-body">
        <div class="task-title">${escape(t.title)}</div>
        <div class="task-meta">
          <span class="pill ${t.priority}">${t.priority}</span>
          <span class="pill cat">${t.category}</span>
          <span>📅 ${due}</span>
          ${t.notes ? `<span>· ${escape(t.notes).slice(0, 60)}</span>` : ''}
        </div>
      </div>
      <div class="task-actions">
        <button data-act="edit" title="Edit">✎</button>
        <button data-act="del" title="Delete">🗑</button>
      </div>
    </div>`;
  }
  function escape(s) { return (s || '').replace(/[&<>"]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m])); }

  function renderTasks() {
    const list = document.getElementById('taskList');
    const arr = filteredTasks();
    list.innerHTML = arr.map(taskHTML).join('');
    document.getElementById('emptyTasks').classList.toggle('hidden', state.tasks.length > 0);
    list.classList.toggle('hidden', state.tasks.length === 0);
    list.querySelectorAll('.task').forEach(el => {
      const id = el.dataset.id;
      el.querySelector('[data-act="toggle"]').onclick = () => toggleTask(id);
      el.querySelector('[data-act="edit"]').onclick = () => openTask(state.tasks.find(t => t.id === id));
      el.querySelector('[data-act="del"]').onclick = () => delTask(id);
    });
  }
  ['taskSearch', 'filterPriority', 'filterCategory', 'filterStatus', 'sortBy'].forEach(id => {
    document.getElementById(id).addEventListener('input', renderTasks);
    document.getElementById(id).addEventListener('change', renderTasks);
  });

  /* ---------- Goals ---------- */
  function delGoal(id) { state.goals = state.goals.filter(g => g.id !== id); save(); renderAll(); toast('Goal deleted'); }
  function bumpGoal(id, dir) {
    const g = state.goals.find(x => x.id === id);
    if (!g) return;
    g.current = Math.max(0, Math.min(g.target, g.current + dir));
    save(); renderGoals();
  }
  function renderGoals() {
    const list = document.getElementById('goalList');
    list.innerHTML = state.goals.map(g => {
      const pct = Math.round((g.current / g.target) * 100);
      return `<div class="goal" data-id="${g.id}">
        <div class="goal-top">
          <h4 class="goal-title">${escape(g.title)}</h4>
          <span class="goal-cat">${g.category}</span>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:end">
          <div class="goal-num">${g.current}<span class="small"> / ${g.target}</span></div>
          <div class="goal-pct">${pct}%</div>
        </div>
        <div class="progress"><div class="progress-bar grad" style="width:${pct}%"></div></div>
        <div class="goal-actions">
          <button class="btn ghost" data-act="dec">−</button>
          <button class="btn ghost" data-act="inc">+</button>
          <button class="btn ghost" data-act="edit">Edit</button>
          <button class="btn ghost" data-act="del">Delete</button>
        </div>
      </div>`;
    }).join('');
    document.getElementById('emptyGoals').classList.toggle('hidden', state.goals.length > 0);
    list.classList.toggle('hidden', state.goals.length === 0);
    list.querySelectorAll('.goal').forEach(el => {
      const id = el.dataset.id;
      el.querySelector('[data-act="inc"]').onclick = () => bumpGoal(id, 1);
      el.querySelector('[data-act="dec"]').onclick = () => bumpGoal(id, -1);
      el.querySelector('[data-act="edit"]').onclick = () => openGoal(state.goals.find(g => g.id === id));
      el.querySelector('[data-act="del"]').onclick = () => delGoal(id);
    });
  }

  /* ---------- Dashboard ---------- */
  function animateCount(el, to) {
    const start = +el.textContent || 0;
    const dur = 600, t0 = performance.now();
    function step(t) {
      const p = Math.min(1, (t - t0) / dur);
      el.textContent = Math.round(start + (to - start) * (1 - Math.pow(1 - p, 3)));
      if (p < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  function renderDashboard() {
    const total = state.tasks.length;
    const done = state.tasks.filter(t => t.done).length;
    const pending = total - done;
    const score = total ? Math.round((done / total) * 100) : 0;
    animateCount(document.getElementById('statTotal'), total);
    animateCount(document.getElementById('statDone'), done);
    animateCount(document.getElementById('statPending'), pending);
    animateCount(document.getElementById('statScore'), score);
    document.getElementById('doneBar').style.width = (total ? (done / total) * 100 : 0) + '%';
    document.getElementById('scoreBar').style.width = score + '%';
    document.getElementById('sidebarStreak').textContent = state.streak.count;
    document.getElementById('focusMins').textContent = state.focus.minutes;
    document.getElementById('focusBig').textContent = state.focus.minutes;
    const goal = 120; // 2h daily focus goal
    const pct = Math.min(1, state.focus.minutes / goal);
    document.getElementById('focusArc').style.strokeDashoffset = 427 * (1 - pct);

    // greeting
    const h = new Date().getHours();
    document.getElementById('greetTime').textContent = h < 12 ? 'morning' : h < 18 ? 'afternoon' : 'evening';

    // recent
    const rec = state.tasks.slice(0, 4);
    document.getElementById('recentTasks').innerHTML = rec.length ? rec.map(taskHTML).join('') : `<p class="muted" style="padding:20px;text-align:center">No tasks yet. Create one to get started.</p>`;
    document.querySelectorAll('#recentTasks .task').forEach(el => {
      const id = el.dataset.id;
      el.querySelector('[data-act="toggle"]').onclick = () => toggleTask(id);
      el.querySelector('[data-act="edit"]').onclick = () => openTask(state.tasks.find(t => t.id === id));
      el.querySelector('[data-act="del"]').onclick = () => delTask(id);
    });

    renderWeeklyChart('weeklyChart');
  }

  document.querySelectorAll('[data-focus]').forEach(b => b.onclick = () => {
    const v = +b.dataset.focus;
    state.focus.minutes = Math.max(0, state.focus.minutes + v);
    if (v === -25 && b.textContent.includes('Reset')) state.focus.minutes = 0;
    save(); renderDashboard();
  });

  /* ---------- Charts ---------- */
  let charts = {};
  function chartColors() {
    const cs = getComputedStyle(document.documentElement);
    return {
      text: cs.getPropertyValue('--text-dim').trim(),
      grid: cs.getPropertyValue('--border').trim(),
      accent: cs.getPropertyValue('--accent').trim(),
      accent2: cs.getPropertyValue('--accent-2').trim(),
    };
  }
  function last7() {
    const arr = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000);
      const key = d.toISOString().slice(0, 10);
      arr.push({ label: d.toLocaleDateString(undefined, { weekday: 'short' }), key, val: state.history[key] || 0 });
    }
    return arr;
  }
  function renderWeeklyChart(canvasId) {
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;
    const data = last7();
    const c = chartColors();
    if (charts[canvasId]) charts[canvasId].destroy();
    const grad = ctx.getContext('2d').createLinearGradient(0, 0, 0, 260);
    grad.addColorStop(0, c.accent + 'cc'); grad.addColorStop(1, c.accent + '10');
    charts[canvasId] = new Chart(ctx, {
      type: 'bar',
      data: { labels: data.map(d => d.label), datasets: [{ label: 'Completed', data: data.map(d => d.val), backgroundColor: grad, borderRadius: 8, borderSkipped: false }] },
      options: chartBaseOptions(c),
    });
  }
  function renderAnalytics() {
    const c = chartColors();
    const total = state.tasks.length, done = state.tasks.filter(t => t.done).length;
    document.getElementById('aRate').textContent = total ? Math.round(done / total * 100) : 0;
    document.getElementById('aDone').textContent = done;
    document.getElementById('aGoals').textContent = state.goals.length;
    document.getElementById('aStreak').textContent = state.streak.count;

    if (charts.doughnut) charts.doughnut.destroy();
    charts.doughnut = new Chart(document.getElementById('doughnutChart'), {
      type: 'doughnut',
      data: { labels: ['Completed', 'Pending'], datasets: [{ data: [done, total - done], backgroundColor: [c.accent, c.grid || 'rgba(255,255,255,.08)'], borderWidth: 0, hoverOffset: 8 }] },
      options: { responsive: true, maintainAspectRatio: false, cutout: '70%', plugins: { legend: { labels: { color: c.text, font: { family: 'Inter', size: 12 } } } } },
    });

    if (charts.prod) charts.prod.destroy();
    const data = last7();
    const ctx = document.getElementById('prodChart').getContext('2d');
    const grad = ctx.createLinearGradient(0, 0, 0, 260);
    grad.addColorStop(0, c.accent + '55'); grad.addColorStop(1, c.accent + '00');
    charts.prod = new Chart(document.getElementById('prodChart'), {
      type: 'line',
      data: { labels: data.map(d => d.label), datasets: [{ label: 'Tasks', data: data.map(d => d.val), borderColor: c.accent, backgroundColor: grad, fill: true, tension: .4, pointBackgroundColor: c.accent2, pointRadius: 4, pointHoverRadius: 6, borderWidth: 3 }] },
      options: chartBaseOptions(c),
    });

    renderWeeklyChart('weeklyChart2');
  }
  function chartBaseOptions(c) {
    return {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { backgroundColor: 'rgba(15,15,30,.9)', borderColor: c.accent, borderWidth: 1, padding: 10, cornerRadius: 8 } },
      scales: {
        x: { ticks: { color: c.text, font: { family: 'Inter' } }, grid: { display: false } },
        y: { ticks: { color: c.text, font: { family: 'Inter' }, stepSize: 1 }, grid: { color: c.grid || 'rgba(255,255,255,.06)' }, beginAtZero: true },
      },
    };
  }
  function rerenderCharts() {
    if (!document.querySelector('[data-view="analytics"]').classList.contains('hidden')) renderAnalytics();
    if (!document.querySelector('[data-view="dashboard"]').classList.contains('hidden')) renderWeeklyChart('weeklyChart');
  }

  /* ---------- Reset ---------- */
  document.getElementById('resetData').onclick = () => {
    if (!confirm('Erase all tasks, goals and preferences?')) return;
    localStorage.removeItem(LS_KEY);
    location.reload();
  };

  /* ---------- Global search ---------- */
  document.getElementById('globalSearch').addEventListener('input', e => {
    const v = e.target.value;
    document.getElementById('taskSearch').value = v;
    go('tasks');
    renderTasks();
  });

  /* ---------- Toast ---------- */
  let toastTimer;
  function toast(msg) {
    const el = document.getElementById('toast');
    el.textContent = msg; el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
  }

  /* ---------- Particles ---------- */
  (function particles() {
    const wrap = document.getElementById('particles');
    for (let i = 0; i < 18; i++) {
      const s = document.createElement('span');
      s.style.left = Math.random() * 100 + '%';
      s.style.bottom = '-' + (Math.random() * 30) + 'px';
      s.style.animationDuration = (15 + Math.random() * 20) + 's';
      s.style.animationDelay = (Math.random() * -20) + 's';
      s.style.opacity = (.2 + Math.random() * .4);
      s.style.width = s.style.height = (2 + Math.random() * 3) + 'px';
      wrap.appendChild(s);
    }
  })();

  function renderAll() { renderDashboard(); renderTasks(); renderGoals(); }
  applyPrefs();
  renderAll();
  go('dashboard');
})();
