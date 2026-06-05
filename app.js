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
  "Løb": { multiplier: 1, goal: 200, unit: "km" },
  "Armbøjninger": { multiplier: 1, goal: 5000, unit: "stk." },
  "Mavebøjninger": { multiplier: 1, goal: 5000, unit: "stk." },
  "Squats": { multiplier: 1, goal: 5000, unit: "stk." }
};

const state = {
  participants: [],
  actions: [],
  scoreFilter: "all",
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
  scoreFilter: document.querySelector("#score-filter"),
  goalText: document.querySelector("#goal-text"),
  trainerGoal: document.querySelector("#trainer-goal"),
  playerGoal: document.querySelector("#player-goal"),
  trainerUnit: document.querySelector("#trainer-unit"),
  playerUnit: document.querySelector("#player-unit"),
  setupDialog: document.querySelector("#setup-dialog"),
  tokenInput: document.querySelector("#token-input"),
  saveToken: document.querySelector("#save-token-button")
};

const storageTokenKey = "kh-sommer-ol-airtable-token";

document.addEventListener("DOMContentLoaded", init);

function init() {
  if (els.date) els.date.value = getTodayValue();
  bindEvents();

  if (!getToken()) {
    setStatus("Token mangler", "error");
    showSetupDialog();
    renderEmptyState();
    return;
  }

  loadData();
}

function bindEvents() {
  if (els.form) els.form.addEventListener("submit", submitAction);
  if (els.refresh) els.refresh.addEventListener("click", loadData);
  if (els.saveToken) els.saveToken.addEventListener("click", saveLocalToken);
  if (els.scoreFilter) {
    els.scoreFilter.addEventListener("change", () => {
      state.scoreFilter = els.scoreFilter.value;
      render();
    });
  }
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
    const shouldLoadActions = Boolean(els.trainerScore);
    const [participants, actions] = await Promise.all([
      listRecords(AIRTABLE.participantsTable),
      shouldLoadActions ? listRecords(AIRTABLE.actionsTable) : Promise.resolve([])
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
    window.location.href = "index.html";
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
  if (!els.member) return;

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
  if (!els.trainerScore) return;
  const totals = calculateTotals();
  renderScores(totals);
}

function calculateTotals() {
  const filter = state.scoreFilter;
  const totals = {
    teams: { "Træner": 0, "Spiller": 0 }
  };

  state.actions.forEach((action) => {
    if (filter !== "all" && action.activity !== filter) return;

    const multiplier = ACTIVITIES[action.activity]?.multiplier || 1;
    const points = action.quantity * multiplier;
    const type = action.type === "Træner" || action.type === "Spiller" ? action.type : "";

    if (type) totals.teams[type] += points;
  });

  return totals;
}

function renderScores(totals) {
  const trainer = totals.teams["Træner"];
  const player = totals.teams["Spiller"];
  const activity = ACTIVITIES[state.scoreFilter];
  const goal = activity?.goal || null;
  const unit = activity?.unit || "point";
  const max = goal || Math.max(trainer, player, 1);
  const trainerPct = scoreToPathPercent(trainer, max);
  const playerPct = scoreToPathPercent(player, max);
  const leader = trainer === player ? "draw" : trainer > player ? "trainer" : "player";

  animateNumber(els.trainerScore, trainer);
  animateNumber(els.playerScore, player);
  setScoreMeta(unit, goal);
  setPathProgress(els.trainerProgress, els.trainerRunner, trainerPct, trainer ? trainerPct : 0);
  setPathProgress(els.playerProgress, els.playerRunner, playerPct, player ? playerPct : 0);

  if (state.lastLeader && state.lastLeader !== leader) {
    burstConfetti();
  }
  state.lastLeader = leader;
}

function scoreToPathPercent(score, max) {
  if (!score) return 14;
  return Math.min(84, Math.max(8, Math.round((score / max) * 84)));
}

function setScoreMeta(unit, goal) {
  const goalLabel = goal ? `${formatNumber(goal)} ${unit}` : "Mål";
  const goalText = goal ? `Mål: ${goalLabel}` : "Mål: samlet stilling";

  els.trainerUnit.textContent = unit;
  els.playerUnit.textContent = unit;
  els.trainerGoal.textContent = goalLabel;
  els.playerGoal.textContent = goalLabel;
  els.goalText.textContent = goalText;
}

function setPathProgress(progressEl, markerEl, markerPercent, fillPercent) {
  const decimal = fillPercent / 100;
  progressEl.style.setProperty("--path-progress", decimal.toFixed(3));
  markerEl.style.setProperty("--marker-top", `${markerPercent}%`);
  markerEl.dataset.zone = markerPercent > 74 ? "bottom" : "middle";
}

function renderEmptyState() {
  if (els.member) els.member.innerHTML = `<option value="">Token mangler</option>`;
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

function getTodayValue() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
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
  if (els.setupDialog && typeof els.setupDialog.showModal === "function" && !els.setupDialog.open) {
    els.setupDialog.showModal();
  }
}

function setBusy(isBusy) {
  if (els.submit) els.submit.disabled = isBusy;
  if (els.refresh) {
    els.refresh.disabled = isBusy;
    els.refresh.classList.toggle("loading", isBusy);
  }
}

function setStatus(text, mode) {
  if (!els.sync) return;
  els.sync.textContent = text;
  els.sync.classList.toggle("ok", mode === "ok");
  els.sync.classList.toggle("error", mode === "error");
}

function setMessage(text, mode) {
  if (!els.message) return;
  els.message.textContent = text;
  els.message.className = `form-message ${mode || ""}`.trim();
}

function clearMessage() {
  setMessage("", "");
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
