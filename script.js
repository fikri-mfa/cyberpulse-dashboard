// script.js — Cyberpunk Dashboard (vanilla JS)

// -----------------------------
// Helpers
// -----------------------------
const qs = sel => document.querySelector(sel);
const qsa = sel => Array.from(document.querySelectorAll(sel));
const fmtTime = (d = new Date()) => d.toLocaleTimeString();

// -----------------------------
// Panel navigation
// -----------------------------
const navItems = qsa('.nav-item');
const panels = {
  realtime: qs('#panel-realtime'),
  analytics: qs('#panel-analytics'),
  alerts: qs('#panel-alerts'),
  settings: qs('#panel-settings')
};
const panelTitle = qs('#panel-title');

navItems.forEach(btn => {
  btn.addEventListener('click', () => {
    navItems.forEach(n => n.classList.remove('active'));
    btn.classList.add('active');
    const panel = btn.dataset.panel;
    // update panels
    Object.values(panels).forEach(p => p.classList.remove('active-panel'));
    panels[panel].classList.add('active-panel');
    // update title
    panelTitle.textContent = btn.querySelector('.label').textContent;
    // aria
    navItems.forEach(n => n.setAttribute('aria-pressed', n === btn));
  });
});

// -----------------------------
// Theme & Appearance controls
// -----------------------------
const themeToggle = qs('#themeToggle');
const accentColorInput = qs('#accentColor');
const compactModeInput = qs('#compactMode');

function applyAccent(color) {
  document.documentElement.style.setProperty('--accent', color);
}
function applyCompact(isCompact) {
  document.documentElement.classList.toggle('compact', isCompact);
}

themeToggle.addEventListener('click', () => {
  document.documentElement.classList.toggle('dark');
  themeToggle.classList.toggle('active');
});

// load settings
function loadSettings() {
  const s = JSON.parse(localStorage.getItem('cp-dashboard:v1') || '{}');
  if (s.accent) accentColorInput.value = s.accent;
  if (typeof s.compact === 'boolean') compactModeInput.checked = s.compact;
  if (s.username) qs('#username').value = s.username;
  if (s.apiKey) qs('#apiKey').value = s.apiKey;
  applyAccent(accentColorInput.value);
  applyCompact(compactModeInput.checked);
}
accentColorInput.addEventListener('input', e => applyAccent(e.target.value));
compactModeInput.addEventListener('change', e => applyCompact(e.target.checked));

qs('#saveSettings').addEventListener('click', () => {
  const state = {
    accent: accentColorInput.value,
    compact: compactModeInput.checked,
    username: qs('#username').value,
    apiKey: qs('#apiKey').value
  };
  localStorage.setItem('cp-dashboard:v1', JSON.stringify(state));
  flashMessage('Settings saved');
});

loadSettings();

// small flash helper
function flashMessage(text, ms = 1600) {
  const f = document.createElement('div');
  f.className = 'toast';
  f.textContent = text;
  document.body.appendChild(f);
  setTimeout(() => f.classList.add('visible'), 10);
  setTimeout(() => f.classList.remove('visible'), ms - 300);
  setTimeout(() => f.remove(), ms);
}

// -----------------------------
// Simple canvas line chart (lightweight, no libs)
// -----------------------------
class MiniChart {
  constructor(canvas, options = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.data = options.data || [];
    this.maxPoints = options.maxPoints || 60;
    this.lineColor = options.lineColor || getComputedStyle(document.documentElement).getPropertyValue('--accent') || '#0ff';
    this.bg = options.bg || 'rgba(0,0,0,0)';
    this.padding = 10;
    this.gridColor = 'rgba(255,255,255,0.04)';
    window.addEventListener('resize', () => this.draw());
    this.draw();
  }

  push(value) {
    this.data.push(value);
    if (this.data.length > this.maxPoints) this.data.shift();
    this.draw();
  }

  clear() {
    this.data = [];
    this.draw();
  }

  draw() {
    const c = this.canvas;
    const ctx = this.ctx;
    const w = c.width = c.clientWidth || c.width;
    const h = c.height = c.clientHeight || c.height;
    ctx.clearRect(0, 0, w, h);

    // background
    ctx.fillStyle = this.bg;
    ctx.fillRect(0, 0, w, h);

    if (this.data.length < 2) return;

    const max = Math.max(...this.data) * 1.1;
    const min = Math.min(...this.data) * 0.9;
    const range = (max - min) || 1;

    // grid
    ctx.strokeStyle = this.gridColor;
    ctx.lineWidth = 1;
    const rows = 3;
    for (let i = 0; i <= rows; i++) {
      const y = this.padding + (h - this.padding * 2) * (i / rows);
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); ctx.closePath();
    }

    // path
    ctx.beginPath();
    this.data.forEach((v, i) => {
      const x = (w - this.padding * 2) * (i / (this.maxPoints - 1)) + this.padding;
      const y = h - this.padding - ((v - min) / range) * (h - this.padding * 2);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--accent') || this.lineColor;
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.closePath();

    // fill under curve
    ctx.lineTo(w - this.padding, h - this.padding);
    ctx.lineTo(this.padding, h - this.padding);
    ctx.fillStyle = (getComputedStyle(document.documentElement).getPropertyValue('--accent') || this.lineColor).trim() + '22';
    ctx.fill();
  }
}

// -----------------------------
// Realtime simulation & UI
// -----------------------------
const throughputCanvas = qs('#throughputChart');
const throughputChart = new MiniChart(throughputCanvas, { maxPoints: 60 });
const trafficCanvas = qs('#trafficChart');
const trafficChart = new MiniChart(trafficCanvas, { maxPoints: 60 });

const cpuStat = qs('#cpuStat');
const memStat = qs('#memStat');
const latStat = qs('#latStat');
const throughputTs = qs('#throughput-ts');

let nodes = [];
const nodesList = qs('#nodesList');
const alertsList = qs('#alertsList');
const topSourcesList = qs('#topSources');

function seedNodes(n = 6) {
  nodes = [];
  for (let i = 0; i < n; i++) {
    nodes.push({
      id: `node-${i+1}`,
      name: `NODE-${(100+i).toString(16).toUpperCase()}`,
      status: Math.random() > 0.1 ? 'ok' : 'warn',
      load: Math.round(Math.random()*80)+10
    });
  }
  renderNodes();
}
function renderNodes() {
  nodesList.innerHTML = '';
  nodes.forEach(n => {
    const li = document.createElement('li');
    li.className = 'list-item';
    li.innerHTML = `<div class="node-line">
      <div class="node-id">${n.name}</div>
      <div class="node-meta">${n.load}% <span class="muted">|</span> ${n.status}</div>
    </div>`;
    nodesList.appendChild(li);
  });
}

// alerts
let alerts = [
  {id:1, lvl:'critical', text:'Node NODE-104 unreachable', ts: Date.now() - 1000*60*8},
  {id:2, lvl:'warning', text:'High latency detected', ts: Date.now() - 1000*60*20},
  {id:3, lvl:'info', text:'New node joined: NODE-108', ts: Date.now() - 1000*60*60}
];
function renderAlerts() {
  alertsList.innerHTML = '';
  alerts.forEach(a => {
    const li = document.createElement('li');
    li.className = `alert ${a.lvl}`;
    li.innerHTML = `<div class="left"><strong>${a.text}</strong><div class="muted small">${new Date(a.ts).toLocaleString()}</div></div>
      <div class="right"><button class="btn small dismiss" data-id="${a.id}">Dismiss</button></div>`;
    alertsList.appendChild(li);
  });
  qs('#alerts-badge').textContent = alerts.length;
}
document.addEventListener('click', e => {
  if (e.target.matches('.dismiss')) {
    const id = Number(e.target.dataset.id);
    alerts = alerts.filter(a => a.id !== id);
    renderAlerts();
  }
});

// top sources
let topSources = [
  {name:'192.168.1.12', mb: 120},
  {name:'10.0.0.4', mb: 98},
  {name:'172.16.0.2', mb: 72}
];
function renderTopSources() {
  topSourcesList.innerHTML = '';
  topSources.forEach(s => {
    const li = document.createElement('li');
    li.className = 'list-item small';
    li.innerHTML = `<div class="node-line"><div class="node-id">${s.name}</div><div class="node-meta">${s.mb}MB</div></div>`;
    topSourcesList.appendChild(li);
  });
}

// simulate metric generator
function randomWalk(prev, variance = 6, min = 0, max = 100) {
  const change = (Math.random()-0.5) * variance;
  let nv = prev + change;
  if (nv > max) nv = max;
  if (nv < min) nv = min;
  return Math.round(nv*10)/10;
}

let syntheticThroughput = 40;
let syntheticTraffic = 320;

function tick() {
  // throughput & traffic
  syntheticThroughput = randomWalk(syntheticThroughput, 12, 5, 220);
  syntheticTraffic = randomWalk(syntheticTraffic, 30, 50, 1200);

  throughputChart.push(syntheticThroughput);
  trafficChart.push(syntheticTraffic);

  // system stats
  cpuStat.textContent = Math.round(randomWalk(parseFloat(cpuStat.textContent) || 20, 8, 2, 99)) + '%';
  memStat.textContent = Math.round(randomWalk(parseFloat(memStat.textContent) || 50, 4, 8, 98)) + '%';
  latStat.textContent = Math.round(randomWalk(parseFloat(latStat.textContent) || 12, 6, 1, 500)) + ' ms';

  throughputTs.textContent = fmtTime();

  // occasionally generate alerts or new nodes
  if (Math.random() < 0.03) {
    const id = Date.now();
    const text = Math.random() < 0.5 ? `Spike detected: ${Math.round(syntheticTraffic)} MB/s` : `Node NODE-${100 + Math.floor(Math.random()*20)} high CPU`;
    const lvl = Math.random() < 0.4 ? 'warning' : 'info';
    alerts.unshift({id, lvl, text, ts: Date.now()});
    renderAlerts();
  }
  if (Math.random() < 0.02) {
    // add a new node
    const id = nodes.length + 1;
    nodes.push({
      id: `node-${id}`,
      name: `NODE-${100 + id}`,
      status: 'ok',
      load: Math.round(Math.random()*30)+10
    });
    renderNodes();
  }

  // rotate top sources randomly
  if (Math.random() < 0.12) {
    topSources = topSources.map(s => ({...s, mb: Math.max(1, Math.round(s.mb * (0.8 + Math.random()*0.6)))}))
      .sort((a,b) => b.mb - a.mb);
    renderTopSources();
  }
}

// start loop
seedNodes(6);
renderAlerts();
renderTopSources();

// initial fill for charts
for (let i = 0; i < 18; i++) tick();

// main interval
const mainInterval = setInterval(tick, 1500);

// simulate button
qs('#simulateBtn').addEventListener('click', () => {
  // quick synthetic event
  alerts.unshift({id: Date.now(), lvl: 'critical', text: 'Manual simulation: service degrade', ts: Date.now()});
  renderAlerts();
  flashMessage('Simulated alert injected');
});

// analytics range control (just updates fake data behavior)
qs('#analytics-range').addEventListener('change', e => {
  const val = Number(e.target.value);
  // create a burst of traffic points suitable to range
  for (let i = 0; i < Math.min(60, val*6); i++) {
    trafficChart.push(100 + Math.random() * (val * 4));
  }
  flashMessage(`Range set: ${val === 1 ? '1 hour' : (val === 6 ? '6 hours' : (val === 24 ? '24 hours' : '7 days'))}`);
});

// search (simple filter over nodes and alerts)
qs('#search').addEventListener('input', e => {
  const q = e.target.value.trim().toLowerCase();
  if (!q) {
    renderNodes(); renderAlerts(); renderTopSources();
    return;
  }
  // filter nodes
  nodesList.innerHTML = '';
  nodes.filter(n => n.name.toLowerCase().includes(q)).forEach(n => {
    const li = document.createElement('li');
    li.className = 'list-item';
    li.innerHTML = `<div class="node-line"><div class="node-id">${n.name}</div><div class="node-meta">${n.load}%</div></div>`;
    nodesList.appendChild(li);
  });
  // filter alerts
  alertsList.innerHTML = '';
  alerts.filter(a => a.text.toLowerCase().includes(q)).forEach(a => {
    const li = document.createElement('li');
    li.className = `alert ${a.lvl}`;
    li.innerHTML = `<div><strong>${a.text}</strong><div class="muted small">${new Date(a.ts).toLocaleString()}</div></div>`;
    alertsList.appendChild(li);
  });
  // filter top sources
  topSourcesList.innerHTML = '';
  topSources.filter(s => s.name.toLowerCase().includes(q)).forEach(s => {
    const li = document.createElement('li');
    li.className = 'list-item small';
    li.innerHTML = `<div class="node-line"><div class="node-id">${s.name}</div><div class="node-meta">${s.mb}MB</div></div>`;
    topSourcesList.appendChild(li);
  });
});

// cleanup on page unload
window.addEventListener('beforeunload', () => {
  clearInterval(mainInterval);
});
