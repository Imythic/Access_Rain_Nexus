/* ── RainUSE Nexus – Frontend Application ───────────────────────────────── */

const API_BASE = 'http://localhost:8000';
const LOGISTICS_BASE = 'http://localhost:8001';

// ── STATE ──────────────────────────────────────────────────────────────────
let allBuildings = [];
let filteredBuildings = [];
let map = null;
let markers = [];
let metricsData = null;

// ── INIT ───────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initMap();
  loadData();
  bindControls();
});

// ── MAP SETUP ──────────────────────────────────────────────────────────────
function initMap() {
  map = L.map('map', {
    center: [38.5, -97.0],
    zoom: 4,
    zoomControl: true,
    attributionControl: false
  });

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 18,
    attribution: '© OpenStreetMap contributors'
  }).addTo(map);
}

// ── DATA LOADING ───────────────────────────────────────────────────────────
async function loadData() {
  showMapLoading(true);
  try {
    const [buildingsRes, metricsRes, statesRes] = await Promise.all([
      fetch(`${API_BASE}/buildings`),
      fetch(`${API_BASE}/metrics`),
      fetch(`${API_BASE}/states`)
    ]);

    if (!buildingsRes.ok || !metricsRes.ok || !statesRes.ok) {
      throw new Error('API response error');
    }

    const buildingsData = await buildingsRes.json();
    metricsData = await metricsRes.json();
    const statesData = await statesRes.json();

    allBuildings = buildingsData.buildings || [];
    filteredBuildings = [...allBuildings];

    populateStateFilter(statesData.states || []);
    updateNavStats();
    renderMetrics(metricsData);
    renderStateRankings(metricsData.top_states || []);
    plotMarkers(filteredBuildings);
    renderTopList(filteredBuildings);
    renderInsights(allBuildings);
    renderScoreChart(allBuildings);
    renderHotLeads(allBuildings);

  } catch (err) {
    console.error('Failed to load data:', err);
    showToast('⚠️ Could not connect to API. Using fallback data.');
    loadFallbackData();
  } finally {
    showMapLoading(false);
  }
}

// ── FALLBACK DATA (if API is offline) ─────────────────────────────────────
async function loadFallbackData() {
  try {
    const res = await fetch('data/buildings_enriched.json');
    const data = await res.json();
    allBuildings = data;
    filteredBuildings = [...allBuildings];
    plotMarkers(filteredBuildings);
    renderTopList(filteredBuildings);
    renderInsights(allBuildings);
    renderScoreChart(allBuildings);
    renderHotLeads(allBuildings);
    updateNavStats();
  } catch (e) {
    console.error('Fallback data also failed:', e);
  }
}

// ── POPULATE CONTROLS ──────────────────────────────────────────────────────
function populateStateFilter(states) {
  const sel = document.getElementById('filter-state');
  states.forEach(s => {
    const opt = document.createElement('option');
    opt.value = s;
    opt.textContent = s;
    sel.appendChild(opt);
  });
}

// ── BIND CONTROLS ─────────────────────────────────────────────────────────
function bindControls() {
  const roofSlider = document.getElementById('filter-roof');
  const viabSlider = document.getElementById('filter-viab');
  const roofVal = document.getElementById('roof-val');
  const viabVal = document.getElementById('viab-val');

  roofSlider.addEventListener('input', () => {
    roofVal.textContent = formatNum(roofSlider.value) + ' sqft';
  });
  viabSlider.addEventListener('input', () => {
    viabVal.textContent = viabSlider.value;
  });

  document.getElementById('apply-filters').addEventListener('click', applyFilters);
  document.getElementById('reset-filters').addEventListener('click', resetFilters);
  document.getElementById('search-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') applyFilters();
  });

  document.getElementById('drawer-close').addEventListener('click', closeDrawer);
  document.getElementById('drawer-overlay').addEventListener('click', closeDrawer);

  document.getElementById('load-logistics').addEventListener('click', loadLogistics);
}

// ── FILTERS ────────────────────────────────────────────────────────────────
function applyFilters() {
  const state = document.getElementById('filter-state').value;
  const minRoof = parseInt(document.getElementById('filter-roof').value);
  const minViab = parseFloat(document.getElementById('filter-viab').value);
  const coolingOnly = document.getElementById('filter-cooling').checked;
  const esgOnly = document.getElementById('filter-esg').checked;
  const search = document.getElementById('search-input').value.toLowerCase();

  filteredBuildings = allBuildings.filter(b => {
    if (state && b.state !== state) return false;
    if (b.roof_size_sqft < minRoof) return false;
    if (b.viability_score < minViab) return false;
    if (coolingOnly && !b.cooling_tower) return false;
    if (esgOnly && b.esg_score < 70) return false;
    if (search && !b.name.toLowerCase().includes(search) && !b.city.toLowerCase().includes(search)) return false;
    return true;
  });

  plotMarkers(filteredBuildings);
  renderTopList(filteredBuildings);
  document.getElementById('visible-count').textContent = filteredBuildings.length;
  showToast(`🔍 Showing ${filteredBuildings.length} buildings`);
}

function resetFilters() {
  document.getElementById('filter-state').value = '';
  document.getElementById('filter-roof').value = 0;
  document.getElementById('filter-viab').value = 0;
  document.getElementById('filter-cooling').checked = false;
  document.getElementById('filter-esg').checked = false;
  document.getElementById('search-input').value = '';
  document.getElementById('roof-val').textContent = '0 sqft';
  document.getElementById('viab-val').textContent = '0';
  filteredBuildings = [...allBuildings];
  plotMarkers(filteredBuildings);
  renderTopList(filteredBuildings);
}

// ── MARKERS ────────────────────────────────────────────────────────────────
function scoreColor(score) {
  if (score >= 70) return { fill: '#4ade80', glow: 'rgba(74,222,128,0.5)' };
  if (score >= 40) return { fill: '#facc15', glow: 'rgba(250,204,21,0.5)' };
  return { fill: '#f87171', glow: 'rgba(248,113,113,0.5)' };
}

function createMarkerIcon(score, large) {
  const c = scoreColor(score);
  const size = large ? 14 : 10;
  const svg = `<svg width="${size+6}" height="${size+6}" xmlns="http://www.w3.org/2000/svg">
    <circle cx="${(size+6)/2}" cy="${(size+6)/2}" r="${size/2+1}" fill="${c.glow}" />
    <circle cx="${(size+6)/2}" cy="${(size+6)/2}" r="${size/2}" fill="${c.fill}" stroke="rgba(255,255,255,0.4)" stroke-width="1"/>
  </svg>`;
  return L.divIcon({
    html: svg,
    className: '',
    iconSize: [size+6, size+6],
    iconAnchor: [(size+6)/2, (size+6)/2]
  });
}

function plotMarkers(buildings) {
  markers.forEach(m => map.removeLayer(m));
  markers = [];

  buildings.forEach(b => {
    const icon = createMarkerIcon(b.viability_score, b.large_roof);
    const marker = L.marker([b.lat, b.lon], { icon });
    marker.bindPopup(buildPopupHTML(b), { maxWidth: 300 });
    marker.on('click', () => {
      setTimeout(() => {
        const btn = document.querySelector('.popup-detail-btn');
        if (btn) {
          btn.onclick = () => { map.closePopup(); openDrawer(b); };
        }
      }, 50);
    });
    marker.addTo(map);
    markers.push(marker);
  });

  document.getElementById('visible-count').textContent = buildings.length;
}

function buildPopupHTML(b) {
  const c = scoreColor(b.viability_score);
  const tagHTML = (b.tags || []).map(t => {
    const cls = t.includes('Hot') ? 'tag-orange' : t.includes('ESG') ? 'tag-green' : t.includes('Tower') ? 'tag-blue' : 'tag-purple';
    return `<span class="popup-tag ${cls}">${t}</span>`;
  }).join('');

  return `<div class="popup-card">
    <div class="popup-header">
      <div>
        <div class="popup-name">${b.name}</div>
        <div class="popup-city">📍 ${b.city}, ${b.state}</div>
      </div>
      <div>
        <div class="popup-viability score-${viabClass(b.viability_score)}" style="background:${c.glow}; color:${c.fill};">${b.viability_score}</div>
        <div style="font-size:9px;text-align:center;color:var(--text-muted);margin-top:2px">SCORE</div>
      </div>
    </div>
    <div class="popup-grid">
      <div class="popup-stat">
        <div class="popup-stat-label">Roof Size</div>
        <div class="popup-stat-val ${b.large_roof ? 'highlight' : ''}">${formatNum(b.roof_size_sqft)} ft²</div>
      </div>
      <div class="popup-stat">
        <div class="popup-stat-label">Cooling Tower</div>
        <div class="popup-stat-val">${b.cooling_tower ? '✅ Yes' : '❌ No'}</div>
      </div>
      <div class="popup-stat">
        <div class="popup-stat-label">CV Confidence</div>
        <div class="popup-stat-val">${b.detection_confidence}%</div>
      </div>
      <div class="popup-stat">
        <div class="popup-stat-label">ESG Score</div>
        <div class="popup-stat-val">${b.esg_score}/100</div>
      </div>
      <div class="popup-stat">
        <div class="popup-stat-label">Water Potential</div>
        <div class="popup-stat-val">${formatGallons(b.water_potential_gallons)}</div>
      </div>
      <div class="popup-stat">
        <div class="popup-stat-label">Annual Savings</div>
        <div class="popup-stat-val">${formatDollar(b.estimated_annual_savings)}</div>
      </div>
    </div>
    <div class="popup-tags">${tagHTML}</div>
    <button class="popup-detail-btn" id="popup-btn-${b.id}">View Full Report →</button>
  </div>`;
}

function viabClass(score) {
  if (score >= 70) return 'green';
  if (score >= 40) return 'yellow';
  return 'red';
}

// ── TOP LIST ───────────────────────────────────────────────────────────────
function renderTopList(buildings) {
  const sorted = [...buildings].sort((a, b) => b.viability_score - a.viability_score).slice(0, 10);
  const container = document.getElementById('top-list');
  document.getElementById('top-count').textContent = sorted.length;

  container.innerHTML = sorted.map((b, i) => `
    <div class="top-item" data-id="${b.id}">
      <div class="top-rank">#${i+1}</div>
      <div>
        <div class="top-name">${b.name}</div>
        <div class="top-loc">${b.city}, ${b.state}</div>
      </div>
      <div class="top-score score-${viabClass(b.viability_score)}">${b.viability_score}</div>
    </div>
  `).join('');

  container.querySelectorAll('.top-item').forEach(el => {
    el.addEventListener('click', () => {
      const b = allBuildings.find(x => x.id === parseInt(el.dataset.id));
      if (b) {
        map.flyTo([b.lat, b.lon], 9, { animate: true, duration: 1 });
        setTimeout(() => {
          const marker = markers.find(m => {
            const ll = m.getLatLng();
            return Math.abs(ll.lat - b.lat) < 0.001 && Math.abs(ll.lng - b.lon) < 0.001;
          });
          if (marker) marker.openPopup();
        }, 1100);
      }
    });
  });
}

// ── METRICS ────────────────────────────────────────────────────────────────
function renderMetrics(data) {
  document.getElementById('m-savings').textContent = formatDollar(data.total_annual_savings);
  document.getElementById('m-water').textContent = formatBig(data.total_water_potential_gallons);
  document.getElementById('m-viab').textContent = data.avg_viability_score.toFixed(1);
  document.getElementById('m-high').textContent = data.high_value_count;
}

function updateNavStats() {
  document.getElementById('nav-total').textContent = allBuildings.length;
  const totalSavings = allBuildings.reduce((s, b) => s + (b.estimated_annual_savings || 0), 0);
  document.getElementById('nav-savings').textContent = formatDollar(totalSavings);
  const hot = allBuildings.filter(b => b.viability_score >= 80 && b.esg_score >= 70).length;
  document.getElementById('nav-hot').textContent = hot;
}

// ── STATE RANKINGS ─────────────────────────────────────────────────────────
function renderStateRankings(states) {
  const container = document.getElementById('state-rankings');
  const maxScore = Math.max(...states.map(s => s.avg_viability));
  container.innerHTML = states.map((s, i) => `
    <div class="state-rank-item">
      <div class="state-code">${s.state}</div>
      <div class="state-info">
        <div class="state-name-label">#${i+1} Top State</div>
        <div class="rank-bar"><div class="rank-bar-fill" style="width:${(s.avg_viability/maxScore*100).toFixed(1)}%"></div></div>
        <div class="state-sub">${s.building_count} buildings • ${formatDollar(s.total_savings)}</div>
      </div>
      <div class="state-score">${s.avg_viability}</div>
    </div>
  `).join('');
}

// ── INSIGHTS ───────────────────────────────────────────────────────────────
function renderInsights(buildings) {
  const tagCounts = {};
  buildings.forEach(b => (b.tags || []).forEach(t => { tagCounts[t] = (tagCounts[t] || 0) + 1; }));

  const insightDefs = [
    { tag: 'Hot Lead', icon: '🔥', desc: 'Score ≥80 AND ESG ≥70', cls: 'tag-orange' },
    { tag: 'High ROI + High ESG', icon: '🌱', desc: 'Strong financial + sustainability profile', cls: 'tag-green' },
    { tag: 'Large Roof + High Rainfall', icon: '☔', desc: 'Maximum water catchment potential', cls: 'tag-blue' },
    { tag: 'Cooling Tower Detected', icon: '🌀', desc: 'CV-detected industrial cooling system', cls: 'tag-purple' },
    { tag: 'Tax Incentive Available', icon: '💰', desc: 'State-level tax program available', cls: 'tag-green' },
    { tag: 'Mega Roof', icon: '🏗️', desc: 'Roof area ≥500,000 sqft', cls: 'tag-blue' },
  ];

  const container = document.getElementById('insights-list');
  container.innerHTML = insightDefs.map(ins => {
    const count = tagCounts[ins.tag] || 0;
    if (count === 0) return '';
    return `<div class="insight-item">
      <div class="insight-tag">
        <span>${ins.icon}</span>
        <span class="popup-tag ${ins.cls}">${ins.tag}</span>
        <span class="insight-count">${count}</span>
      </div>
      <div class="insight-desc">${ins.desc}</div>
    </div>`;
  }).join('');
}

// ── SCORE CHART ────────────────────────────────────────────────────────────
function renderScoreChart(buildings) {
  const bands = [
    { label: '80–100', min: 80, max: 101, color: '#4ade80' },
    { label: '60–79', min: 60, max: 80,  color: '#34d399' },
    { label: '40–59', min: 40, max: 60,  color: '#facc15' },
    { label: '20–39', min: 20, max: 40,  color: '#fb923c' },
    { label: '0–19',  min: 0,  max: 20,  color: '#f87171' },
  ];
  const max = buildings.length;
  const container = document.getElementById('score-chart');
  container.innerHTML = bands.map(band => {
    const count = buildings.filter(b => b.viability_score >= band.min && b.viability_score < band.max).length;
    const pct = max > 0 ? (count / max * 100) : 0;
    return `<div class="chart-row">
      <div class="chart-label">${band.label}</div>
      <div class="chart-bar-wrap">
        <div class="chart-bar" style="width:${pct}%;background:${band.color};"></div>
      </div>
      <div class="chart-count">${count}</div>
    </div>`;
  }).join('');
}

// ── HOT LEADS ──────────────────────────────────────────────────────────────
function renderHotLeads(buildings) {
  const hot = buildings
    .filter(b => b.viability_score >= 75 && b.esg_score >= 65)
    .sort((a, b) => b.viability_score - a.viability_score)
    .slice(0, 6);

  const container = document.getElementById('hot-leads');
  container.innerHTML = hot.map(b => `
    <div class="hot-lead-item" data-id="${b.id}">
      <div class="hot-lead-name">${b.name}</div>
      <div class="hot-lead-meta">
        <span>${b.city}, ${b.state}</span>
        <span class="hot-score">${b.viability_score}</span>
      </div>
    </div>
  `).join('');

  container.querySelectorAll('.hot-lead-item').forEach(el => {
    el.addEventListener('click', () => {
      const b = allBuildings.find(x => x.id === parseInt(el.dataset.id));
      if (b) openDrawer(b);
    });
  });
}

// ── DETAIL DRAWER ──────────────────────────────────────────────────────────
function openDrawer(b) {
  const c = scoreColor(b.viability_score);
  const tagHTML = (b.tags || []).map(t => {
    const cls = t.includes('Hot') ? 'tag-orange' : t.includes('ESG') ? 'tag-green' : t.includes('Tower') ? 'tag-blue' : 'tag-purple';
    return `<span class="popup-tag ${cls}">${t}</span>`;
  }).join('');

  // Score component breakdown
  const rainfall = b.rainfall_inches || 30;
  const wpNorm = Math.min((b.water_potential_gallons || 0) / 5000000 * 100, 100);
  const roiNorm = Math.min((b.roi_percent || 0) / 30 * 100, 100);
  const esgNorm = b.esg_score;
  const confNorm = b.detection_confidence;

  const paybackPct = Math.min((b.payback_years || 10) / 20 * 100, 100);

  document.getElementById('drawer-content').innerHTML = `
    <div class="drawer-title">${b.name}</div>
    <div class="drawer-subtitle">📍 ${b.city}, ${b.state} &nbsp;|&nbsp; 🌧 ${rainfall}" annual rainfall</div>

    <div class="drawer-score-section">
      <div>
        <div class="big-score" style="color:${c.fill};">${b.viability_score}</div>
        <div class="big-score-label">Viability Score</div>
      </div>
      <div class="score-bars">
        ${scoreBarRow('Water Potential', wpNorm, 'fill-water')}
        ${scoreBarRow('Financial ROI', roiNorm, 'fill-roi')}
        ${scoreBarRow('ESG Score', esgNorm, 'fill-esg')}
        ${scoreBarRow('CV Confidence', confNorm, 'fill-conf')}
      </div>
    </div>

    <div class="drawer-section">
      <div class="drawer-section-title">Building Profile</div>
      <div class="drawer-grid">
        <div class="drawer-stat">
          <div class="drawer-stat-label">Roof Size</div>
          <div class="drawer-stat-val ${b.large_roof ? 'yellow' : ''}">${formatNum(b.roof_size_sqft)} ft²</div>
        </div>
        <div class="drawer-stat">
          <div class="drawer-stat-label">Cooling Tower</div>
          <div class="drawer-stat-val">${b.cooling_tower ? '✅ Yes' : '❌ No'}</div>
        </div>
        <div class="drawer-stat">
          <div class="drawer-stat-label">CV Confidence</div>
          <div class="drawer-stat-val blue">${b.detection_confidence}%</div>
        </div>
      </div>
    </div>

    <div class="drawer-section">
      <div class="drawer-section-title">Environmental</div>
      <div class="drawer-grid">
        <div class="drawer-stat">
          <div class="drawer-stat-label">Rainfall</div>
          <div class="drawer-stat-val blue">${rainfall}" / yr</div>
        </div>
        <div class="drawer-stat">
          <div class="drawer-stat-label">Water Potential</div>
          <div class="drawer-stat-val green">${formatGallons(b.water_potential_gallons)}</div>
        </div>
        <div class="drawer-stat">
          <div class="drawer-stat-label">ESG Score</div>
          <div class="drawer-stat-val">${b.esg_score}/100</div>
        </div>
      </div>
    </div>

    <div class="drawer-section">
      <div class="drawer-section-title">Financial Analysis</div>
      <div class="drawer-grid">
        <div class="drawer-stat">
          <div class="drawer-stat-label">Annual Savings</div>
          <div class="drawer-stat-val green">${formatDollar(b.estimated_annual_savings)}</div>
        </div>
        <div class="drawer-stat">
          <div class="drawer-stat-label">Install Cost</div>
          <div class="drawer-stat-val orange">${formatDollar(b.install_cost_estimate)}</div>
        </div>
        <div class="drawer-stat">
          <div class="drawer-stat-label">Annual ROI</div>
          <div class="drawer-stat-val blue">${(b.roi_percent || 0).toFixed(1)}%</div>
        </div>
        <div class="drawer-stat">
          <div class="drawer-stat-label">Water Cost/gal</div>
          <div class="drawer-stat-val">\$${(b.water_cost_per_gal || 0).toFixed(4)}</div>
        </div>
        <div class="drawer-stat">
          <div class="drawer-stat-label">Tax Incentive</div>
          <div class="drawer-stat-val">${b.tax_incentive ? '✅ Yes' : '❌ No'}</div>
        </div>
        <div class="drawer-stat">
          <div class="drawer-stat-label">Sustainability</div>
          <div class="drawer-stat-val">${b.sustainability_priority ? '⭐ Priority' : 'Standard'}</div>
        </div>
      </div>

      <div class="payback-meter">
        <div class="payback-label">Estimated Payback Period</div>
        <div class="payback-track"><div class="payback-fill" style="width:${paybackPct}%"></div></div>
        <div class="payback-val">${b.payback_years} years</div>
      </div>
    </div>

    <div class="drawer-section">
      <div class="drawer-section-title">Tags & Insights</div>
      <div class="popup-tags" style="margin:0;">${tagHTML || '<span style="color:var(--text-muted);font-size:11px;">No special tags</span>'}</div>
    </div>
  `;

  document.getElementById('detail-drawer').classList.remove('hidden');
}

function scoreBarRow(label, pct, cls) {
  return `<div class="score-bar-row">
    <div class="score-bar-label"><span>${label}</span><span>${pct.toFixed(0)}</span></div>
    <div class="score-bar-track"><div class="score-bar-fill ${cls}" style="width:${pct}%"></div></div>
  </div>`;
}

function closeDrawer() {
  document.getElementById('detail-drawer').classList.add('hidden');
}

// ── LOGISTICS ──────────────────────────────────────────────────────────────
async function loadLogistics() {
  const btn = document.getElementById('load-logistics');
  const output = document.getElementById('logistics-output');
  btn.textContent = 'Loading…';
  btn.disabled = true;

  try {
    const res = await fetch(`${LOGISTICS_BASE}/logistics`);
    if (!res.ok) throw new Error('Logistics service unavailable');
    const data = await res.json();

    output.classList.remove('hidden');
    output.innerHTML = `
      <div style="font-size:10px;color:var(--green-400);font-family:var(--font-mono);margin-bottom:8px;">
        ✅ ${data.total_buildings} viable buildings analyzed
      </div>
      ${(data.clusters || []).slice(0,4).map(c => `
        <div class="logistics-cluster">
          <div class="cluster-name"><span>${c.region}</span><span style="color:var(--green-400)">${c.avg_viability_score}</span></div>
          <div class="cluster-meta">${c.buildings ? c.buildings.length : 0} sites • ${formatDollar(c.total_savings)} savings</div>
        </div>
      `).join('')}
    `;
    showToast('🚚 Logistics plan loaded from Go service');
  } catch (err) {
    output.classList.remove('hidden');
    output.innerHTML = `<div style="font-size:10px;color:var(--text-muted);">Logistics service offline. Run: <code style="color:var(--cyan-400)">go run main.go</code> in /logistics</div>`;
  } finally {
    btn.textContent = 'Reload Plan';
    btn.disabled = false;
  }
}

// ── MAP LOADING ────────────────────────────────────────────────────────────
function showMapLoading(show) {
  const existing = document.querySelector('.loading-overlay');
  if (show) {
    if (!existing) {
      const div = document.createElement('div');
      div.className = 'loading-overlay';
      div.innerHTML = '<div class="spinner"></div><span>Loading pipeline data…</span>';
      document.querySelector('.map-container').appendChild(div);
    }
  } else {
    if (existing) existing.remove();
  }
}

// ── TOAST ──────────────────────────────────────────────────────────────────
let toastTimer;
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add('hidden'), 3000);
}

// ── FORMATTERS ─────────────────────────────────────────────────────────────
function formatNum(n) {
  return Number(n).toLocaleString();
}
function formatDollar(n) {
  if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return '$' + (n / 1e3).toFixed(0) + 'K';
  return '$' + n.toFixed(0);
}
function formatGallons(n) {
  if (n >= 1e9) return (n / 1e9).toFixed(1) + 'B gal';
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M gal';
  if (n >= 1e3) return (n / 1e3).toFixed(0) + 'K gal';
  return n + ' gal';
}
function formatBig(n) {
  if (n >= 1e12) return (n / 1e12).toFixed(1) + 'T';
  if (n >= 1e9) return (n / 1e9).toFixed(1) + 'B';
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(0) + 'K';
  return String(n);
}
