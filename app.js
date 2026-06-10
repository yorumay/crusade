const state = {
  data: null,
  selectedEntity: null,
  history: [],
};

const el = (id) => document.getElementById(id);

function byId(items, id) {
  return items.find((item) => item.id === id);
}

function factionById(data, id) {
  return byId(data.factions, id);
}

function playerById(data, id) {
  return byId(data.players, id);
}

function determinePlanetStatus(data, planet) {
  const factionIds = [...new Set(
    planet.occupyingPlayers
      .map((playerId) => playerById(data, playerId))
      .filter(Boolean)
      .map((player) => player.factionId)
  )];

  if (factionIds.length === 0) return { label: "Neutral", factionId: "neutral" };
  if (factionIds.length === 1) {
    const faction = factionById(data, factionIds[0]);
    return { label: faction ? faction.name : factionIds[0], factionId: factionIds[0] };
  }
  return { label: "Contested", factionId: "contested" };
}

function factionColor(data, factionId) {
  if (factionId === "neutral") return "#64748b";
  if (factionId === "contested") return "#a855f7";
  const faction = factionById(data, factionId);
  return faction?.color ?? "#94a3b8";
}

function make(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  if (attrs.className) node.className = attrs.className;
  if (attrs.type) node.type = attrs.type;
  if (attrs.style) node.style.cssText = attrs.style;
  if (attrs.textContent) node.textContent = attrs.textContent;
  if (attrs.html) node.innerHTML = attrs.html;
  Object.entries(attrs).forEach(([key, value]) => {
    if (key === 'className' || key === 'type' || key === 'style' || key === 'textContent' || key === 'html') return;
    node.setAttribute(key, value);
  });
  [].concat(children).flat().forEach((child) => {
    if (!child) return;
    node.appendChild(child);
  });
  return node;
}

function createEntityButton(label, type, id) {
  const button = make('button', { type: 'button', className: 'entity-link', textContent: label });
  button.addEventListener('click', () => selectEntity(type, id, label));
  return button;
}

function formatUnitCount(count) {
  return `${count} unit${count === 1 ? '' : 's'}`;
}

function renderBreadcrumbs(container) {
  if (!state.history.length) return;

  const crumb = make('div', { className: 'breadcrumbs' });
  const backButton = make('button', { type: 'button', className: 'breadcrumb-back', textContent: '← Back' });
  backButton.addEventListener('click', goBack);
  crumb.appendChild(backButton);

  const label = state.history[state.history.length - 1];
  crumb.appendChild(make('span', { textContent: `${label.type.charAt(0).toUpperCase() + label.type.slice(1)}: ${label.label}` }));
  container.appendChild(crumb);
}

function clearDetails() {
  state.selectedEntity = null;
  state.history = [];
  el('details-empty').classList.remove('hidden');
  el('details-content').classList.add('hidden');
  el('details-content').innerHTML = '';
}

function selectEntity(type, id, label, preserveHistory = false) {
  if (!preserveHistory && state.selectedEntity && (state.selectedEntity.type !== type || state.selectedEntity.id !== id)) {
    const currentLabel = state.selectedEntity.label || `${state.selectedEntity.type}:${state.selectedEntity.id}`;
    state.history.push({ ...state.selectedEntity, label: currentLabel });
  }

  state.selectedEntity = { type, id, label };
  renderDetails(state.data);
}

function goBack() {
  if (!state.history.length) return;
  const previous = state.history.pop();
  state.selectedEntity = { type: previous.type, id: previous.id };
  renderDetails(state.data);
}

function renderDetails(data) {
  if (!state.selectedEntity) {
    clearDetails();
    return;
  }

  el('details-empty').classList.add('hidden');
  const content = el('details-content');
  content.classList.remove('hidden');
  content.innerHTML = '';
  renderBreadcrumbs(content);

  const { type, id } = state.selectedEntity;
  if (type === 'planet') {
    renderPlanetDetails(data, id, content);
    return;
  }
  if (type === 'faction') {
    renderFactionDetails(data, id, content);
    return;
  }
  if (type === 'player') {
    renderPlayerDetails(data, id, content);
    return;
  }
  if (type === 'unit') {
    renderUnitDetails(data, id, content);
    return;
  }
}

function renderPlanetDetails(data, planetId, container) {
  const planet = byId(data.planets, planetId);
  if (!planet) return clearDetails();

  const status = determinePlanetStatus(data, planet);
  const statusFaction = factionById(data, status.factionId);

  container.appendChild(make('div', { className: 'panel-heading' }, [
    make('div', {}, [
      make('h2', { textContent: planet.name }),
      make('p', { className: 'muted', textContent: 'Planet information and controlling forces.' }),
    ]),
    make('span', { className: 'pill', textContent: `${planet.type} · ${statusFaction ? statusFaction.name : status.label}` }),
  ]));

  container.appendChild(make('p', { textContent: planet.description }));

  const stats = make('div', { className: 'detail-grid' }, [
    make('div', {}, [make('span', { className: 'stat-label', textContent: 'Status' }), make('strong', { textContent: status.label, style: `color: ${factionColor(data, status.factionId)}` })]),
    make('div', {}, [make('span', { className: 'stat-label', textContent: 'Value' }), make('strong', { textContent: planet.strategicValue })]),
    make('div', {}, [make('span', { className: 'stat-label', textContent: 'Coordinates' }), make('strong', { textContent: `${planet.x}, ${planet.y}` })]),
  ]);
  container.appendChild(stats);

  const factionIds = [...new Set(
    planet.occupyingPlayers
      .map((playerId) => playerById(data, playerId))
      .filter(Boolean)
      .map((player) => player.factionId)
  )];

  container.appendChild(make('h3', { textContent: 'Present Factions' }));
  if (factionIds.length === 0) {
    container.appendChild(make('p', { className: 'muted', textContent: 'No factions are currently present on this world.' }));
  } else {
    factionIds.forEach((factionId) => {
      const faction = factionById(data, factionId);
      container.appendChild(createEntityButton(faction ? faction.name : factionId, 'faction', factionId));
    });
  }

  container.appendChild(make('h3', { textContent: 'Controlling Players' }));
  if (!planet.occupyingPlayers.length) {
    container.appendChild(make('p', { className: 'muted', textContent: 'None — the world is Neutral.' }));
  } else {
    planet.occupyingPlayers.forEach((playerId) => {
      const player = playerById(data, playerId);
      const army = player ? player.army : null;
      const label = player ? `${player.name} · ${factionById(data, player.factionId)?.name ?? 'Unknown'}` : playerId;
      const button = createEntityButton(label, 'player', playerId);
      if (army) {
        button.appendChild(make('div', { className: 'muted', textContent: army.name }));
      }
      if (player) {
        const count = player.units?.length || 0;
        button.appendChild(make('div', { className: 'muted', textContent: formatUnitCount(count) }));
      }
      container.appendChild(button);
    });
  }

  container.appendChild(make('h3', { textContent: 'Lore' }));
  container.appendChild(make('p', { className: 'muted', textContent: planet.lore || 'No lore entered yet.' }));

  container.appendChild(make('h3', { textContent: 'History' }));
  if (planet.history.length) {
    planet.history.forEach((entry) => {
      container.appendChild(make('div', { className: 'card' }, [
        make('strong', { textContent: `Turn ${entry.turn}` }),
        make('p', { className: 'muted', textContent: entry.event }),
      ]));
    });
  } else {
    container.appendChild(make('div', { className: 'card' }, [make('p', { className: 'muted', textContent: 'No campaign events logged yet.' })]));
  }
}

function renderFactionDetails(data, factionId, container) {
  const faction = factionById(data, factionId);
  if (!faction) return clearDetails();

  const worlds = data.planets.filter((planet) => determinePlanetStatus(data, planet).factionId === factionId).length;
  const players = data.players.filter((player) => player.factionId === factionId);
  const totalUnits = players.reduce((sum, player) => sum + (player.units?.length || 0), 0);

  container.appendChild(make('div', { className: 'panel-heading' }, [
    make('div', {}, [
      make('h2', { textContent: faction.name }),
      make('p', { className: 'muted', textContent: faction.description }),
    ]),
    make('span', { className: 'pill', style: `border-color: ${faction.color}55; color: ${faction.color};`, textContent: 'Faction' }),
  ]));

  const stats = make('div', { className: 'detail-grid' }, [
    make('div', {}, [make('span', { className: 'stat-label', textContent: 'Controlled Worlds' }), make('strong', { textContent: worlds })]),
    make('div', {}, [make('span', { className: 'stat-label', textContent: 'Players' }), make('strong', { textContent: players.length })]),
    make('div', {}, [make('span', { className: 'stat-label', textContent: 'Units' }), make('strong', { textContent: totalUnits })]),
  ]);
  container.appendChild(stats);

  container.appendChild(make('h3', { textContent: 'Players' }));
  if (!players.length) {
    container.appendChild(make('p', { className: 'muted', textContent: 'No commanders have joined this faction yet.' }));
  } else {
    players.forEach((player) => {
      const button = createEntityButton(player.name, 'player', player.id);
      const count = player.units?.length || 0;
      button.appendChild(make('div', { className: 'muted', textContent: formatUnitCount(count) }));
      container.appendChild(button);
    });
  }
}

function renderPlayerDetails(data, playerId, container) {
  const player = playerById(data, playerId);
  if (!player) return clearDetails();

  const faction = factionById(data, player.factionId);
  const army = player.army;

  container.appendChild(make('div', { className: 'panel-heading' }, [
    make('div', {}, [
      make('h2', { textContent: player.name }),
      make('p', { className: 'muted', textContent: player.notes || 'No notes yet.' }),
    ]),
    make('span', { className: 'pill', style: `border-color: ${faction?.color ?? '#fff'}55; color: ${faction?.color ?? '#fff'};`, textContent: faction?.name ?? 'Player' }),
  ]));

  container.appendChild(make('h3', { textContent: 'Faction' }));
  if (faction) {
    container.appendChild(createEntityButton(faction.name, 'faction', faction.id));
  }

  if (army) {
    container.appendChild(make('h3', { textContent: 'Army' }));
    container.appendChild(make('div', { className: 'card' }, [
      make('h3', { textContent: army.name }),
      make('p', { className: 'muted', textContent: army.factionKeyword }),
      make('p', { html: `<span class="stat-label">Crusade Points</span><strong>${army.crusadePoints}</strong>` }),
      make('p', { html: `<span class="stat-label">Supply Limit</span><strong>${army.supplyLimit}</strong>` }),
      make('p', { html: `<span class="stat-label">Units</span><strong>${army.units?.length || 0}</strong>` }),
    ]));

    container.appendChild(make('h3', { textContent: 'Units' }));
    if (!army.units.length) {
      container.appendChild(make('p', { className: 'muted', textContent: 'No units are currently listed for this army.' }));
    } else {
      army.units.forEach((unit) => {
        container.appendChild(createEntityButton(`${unit.name} · ${unit.role}`, 'unit', unit.id));
      });
    }
  }
}

function renderUnitDetails(data, unitId, container) {
  let found = null;
  let army = null;
  let player = null;

  data.players.forEach((currentPlayer) => {
    const unit = (currentPlayer.units || []).find((entry) => entry.id === unitId);
    if (unit) {
      found = unit;
      player = currentPlayer;
      army = currentPlayer.army;
    }
  });
  if (!found) return clearDetails();

  container.appendChild(make('div', { className: 'panel-heading' }, [
    make('div', {}, [
      make('h2', { textContent: found.name }),
      make('p', { className: 'muted', textContent: found.role }),
    ]),
    make('span', { className: 'pill', textContent: 'Unit' }),
  ]));

  const stats = make('div', { className: 'detail-grid' }, [
    make('div', {}, [make('span', { className: 'stat-label', textContent: 'Experience' }), make('strong', { textContent: found.xp })]),
    make('div', {}, [make('span', { className: 'stat-label', textContent: 'Battle Honours' }), make('strong', { textContent: found.battleHonours.join(', ') || 'None' })]),
    make('div', {}, [make('span', { className: 'stat-label', textContent: 'Battle Scars' }), make('strong', { textContent: found.battleScars.join(', ') || 'None' })]),
  ]);
  container.appendChild(stats);

  if (player) {
    container.appendChild(make('h3', { textContent: 'Owner' }));
    container.appendChild(createEntityButton(player.name, 'player', player.id));
  }
  if (army) {
    container.appendChild(make('h3', { textContent: 'Army' }));
    container.appendChild(make('div', { className: 'card' }, [
      make('h3', { textContent: army.name }),
      make('p', { className: 'muted', textContent: army.factionKeyword }),
    ]));
  }
}

function renderMap(data) {
  const svg = el("sector-map");
  const width = data.campaign?.map?.width || 1200;
  const height = data.campaign?.map?.height || 800;
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.innerHTML = "";

  const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
  defs.innerHTML = `
    <filter id="glow">
      <feGaussianBlur stdDeviation="4" result="coloredBlur"></feGaussianBlur>
      <feMerge>
        <feMergeNode in="coloredBlur"></feMergeNode>
        <feMergeNode in="SourceGraphic"></feMergeNode>
      </feMerge>
    </filter>
  `;
  svg.appendChild(defs);

  data.spacelanes.forEach((lane) => {
    const a = byId(data.planets, lane.from);
    const b = byId(data.planets, lane.to);
    if (!a || !b) return;
    const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
    line.setAttribute("x1", a.x);
    line.setAttribute("y1", a.y);
    line.setAttribute("x2", b.x);
    line.setAttribute("y2", b.y);
    line.setAttribute("class", "link");
    svg.appendChild(line);
  });

  data.planets.forEach((planet) => {
    const status = determinePlanetStatus(data, planet);
    const color = factionColor(data, status.factionId);
    const node = document.createElementNS("http://www.w3.org/2000/svg", "g");
    node.setAttribute("class", "world-node");
    node.setAttribute("tabindex", "0");
    node.setAttribute("role", "button");
    node.setAttribute("aria-label", `${planet.name}, ${status.label}`);
    node.addEventListener("click", () => selectPlanet(data, planet.id));
    node.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        selectPlanet(data, planet.id);
      }
    });

    const pulse = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    pulse.setAttribute("cx", planet.x);
    pulse.setAttribute("cy", planet.y);
    pulse.setAttribute("r", 16);
    pulse.setAttribute("fill", color);
    pulse.setAttribute("opacity", "0.2");
    pulse.setAttribute("filter", "url(#glow)");

    const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    circle.setAttribute("cx", planet.x);
    circle.setAttribute("cy", planet.y);
    circle.setAttribute("r", 9);
    circle.setAttribute("fill", color);

    const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
    text.setAttribute("x", planet.x + 14);
    text.setAttribute("y", planet.y + 4);
    text.textContent = planet.name;

    node.appendChild(pulse);
    node.appendChild(circle);
    node.appendChild(text);
    svg.appendChild(node);
  });
}

function selectPlanet(data, planetId) {
  selectEntity('planet', planetId);
}

async function loadData() {
  const [campaignResp, factionsResp, playersResp] = await Promise.all([
    fetch('./data/campaign.json'),
    fetch('./data/factions.json'),
    fetch('./data/players.json'),
  ]);

  if (!campaignResp.ok) throw new Error(`Failed to load campaign.json (${campaignResp.status})`);
  if (!factionsResp.ok) throw new Error(`Failed to load factions.json (${factionsResp.status})`);
  if (!playersResp.ok) throw new Error(`Failed to load players.json (${playersResp.status})`);

  const campaign = await campaignResp.json();
  campaign.map = campaign.map || { width: 1200, height: 800, backgroundImage: "", notes: "" };
  const factionsData = await factionsResp.json();
  const playersData = await playersResp.json();
  const players = playersData.players || [];

  await Promise.all(players.map(async (player) => {
    if (!player.unitsFile) {
      player.units = [];
      return;
    }

    const unitsResp = await fetch(`./data/${player.unitsFile}`);
    if (!unitsResp.ok) {
      throw new Error(`Failed to load ${player.unitsFile} (${unitsResp.status})`);
    }
    const unitsData = await unitsResp.json();
    player.units = unitsData.units || [];
  }));

  return {
    campaign,
    factions: factionsData.factions || [],
    players,
    planets: campaign.planets || [],
    spacelanes: campaign.spacelanes || [],
    battleReports: campaign.battleReports || [],
  };
}

function updateHeader(data) {
  el('campaign-name').textContent = data.campaign.name;
  el('campaign-subtitle').textContent = data.campaign.subtitle;
  el('campaign-turn').textContent = data.campaign.turnLabel;
  el('world-count').textContent = data.planets.length;
  el('player-count').textContent = data.players.length;
}

async function init() {
  state.data = await loadData();
  updateHeader(state.data);
  renderMap(state.data);
  clearDetails();
}

init().catch((error) => {
  document.body.innerHTML = `
    <div style="padding:24px; font-family:system-ui, sans-serif; color:#fff; background:#0b1020;">
      <h1>Template failed to load</h1>
      <p>${error.message}</p>
      <p class="muted">Run this from a local web server or GitHub Pages so the JSON file can be fetched.</p>
    </div>
  `;
  console.error(error);
});
