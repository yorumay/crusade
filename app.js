const state = {
  data: null,
  selectedPlanetId: null,
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

function armyById(data, id) {
  return byId(data.armies, id);
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

function renderSidebar(data) {
  el("campaign-name").textContent = data.campaign.name;
  el("campaign-subtitle").textContent = data.campaign.subtitle;
  el("campaign-turn").textContent = data.campaign.turnLabel;
  el("world-count").textContent = data.planets.length;
  el("player-count").textContent = data.players.length;

  const factionList = el("faction-list");
  factionList.innerHTML = data.factions.map((faction) => {
    const worlds = data.planets.filter((planet) => determinePlanetStatus(data, planet).factionId === faction.id).length;
    const players = data.players.filter((player) => player.factionId === faction.id).length;
    return `
      <div class="card">
        <h3>${faction.name}</h3>
        <p class="muted">${faction.description}</p>
        <p><span class="stat-label">Players</span><strong>${players}</strong></p>
        <p><span class="stat-label">Controlled Worlds</span><strong>${worlds}</strong></p>
      </div>
    `;
  }).join("");

  const playerList = el("player-list");
  playerList.innerHTML = data.players.map((player) => {
    const faction = factionById(data, player.factionId);
    const army = armyById(data, player.armyId);
    return `
      <div class="card">
        <h3>${player.name}</h3>
        <p class="pill" style="border-color:${faction?.color ?? '#fff'}55">${faction?.name ?? player.factionId}</p>
        <p class="muted">${player.notes || "No notes yet."}</p>
        <p><strong>${army?.name ?? "No army linked"}</strong></p>
      </div>
    `;
  }).join("");

  const armyList = el("army-list");
  armyList.innerHTML = data.armies.map((army) => {
    const playerNames = (army.players || []).map((playerId) => playerById(data, playerId)?.name).filter(Boolean).join(", ");
    return `
      <div class="card">
        <h3>${army.name}</h3>
        <p class="muted">${army.factionKeyword}</p>
        <p><span class="stat-label">Crusade Points</span><strong>${army.crusadePoints}</strong></p>
        <p><span class="stat-label">Supply Limit</span><strong>${army.supplyLimit}</strong></p>
        <p class="muted">${playerNames || "No player linked."}</p>
      </div>
    `;
  }).join("");
}

function renderMap(data) {
  const svg = el("sector-map");
  const width = data.campaign.map.width || 1200;
  const height = data.campaign.map.height || 800;
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

function renderWorldDetails(data, planetId) {
  const planet = byId(data.planets, planetId);
  if (!planet) {
    el("selected-world").classList.add("hidden");
    el("selected-world-empty").classList.remove("hidden");
    return;
  }

  const status = determinePlanetStatus(data, planet);
  const statusFaction = factionById(data, status.factionId);

  el("selected-world-empty").classList.add("hidden");
  el("selected-world").classList.remove("hidden");
  el("world-name").textContent = planet.name;
  el("world-type").textContent = planet.type;
  el("world-description").textContent = planet.description;
  el("world-status").textContent = status.label;
  el("world-value").textContent = planet.strategicValue;
  el("world-coords").textContent = `${planet.x}, ${planet.y}`;
  el("world-lore").textContent = planet.lore || "No lore entered yet.";

  const controllers = el("world-controllers");
  controllers.innerHTML = (planet.occupyingPlayers.length
    ? planet.occupyingPlayers
        .map((playerId) => {
          const player = playerById(data, playerId);
          const army = player ? armyById(data, player.armyId) : null;
          return `<li><strong>${player?.name ?? playerId}</strong><div class="muted">${factionById(data, player?.factionId)?.name ?? "Unknown faction"}${army ? ` · ${army.name}` : ""}</div></li>`;
        })
    : ["<li>None — the world is Neutral.</li>"]
  ).join("");

  const history = el("world-history");
  history.innerHTML = planet.history.length
    ? planet.history.map((entry) => `<div class="card"><strong>Turn ${entry.turn}</strong><p class="muted">${entry.event}</p></div>`).join("")
    : `<div class="card"><p class="muted">No campaign events logged yet.</p></div>`;

  const label = statusFaction ? statusFaction.name : status.label;
  el("world-status").style.color = factionColor(data, status.factionId);
  el("world-type").style.borderColor = `${factionColor(data, status.factionId)}55`;
  el("world-type").textContent = `${planet.type} · ${label}`;
}

function selectPlanet(data, planetId) {
  state.selectedPlanetId = planetId;
  renderWorldDetails(data, planetId);
}

async function init() {
  const response = await fetch("./data/campaign.json");
  if (!response.ok) {
    throw new Error(`Failed to load campaign.json (${response.status})`);
  }
  state.data = await response.json();
  renderSidebar(state.data);
  renderMap(state.data);
  selectPlanet(state.data, state.data.planets[0]?.id);
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
