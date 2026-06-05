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
  "Løb": { leagueMultiplier: 25, goal: 200, unit: "km" },
  "Armbøjninger": { leagueMultiplier: 1, goal: 5000, unit: "stk." },
  "Mavebøjninger": { leagueMultiplier: 1, goal: 5000, unit: "stk." },
  "Squats": { leagueMultiplier: 1, goal: 5000, unit: "stk." }
};

const LEAGUE_TOTAL = { goal: 20000, unit: "stk." };

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
  trainerScore: document.querySelector("#trainer-score"),
  playerScore: document.querySelector("#player-score"),
  trainerProgress: document.querySelector("#trainer-progress"),
  playerProgress: document.querySelector("#player-progress"),
  trainerMarker: document.querySelector("#trainer-marker"),
  playerMarker: document.querySelector("#player-marker"),
  scoreFilter: document.querySelector("#score-filter"),
  trainerGoal: document.querySelector("#trainer-goal"),
  playerGoal: document.querySelector("#player-goal"),
  trainerUnit: document.querySelector("#trainer-unit"),
  playerUnit: document.querySelector("#player-unit"),
  setupDialog: document.querySelector("#setup-dialog"),
  tokenInput: document.querySelector("#token-input"),
  saveToken: document.querySelector("#save-token-button"),
  introFrame: document.querySelector("#intro-frame"),
  introSrcdoc: document.querySelector("#intro-srcdoc"),
  scoreboardView: document.querySelector("#scoreboard-view"),
  registerView: document.querySelector("#register-view"),
  showRegister: document.querySelector("#show-register"),
  showScoreboard: document.querySelector("#show-scoreboard")
};

const storageTokenKey = "kh-sommer-ol-airtable-token";
const introDurationMs = 7000;
const introFadeMs = 420;

document.addEventListener("DOMContentLoaded", init);

function init() {
  const introReady = playIntroOverlay();

  if (els.date) els.date.value = getTodayValue();
  bindEvents();

  if (!getToken()) {
    introReady.then(showSetupDialog);
    renderEmptyState();
    return;
  }

  loadData();
}

function bindEvents() {
  if (els.form) els.form.addEventListener("submit", submitAction);
  if (els.saveToken) els.saveToken.addEventListener("click", saveLocalToken);
  if (els.showRegister) els.showRegister.addEventListener("click", () => showView("register"));
  if (els.showScoreboard) els.showScoreboard.addEventListener("click", () => showView("scoreboard"));
  if (els.scoreFilter) {
    els.scoreFilter.addEventListener("change", () => {
      state.scoreFilter = els.scoreFilter.value;
      render();
    });
  }
}

function playIntroOverlay() {
  const overlay = document.querySelector("#intro-overlay");
  if (!overlay) return Promise.resolve();

  loadEmbeddedIntro();

  const skip = document.querySelector("#intro-skip");
  let done = false;
  document.body.classList.add("intro-active");

  return new Promise((resolve) => {
    const hide = () => {
      if (done) return;
      done = true;
      overlay.classList.add("is-exiting");
      document.body.classList.remove("intro-active");
      window.setTimeout(() => {
        overlay.remove();
        resolve();
      }, introFadeMs);
    };

    const timer = window.setTimeout(hide, introDurationMs);
    if (skip) {
      skip.addEventListener("click", () => {
        window.clearTimeout(timer);
        hide();
      });
    }
  });
}

function loadEmbeddedIntro() {
  if (!els.introFrame || !els.introSrcdoc || els.introFrame.srcdoc) return;

  try {
    const encoded = els.introSrcdoc.textContent.trim();
    const binary = atob(encoded);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    els.introFrame.srcdoc = new TextDecoder("utf-8").decode(bytes);
  } catch (error) {
    els.introFrame.srcdoc = "<!doctype html><html><body style=\"margin:0;background:#15a7ae\"></body></html>";
    console.error("Intro kunne ikke indlæses:", error);
  }
}

function showView(view) {
  const isRegister = view === "register";

  if (els.scoreboardView) els.scoreboardView.hidden = isRegister;
  if (els.registerView) els.registerView.hidden = !isRegister;
  if (els.showRegister) els.showRegister.hidden = isRegister;
  if (els.showScoreboard) els.showScoreboard.hidden = !isRegister;

  document.title = isRegister ? "Registrer aktivitet" : "Sommerduel";
  window.scrollTo({ top: 0, behavior: "smooth" });
}

async function loadData() {
  if (!getToken()) {
    showSetupDialog();
    return;
  }

  setBusy(true);
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
  } catch (error) {
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
    await loadData();
    showView("scoreboard");
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

    const multiplier = filter === "all" ? ACTIVITIES[action.activity]?.leagueMultiplier || 1 : 1;
    const points = action.quantity * multiplier;
    const type = action.type === "Træner" || action.type === "Spiller" ? action.type : "";

    if (type) totals.teams[type] += points;
  });

  return totals;
}

function renderScores(totals) {
  const trainer = totals.teams["Træner"];
  const player = totals.teams["Spiller"];
  const scoreMeta = getScoreMeta();
  const max = scoreMeta.goal || Math.max(trainer, player, 1);
  const trainerProgress = scoreToPathProgress(trainer, max);
  const playerProgress = scoreToPathProgress(player, max);
  const leader = trainer === player ? "draw" : trainer > player ? "trainer" : "player";

  animateNumber(els.trainerScore, trainer);
  animateNumber(els.playerScore, player);
  setScoreMeta(scoreMeta);
  setPathProgress(els.trainerProgress, els.trainerMarker, trainerProgress);
  setPathProgress(els.playerProgress, els.playerMarker, playerProgress);

  if (state.lastLeader && state.lastLeader !== leader) {
    burstConfetti();
  }
  state.lastLeader = leader;
}

function scoreToPathProgress(score, max) {
  if (!score) return 0;
  return Math.min(1, Math.max(0, score / max));
}

function getScoreMeta() {
  if (state.scoreFilter === "all") return LEAGUE_TOTAL;
  return ACTIVITIES[state.scoreFilter] || LEAGUE_TOTAL;
}

function setScoreMeta({ unit, goal }) {
  const goalLabel = `${formatNumber(goal)} ${unit}`;

  els.trainerUnit.textContent = unit;
  els.playerUnit.textContent = unit;
  els.trainerGoal.textContent = goalLabel;
  els.playerGoal.textContent = goalLabel;
}

function setPathProgress(progressEl, markerEl, progress) {
  const decimal = Math.min(1, Math.max(0, progress));
  progressEl.style.setProperty("--path-progress", decimal.toFixed(4));

  if (!markerEl || typeof progressEl.getTotalLength !== "function") return;

  const pathLength = progressEl.getTotalLength();
  const point = progressEl.getPointAtLength(pathLength * decimal);
  markerEl.style.setProperty("--path-marker-x", point.x.toFixed(2));
  markerEl.style.setProperty("--path-marker-y", point.y.toFixed(2));
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
