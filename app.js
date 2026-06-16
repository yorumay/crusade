// Change state history tracker from an array to a simple parent pointer string
const state = {
  data: null,
  selectedEntity: null,
  history: [], // Keep for background map compatibility if needed, but we will bypass for details nav
  activeNavFactionId: null 
};

const el = (id) => document.getElementById(id);

// Map transform state and references
let mapTransform = { x: 0, y: 0, k: 1 };
// let mapSvg = null;
// let mapViewport = null;
function byId(items, id) {
  return items.find((item) => item.id === id);
}

function factionById(data, id) {
  return byId(data.factions, id);
}

function playerById(data, id) {
  return byId(data.players, id);
}

function spacelaneById(data, id) {
  return byId(data.spacelanes, id);
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
  
  if (attrs.textContent !== undefined && attrs.textContent !== null) node.textContent = attrs.textContent;
  
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
  // Removed per request to clear the layout clutter
}

function formatImperialDate(dateString) {
  const exactDateMatch = /^\d{4}-\d{2}-\d{2}$/.test(dateString);
  if (exactDateMatch) {
    const parsed = Date.parse(dateString);
    if (!Number.isNaN(parsed)) {
      const date = new Date(parsed);
      const year = date.getUTCFullYear();
      const startOfYear = Date.UTC(year, 0, 1);
      const dayOfYear = Math.floor((date.getTime() - startOfYear) / 86400000) + 1;
      
      // Calculate the year fraction (000-999)
      const segment = Math.max(1, Math.min(1000, Math.round((dayOfYear / 365) * 1000)));
      const imperialYear = year + 40000;
      const millennium = Math.floor(imperialYear / 1000);
      const yearOfMillennium = imperialYear % 1000;
      
      
      return `${String(segment).padStart(3, '0')}${String(yearOfMillennium).padStart(3, '0')}.M${millennium}`;
    }
  }

  const numeric = parseInt(dateString, 10);
  if (!Number.isNaN(numeric) && String(numeric).length === 4) {
    const year = numeric + 40000;
    const millennium = Math.floor(year / 1000);
    const yearOfMillennium = year % 1000;
    return `${String(yearOfMillennium).padStart(3, '0')} M${millennium}`;
  }

  const parsed = Date.parse(dateString);
  if (!Number.isNaN(parsed)) {
    const year = new Date(parsed).getUTCFullYear();
    const imperial = year + 40000;
    const millennium = Math.floor(imperial / 1000);
    const yearOfMillennium = imperial % 1000;
    return `${String(yearOfMillennium).padStart(3, '0')} M${millennium}`;
  }

  return dateString;
}

function findSpacelane(data, spacelaneId) {
  if (!spacelaneId) return null;
  const direct = spacelaneById(data, spacelaneId);
  if (direct) return direct;

  const planetIds = data.planets.map((planet) => planet.id);
  const matched = planetIds.filter((planetId) => spacelaneId.includes(planetId));
  if (matched.length === 2) {
    return data.spacelanes.find((lane) => (lane.from === matched[0] && lane.to === matched[1]) || (lane.from === matched[1] && lane.to === matched[0]));
  }

  return null;
}

function timelineLocationLabel(data, report) {
  if (report.planetId) {
    const planet = byId(data.planets, report.planetId);
    return planet ? planet.name : `${report.planetId}`;
  }
  if (report.spacelaneId) {
    const lane = findSpacelane(data, report.spacelaneId);
    if (lane) {
      const from = byId(data.planets, lane.from);
      const to = byId(data.planets, lane.to);
      return `spacelane ${from?.name || lane.from} ↔ ${to?.name || lane.to}`;
    }
    return `spacelane ${report.spacelaneId}`;
  }
  return report.location || 'unknown location';
}

function timelinePlayerIds(report) {
  if (Array.isArray(report.playerIds) && report.playerIds.length) return report.playerIds;
  const ids = [];
  if (Array.isArray(report.attackerPlayerIds)) ids.push(...report.attackerPlayerIds);
  if (Array.isArray(report.defenderPlayerIds)) ids.push(...report.defenderPlayerIds);
  return ids;
}

function timelineEntriesForPlanet(data, planetId) {
  return (data.timeline || []).filter((entry) => {
    if (entry.planetId === planetId) return true;
    if (entry.spacelaneId) {
      const lane = findSpacelane(data, entry.spacelaneId);
      return lane && (lane.from === planetId || lane.to === planetId);
    }
    return false;
  });
}

function timelineEntriesForPlayer(data, playerId) {
  return data.timeline.filter((entry) => timelinePlayerIds(entry).includes(playerId));
}

function timelineEntriesForFaction(data, factionId) {
  const factionPlayers = data.players.filter((player) => player.factionId === factionId).map((player) => player.id);
  return data.timeline.filter((entry) => timelinePlayerIds(entry).some((id) => factionPlayers.includes(id)));
}

function renderRelatedTimeline(container, title, entries, data) {
  container.appendChild(make('h3', { textContent: title }));
  if (!entries.length) {
    container.appendChild(make('p', { className: 'muted', textContent: 'No timeline entries are linked to this record yet.' }));
    return;
  }

  entries.slice(0, 4).forEach((entry) => {
    const dateLabel = entry.date ? formatImperialDate(entry.date) : 'Unknown date';
    const location = timelineLocationLabel(data, entry);
    
    const players = timelinePlayerIds(entry)
      .map((playerId) => playerById(data, playerId)?.name || playerId)
      .join(', ') || 'Unknown players';
      
    const details = entry.aftermath || entry.mechanics || entry.notes || 'No aftermath details yet.';

    const box = make('div', { className: 'timeline-entry' }, [
      make('div', { className: 'timeline-header' }, [
        make('strong', { textContent: dateLabel }),
        make('span', { className: 'muted', textContent: location }),
      ]),
      make('p', { textContent: players ? `${players} are involved.` : 'Participants are not linked yet.' }),
      make('div', { className: 'timeline-box' }, [
        make('strong', { textContent: 'Summary' }),
        make('p', { textContent: entry.summary || entry.description || 'No summary provided.' }),
      ]),
      make('div', { className: 'timeline-box' }, [
        make('strong', { textContent: 'Details' }),
        make('p', { textContent: details }),
      ]),
    ]);

    if (Array.isArray(entry.unitChanges) && entry.unitChanges.length) {
      const list = make('ul', { className: 'timeline-listbox' });
      entry.unitChanges.forEach((change) => {
        list.appendChild(make('li', { textContent: change }));
      });
      box.appendChild(make('div', { className: 'timeline-box' }, [
        make('strong', { textContent: 'Mechanical changes' }),
        list,
      ]));
    }

    container.appendChild(box);
  });
}

function renderTimeline(data) {
  const list = el('timeline-list');
  if (!list) return;
  list.innerHTML = '';

  const reports = Array.isArray(data.timeline) ? [...data.timeline] : (Array.isArray(data.battleReports) ? [...data.battleReports] : []);
  const parseSortValue = (value) => {
    if (!value) return -Infinity;
    const numeric = parseInt(value, 10);
    if (!Number.isNaN(numeric) && String(numeric).length === 4) {
      return numeric;
    }
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) {
      return new Date(parsed).getUTCFullYear();
    }
    return value;
  };
  reports.sort((a, b) => {
    const aValue = parseSortValue(a.date);
    const bValue = parseSortValue(b.date);
    if (typeof aValue === 'number' && typeof bValue === 'number') {
      return bValue - aValue;
    }
    if (typeof aValue === 'string' && typeof bValue === 'string') {
      return bValue.localeCompare(aValue);
    }
    return 0;
  });

  reports.forEach((report) => {
    const dateLabel = report.date ? formatImperialDate(report.date) : 'Unknown date';
    const location = timelineLocationLabel(data, report);
    const players = timelinePlayerIds(report).map((playerId) => playerById(data, playerId)?.name || playerId).join(', ') || 'Unknown players';

    const entry = make('div', { className: 'timeline-entry' }, [
      make('div', { className: 'timeline-header' }, [
        make('strong', { textContent: dateLabel }),
        make('span', { className: 'muted', textContent: `Location: ${location}` }),
      ]),
      make('p', { textContent: players ? `${players} are involved in this event.` : 'Participants are not linked yet.' }),
      make('div', { className: 'timeline-box' }, [
        make('strong', { textContent: 'Summary' }),
        make('p', { textContent: report.summary || report.description || 'No summary provided.' }),
      ]),
    ]);

    if (report.aftermath || report.mechanics || report.notes) {
      entry.appendChild(make('div', { className: 'timeline-box' }, [
        make('strong', { textContent: 'Aftermath' }),
        make('p', { textContent: report.aftermath || report.mechanics || report.notes }),
      ]));
    }

    if (Array.isArray(report.unitChanges) && report.unitChanges.length) {
      const listbox = make('ul', { className: 'timeline-listbox' });
      report.unitChanges.forEach((change) => {
        listbox.appendChild(make('li', { textContent: change }));
      });
      entry.appendChild(make('div', { className: 'timeline-box' }, [
        make('strong', { textContent: 'Mechanical changes' }),
        listbox,
      ]));
    }

    list.appendChild(entry);
  });

  if (!reports.length) {
    list.appendChild(make('p', { className: 'muted', textContent: 'No timeline events are available yet.' }));
  }
}

function deselectPlanet() {
  if (!mapSvg) return;
  const prev = mapSvg.querySelector('.world-node.selected');
  if (prev) prev.classList.remove('selected');
}

function clearDetails(data) {
  state.selectedEntity = null;
  state.history = [];
  deselectPlanet();
  
  applyMapVisualFilters(null, null);
  
  el('details-empty').classList.remove('hidden');
  el('details-content').classList.add('hidden');
  el('details-content').innerHTML = '';
  renderTimeline(data || state.data);
}

function selectEntity(type, id, label, preserveHistory = false) {
  state.selectedEntity = { type, id, label };
  applyMapVisualFilters(type, id);
  renderDetails(state.data);
}

function goBack() {
  if (!state.selectedEntity) return;

  const { type, id } = state.selectedEntity;
  const data = state.data;

  // Hierarchical single-level back routing: Unit -> Player -> Faction -> Close
  if (type === 'unit') {
    let parentPlayer = null;
    data.players.forEach((p) => {
      if ((p.units || []).some(u => u.id === id)) parentPlayer = p;
    });
    if (parentPlayer) {
      selectEntity('player', parentPlayer.id, parentPlayer.name);
      return;
    }
  } else if (type === 'player') {
    const player = playerById(data, id);
    const faction = player ? factionById(data, player.factionId) : null;
    if (faction) {
      selectEntity('faction', faction.id, faction.name);
      return;
    }
  } else if (type === 'faction') {
    clearDetails(data);
    return;
  }
  
  // Default fallback for items outside the chain
  clearDetails(data);
}

function renderDetails(data) {
  if (!state.selectedEntity) {
    clearDetails(data);
    return;
  }

  el('details-empty').classList.add('hidden');
  const content = el('details-content');
  content.classList.remove('hidden');
  content.innerHTML = '';

  const { type, id } = state.selectedEntity;

  // --- Strict Single-Level Back Navigation Button ---
  // Only render a back action if the entity belongs strictly to our target hierarchy chain
  if (type === 'faction' || type === 'player' || type === 'unit') {
    let backLabel = '← Back';

    const backButton = make('button', {
      type: 'button',
      className: 'breadcrumb-back',
      textContent: backLabel,
    });
    backButton.addEventListener('click', goBack);
    content.appendChild(backButton);
  }

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

  // ========================================================
  // INTEGRATED FEATURE: Faction Strategic Control Pips Card
  // ========================================================
  const controlValues = planet.controlSteps || { protectors: 0, invaders: 0, despoilers: 0 };
  const trackerCard = make('div', { className: 'control-tracker-card' });
  
  trackerCard.appendChild(make('h4', { 
    textContent: 'Faction Strategic Control', 
    style: 'margin: 0 0 4px 0; font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--text);' 
  }));

  (data.factions || []).forEach(faction => {
    const filledCount = Math.max(0, Math.min(12, controlValues[faction.id] || 0));
    
    const labelRow = make('div', { className: 'control-bar-label' }, [
      make('span', { textContent: faction.name, style: `color: ${faction.color}; font-weight: 600;` }),
      make('span', { className: 'muted', textContent: `${filledCount} / 12 Steps` })
    ]);

    const trackRow = make('div', { className: 'control-steps-track' });

    for (let i = 1; i <= 12; i++) {
      const isFilled = i <= filledCount;
      const pipAttrs = { className: `control-pip ${isFilled ? 'filled' : ''}` };
      
      if (isFilled) {
        pipAttrs.style = `--pip-glow: ${faction.color}; background-color: ${faction.color};`;
      }
      trackRow.appendChild(make('div', pipAttrs));
    }

    trackerCard.appendChild(make('div', { className: 'control-bar-group' }, [labelRow, trackRow]));
  });

  container.appendChild(trackerCard);
  // ========================================================

  container.appendChild(make('hr'));

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

  container.appendChild(make('hr'));

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

  container.appendChild(make('hr'));

  container.appendChild(make('h3', { textContent: 'Lore' }));
  container.appendChild(make('p', { className: 'muted', textContent: planet.lore || 'No lore entered yet.' }));

  container.appendChild(make('hr'));

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

  container.appendChild(make('hr'));

  renderRelatedTimeline(container, 'Related Timeline', timelineEntriesForPlanet(data, planet.id), data);
}

function renderFactionDetails(data, factionId, container) {
  const faction = factionById(data, factionId);
  if (!faction) return clearDetails();

  const players = data.players.filter((player) => player.factionId === factionId);

  // --- Row 1: Centered 80% Width Faction "Cover Art" Banner Box ---
  const coverArtWrapper = make('div', {
    style: `
      display: flex;
      justify-content: center;
      align-items: center;
      width: 80%;
      margin: 0 auto 20px auto;
      padding: 24px;
      background: var(--panel-strong);
      border: 1px solid ${faction.color}33;
      border-radius: 12px;
      box-shadow: inset 0 0 20px ${faction.color}11, 0 10px 30px rgba(0,0,0,0.2);
    `
  }, [
    make('img', { 
      src: `./icons/factions/${faction.id}.svg`, 
      alt: `${faction.name} Crest`,
      style: `
        object-fit: contain;
        filter: drop-shadow(0 0 12px ${faction.color}66);
      `,
      onerror: "this.style.display='none';" 
    })
  ]);
  container.appendChild(coverArtWrapper);

  // --- Row 2: Centered Faction Heading ---
  const headerContainer = make('div', { 
    className: 'panel-heading', 
    style: 'display: block; text-align: center; margin-bottom: 24px;' 
  }, [
    make('h2', { 
      textContent: faction.name, 
      style: `color: ${faction.color}; margin: 0; line-height: 1.2; font-weight: 700; letter-spacing: 0.03em;` 
    })
  ]);
  container.appendChild(headerContainer);

  // --- Row 3: Faction Strategic Note/Manifesto Box ---
  const manifestoBox = make('div', { className: 'card', style: `margin-bottom: 24px; border-color: ${faction.color}33;` }, [
    make('span', { className: 'stat-label', style: 'margin-bottom: 6px;', textContent: 'Strategic Objectives' }),
    make('p', { 
      style: 'margin: 0; font-size: 0.95rem;', 
      textContent: faction.description || 'No campaign directives issued yet.' 
    })
  ]);
  container.appendChild(manifestoBox);

  // --- Row 4: Command Roster (Players & Army Faction Keywords) ---
  container.appendChild(make('h3', { textContent: 'Command Roster' }));
  if (!players.length) {
    container.appendChild(make('p', { className: 'muted', textContent: 'No commanders have joined this alliance yet.' }));
  } else {
    players.forEach((player) => {
      const armyKeyword = player.army ? player.army.factionKeyword : 'Unassigned Order of Battle';
      const buttonLabel = `${player.name} | ${armyKeyword}`;
      
      const button = createEntityButton(buttonLabel, 'player', player.id);
      
      button.querySelectorAll('.muted').forEach(el => el.remove());
      
      container.appendChild(button);
    });
  }

  container.appendChild(make('hr'));

  // --- Row 5: Related Timeline ---
  renderRelatedTimeline(container, 'Related Timeline', timelineEntriesForFaction(data, faction.id), data);
}

function renderPlayerDetails(data, playerId, container) {
  const player = playerById(data, playerId);
  if (!player) return clearDetails();

  const faction = factionById(data, player.factionId);
  const army = player.army;
  const playerUnits = player.units || []; 
  
  // Use faction color if available, fallback to a neutral tint if not assigned
  const themeColor = faction ? faction.color : '#ffffff';

  // --- Row 1: Centered 80% Width Player Army "Cover Art" Banner Box ---
  const coverArtWrapper = make('div', {
    style: `
      display: flex;
      justify-content: center;
      align-items: center;
      width: 80%;
      margin: 0 auto 20px auto;
      padding: 24px;
      background: var(--panel-strong);
      border: 1px solid ${themeColor}33;
      border-radius: 12px;
      box-shadow: inset 0 0 20px ${themeColor}11, 0 10px 30px rgba(0,0,0,0.2);
    `
  }, [
    make('img', { 
      src: army ? `./icons/armies/${army.id}.svg` : `./icons/factions/neutral.svg`, 
      alt: army ? `${army.name} Heraldry` : 'Unassigned Heraldry',
      style: `
        object-fit: contain;
        filter: drop-shadow(0 0 12px ${themeColor}66);
      `,
      onerror: "this.style.display='none';" 
    })
  ]);
  container.appendChild(coverArtWrapper);

  // --- Row 2: Player Name & Army Name (2-Column Grid Configuration) ---
  const identityGrid = make('div', { className: 'detail-grid', style: 'grid-template-columns: repeat(2, 1fr); margin-bottom: 10px;' }, [
    make('div', {}, [
      make('span', { className: 'stat-label', textContent: 'Commander' }), 
      make('strong', { textContent: player.name })
    ]),
    make('div', {}, [
      make('span', { className: 'stat-label', textContent: 'Army Name' }), 
      make('strong', { textContent: army ? army.name : 'Unassigned' })
    ])
  ]);
  container.appendChild(identityGrid);

  // --- Row 3: Faction Keyword & Grand Faction (2-Column Grid Configuration) ---
  const factionGrid = make('div', { className: 'detail-grid', style: 'grid-template-columns: repeat(2, 1fr); margin-top: 0; margin-bottom: 14px;' }, [
    make('div', {}, [
      make('span', { className: 'stat-label', textContent: 'Faction Keyword' }), 
      make('strong', { textContent: army ? army.factionKeyword : 'N/A' })
    ]),
    make('div', { style: faction ? `border-color: ${faction.color}44;` : '' }, [
      make('span', { className: 'stat-label', textContent: 'Campaign Alliance' }), 
      make('strong', { 
        textContent: faction ? faction.name : 'Unknown Alliance',
        style: faction ? `color: ${faction.color};` : ''
      })
    ])
  ]);
  container.appendChild(factionGrid);

  // --- Row 4: Commander's Notes / Logistics Record (Full-Width Card Box) ---
  const notesBox = make('div', { className: 'card', style: 'margin-bottom: 24px;' }, [
    make('span', { className: 'stat-label', style: 'margin-bottom: 6px;', textContent: 'Notes' }),
    make('p', { 
      className: player.notes ? '' : 'muted', 
      style: `margin: 0; font-style: ${player.notes ? 'normal' : 'italic'}; font-size: 0.95rem;`,
      textContent: player.notes || 'No active strategic notes recorded for this commander.' 
    })
  ]);
  container.appendChild(notesBox);

  // --- Row 5: Army Crusade Statistics (The 3-Box Stats Row) ---
  if (army) {
    container.appendChild(make('h3', { textContent: 'Crusade Mechanics' }));
    
    const stats = make('div', { className: 'detail-grid' }, [
      make('div', {}, [make('span', { className: 'stat-label', textContent: 'Crusade Points' }), make('strong', { textContent: army.crusadePoints })]),
      make('div', {}, [make('span', { className: 'stat-label', textContent: 'Supply Limit' }), make('strong', { textContent: army.supplyLimit })]),
      make('div', {}, [make('span', { className: 'stat-label', textContent: 'Total Units' }), make('strong', { textContent: playerUnits.length })])
    ]);
    container.appendChild(stats);

    container.appendChild(make('hr'));

    // --- Row 6: Order of Battle (Units List) ---
    container.appendChild(make('h3', { textContent: 'Order of Battle' }));
    if (!playerUnits.length) { 
      container.appendChild(make('p', { className: 'muted', textContent: 'No units are currently listed for this army.' }));
    } else {
      playerUnits.forEach((unit) => {
        container.appendChild(createEntityButton(`${unit.name} · ${unit.role}`, 'unit', unit.id));
      });
    }
  }

  container.appendChild(make('hr'));

  renderRelatedTimeline(container, 'Related Timeline', timelineEntriesForPlayer(data, player.id), data);
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

  const faction = player ? factionById(data, player.factionId) : null;
  const themeColor = faction ? faction.color : '#ffffff';

  // --- Row 1: Full Width Unit Name Header Box ---
  const nameBox = make('div', {
    className: 'card',
    style: `margin-bottom: 10px; background: var(--panel-strong); border-color: ${themeColor}33; text-align: center; padding: 18px;`
  }, [
    make('h2', { textContent: found.name, style: 'margin: 0; font-size: 1.6rem; letter-spacing: 0.02em;' })
  ]);
  container.appendChild(nameBox);

  // --- Row 2: Full Width Repurposed Datasheet Role Box ---
  const datasheetBox = make('div', {
    className: 'card',
    style: 'margin-bottom: 20px; text-align: center; padding: 10px; background: rgba(255,255,255,0.02);'
  }, [
    make('span', { className: 'stat-label', style: 'margin-bottom: 2px;', textContent: 'Core Datasheet' }),
    make('strong', { textContent: found.role || 'Unspecified Datasheet', style: 'font-size: 1.05rem; color: var(--text);' })
  ]);
  container.appendChild(datasheetBox);

  // --- Calculate Experience Rank & Flair ---
  const xpValue = found.xp || 0;
  let rankLabel = 'Battle-Ready';
  let rankColor = 'rgba(255,255,255,0.4)';
  
  if (xpValue >= 51) {
    rankLabel = 'Legendary ❖';
    rankColor = '#f59e0b'; // Gold
  } else if (xpValue >= 31) {
    rankLabel = 'Heroic ★';
    rankColor = '#ec4899'; // Pink/Purple
  } else if (xpValue >= 16) {
    rankLabel = 'Battle-Hardened';
    rankColor = '#3b82f6'; // Blue
  } else if (xpValue >= 6) {
    rankLabel = 'Blooded';
    rankColor = '#10b981'; // Green
  }

  // --- Row 3: Mechanics Grid (Point Cost, Crusade Points, Experience Points) ---
  const mechanicsGrid = make('div', { className: 'detail-grid', style: 'grid-template-columns: repeat(3, 1fr); margin-bottom: 20px;' }, [
    make('div', {}, [
      make('span', { className: 'stat-label', textContent: 'Point Cost' }), 
      make('strong', { textContent: found.points || '—' })
    ]),
    make('div', {}, [
      make('span', { className: 'stat-label', textContent: 'Crusade Points' }), 
      make('strong', { textContent: found.crusadePoints !== undefined ? found.crusadePoints : '—' })
    ]),
    make('div', { style: `border-color: ${rankColor}55; background: ${rankColor}06;` }, [
      make('span', { className: 'stat-label', textContent: `XP (${rankLabel})` }), 
      make('strong', { textContent: xpValue, style: `color: ${xpValue >= 6 ? rankColor : 'var(--text)'};` })
    ])
  ]);
  container.appendChild(mechanicsGrid);

  // --- Row 4: Equipment & Loadout Record Box ---
  const equipmentBox = make('div', { className: 'card', style: 'margin-bottom: 12px;' }, [
    make('span', { className: 'stat-label', style: 'margin-bottom: 6px;', textContent: 'Wargear & Equipment' }),
    make('p', { 
      className: found.equipment ? '' : 'muted', 
      style: 'margin: 0; font-size: 0.95rem;', 
      textContent: found.equipment || 'Standard baseline package deployment.' 
    })
  ]);
  container.appendChild(equipmentBox);

  // --- Row 5: Enhancements and Upgrades Record Box ---
  const upgradesBox = make('div', { className: 'card', style: 'margin-bottom: 24px;' }, [
    make('span', { className: 'stat-label', style: 'margin-bottom: 6px;', textContent: 'Enhancements & Upgrades' }),
    make('p', { 
      className: found.upgrades ? '' : 'muted', 
      style: 'margin: 0; font-size: 0.95rem;', 
      textContent: found.upgrades || 'No active mechanical modifications.' 
    })
  ]);
  container.appendChild(upgradesBox);

  container.appendChild(make('h3', { textContent: 'Combat Tallies' }));

  // --- Row 6: Performance Metrics (Corrected with commas) ---
  const talliesGrid = make('div', { className: 'detail-grid', style: 'margin-bottom: 24px;' }, [
    make('div', {}, [make('span', { className: 'stat-label', textContent: 'Battles Played' }), make('strong', { textContent: found.play || 0 })]),
    make('div', {}, [make('span', { className: 'stat-label', textContent: 'Battles Survived' }), make('strong', { textContent: found.survive || 0 })]),
    make('div', {}, [make('span', { className: 'stat-label', textContent: 'Enemy Units Destroyed' }), make('strong', { textContent: found.kill || 0 })])
  ]);
  container.appendChild(talliesGrid);

  // --- Row 7: Battle Honours & Battle Scars Split Grid ---
  const traitsGrid = make('div', { className: 'detail-grid', style: 'grid-template-columns: repeat(2, 1fr); gap: 12px; border: none; padding: 0; background: transparent; box-shadow: none;' }, [
    make('div', { style: 'border: 1px solid rgba(16, 185, 129, 0.2); background: rgba(16, 185, 129, 0.02);' }, [
      make('span', { className: 'stat-label', style: 'color: #10b981; margin-bottom: 4px;', textContent: 'Battle Honours' }),
      make('div', { 
        className: found.honours ? '' : 'muted', 
        style: 'font-size: 0.9rem; font-weight: 500; text-align: left; line-height: 1.4;',
        textContent: found.honours || 'None earned yet.'
      })
    ]),
    make('div', { style: 'border: 1px solid rgba(239, 68, 68, 0.2); background: rgba(239, 68, 68, 0.02);' }, [
      make('span', { className: 'stat-label', style: 'color: #ef4444; margin-bottom: 4px;', textContent: 'Battle Scars' }),
      make('div', { 
        className: found.scars ? '' : 'muted', 
        style: 'font-size: 0.9rem; font-weight: 500; text-align: left; line-height: 1.4;',
        textContent: found.scars || 'Clean status record.'
      })
    ])
  ]);
  container.appendChild(traitsGrid);
}

function renderMap(data) {
  console.log('renderMap called', { 
    campaignExists: !!data.campaign,
    mapExists: !!data.campaign?.map,
    backgroundImage: data.campaign?.map?.backgroundImage,
    planets: (data.planets || []).length, 
    spacelanes: (data.spacelanes || []).length 
  });
  const svg = el("sector-map");
  const width = data.campaign?.map?.width;
  const height = data.campaign?.map?.height;
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
    <filter id="drop-shadow" x="-50%" y="-50%" width="200%" height="200%">
      <feDropShadow dx="0" dy="2" stdDeviation="3" flood-opacity="0.5" flood-color="#000000"/>
    </filter>
  `;
  svg.appendChild(defs);

  mapSvg = svg;
  mapViewport = document.createElementNS("http://www.w3.org/2000/svg", "g");
  mapViewport.setAttribute('id', 'viewport');
  svg.appendChild(mapViewport);

  if (data.campaign?.map?.backgroundImage) {
    let imagePath = data.campaign.map.backgroundImage;
    if (!imagePath.startsWith('./') && !imagePath.startsWith('/')) {
      imagePath = `./${imagePath}`;
    }
    const backgroundImage = document.createElementNS("http://www.w3.org/2000/svg", "image");
    backgroundImage.setAttribute('href', imagePath);
    backgroundImage.setAttribute('x', 0);
    backgroundImage.setAttribute('y', 0);
    backgroundImage.setAttribute('width', width);
    backgroundImage.setAttribute('height', height);
    backgroundImage.setAttribute('preserveAspectRatio', 'none');
    backgroundImage.setAttribute('class', 'map-background');
    backgroundImage.setAttribute('pointer-events', 'none');
    console.log('Added background image to viewport:', imagePath);
    mapViewport.appendChild(backgroundImage);
  }

  const backgroundEl = el('map-background');
  if (backgroundEl) {
    backgroundEl.style.backgroundImage = '';
  }

  // Draw spacelanes — width increased by 2x (via direct inline strokeWidth styling value override)
  (data.spacelanes || []).forEach((lane) => {
    const a = byId(data.planets, lane.from);
    const b = byId(data.planets, lane.to);
    if (!a || !b) return;
    const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
    line.setAttribute("x1", a.x);
    line.setAttribute("y1", a.y);
    line.setAttribute("x2", b.x);
    line.setAttribute("y2", b.y);
    line.setAttribute("class", "link");
    line.style.strokeWidth = "4px"; // 2x route width enhancement scale
    mapViewport.appendChild(line);
  });

  // Draw planets with 2x layout scale metrics configured
  (data.planets || []).forEach((planet) => {
    const status = determinePlanetStatus(data, planet);
    const color = factionColor(data, status.factionId);
    const node = document.createElementNS("http://www.w3.org/2000/svg", "g");
    node.setAttribute("class", "world-node");
    node.setAttribute('data-planet-id', planet.id);
    node.setAttribute("tabindex", "0");
    node.setAttribute("role", "button");
    node.setAttribute("aria-label", `${planet.name}, ${status.label}`);
    node.addEventListener("click", (ev) => { console.log('node click', planet.id, ev.target); selectPlanet(data, planet.id); });
    node.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        selectPlanet(data, planet.id);
      }
    });

    const pulse = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    pulse.setAttribute("cx", planet.x);
    pulse.setAttribute("cy", planet.y);
    pulse.setAttribute("r", 32); // Scaled from 16
    pulse.setAttribute("fill", color);
    pulse.setAttribute("opacity", "0.2");
    pulse.setAttribute("filter", "url(#glow)");
    pulse.setAttribute('class', 'world-pulse');
    pulse.setAttribute('pointer-events', 'none');

    const selectionRing = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    selectionRing.setAttribute("cx", planet.x);
    selectionRing.setAttribute("cy", planet.y);
    selectionRing.setAttribute("r", 52); // Scaled from 26
    selectionRing.setAttribute('class', 'world-selection');
    selectionRing.setAttribute('pointer-events', 'none');

    const iconSize = 88; // 2x size enhancement scale from original 44
    const icon = document.createElementNS("http://www.w3.org/2000/svg", "image");
    const typeSlug = `./icons/${String(planet.type || '').toLowerCase().replace(/\s+/g,'-')}.svg`;
    icon.setAttribute('href', typeSlug);
    icon.setAttributeNS('http://www.w3.org/1999/xlink', 'href', typeSlug);
    icon.setAttribute('x', planet.x - iconSize / 2); // Center alignment calculations updated (-44)
    icon.setAttribute('y', planet.y - iconSize / 2);
    icon.setAttribute('width', iconSize);
    icon.setAttribute('height', iconSize);
    icon.setAttribute('class', 'world-icon');
    icon.setAttribute('filter', 'url(#drop-shadow)');
    icon.setAttribute('pointer-events', 'none');
    icon.style.pointerEvents = 'none';

const occupants = (planet.occupyingPlayers || []).map((playerId) => playerById(data, playerId)).filter(Boolean);
    const dotsGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
    dotsGroup.setAttribute('class', 'world-player-dots');
    dotsGroup.setAttribute('pointer-events', 'none');
    
    const playerIconSize = 32; // 2x size enhancement scale from original 16
    const dotGapX = playerIconSize + 6;
    const dotGapY = playerIconSize + 4; // Vertical spacing between rows
    const baseDotY = planet.y - 64;    // The original baseline height for row 1

    // Determine layout configuration based on player count
    const maxIconsPerRow = 5;
    const totalOccupants = occupants.length;
    
    occupants.forEach((player, index) => {
      let rowIndex = 0;
      let colIndex = index;
      let iconsInThisRow = totalOccupants;

      // If we exceed 5 players, split into two rows
      if (totalOccupants > maxIconsPerRow) {
        // Row 0 gets the first 5, Row 1 gets the remainder
        if (index < maxIconsPerRow) {
          rowIndex = 0;
          colIndex = index;
          iconsInThisRow = maxIconsPerRow;
        } else {
          rowIndex = 1;
          colIndex = index - maxIconsPerRow;
          iconsInThisRow = totalOccupants - maxIconsPerRow;
        }
      }

      // Calculate centering offset specifically for this row's icon count
      const rowStartX = planet.x - ((iconsInThisRow - 1) * dotGapX) / 2;
      const currentX = rowStartX + colIndex * dotGapX;
      
      // Row 0 stacks upward (baseDotY - dotGapY), Row 1 sits at baseline (baseDotY)
      // This ensures that if a second row is added, it doesn't clip downward into the planet icon
      const currentY = rowIndex === 0 && totalOccupants > maxIconsPerRow
        ? baseDotY - dotGapY 
        : baseDotY;

      const playerIcon = document.createElementNS("http://www.w3.org/2000/svg", "image");
      const playerIconSrc = player.army?.icon || `./icons/players/${player.id}.svg`;
      playerIcon.setAttribute('href', playerIconSrc);
      playerIcon.setAttributeNS('http://www.w3.org/1999/xlink', 'href', playerIconSrc);
      
      // Position using our multi-row grid math
      playerIcon.setAttribute('x', currentX - playerIconSize / 2);
      playerIcon.setAttribute('y', currentY - playerIconSize / 2);
      
      playerIcon.setAttribute('width', playerIconSize);
      playerIcon.setAttribute('height', playerIconSize);
      playerIcon.setAttribute('class', 'world-player-icon');
      playerIcon.setAttribute('pointer-events', 'all');
      playerIcon.style.pointerEvents = 'all';
      
      playerIcon.addEventListener('click', (ev) => {
        ev.stopPropagation();
        selectEntity('player', player.id, player.name);
      });
      
      playerIcon.setAttribute('opacity', '0.95');
      dotsGroup.appendChild(playerIcon);
    });


    const hit = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    hit.setAttribute("cx", planet.x);
    hit.setAttribute("cy", planet.y);
    hit.setAttribute("r", 42); // Expanded interaction landing map size from 21
    hit.setAttribute("fill", "transparent");
    hit.setAttribute('pointer-events', 'all');
    hit.addEventListener('click', () => selectPlanet(data, planet.id));

    const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
    text.setAttribute("x", planet.x);
    text.setAttribute("y", planet.y + 54); // Shifted down labels offset slightly to clear bigger bounds
    text.setAttribute('text-anchor', 'middle');
    text.setAttribute('dominant-baseline', 'hanging');
    text.textContent = planet.name;
    text.setAttribute('class', 'world-label');
    text.setAttribute('pointer-events', 'none');

    node.appendChild(pulse);
    node.appendChild(selectionRing);
    node.appendChild(icon);
    node.appendChild(dotsGroup);
    node.appendChild(hit);
    node.appendChild(text);
    mapViewport.appendChild(node);
  });

  if (!mapTransform || typeof mapTransform.k !== 'number') mapTransform = { x: 0, y: 0, k: 1 };
  clampTransform(svg, mapTransform);
  updateViewportTransform();

  enableMapInteractions(svg);
}

function selectPlanet(data, planetId) {
  deselectPlanet();
  selectEntity('planet', planetId);
  highlightPlanet(planetId);
}

function highlightPlanet(planetId) {
  if (!mapSvg) return;
  const prev = mapSvg.querySelector('.world-node.selected');
  if (prev) prev.classList.remove('selected');
  const node = mapSvg.querySelector(`.world-node[data-planet-id="${planetId}"]`);
  if (node) node.classList.add('selected');
}

function updateViewportTransform() {
  if (!mapViewport) return;
  mapViewport.setAttribute('transform', `translate(${mapTransform.x},${mapTransform.y}) scale(${mapTransform.k})`);
}

function screenToWorld(svg, clientX, clientY) {
  try {
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const ctm = svg.getScreenCTM();
    if (ctm && ctm.inverse) {
      const svgP = pt.matrixTransform(ctm.inverse());
      if (Number.isFinite(svgP.x) && Number.isFinite(svgP.y)) return svgP;
    }
  } catch (err) {}

  const rect = svg.getBoundingClientRect();
  const vb = svg.viewBox.baseVal;
  const x = ((clientX - rect.left) / rect.width) * vb.width + vb.x;
  const y = ((clientY - rect.top) / rect.height) * vb.height + vb.y;
  return { x, y };
}

function clampTransform(svg, t) {
  if (!svg) return;
  const vb = svg.viewBox.baseVal;
  const contentW = vb.width;
  const contentH = vb.height;
  const k = t.k;

  // Measure container layout to adjust bounds for widescreen empty borders
  const rect = svg.getBoundingClientRect();
  let visibleW = contentW;
  
  if (rect.height && rect.width) {
    const containerAspect = rect.width / rect.height;
    const mapAspect = contentW / contentH;
    
    // If screen is wider than the map image aspect ratio
    if (containerAspect > mapAspect) {
      visibleW = containerAspect * contentH;
    }
  }

  // --- X Axis (Left / Right) Edge Collision ---
  if (contentW * k <= visibleW) {
    // Zoomed out: anchor perfectly in the middle of the available space
    t.x = (visibleW - contentW * k) / 2;
  } else {
    // Zoomed in: lock boundaries exactly between the visual limits of the art canvas
    const minX = visibleW - contentW * k;
    const maxX = 0;
    t.x = Math.min(maxX, Math.max(minX, t.x));
  }

  // --- Y Axis (Top / Bottom) Edge Collision ---
  if (contentH * k <= contentH) {
    t.y = (contentH - contentH * k) / 2;
  } else {
    const minY = contentH - contentH * k;
    const maxY = 0;
    t.y = Math.min(maxY, Math.max(minY, t.y));
  }
}

function zoomBy(factor, centerX, centerY) {
  const svg = mapSvg;
  if (!svg) return;
  const S = centerX != null && centerY != null ? { x: centerX, y: centerY } : { x: svg.viewBox.baseVal.width / 2, y: svg.viewBox.baseVal.height / 2 };
  const newK = Math.max(0.3, Math.min(6, mapTransform.k * factor));
  const px = (S.x - mapTransform.x) / mapTransform.k;
  const py = (S.y - mapTransform.y) / mapTransform.k;
  mapTransform.k = newK;
  mapTransform.x = S.x - px * newK;
  mapTransform.y = S.y - py * newK;
  clampTransform(svg, mapTransform);
  updateViewportTransform();
}

function resetMap() {
  mapTransform = { x: 0, y: 0, k: 1 };
  if (mapSvg) clampTransform(mapSvg, mapTransform);
  updateViewportTransform();
}

function enableMapInteractions(svg) {
  if (!svg) return;
  let dragging = false;
  let dragMoved = false;
  
  // Store drag anchors using standard window pixels to isolate the movement delta smoothly
  let startX = 0;
  let startY = 0;
  let startTx = 0;
  let startTy = 0;

  svg.addEventListener('wheel', (e) => {
    e.preventDefault();
    const delta = Math.sign(e.deltaY);
    const zoomFactor = delta > 0 ? 1 / 1.15 : 1.15;
    const newK = Math.max(0.3, Math.min(6, mapTransform.k * zoomFactor));

    const svgPt = screenToWorld(svg, e.clientX, e.clientY);
    const Sx = svgPt.x, Sy = svgPt.y;
    const k = mapTransform.k, tx = mapTransform.x, ty = mapTransform.y;
    const px = (Sx - tx) / k;
    const py = (Sy - ty) / k;
    const newTx = Sx - px * newK;
    const newTy = Sy - py * newK;

    mapTransform.k = newK;
    mapTransform.x = newTx;
    mapTransform.y = newTy;
    clampTransform(svg, mapTransform);
    updateViewportTransform();
  }, { passive: false });

  svg.addEventListener('pointerdown', (e) => {
    const isOnNode = e.target && e.target.closest && e.target.closest('.world-node');
    if (isOnNode) return;
    
    dragging = true;
    dragMoved = false;
    try { svg.setPointerCapture(e.pointerId); } catch (err) {}
    
    // Track standard screen tracking coordinates for the delta tracking mechanics
    startX = e.clientX;
    startY = e.clientY;
    startTx = mapTransform.x;
    startTy = mapTransform.y;
    svg.classList.add('grabbing');
  });

  svg.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    dragMoved = true;
    
    // Calculate basic screen pixel distance changes directly
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    
    // Update structural layout map positioning transforms
    mapTransform.x = startTx + dx;
    mapTransform.y = startTy + dy;
    
    clampTransform(svg, mapTransform);
    updateViewportTransform();
  });

  svg.addEventListener('pointerup', (e) => {
    if (dragging && !dragMoved) {
      const isOnNode = e.target && e.target.closest && e.target.closest('.world-node');
      if (!isOnNode) {
        clearDetails();
      }
    }
    dragging = false;
    try { svg.releasePointerCapture(e.pointerId); } catch (err) {}
    svg.classList.remove('grabbing');
  });
}

async function loadData() {
  const [campaignResp, factionsResp, playersResp, timelineResp] = await Promise.all([
    fetch('./data/campaign.json'),
    fetch('./data/factions.json'),
    fetch('./data/players.json'),
    fetch('./data/timeline.json'),
  ]);

  if (!campaignResp.ok) throw new Error(`Failed to load campaign.json (${campaignResp.status})`);
  if (!factionsResp.ok) throw new Error(`Failed to load factions.json (${factionsResp.status})`);
  if (!playersResp.ok) throw new Error(`Failed to load players.json (${playersResp.status})`);
  if (!timelineResp.ok) throw new Error(`Failed to load timeline.json (${timelineResp.status})`);

  const campaignFile = await campaignResp.json();
  const campaign = campaignFile.campaign || {};
  // campaign.map = campaign.map || { width: 1200, height: 800, backgroundImage: "", notes: "" };
  const factionsData = await factionsResp.json();
  const playersData = await playersResp.json();
  const timelineData = await timelineResp.json();
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
    planets: campaignFile.planets || [],
    spacelanes: campaignFile.spacelanes || [],
    timeline: timelineData.timeline || [],
    battleReports: campaignFile.battleReports || [],
  };
}

function updateHeader(data) {
  const nameEl = el('campaign-name');
  const subtitleEl = el('campaign-subtitle');
  const turnEl = el('campaign-turn');
  const worldCountEl = el('world-count');
  const playerCountEl = el('player-count');

  if (nameEl) nameEl.textContent = data.campaign.name;
  if (subtitleEl) subtitleEl.textContent = data.campaign.subtitle;
  if (turnEl) turnEl.textContent = data.campaign.turnLabel;
  if (worldCountEl) worldCountEl.textContent = data.planets.length;
  if (playerCountEl) playerCountEl.textContent = data.players.length;
}

async function init() {
  state.data = await loadData();
  updateHeader(state.data);
  renderMap(state.data);
  clearDetails();

  renderCampaignNavigationBar(state.data);
  
  clearDetails();
  
  const zin = el('zoom-in');
  const zout = el('zoom-out');
  const zreset = el('zoom-reset');
  if (zin) zin.addEventListener('click', () => zoomBy(1.25));
  if (zout) zout.addEventListener('click', () => zoomBy(1 / 1.25));
  if (zreset) zreset.addEventListener('click', () => resetMap());
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

function applyMapVisualFilters(type, id) {
  const mapElement = el('sector-map');
  if (!mapElement) return;

  mapElement.classList.remove('map-faded-state');
  mapElement.querySelectorAll('.map-highlight-node').forEach(n => n.classList.remove('map-highlight-node'));
  mapElement.querySelectorAll('.map-highlight-link').forEach(l => l.classList.remove('map-highlight-link'));

  if (!type && state.activeNavFactionId) {
    type = 'faction';
    id = state.activeNavFactionId;
  }

  if (!type) return;

  const data = state.data;
  let targetPlanetIds = [];

  if (type === 'planet') {
    mapElement.classList.add('map-faded-state');
    const node = mapElement.querySelector(`.world-node[data-planet-id="${id}"], [id="${id}"]`);
    if (node) node.classList.add('map-highlight-node');
    return;
  }

  if (type === 'player') {
    targetPlanetIds = (data.planets || [])
      .filter(p => p.occupyingPlayers && p.occupyingPlayers.includes(id))
      .map(p => p.id);
  } else if (type === 'faction') {
    const factionPlayers = (data.players || [])
      .filter(p => p.factionId === id)
      .map(p => p.id);
    
    targetPlanetIds = (data.planets || [])
      .filter(p => p.occupyingPlayers && p.occupyingPlayers.some(pid => factionPlayers.includes(pid)))
      .map(p => p.id);
  }

  if (targetPlanetIds.length > 0) {
    mapElement.classList.add('map-faded-state');
    
    targetPlanetIds.forEach(pid => {
      const node = mapElement.querySelector(`.world-node[data-planet-id="${pid}"], [id="${pid}"]`);
      if (node) node.classList.add('map-highlight-node');
    });

    (data.spacelanes || []).forEach((lane, index) => {
      if (targetPlanetIds.includes(lane.from) && targetPlanetIds.includes(lane.to)) {
        const lines = mapElement.querySelectorAll('.link');
        if (lines[index]) lines[index].classList.add('map-highlight-link');
      }
    });
  }
}

function renderCampaignNavigationBar(data) {
  const tabsContainer = el('faction-nav-tabs');
  const linksContainer = el('player-nav-links');
  if (!tabsContainer || !linksContainer) return;

  tabsContainer.innerHTML = '';
  linksContainer.innerHTML = '';

  (data.factions || []).forEach(faction => {
    const tab = document.createElement('button');
    tab.type = 'button';
    tab.className = `faction-tab ${state.activeNavFactionId === faction.id ? 'active' : ''}`;
    tab.textContent = faction.name;
    
    if (state.activeNavFactionId === faction.id) {
      tab.style.color = faction.color;
      tab.style.borderColor = `${faction.color}44`;
    }

    tab.addEventListener('click', (e) => {
      e.stopPropagation();
      if (state.activeNavFactionId === faction.id) {
        state.activeNavFactionId = null;
        clearDetails(data); 
      } else {
        state.activeNavFactionId = faction.id;
        selectEntity('faction', faction.id, faction.name);
      }
      renderCampaignNavigationBar(data);
      applyMapVisualFilters(state.selectedEntity?.type, state.selectedEntity?.id);
    });
    
    tabsContainer.appendChild(tab);
  });

  if (state.activeNavFactionId) {
    linksContainer.classList.add('nav-faded-state');
  } else {
    linksContainer.classList.remove('nav-faded-state');
  }

  (data.players || []).forEach(player => {
    const faction = factionById(data, player.factionId);
    const isMatchingFaction = player.factionId === state.activeNavFactionId;
    
    const pBtn = document.createElement('button');
    pBtn.type = 'button';
    pBtn.className = `player-nav-btn ${isMatchingFaction ? 'nav-highlight-btn' : ''}`;
    pBtn.textContent = player.name;

    if (faction && (!state.activeNavFactionId || isMatchingFaction)) {
      pBtn.style.borderColor = `${faction.color}55`;
    }

    pBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      selectEntity('player', player.id, player.name);
    });

    linksContainer.appendChild(pBtn);
  });
}

