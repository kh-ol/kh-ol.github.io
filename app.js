const AIRTABLE = {
  baseId: "apphFNuhLi1kfaEiG",
  actionsTable: "tblPZgzvRQ7FaRNkN",
  participantsTable: "tblkWgi6deumtD9QK",
  token: window.KH_OL_CONFIG?.airtableToken || "",
  fields: {
    actionId: "fldFY2XbaHB4zfP90",
    activity: "fld2ExglTGs5KBbXT",
    date: "fldMe5Ze53uBEd6nw",
    member: "fldMReCTLPpxMxkCw",
    quantity: "fldYs04VVhKy6mmIW",
    actionType: "fldHEsXbswFQpy6lN",
    participantName: "fldl22aDY1KvcAoPU",
    participantAlias: "fldzgie0hrataHAr7",
    participantType: "fldkNySBtCkeKfXhU",
    participantActions: "fldRCCC3BnooKyKPU"
  }
};

const ACTIVITIES = {
  "Løb": { metricId: "metric-run", unit: "point", multiplier: 1 },
  "Armbøjninger": { metricId: "metric-pushups", unit: "point", multiplier: 1 },
  "Mavebøjninger": { metricId: "metric-situps", unit: "point", multiplier: 1 },
  "Squats": { metricId: "metric-squats", unit: "point", multiplier: 1 }
};

const state = {
  participants: [],
  actions: [],
  activeTab: "members",
  lastLeader: null
};

const els = {
  form: document.querySelector("#entry-form"),
  member: document.querySelector("#member-input"),
  activity: document.querySelector("#activity-input"),
  date: document.querySelector("#date-input"),
  quantity: document.querySelector("#quantity-input"),
  submit: document.querySelector("#submit-button"),
  message: document.querySelector("#form-message"),
  sync: document.querySelector("#sync-status"),
  refresh: document.querySelector("#refresh-button"),
  trainerScore: document.querySelector("#trainer-score"),
  playerScore: document.querySelector("#player-score"),
  trainerProgress: document.querySelector("#trainer-progress"),
  playerProgress: document.querySelector("#player-progress"),
  trainerRunner: document.querySelector("#trainer-runner"),
  playerRunner: document.querySelector("#player-runner"),
  handball: document.querySelector("#handball"),
  rankList: document.querySelector("#rank-list"),
  setupDialog: document.querySelector("#setup-dialog"),
  tokenInput: document.querySelector("#token-input"),
  saveToken: document.querySelector("#save-token-button")
};

const storageTokenKey = "kh-sommer-ol-airtable-token";

document.addEventListener("DOMContentLoaded", init);

function init() {
  els.date.valueAsDate = new Date();
  bindEvents();
  startBackgroundAnimation();

  if (!getToken()) {
    setStatus("Token mangler", "error");
    showSetupDialog();
    renderEmptyState();
    return;
  }

  loadData();
}

function bindEvents() {
  els.form.addEventListener("submit", submitAction);
  els.refresh.addEventListener("click", loadData);
  els.saveToken.addEventListener("click", saveLocalToken);

  document.querySelectorAll(".tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      state.activeTab = tab.dataset.tab;
      document.querySelectorAll(".tab").forEach((item) => item.classList.toggle("active", item === tab));
      render();
    });
  });
}

async function loadData() {
  if (!getToken()) {
    showSetupDialog();
    return;
  }

  setBusy(true);
  setStatus("Henter data", "");
  clearMessage();

  try {
    const [participants, actions] = await Promise.all([
      listRecords(AIRTABLE.participantsTable),
      listRecords(AIRTABLE.actionsTable)
    ]);

    state.participants = participants
      .map(normalizeParticipant)
      .sort((a, b) => a.label.localeCompare(b.label, "da"));
    state.actions = actions.map(normalizeAction);

    populateParticipants();
    render();
    setStatus("Opdateret", "ok");
  } catch (error) {
    setStatus("Kunne ikke hente", "error");
    setMessage(error.message, "error");
  } finally {
    setBusy(false);
  }
}

async function submitAction(event) {
  event.preventDefault();

  const memberId = els.member.value;
  const activity = els.activity.value;
  const quantity = Number.parseInt(els.quantity.value, 10);
  const date = els.date.value;

  if (!memberId || !activity || !date || !Number.isFinite(quantity) || quantity < 1) {
    setMessage("Udfyld deltager, aktivitet, dato og et positivt antal.", "error");
    return;
  }

  setBusy(true);
  setMessage("Sender point...", "");

  try {
    await createRecord(AIRTABLE.actionsTable, {
      [AIRTABLE.fields.activity]: activity,
      [AIRTABLE.fields.date]: date,
      [AIRTABLE.fields.member]: [memberId],
      [AIRTABLE.fields.quantity]: quantity
    });

    els.quantity.value = "";
    setMessage("Point er registreret.", "ok");
    burstConfetti();
    await loadData();
  } catch (error) {
    setMessage(error.message, "error");
  } finally {
    setBusy(false);
  }
}

async function listRecords(tableId) {
  const records = [];
  let offset = "";

  do {
    const params = new URLSearchParams({ returnFieldsByFieldId: "true", pageSize: "100" });
    if (offset) params.set("offset", offset);

    const response = await airtableFetch(`${tableId}?${params.toString()}`);
    records.push(...response.records);
    offset = response.offset || "";
  } while (offset);

  return records;
}

async function createRecord(tableId, fields) {
  const params = new URLSearchParams({ returnFieldsByFieldId: "true" });
  return airtableFetch(`${tableId}?${params.toString()}`, {
    method: "POST",
    body: JSON.stringify({
      records: [{ fields }],
      typecast: true
    })
  });
}

async function airtableFetch(path, options = {}) {
  const token = getToken();
  const response = await fetch(`https://api.airtable.com/v0/${AIRTABLE.baseId}/${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });

  const body = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message = body?.error?.message || body?.error?.type || `Airtable svarede ${response.status}`;
    throw new Error(message);
  }

  return body;
}

function normalizeParticipant(record) {
  const fields = record.fields || {};
  const name = fields[AIRTABLE.fields.participantName] || "Ukendt";
  const alias = fields[AIRTABLE.fields.participantAlias] || "";
  const type = fields[AIRTABLE.fields.participantType] || "";

  return {
    id: record.id,
    name,
    alias,
    type,
    label: alias ? `${alias} (${name})` : name
  };
}

function normalizeAction(record) {
  const fields = record.fields || {};
  const linkedMember = Array.isArray(fields[AIRTABLE.fields.member]) ? fields[AIRTABLE.fields.member][0] : "";
  const participant = state.participants.find((item) => item.id === linkedMember);
  const lookupType = Array.isArray(fields[AIRTABLE.fields.actionType])
    ? fields[AIRTABLE.fields.actionType][0]
    : fields[AIRTABLE.fields.actionType];

  return {
    id: record.id,
    activity: fields[AIRTABLE.fields.activity] || "",
    date: fields[AIRTABLE.fields.date] || "",
    memberId: linkedMember,
    quantity: Number(fields[AIRTABLE.fields.quantity]) || 0,
    type: lookupType || participant?.type || "",
    memberLabel: participant?.label || "Ukendt deltager"
  };
}

function populateParticipants() {
  const current = els.member.value;
  els.member.innerHTML = `<option value="">Vælg deltager</option>`;

  state.participants.forEach((participant) => {
    const option = document.createElement("option");
    option.value = participant.id;
    option.textContent = `${participant.label} · ${participant.type || "Hold mangler"}`;
    els.member.append(option);
  });

  if (state.participants.some((participant) => participant.id === current)) {
    els.member.value = current;
  }
}

function render() {
  const totals = calculateTotals();
  renderScores(totals);
  renderMetrics(totals);
  renderRanks(totals);
}

function calculateTotals() {
  const totals = {
    teams: { "Træner": 0, "Spiller": 0 },
    activities: Object.fromEntries(Object.keys(ACTIVITIES).map((activity) => [activity, 0])),
    members: new Map()
  };

  state.participants.forEach((participant) => {
    totals.members.set(participant.id, {
      id: participant.id,
      name: participant.label,
      type: participant.type,
      points: 0
    });
  });

  state.actions.forEach((action) => {
    const multiplier = ACTIVITIES[action.activity]?.multiplier || 1;
    const points = action.quantity * multiplier;
    const type = action.type === "Træner" || action.type === "Spiller" ? action.type : "";

    if (type) totals.teams[type] += points;
    if (action.activity in totals.activities) {
      totals.activities[action.activity] += points;
    }

    if (!totals.members.has(action.memberId)) {
      totals.members.set(action.memberId, {
        id: action.memberId,
        name: action.memberLabel,
        type,
        points: 0
      });
    }

    totals.members.get(action.memberId).points += points;
  });

  return totals;
}

function renderScores(totals) {
  const trainer = totals.teams["Træner"];
  const player = totals.teams["Spiller"];
  const max = Math.max(trainer, player, 1);
  const trainerPct = Math.max(5, Math.round((trainer / max) * 100));
  const playerPct = Math.max(5, Math.round((player / max) * 100));
  const leader = trainer === player ? "draw" : trainer > player ? "trainer" : "player";

  animateNumber(els.trainerScore, trainer);
  animateNumber(els.playerScore, player);
  els.trainerProgress.style.width = `${trainerPct}%`;
  els.playerProgress.style.width = `${playerPct}%`;
  els.trainerRunner.style.left = `${trainerPct}%`;
  els.playerRunner.style.left = `${playerPct}%`;

  const ballLeft = leader === "draw" ? 50 : leader === "trainer" ? 34 : 66;
  els.handball.style.left = `${ballLeft}%`;
  els.handball.classList.remove("bounce");
  requestAnimationFrame(() => els.handball.classList.add("bounce"));

  if (state.lastLeader && state.lastLeader !== leader) {
    burstConfetti();
  }
  state.lastLeader = leader;
}

function renderMetrics(totals) {
  Object.entries(ACTIVITIES).forEach(([activity, meta]) => {
    const el = document.querySelector(`#${meta.metricId}`);
    if (el) animateNumber(el, totals.activities[activity] || 0);
  });
}

function renderRanks(totals) {
  const rows = state.activeTab === "members"
    ? [...totals.members.values()].sort((a, b) => b.points - a.points || a.name.localeCompare(b.name, "da")).slice(0, 8)
    : Object.entries(totals.activities)
      .map(([name, points]) => ({ id: name, name, type: ACTIVITIES[name].unit, points }))
      .sort((a, b) => b.points - a.points);

  els.rankList.innerHTML = "";

  if (!rows.length || rows.every((row) => row.points === 0)) {
    const empty = document.createElement("li");
    empty.className = "rank-item";
    empty.innerHTML = `<span class="rank-place">1</span><span><span class="rank-name">Ingen point endnu</span><br><span class="rank-meta">Sommeren er klar til første indsats</span></span><strong class="rank-score">0</strong>`;
    els.rankList.append(empty);
    return;
  }

  rows.forEach((row, index) => {
    const item = document.createElement("li");
    item.className = "rank-item";
    item.innerHTML = `
      <span class="rank-place">${index + 1}</span>
      <span>
        <span class="rank-name">${escapeHtml(row.name)}</span><br>
        <span class="rank-meta">${escapeHtml(row.type || "Point")}</span>
      </span>
      <strong class="rank-score">${formatNumber(row.points)}</strong>
    `;
    els.rankList.append(item);
  });
}

function renderEmptyState() {
  els.member.innerHTML = `<option value="">Token mangler</option>`;
  render();
}

function animateNumber(el, nextValue) {
  const from = Number(el.dataset.value || "0");
  const to = Number(nextValue) || 0;
  const start = performance.now();
  const duration = 450;
  el.dataset.value = String(to);

  function tick(now) {
    const progress = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - progress, 3);
    el.textContent = formatNumber(Math.round(from + (to - from) * eased));
    if (progress < 1) requestAnimationFrame(tick);
  }

  requestAnimationFrame(tick);
}

function formatNumber(value) {
  return new Intl.NumberFormat("da-DK").format(value);
}

function getToken() {
  const configuredToken = AIRTABLE.token && AIRTABLE.token !== "__AIRTABLE_TOKEN__" ? AIRTABLE.token : "";
  return configuredToken || localStorage.getItem(storageTokenKey) || "";
}

function saveLocalToken() {
  const token = els.tokenInput.value.trim();
  if (!token) return;
  localStorage.setItem(storageTokenKey, token);
  els.setupDialog.close();
  loadData();
}

function showSetupDialog() {
  if (typeof els.setupDialog.showModal === "function" && !els.setupDialog.open) {
    els.setupDialog.showModal();
  }
}

function setBusy(isBusy) {
  els.submit.disabled = isBusy;
  els.refresh.disabled = isBusy;
  els.refresh.classList.toggle("loading", isBusy);
}

function setStatus(text, mode) {
  els.sync.textContent = text;
  els.sync.classList.toggle("ok", mode === "ok");
  els.sync.classList.toggle("error", mode === "error");
}

function setMessage(text, mode) {
  els.message.textContent = text;
  els.message.className = `form-message ${mode || ""}`.trim();
}

function clearMessage() {
  setMessage("", "");
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function startBackgroundAnimation() {
  const canvas = document.querySelector("#motion-field");
  const ctx = canvas.getContext("2d");
  const particles = Array.from({ length: 34 }, (_, index) => ({
    x: Math.random(),
    y: Math.random(),
    speed: 0.18 + Math.random() * 0.35,
    size: 4 + Math.random() * 9,
    hue: index % 2 ? 178 : 345
  }));

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.floor(window.innerWidth * ratio);
    canvas.height = Math.floor(window.innerHeight * ratio);
    canvas.style.width = `${window.innerWidth}px`;
    canvas.style.height = `${window.innerHeight}px`;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  }

  function draw() {
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    particles.forEach((particle) => {
      particle.x += particle.speed / window.innerWidth;
      particle.y += Math.sin(performance.now() / 900 + particle.size) * 0.0003;
      if (particle.x > 1.05) particle.x = -0.05;

      ctx.beginPath();
      ctx.arc(particle.x * window.innerWidth, particle.y * window.innerHeight, particle.size, 0, Math.PI * 2);
      ctx.fillStyle = `hsla(${particle.hue}, 78%, 56%, 0.18)`;
      ctx.fill();
    });
    requestAnimationFrame(draw);
  }

  resize();
  window.addEventListener("resize", resize);
  draw();
}

function burstConfetti() {
  const pieces = Array.from({ length: 26 }, () => {
    const piece = document.createElement("span");
    piece.style.position = "fixed";
    piece.style.left = `${45 + Math.random() * 10}%`;
    piece.style.top = "20%";
    piece.style.width = "0.55rem";
    piece.style.height = "0.85rem";
    piece.style.borderRadius = "2px";
    piece.style.background = Math.random() > 0.5 ? "var(--trainer)" : "var(--player)";
    piece.style.pointerEvents = "none";
    piece.style.zIndex = "10";
    document.body.append(piece);
    return {
      el: piece,
      x: (Math.random() - 0.5) * 460,
      y: 260 + Math.random() * 180,
      rotation: (Math.random() - 0.5) * 720
    };
  });

  pieces.forEach((piece) => {
    piece.el.animate(
      [
        { transform: "translate3d(0, 0, 0) rotate(0deg)", opacity: 1 },
        { transform: `translate3d(${piece.x}px, ${piece.y}px, 0) rotate(${piece.rotation}deg)`, opacity: 0 }
      ],
      { duration: 950 + Math.random() * 500, easing: "cubic-bezier(.12,.72,.24,1)", fill: "forwards" }
    ).addEventListener("finish", () => piece.el.remove());
  });
}
