const STORAGE_KEY = "priority-pass:stats";

const state = {
  allScenarios: [],
  pool: [],       // scenarios matching current tier filter, shuffled
  poolIndex: 0,
  current: null,
  tier: "all",
  stats: loadStats(),
};

const el = {
  puzzleArea: document.getElementById("puzzle-area"),
  loading: document.getElementById("loading"),
  puzzleCount: document.getElementById("puzzle-count"),
  statStreak: document.getElementById("stat-streak"),
  statScore: document.getElementById("stat-score"),
  statTotal: document.getElementById("stat-total"),
  statBest: document.getElementById("stat-best"),
  tierBtns: Array.from(document.querySelectorAll(".tier-btn")),
};

function loadStats() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (err) {
    console.warn("Could not read saved stats", err);
  }
  return { streak: 0, bestStreak: 0, correct: 0, total: 0 };
}

function saveStats() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.stats));
  } catch (err) {
    console.warn("Could not save stats", err);
  }
}

function renderStats() {
  el.statStreak.textContent = state.stats.streak;
  el.statScore.textContent = state.stats.correct;
  el.statTotal.textContent = state.stats.total;
  el.statBest.textContent = state.stats.bestStreak;
}

function shuffle(arr) {
  const copy = arr.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function buildPool() {
  const filtered = state.tier === "all"
    ? state.allScenarios
    : state.allScenarios.filter((s) => s.tier === state.tier);
  state.pool = shuffle(filtered);
  state.poolIndex = 0;
}

function nextScenario() {
  if (state.pool.length === 0) {
    state.current = null;
    renderEmpty();
    return;
  }
  if (state.poolIndex >= state.pool.length) {
    // reshuffle once we've cycled through the whole filtered set
    state.pool = shuffle(state.pool);
    state.poolIndex = 0;
  }
  state.current = state.pool[state.poolIndex++];
  renderScenario();
}

function renderEmpty() {
  el.puzzleArea.innerHTML = `<div class="empty-state">No puzzles in this tier yet.</div>`;
}

function tierBadgeClass(tier) {
  return `badge badge-${tier}`;
}

function renderScenario() {
  const s = state.current;
  const optionsHtml = s.options
    .map(
      (opt) => `
      <button class="option-btn" data-option-id="${opt.id}">
        <span class="option-letter">${opt.id.toUpperCase()}.</span>${escapeHtml(opt.text)}
      </button>`
    )
    .join("");

  el.puzzleArea.innerHTML = `
    <div class="puzzle-meta">
      <span class="${tierBadgeClass(s.tier)}">${s.tier}</span>
      <span class="badge badge-concept">${escapeHtml(s.concept.replace(/_/g, " "))}</span>
    </div>
    <h2 class="puzzle-title">${escapeHtml(s.title)}</h2>
    <p class="board-state">${escapeHtml(s.board_state)}</p>
    <div class="options">${optionsHtml}</div>
    <div id="reveal-slot"></div>
  `;

  el.puzzleArea.querySelectorAll(".option-btn").forEach((btn) => {
    btn.addEventListener("click", () => onOptionSelected(btn.dataset.optionId));
  });
}

function onOptionSelected(optionId) {
  const s = state.current;
  const chosen = s.options.find((o) => o.id === optionId);
  const wasCorrect = !!chosen.correct;

  // lock all option buttons, mark correct/incorrect
  el.puzzleArea.querySelectorAll(".option-btn").forEach((btn) => {
    btn.disabled = true;
    const opt = s.options.find((o) => o.id === btn.dataset.optionId);
    if (opt.correct) {
      btn.classList.add("correct");
    } else if (btn.dataset.optionId === optionId) {
      btn.classList.add("incorrect");
    }
  });

  state.stats.total += 1;
  if (wasCorrect) {
    state.stats.correct += 1;
    state.stats.streak += 1;
    state.stats.bestStreak = Math.max(state.stats.bestStreak, state.stats.streak);
  } else {
    state.stats.streak = 0;
  }
  saveStats();
  renderStats();

  const refsHtml = (s.rules_refs || [])
    .map((ref) => `<span class="rule-ref">${escapeHtml(ref)}</span>`)
    .join("");

  const revealSlot = document.getElementById("reveal-slot");
  revealSlot.innerHTML = `
    <div class="reveal">
      <div class="reveal-verdict ${wasCorrect ? "correct" : "incorrect"}">
        ${wasCorrect ? "Correct." : "Not quite."}
      </div>
      <p class="reveal-text">${escapeHtml(s.reveal)}</p>
      ${refsHtml ? `<div class="rules-refs">${refsHtml}</div>` : ""}
      <button class="next-btn" id="next-btn">Next puzzle →</button>
    </div>
  `;
  document.getElementById("next-btn").addEventListener("click", nextScenario);
  revealSlot.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function setTier(tier) {
  state.tier = tier;
  el.tierBtns.forEach((btn) => btn.classList.toggle("active", btn.dataset.tier === tier));
  buildPool();
  nextScenario();
}

el.tierBtns.forEach((btn) => {
  btn.addEventListener("click", () => setTier(btn.dataset.tier));
});

async function init() {
  renderStats();
  try {
    const res = await fetch("mtg-puzzle-bank.json");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    state.allScenarios = data.scenarios || [];
    el.puzzleCount.textContent = `${state.allScenarios.length} scenarios loaded`;
    buildPool();
    nextScenario();
  } catch (err) {
    el.puzzleArea.innerHTML = `<div class="empty-state">Couldn't load puzzle bank: ${escapeHtml(err.message)}</div>`;
    console.error(err);
  }
}

init();
