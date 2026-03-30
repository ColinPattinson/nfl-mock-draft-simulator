const state = {
  teams: [],
  prospects: [],
  drafted: [],
  currentPickIndex: 0,
  draggedPlayerId: null,
  filters: {
    search: '',
    position: 'ALL',
    school: 'ALL'
  }
};

const POSITION_COLOURS = {
  QB: 'position-qb',
  RB: 'position-rb',
  WR: 'position-wr',
  TE: 'position-te',
  OT: 'position-ot',
  IOL: 'position-iol',
  EDGE: 'position-edge',
  DL: 'position-dl',
  LB: 'position-lb',
  'LB/EDGE': 'position-lb-edge',
  CB: 'position-cb',
  S: 'position-s'
};

const els = {};

function cacheElements() {
  els.currentPick = document.getElementById('current-pick');
  els.queue = document.getElementById('pick-queue');
  els.drafted = document.getElementById('drafted-list');
  els.prospectGrid = document.getElementById('prospect-grid');
  els.search = document.getElementById('player-search');
  els.position = document.getElementById('position-filter');
  els.school = document.getElementById('school-filter');
  els.availableCount = document.getElementById('available-count');
  els.draftedCount = document.getElementById('drafted-count');
  els.reset = document.getElementById('reset-draft');
  els.undo = document.getElementById('undo-pick');
}

function showFatalError(message) {
  if (els.prospectGrid) {
    els.prospectGrid.innerHTML = `
      <div class="empty-state">
        <strong>App error</strong><br>
        ${message}
      </div>
    `;
  }
}

async function loadData() {
  try {
    const [teamsRes, prospectsRes] = await Promise.all([
      fetch('./data/teams.json'),
      fetch('./data/prospects.json')
    ]);

    if (!teamsRes.ok) {
      throw new Error(`Could not load teams.json (${teamsRes.status})`);
    }

    if (!prospectsRes.ok) {
      throw new Error(`Could not load prospects.json (${prospectsRes.status})`);
    }

    state.teams = await teamsRes.json();
    state.prospects = await prospectsRes.json();

    renderFilters();
    render();
  } catch (error) {
    console.error(error);
    showFatalError(error.message);
  }
}

function renderFilters() {
  if (!els.position || !els.school) return;

  const positions = ['ALL', ...new Set(state.prospects.map(player => player.position))];
  const schools = ['ALL', ...new Set(state.prospects.map(player => player.school))].sort((a, b) => a.localeCompare(b));

  els.position.innerHTML = positions
    .map(position => `<option value="${position}">${position}</option>`)
    .join('');

  els.school.innerHTML = schools
    .map(school => `<option value="${school}">${school}</option>`)
    .join('');
}

function getCurrentTeam() {
  return state.teams[state.currentPickIndex] || null;
}

function getPositionClass(position) {
  return POSITION_COLOURS[position] || 'position-default';
}

function getAvailableProspects() {
  return state.prospects.filter(player => {
    const matchesSearch = `${player.name} ${player.school} ${player.position}`
      .toLowerCase()
      .includes(state.filters.search.toLowerCase());

    const matchesPosition =
      state.filters.position === 'ALL' || player.position === state.filters.position;

    const matchesSchool =
      state.filters.school === 'ALL' || player.school === state.filters.school;

    return player.status === 'available' && matchesSearch && matchesPosition && matchesSchool;
  });
}

function renderCurrentPick() {
  if (!els.currentPick) return;

  const currentTeam = getCurrentTeam();

  if (!currentTeam) {
    els.currentPick.innerHTML = `
      <div class="current-pick">
        <div class="eyebrow">Round complete</div>
        <h2 class="pick-team">All 32 picks are in</h2>
        <p class="status-line">Use Undo to step back or Reset Draft to start over.</p>
      </div>
    `;
    return;
  }

  els.currentPick.innerHTML = `
    <div class="current-pick">
      <div class="eyebrow">On the clock</div>
      <div class="current-pick-card">
        <img src="${currentTeam.logo}" alt="${currentTeam.short} logo">
        <div>
          <div class="pick-label">Pick ${currentTeam.pick}</div>
          <h2 class="pick-team">${currentTeam.team}</h2>
          <div class="pick-meta">Drag a player here or use Draft now</div>
        </div>
      </div>
      <div class="dropzone" id="draft-dropzone">Drop prospect here to make the pick</div>
      <div class="toolbar">
        <button class="btn btn-secondary" id="skip-to-top">Draft highest ranked available</button>
      </div>
    </div>
  `;

  const dropzone = document.getElementById('draft-dropzone');
  const skipButton = document.getElementById('skip-to-top');

  if (dropzone) {
    dropzone.addEventListener('dragover', event => {
      event.preventDefault();
      dropzone.classList.add('drag-over');
    });

    dropzone.addEventListener('dragleave', () => {
      dropzone.classList.remove('drag-over');
    });

    dropzone.addEventListener('drop', event => {
      event.preventDefault();
      dropzone.classList.remove('drag-over');

      if (state.draggedPlayerId) {
        draftPlayer(state.draggedPlayerId);
      }
    });
  }

  if (skipButton) {
    skipButton.addEventListener('click', () => {
      const best = state.prospects.find(player => player.status === 'available');
      if (best) {
        draftPlayer(best.id);
      }
    });
  }
}

function renderQueue() {
  if (!els.queue) return;

  els.queue.innerHTML = state.teams
    .map((team, index) => {
      const draftedPick = state.drafted.find(item => item.pick === team.pick);

      return `
        <div class="queue-item ${index === state.currentPickIndex ? 'active' : ''}">
          <img src="${team.logo}" alt="${team.short} logo">
          <div>
            <div class="queue-pick">Pick ${team.pick}</div>
            <div class="queue-team">${team.team}</div>
            <div class="queue-pick">${draftedPick ? `Selected: ${draftedPick.player.name}` : 'Awaiting pick'}</div>
          </div>
        </div>
      `;
    })
    .join('');
}

function renderDrafted() {
  if (!els.drafted) return;

  if (state.drafted.length === 0) {
    els.drafted.innerHTML =
      '<div class="empty-state">No picks made yet. Start dragging prospects into the current pick panel.</div>';
    return;
  }

  els.drafted.innerHTML = state.drafted
    .map(item => `
      <div class="drafted-item">
        <img src="${item.team.logo}" alt="${item.team.short} logo">
        <div>
          <div class="drafted-pick">Pick ${item.pick}</div>
          <div class="drafted-team">${item.team.team}</div>
          <div class="drafted-pick">${item.player.name} · ${item.player.position} · ${item.player.school}</div>
        </div>
      </div>
    `)
    .join('');
}

function renderProspects() {
  if (!els.prospectGrid) return;

  const available = getAvailableProspects();

  if (available.length === 0) {
    els.prospectGrid.innerHTML = '<div class="empty-state">No prospects match the current filters.</div>';
    return;
  }

  els.prospectGrid.innerHTML = available
    .map(player => `
      <article class="prospect-card" draggable="true" data-player-id="${player.id}">
        <div class="prospect-content">
          <div class="card-topline">
            <div class="rank-badge">#${player.rank}</div>
            <span class="position-pill ${getPositionClass(player.position)}">${player.position}</span>
          </div>

          <h3 class="prospect-name">${player.name}</h3>

          <div class="prospect-meta">
            <span class="meta-pill">${player.school}</span>
          </div>

          <div class="prospect-school">Available for selection</div>

          <div class="card-actions">
            <button class="btn btn-primary" data-draft-id="${player.id}">Draft now</button>
          </div>
        </div>
      </article>
    `)
    .join('');

  document.querySelectorAll('.prospect-card').forEach(card => {
    card.addEventListener('dragstart', () => {
      state.draggedPlayerId = card.dataset.playerId;
    });

    card.addEventListener('dragend', () => {
      state.draggedPlayerId = null;
    });
  });

  document.querySelectorAll('[data-draft-id]').forEach(button => {
    button.addEventListener('click', () => {
      draftPlayer(button.dataset.draftId);
    });
  });
}

function draftPlayer(playerId) {
  const currentTeam = getCurrentTeam();
  if (!currentTeam) return;

  const player = state.prospects.find(item => item.id === playerId);
  if (!player || player.status !== 'available') return;

  player.status = 'drafted';

  state.drafted.push({
    pick: currentTeam.pick,
    team: currentTeam,
    player
  });

  state.currentPickIndex += 1;
  render();
}

function undoPick() {
  const last = state.drafted.pop();
  if (!last) return;

  const player = state.prospects.find(item => item.id === last.player.id);
  if (player) {
    player.status = 'available';
  }

  state.currentPickIndex = Math.max(0, state.currentPickIndex - 1);
  render();
}

function resetDraft() {
  state.prospects.forEach(player => {
    player.status = 'available';
  });

  state.drafted = [];
  state.currentPickIndex = 0;
  render();
}

function updateStats() {
  if (els.availableCount) {
    const availableCount = state.prospects.filter(player => player.status === 'available').length;
    els.availableCount.textContent = `${availableCount} available`;
  }

  if (els.draftedCount) {
    els.draftedCount.textContent = `${state.drafted.length} drafted`;
  }
}

function render() {
  renderCurrentPick();
  renderQueue();
  renderDrafted();
  renderProspects();
  updateStats();
}

function bindEvents() {
  if (els.search) {
    els.search.addEventListener('input', event => {
      state.filters.search = event.target.value;
      renderProspects();
    });
  }

  if (els.position) {
    els.position.addEventListener('change', event => {
      state.filters.position = event.target.value;
      renderProspects();
    });
  }

  if (els.school) {
    els.school.addEventListener('change', event => {
      state.filters.school = event.target.value;
      renderProspects();
    });
  }

  if (els.undo) {
    els.undo.addEventListener('click', undoPick);
  }

  if (els.reset) {
    els.reset.addEventListener('click', resetDraft);
  }
}

function init() {
  cacheElements();
  bindEvents();
  loadData();
}

document.addEventListener('DOMContentLoaded', init);
