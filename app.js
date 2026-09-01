// ---------- storage helpers ----------

const PRACTICE_STATS_KEY = "priority-pass:practice-stats";
const DAILY_STATE_KEY = "priority-pass:daily-state";
const HISTORY_KEY = "priority-pass:history";
const HISTORY_LIMIT = 1000;
const DECK_KEY = "priority-pass:deck";
const DECK_STATS_KEY = "priority-pass:deck-stats";
const FOGGED_STATE_KEY = "priority-pass:fogged-state";
const FOGGED_STATS_KEY = "priority-pass:fogged-stats";
const FOGGED_TROPHIES_KEY = "priority-pass:fogged-trophies";
const FOGGED_MAX_GUESSES = 10;
const FOGGED_MAX_BLUR_PX = 22;
const FOGGED_SEARCH_QUERY = "legal:commander -is:funny game:paper";
const FOGGED_TROPHY_LIMIT = 200;

function loadJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (raw) return JSON.parse(raw);
  } catch (err) {
    console.warn(`Could not read ${key}`, err);
  }
  return fallback;
}

function saveJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (err) {
    console.warn(`Could not save ${key}`, err);
  }
}

function loadPracticeStats() {
  return loadJSON(PRACTICE_STATS_KEY, { streak: 0, bestStreak: 0, correct: 0, total: 0 });
}

function loadDailyState() {
  return loadJSON(DAILY_STATE_KEY, {
    dailyStreak: 0,
    bestDailyStreak: 0,
    lastCompletedDate: null,
    lastResult: null, // { scenarioId, chosenId, correct }
  });
}

function loadHistory() {
  return loadJSON(HISTORY_KEY, []);
}

function loadDeck() {
  return loadJSON(DECK_KEY, { rawText: "", cardNames: [] });
}

function loadDeckStats() {
  return loadJSON(DECK_STATS_KEY, { streak: 0, bestStreak: 0, correct: 0, total: 0 });
}

// Parses a Moxfield/Archidekt-style plain-text decklist ("1 Sol Ring (C21) 263",
// "1x Blood Artist", "Sol Ring", etc). Strips quantities, set/collector info,
// foil markers, and skips blank lines / section headers.
function parseDecklist(text) {
  const names = new Set();
  text.split("\n").forEach((rawLine) => {
    let line = rawLine.trim();
    if (!line || line.startsWith("//") || line.startsWith("#")) return;
    if (/^(deck|sideboard|commander|maybeboard)\s*$/i.test(line)) return;

    const qtyMatch = line.match(/^(\d+)x?\s+(.+)$/i);
    if (qtyMatch) line = qtyMatch[2];

    line = line
      .replace(/\(([^)]+)\)/g, "") // (SET)
      .replace(/\[[^\]]+\]/g, "") // [SET]
      .replace(/\*[fF]\*/g, "") // *F* foil marker
      .replace(/\b[A-Z0-9]{2,5}\s+\d+[a-z]?$/i, "") // trailing "SET 123"
      .replace(/\s{2,}/g, " ")
      .trim();

    if (line.length > 1) names.add(line);
  });
  return Array.from(names);
}

function loadFoggedState() {
  return loadJSON(FOGGED_STATE_KEY, null);
}

function loadFoggedStats() {
  return loadJSON(FOGGED_STATS_KEY, { dailyStreak: 0, bestStreak: 0, totalSolved: 0, bestGuesses: null });
}

function loadFoggedTrophies() {
  return loadJSON(FOGGED_TROPHIES_KEY, []);
}

function scenarioMentionsDeck(s, cardNamesLower) {
  const text = `${s.title} ${s.board_state}`.toLowerCase();
  return cardNamesLower.some((name) => name.length > 2 && text.includes(name));
}

function recordAttempt(mode, scenario, chosenOption) {
  const history = loadHistory();
  history.push({
    ts: Date.now(),
    mode,
    scenarioId: scenario.id,
    title: scenario.title,
    tier: scenario.tier,
    concept: scenario.concept,
    boardState: scenario.board_state,
    reveal: scenario.reveal,
    rulesRefs: scenario.rules_refs || [],
    chosenId: chosenOption.id,
    chosenText: chosenOption.text,
    correct: !!chosenOption.correct,
    correctText: (scenario.options.find((o) => o.correct) || {}).text || "",
  });
  if (history.length > HISTORY_LIMIT) history.splice(0, history.length - HISTORY_LIMIT);
  saveJSON(HISTORY_KEY, history);
}

// ---------- date / seeded pick helpers ----------

function pad2(n) {
  return String(n).padStart(2, "0");
}

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function dateStrAddDays(dateStr, delta) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + delta);
  return `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}`;
}

function hashStr(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  }
  return h >>> 0;
}

function dailyScenarioFor(dateStr) {
  const sorted = state.allScenarios.slice().sort((a, b) => a.id.localeCompare(b.id));
  if (sorted.length === 0) return null;
  const idx = hashStr(dateStr) % sorted.length;
  return sorted[idx];
}

// ---------- shared render helpers ----------

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function tierBadgeClass(tier) {
  return `badge badge-${tier}`;
}

function scenarioBodyHtml(s) {
  const optionsHtml = s.options
    .map(
      (opt) => `
      <button class="option-btn" data-option-id="${opt.id}">
        <span class="option-letter">${opt.id.toUpperCase()}.</span>${escapeHtml(opt.text)}
      </button>`
    )
    .join("");

  return `
    <div class="puzzle-meta">
      <span class="${tierBadgeClass(s.tier)}">${s.tier}</span>
      <span class="badge badge-concept">${escapeHtml(s.concept.replace(/_/g, " "))}</span>
    </div>
    <h2 class="puzzle-title">${escapeHtml(s.title)}</h2>
    <p class="board-state">${escapeHtml(s.board_state)}</p>
    <div class="options">${optionsHtml}</div>
    <div id="reveal-slot"></div>
  `;
}

function lockOptions(container, s, chosenId) {
  container.querySelectorAll(".option-btn").forEach((btn) => {
    btn.disabled = true;
    const opt = s.options.find((o) => o.id === btn.dataset.optionId);
    if (opt.correct) {
      btn.classList.add("correct");
    } else if (btn.dataset.optionId === chosenId) {
      btn.classList.add("incorrect");
    }
  });
}

function revealHtml(s, wasCorrect, footerHtml) {
  const refsHtml = (s.rules_refs || [])
    .map((ref) => `<span class="rule-ref">${escapeHtml(ref)}</span>`)
    .join("");
  return `
    <div class="reveal">
      <div class="reveal-verdict ${wasCorrect ? "correct" : "incorrect"}">
        ${wasCorrect ? "Correct." : "Not quite."}
      </div>
      <p class="reveal-text">${escapeHtml(s.reveal)}</p>
      ${refsHtml ? `<div class="rules-refs">${refsHtml}</div>` : ""}
      ${footerHtml || ""}
    </div>
  `;
}

// ---------- global state ----------

const state = {
  allScenarios: [],
  activeTab: "practice",
  practice: { tier: "all", pool: [], poolIndex: 0, current: null, stats: loadPracticeStats() },
  daily: { dailyState: loadDailyState() },
  log: { search: "", tier: "all", concept: "all", result: "all" },
  deck: { ...loadDeck(), pool: [], poolIndex: 0, current: null, stats: loadDeckStats() },
  fogged: { gs: null },
};

const root = document.getElementById("view-root");
const puzzleCountEl = document.getElementById("puzzle-count");

// ---------- practice view ----------

function shuffle(arr) {
  const copy = arr.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function practiceBuildPool() {
  const p = state.practice;
  const filtered = p.tier === "all" ? state.allScenarios : state.allScenarios.filter((s) => s.tier === p.tier);
  p.pool = shuffle(filtered);
  p.poolIndex = 0;
}

function practiceNext() {
  const p = state.practice;
  if (p.pool.length === 0) {
    p.current = null;
    renderPracticeCard();
    return;
  }
  if (p.poolIndex >= p.pool.length) {
    p.pool = shuffle(p.pool);
    p.poolIndex = 0;
  }
  p.current = p.pool[p.poolIndex++];
  renderPracticeCard();
}

function renderPracticeView() {
  const p = state.practice;
  root.innerHTML = `
    <section class="controls">
      <div class="tier-filter" role="group" aria-label="Difficulty tier">
        ${["all", "beginner", "intermediate", "commander"]
          .map(
            (t) =>
              `<button class="tier-btn${p.tier === t ? " active" : ""}" data-tier="${t}">${
                t === "all" ? "All" : t[0].toUpperCase() + t.slice(1)
              }</button>`
          )
          .join("")}
      </div>
      <div class="stats" aria-live="polite">
        <div class="stat"><span class="stat-value" id="stat-streak">${p.stats.streak}</span><span class="stat-label">Streak</span></div>
        <div class="stat"><span class="stat-value" id="stat-score">${p.stats.correct}</span><span class="stat-label">Correct</span></div>
        <div class="stat"><span class="stat-value" id="stat-total">${p.stats.total}</span><span class="stat-label">Seen</span></div>
        <div class="stat"><span class="stat-value" id="stat-best">${p.stats.bestStreak}</span><span class="stat-label">Best streak</span></div>
      </div>
    </section>
    <section id="puzzle-area" class="puzzle-area"></section>
  `;

  root.querySelectorAll(".tier-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      p.tier = btn.dataset.tier;
      practiceBuildPool();
      practiceNext();
    });
  });

  if (!p.current || !p.pool.length) practiceBuildPool();
  if (!p.current) practiceNext();
  else renderPracticeCard();
}

function renderPracticeCard() {
  const puzzleArea = document.getElementById("puzzle-area");
  if (!puzzleArea) return;
  const p = state.practice;
  if (!p.current) {
    puzzleArea.innerHTML = `<div class="empty-state">No puzzles in this tier yet.</div>`;
    return;
  }
  puzzleArea.innerHTML = scenarioBodyHtml(p.current);
  puzzleArea.querySelectorAll(".option-btn").forEach((btn) => {
    btn.addEventListener("click", () => handlePracticeAnswer(btn.dataset.optionId));
  });
}

function handlePracticeAnswer(optionId) {
  const puzzleArea = document.getElementById("puzzle-area");
  const p = state.practice;
  const s = p.current;
  const chosen = s.options.find((o) => o.id === optionId);
  const wasCorrect = !!chosen.correct;

  lockOptions(puzzleArea, s, optionId);

  p.stats.total += 1;
  if (wasCorrect) {
    p.stats.correct += 1;
    p.stats.streak += 1;
    p.stats.bestStreak = Math.max(p.stats.bestStreak, p.stats.streak);
  } else {
    p.stats.streak = 0;
  }
  saveJSON(PRACTICE_STATS_KEY, p.stats);
  recordAttempt("practice", s, chosen);

  const streakEl = document.getElementById("stat-streak");
  const scoreEl = document.getElementById("stat-score");
  const totalEl = document.getElementById("stat-total");
  const bestEl = document.getElementById("stat-best");
  if (streakEl) streakEl.textContent = p.stats.streak;
  if (scoreEl) scoreEl.textContent = p.stats.correct;
  if (totalEl) totalEl.textContent = p.stats.total;
  if (bestEl) bestEl.textContent = p.stats.bestStreak;

  const revealSlot = document.getElementById("reveal-slot");
  revealSlot.innerHTML = revealHtml(s, wasCorrect, `<button class="next-btn" id="next-btn">Next puzzle →</button>`);
  document.getElementById("next-btn").addEventListener("click", practiceNext);
  revealSlot.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

// ---------- daily view ----------

function renderDailyView() {
  const today = todayStr();
  const ds = state.daily.dailyState;
  const scenario = dailyScenarioFor(today);

  root.innerHTML = `
    <section class="daily-header">
      <div>
        <div class="daily-date">${today}</div>
      </div>
      <div class="daily-streaks">
        <div class="stat"><span class="stat-value">${ds.dailyStreak}</span><span class="stat-label">Streak</span></div>
        <div class="stat"><span class="stat-value">${ds.bestDailyStreak}</span><span class="stat-label">Best</span></div>
      </div>
    </section>
    <section id="puzzle-area" class="puzzle-area"></section>
  `;

  const puzzleArea = document.getElementById("puzzle-area");
  if (!scenario) {
    puzzleArea.innerHTML = `<div class="empty-state">Puzzle bank still loading…</div>`;
    return;
  }

  puzzleArea.innerHTML = scenarioBodyHtml(scenario);

  const alreadyDone = ds.lastCompletedDate === today && ds.lastResult;
  if (alreadyDone) {
    lockOptions(puzzleArea, scenario, ds.lastResult.chosenId);
    const revealSlot = document.getElementById("reveal-slot");
    revealSlot.innerHTML = revealHtml(
      scenario,
      ds.lastResult.correct,
      `<div class="daily-locked-note">You've already solved today's puzzle. Come back tomorrow for a new one.</div>`
    );
    return;
  }

  puzzleArea.querySelectorAll(".option-btn").forEach((btn) => {
    btn.addEventListener("click", () => handleDailyAnswer(scenario, btn.dataset.optionId));
  });
}

function handleDailyAnswer(scenario, optionId) {
  const puzzleArea = document.getElementById("puzzle-area");
  const chosen = scenario.options.find((o) => o.id === optionId);
  const wasCorrect = !!chosen.correct;
  const today = todayStr();
  const ds = state.daily.dailyState;

  lockOptions(puzzleArea, scenario, optionId);

  if (wasCorrect) {
    const wasYesterday = ds.lastCompletedDate === dateStrAddDays(today, -1);
    ds.dailyStreak = wasYesterday ? ds.dailyStreak + 1 : 1;
    ds.bestDailyStreak = Math.max(ds.bestDailyStreak, ds.dailyStreak);
  } else {
    ds.dailyStreak = 0;
  }
  ds.lastCompletedDate = today;
  ds.lastResult = { scenarioId: scenario.id, chosenId: optionId, correct: wasCorrect };
  saveJSON(DAILY_STATE_KEY, ds);
  recordAttempt("daily", scenario, chosen);

  const revealSlot = document.getElementById("reveal-slot");
  revealSlot.innerHTML = revealHtml(
    scenario,
    wasCorrect,
    `<div class="daily-locked-note">Come back tomorrow for a new puzzle.</div>`
  );

  renderDailyHeaderStreaks();
}

function renderDailyHeaderStreaks() {
  const header = root.querySelector(".daily-streaks");
  if (!header) return;
  const ds = state.daily.dailyState;
  header.innerHTML = `
    <div class="stat"><span class="stat-value">${ds.dailyStreak}</span><span class="stat-label">Streak</span></div>
    <div class="stat"><span class="stat-value">${ds.bestDailyStreak}</span><span class="stat-label">Best</span></div>
  `;
}

// ---------- log view ----------

function conceptList() {
  return Array.from(new Set(state.allScenarios.map((s) => s.concept))).sort();
}

function renderLogView() {
  root.innerHTML = `
    <section class="log-summary" id="log-summary"></section>
    <section class="log-controls">
      <input type="text" id="log-search" placeholder="Search title or board text…" value="${escapeHtml(state.log.search)}" />
      <div class="log-filters">
        <select id="log-tier">
          ${["all", "beginner", "intermediate", "commander"]
            .map((t) => `<option value="${t}"${state.log.tier === t ? " selected" : ""}>${t === "all" ? "All tiers" : t}</option>`)
            .join("")}
        </select>
        <select id="log-concept">
          <option value="all"${state.log.concept === "all" ? " selected" : ""}>All concepts</option>
          ${conceptList()
            .map((c) => `<option value="${c}"${state.log.concept === c ? " selected" : ""}>${c.replace(/_/g, " ")}</option>`)
            .join("")}
        </select>
        <select id="log-result">
          <option value="all"${state.log.result === "all" ? " selected" : ""}>All results</option>
          <option value="correct"${state.log.result === "correct" ? " selected" : ""}>Correct only</option>
          <option value="incorrect"${state.log.result === "incorrect" ? " selected" : ""}>Missed only</option>
        </select>
        <button class="ghost-btn" id="log-clear">Clear log</button>
      </div>
    </section>
    <section class="log-list" id="log-list"></section>
  `;

  document.getElementById("log-search").addEventListener("input", (e) => {
    state.log.search = e.target.value;
    renderLogList();
  });
  document.getElementById("log-tier").addEventListener("change", (e) => {
    state.log.tier = e.target.value;
    renderLogList();
  });
  document.getElementById("log-concept").addEventListener("change", (e) => {
    state.log.concept = e.target.value;
    renderLogList();
  });
  document.getElementById("log-result").addEventListener("change", (e) => {
    state.log.result = e.target.value;
    renderLogList();
  });
  document.getElementById("log-clear").addEventListener("click", () => {
    if (window.confirm("Clear your entire puzzle history? This can't be undone.")) {
      saveJSON(HISTORY_KEY, []);
      renderLogSummary();
      renderLogList();
    }
  });

  renderLogSummary();
  renderLogList();
}

function renderLogSummary() {
  const summaryEl = document.getElementById("log-summary");
  if (!summaryEl) return;
  const history = loadHistory();
  if (history.length === 0) {
    summaryEl.innerHTML = `<h3>Concept mastery</h3><div class="log-summary-empty">No attempts logged yet — answer some puzzles to build your history.</div>`;
    return;
  }

  const byConcept = {};
  history.forEach((h) => {
    if (!byConcept[h.concept]) byConcept[h.concept] = { seen: 0, correct: 0 };
    byConcept[h.concept].seen += 1;
    if (h.correct) byConcept[h.concept].correct += 1;
  });

  const rows = Object.entries(byConcept)
    .map(([concept, v]) => ({ concept, pct: Math.round((v.correct / v.seen) * 100), seen: v.seen }))
    .sort((a, b) => a.pct - b.pct);

  summaryEl.innerHTML = `
    <h3>Concept mastery</h3>
    ${rows
      .map(
        (r) => `
      <div class="concept-row">
        <span class="concept-name">${r.concept.replace(/_/g, " ")}</span>
        <div class="concept-bar-track"><div class="concept-bar-fill${r.pct < 60 ? " weak" : ""}" style="width:${r.pct}%"></div></div>
        <span class="concept-pct">${r.pct}% (${r.seen})</span>
      </div>`
      )
      .join("")}
  `;
}

function renderLogList() {
  const listEl = document.getElementById("log-list");
  if (!listEl) return;
  const { search, tier, concept, result } = state.log;
  const q = search.trim().toLowerCase();

  const filtered = loadHistory()
    .filter((h) => (tier === "all" ? true : h.tier === tier))
    .filter((h) => (concept === "all" ? true : h.concept === concept))
    .filter((h) => (result === "all" ? true : result === "correct" ? h.correct : !h.correct))
    .filter((h) => (q ? h.title.toLowerCase().includes(q) || h.boardState.toLowerCase().includes(q) : true))
    .reverse();

  if (filtered.length === 0) {
    listEl.innerHTML = `<div class="empty-state">No log entries match these filters.</div>`;
    return;
  }

  listEl.innerHTML = filtered
    .map((h) => {
      const d = new Date(h.ts);
      const dateLabel = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
      const refsHtml = (h.rulesRefs || []).map((ref) => `<span class="rule-ref">${escapeHtml(ref)}</span>`).join("");
      return `
      <details class="log-row">
        <summary>
          <span class="log-result-icon ${h.correct ? "correct" : "incorrect"}">${h.correct ? "✓" : "✗"}</span>
          <span class="log-row-title">${escapeHtml(h.title)}</span>
          <span class="badge ${tierBadgeClass(h.tier)}">${h.tier}</span>
          <span class="log-row-date">${dateLabel}</span>
        </summary>
        <div class="log-row-body">
          <p class="board-state">${escapeHtml(h.boardState)}</p>
          <div class="log-row-answer">You answered: <strong>${escapeHtml(h.chosenText)}</strong></div>
          ${!h.correct ? `<div class="log-row-answer">Correct answer: <strong>${escapeHtml(h.correctText)}</strong></div>` : ""}
          <p class="reveal-text">${escapeHtml(h.reveal)}</p>
          ${refsHtml ? `<div class="rules-refs">${refsHtml}</div>` : ""}
        </div>
      </details>`;
    })
    .join("");
}

// ---------- deck view ----------

function deckBuildPool() {
  const d = state.deck;
  const namesLower = d.cardNames.map((n) => n.toLowerCase());
  const filtered = namesLower.length ? state.allScenarios.filter((s) => scenarioMentionsDeck(s, namesLower)) : [];
  d.pool = shuffle(filtered);
  d.poolIndex = 0;
  d.current = null;
}

function deckNext() {
  const d = state.deck;
  if (d.pool.length === 0) {
    d.current = null;
    renderDeckPuzzleArea();
    return;
  }
  if (d.poolIndex >= d.pool.length) {
    d.pool = shuffle(d.pool);
    d.poolIndex = 0;
  }
  d.current = d.pool[d.poolIndex++];
  renderDeckPuzzleArea();
}

function renderDeckView() {
  const d = state.deck;
  root.innerHTML = `
    <section class="deck-input">
      <label for="deck-text">Paste your decklist (Moxfield/Archidekt export format)</label>
      <textarea id="deck-text" rows="8" placeholder="1 Sol Ring&#10;1 Blood Artist&#10;1 Counterspell">${escapeHtml(d.rawText)}</textarea>
      <div class="deck-actions">
        <button class="next-btn" id="deck-save">Save deck</button>
        <button class="ghost-btn" id="deck-clear">Clear deck</button>
      </div>
      <div class="deck-meta" id="deck-meta"></div>
    </section>
    <section class="stats" id="deck-stats-bar" aria-live="polite"></section>
    <section id="puzzle-area" class="puzzle-area"></section>
  `;

  document.getElementById("deck-save").addEventListener("click", () => {
    d.rawText = document.getElementById("deck-text").value;
    d.cardNames = parseDecklist(d.rawText);
    saveJSON(DECK_KEY, { rawText: d.rawText, cardNames: d.cardNames });
    deckBuildPool();
    deckNext();
    renderDeckMeta();
    renderDeckStatsBar();
  });

  document.getElementById("deck-clear").addEventListener("click", () => {
    d.rawText = "";
    d.cardNames = [];
    saveJSON(DECK_KEY, { rawText: "", cardNames: [] });
    document.getElementById("deck-text").value = "";
    deckBuildPool();
    renderDeckPuzzleArea();
    renderDeckMeta();
    renderDeckStatsBar();
  });

  deckBuildPool();
  renderDeckMeta();
  renderDeckStatsBar();
  if (d.cardNames.length && d.pool.length) deckNext();
  else renderDeckPuzzleArea();
}

function renderDeckMeta() {
  const metaEl = document.getElementById("deck-meta");
  if (!metaEl) return;
  const d = state.deck;
  if (!d.cardNames.length) {
    metaEl.textContent = "Paste a decklist above to see puzzles built around your own cards.";
    return;
  }
  metaEl.textContent = `${d.cardNames.length} card${d.cardNames.length === 1 ? "" : "s"} recognized · ${d.pool.length} matching puzzle${
    d.pool.length === 1 ? "" : "s"
  } in the bank.`;
}

function renderDeckStatsBar() {
  const statsEl = document.getElementById("deck-stats-bar");
  if (!statsEl) return;
  const d = state.deck;
  if (!d.pool.length) {
    statsEl.innerHTML = "";
    return;
  }
  statsEl.innerHTML = `
    <div class="stat"><span class="stat-value">${d.stats.streak}</span><span class="stat-label">Streak</span></div>
    <div class="stat"><span class="stat-value">${d.stats.correct}</span><span class="stat-label">Correct</span></div>
    <div class="stat"><span class="stat-value">${d.stats.total}</span><span class="stat-label">Seen</span></div>
    <div class="stat"><span class="stat-value">${d.stats.bestStreak}</span><span class="stat-label">Best streak</span></div>
  `;
}

function renderDeckPuzzleArea() {
  const puzzleArea = document.getElementById("puzzle-area");
  if (!puzzleArea) return;
  const d = state.deck;
  if (!d.cardNames.length) {
    puzzleArea.innerHTML = `<div class="empty-state">No deck saved yet.</div>`;
    return;
  }
  if (!d.current) {
    puzzleArea.innerHTML = `<div class="empty-state">No puzzles in the bank reference cards from this deck yet. Try Practice mode, or paste a bigger list.</div>`;
    return;
  }
  puzzleArea.innerHTML = scenarioBodyHtml(d.current);
  puzzleArea.querySelectorAll(".option-btn").forEach((btn) => {
    btn.addEventListener("click", () => handleDeckAnswer(btn.dataset.optionId));
  });
}

function handleDeckAnswer(optionId) {
  const puzzleArea = document.getElementById("puzzle-area");
  const d = state.deck;
  const s = d.current;
  const chosen = s.options.find((o) => o.id === optionId);
  const wasCorrect = !!chosen.correct;

  lockOptions(puzzleArea, s, optionId);

  d.stats.total += 1;
  if (wasCorrect) {
    d.stats.correct += 1;
    d.stats.streak += 1;
    d.stats.bestStreak = Math.max(d.stats.bestStreak, d.stats.streak);
  } else {
    d.stats.streak = 0;
  }
  saveJSON(DECK_STATS_KEY, d.stats);
  recordAttempt("deck", s, chosen);
  renderDeckStatsBar();

  const revealSlot = document.getElementById("reveal-slot");
  revealSlot.innerHTML = revealHtml(s, wasCorrect, `<button class="next-btn" id="deck-next-btn">Next puzzle →</button>`);
  document.getElementById("deck-next-btn").addEventListener("click", deckNext);
  revealSlot.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

// ---------- fogged card: question bank ----------

function hasNumericPower(card) {
  return typeof card.power === "string" && card.power.trim() !== "" && /^-?\d+(\.\d+)?$/.test(card.power.trim());
}

function isLand(card) {
  return card.type_line.includes("Land");
}

const FOGGED_QUESTIONS = [
  { id: "q_permanent", text: "Is it a permanent?", region: ["type_line"], applicable: () => true, check: (c) => !/(Instant|Sorcery)/.test(c.type_line) },
  { id: "q_creature", text: "Is it a creature?", region: ["type_line", "pt_box"], applicable: () => true, check: (c) => c.type_line.includes("Creature") },
  { id: "q_enchantment", text: "Is it an enchantment?", region: ["type_line"], applicable: () => true, check: (c) => c.type_line.includes("Enchantment") },
  { id: "q_sorcery", text: "Is it a sorcery?", region: ["type_line"], applicable: () => true, check: (c) => c.type_line.includes("Sorcery") },
  { id: "q_instant", text: "Is it an instant?", region: ["type_line"], applicable: () => true, check: (c) => c.type_line.includes("Instant") },
  { id: "q_land", text: "Is it a land?", region: ["type_line"], applicable: () => true, check: (c) => c.type_line.includes("Land") },
  { id: "q_artifact", text: "Is it an artifact?", region: ["type_line"], applicable: () => true, check: (c) => c.type_line.includes("Artifact") },
  { id: "q_multicolor", text: "Is it multicolored?", region: ["mana_cost"], applicable: () => true, check: (c) => c.colors.length > 1 },
  { id: "q_white", text: "Is it white?", region: ["mana_cost"], applicable: () => true, check: (c) => c.colors.includes("W") },
  { id: "q_blue", text: "Is it blue?", region: ["mana_cost"], applicable: () => true, check: (c) => c.colors.includes("U") },
  { id: "q_black", text: "Is it black?", region: ["mana_cost"], applicable: () => true, check: (c) => c.colors.includes("B") },
  { id: "q_red", text: "Is it red?", region: ["mana_cost"], applicable: () => true, check: (c) => c.colors.includes("R") },
  { id: "q_green", text: "Is it green?", region: ["mana_cost"], applicable: () => true, check: (c) => c.colors.includes("G") },
  { id: "q_colorless", text: "Is it colorless?", region: ["mana_cost"], applicable: () => true, check: (c) => c.colors.length === 0 },
  { id: "q_cmc4", text: "Is its mana value 4 or less?", region: ["mana_cost"], applicable: (c) => !isLand(c), check: (c) => c.cmc <= 4 },
  { id: "q_cmc3", text: "Is its mana value 3 or less?", region: ["mana_cost"], applicable: (c) => !isLand(c), check: (c) => c.cmc <= 3 },
  { id: "q_power4", text: "Is its power 4 or greater?", region: ["pt_box"], applicable: (c) => hasNumericPower(c), check: (c) => parseFloat(c.power) >= 4 },
  { id: "q_keyword", text: "Does it have a keyword ability?", region: ["keywords"], applicable: () => true, check: (c) => c.keywords.length > 0 },
  { id: "q_rare", text: "Is it rare or mythic?", region: ["rarity"], applicable: () => true, check: (c) => c.rarity === "rare" || c.rarity === "mythic" },
  { id: "q_kill", text: "Does it destroy or kill something?", region: ["effects"], tag: "Removal", applicable: () => true, check: (c) => /destroy target|destroy all|destroy each|destroy up to/i.test((c.oracle_text || "")) },
  { id: "q_bounce", text: "Does it bounce something (return it to hand)?", region: ["effects"], tag: "Bounce", applicable: () => true, check: (c) => /return\s+(target|up to|all|each)[^.]*\bhands?\b/i.test((c.oracle_text || "")) },
  { id: "q_draw", text: "Does it draw cards?", region: ["effects"], tag: "Card Draw", applicable: () => true, check: (c) => /draws?\s+[\w\s]{0,20}?cards?\b/i.test((c.oracle_text || "")) },
  { id: "q_edict", text: "Does it make an opponent sacrifice something?", region: ["effects"], tag: "Edict/Sacrifice", applicable: () => true, check: (c) => /\b(opponent|player)s?\b[^.]{0,30}\bsacrifices\b/i.test((c.oracle_text || "")) },
];

const FOGGED_REGION_APPLICABLE = {
  type_line: () => true,
  mana_cost: () => true,
  pt_box: (c) => c.power !== undefined && c.power !== null,
  keywords: () => true,
  rarity: () => true,
  effects: () => true,
};

function foggedApplicableQuestions(card) {
  return FOGGED_QUESTIONS.filter((q) => q.applicable(card));
}

function foggedApplicableRegions(card) {
  return Object.keys(FOGGED_REGION_APPLICABLE).filter((r) => FOGGED_REGION_APPLICABLE[r](card));
}

// ---------- fogged card: Scryfall fetch ----------

function foggedField(raw, field) {
  if (raw[field] !== undefined) return raw[field];
  if (raw.card_faces && raw.card_faces[0] && raw.card_faces[0][field] !== undefined) return raw.card_faces[0][field];
  return undefined;
}

function foggedOracleText(raw) {
  if (typeof raw.oracle_text === "string") return raw.oracle_text;
  if (raw.card_faces) return raw.card_faces.map((f) => f.oracle_text || "").join("\n");
  return "";
}

function normalizeCard(raw) {
  const imageUris = foggedField(raw, "image_uris");
  return {
    id: raw.id,
    name: raw.name,
    mana_cost: foggedField(raw, "mana_cost") || "",
    cmc: typeof raw.cmc === "number" ? raw.cmc : 0,
    type_line: foggedField(raw, "type_line") || "",
    colors: foggedField(raw, "colors") || [],
    power: foggedField(raw, "power"),
    toughness: foggedField(raw, "toughness"),
    rarity: raw.rarity,
    keywords: raw.keywords || [],
    oracle_text: foggedOracleText(raw),
    image_url: imageUris ? imageUris.normal : null,
    scryfall_uri: raw.scryfall_uri,
  };
}

async function fetchDailyFoggedCard(dateStr) {
  const seed = hashStr(`fogged:${dateStr}`);
  const baseUrl = `https://api.scryfall.com/cards/search?q=${encodeURIComponent(FOGGED_SEARCH_QUERY)}&order=name&unique=cards`;

  const page1Res = await fetch(`${baseUrl}&page=1`);
  if (!page1Res.ok) throw new Error(`Scryfall search failed (HTTP ${page1Res.status})`);
  const page1 = await page1Res.json();
  if (!page1.data || page1.data.length === 0) throw new Error("Scryfall search returned no cards");

  const total = page1.total_cards;
  const idx = seed % total;
  const pageSize = page1.data.length;
  const pageNum = Math.floor(idx / pageSize) + 1;
  const offset = idx % pageSize;

  let raw;
  if (pageNum === 1) {
    raw = page1.data[offset];
  } else {
    const pageRes = await fetch(`${baseUrl}&page=${pageNum}`);
    if (!pageRes.ok) throw new Error(`Scryfall search page ${pageNum} failed (HTTP ${pageRes.status})`);
    const pageData = await pageRes.json();
    raw = pageData.data[offset];
  }
  if (!raw) throw new Error("Could not resolve today's card from Scryfall results");
  return normalizeCard(raw);
}

// ---------- fogged card: name matching ----------

function normalizeGuess(str) {
  return str
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function nameMatches(guess, cardName) {
  const g = normalizeGuess(guess);
  if (!g) return false;
  const fullName = normalizeGuess(cardName);
  if (g === fullName) return true;
  const frontFace = normalizeGuess(cardName.split("//")[0]);
  return g === frontFace;
}

// ---------- fogged card: state helpers ----------

function foggedNewGameState(dateStr, card) {
  return {
    date: dateStr,
    card,
    guessesUsed: 0,
    answers: {}, // questionId -> true/false
    revealedRegions: [],
    nameGuesses: [], // wrong guesses only
    guessLog: [], // 'yes' | 'no' | 'name-wrong' | 'name-win'
    solved: false,
    lost: false,
  };
}

function foggedSaveState(gs) {
  saveJSON(FOGGED_STATE_KEY, gs);
}

function foggedBlurPx(gs) {
  // The image (and name) never sharpen from answering questions — this is a
  // reasoning game about what the card DOES, not a visual-recognition game.
  // Full clarity is only the end-of-round reveal, on a win or a loss.
  if (gs.solved || gs.lost) return 0;
  return FOGGED_MAX_BLUR_PX;
}

function foggedShareText(gs) {
  const emojiFor = (g) => (g === "yes" ? "🟩" : g === "no" ? "⬜" : g === "name-win" ? "🟨" : "🟦");
  const grid = gs.guessLog.map(emojiFor).join("");
  const resultLine = gs.solved ? `${gs.guessesUsed}/${FOGGED_MAX_GUESSES}` : `X/${FOGGED_MAX_GUESSES}`;
  return `Priority Pass — Guess the Card (${gs.date})\n${resultLine}\n${grid}`;
}

// ---------- fogged card: view ----------

async function renderFoggedView() {
  const today = todayStr();
  let gs = loadFoggedState();

  if (!gs || gs.date !== today) {
    root.innerHTML = `
      <div class="loading">Fetching today's card from Scryfall…</div>
    `;
    try {
      const card = await fetchDailyFoggedCard(today);
      gs = foggedNewGameState(today, card);
      foggedSaveState(gs);
    } catch (err) {
      root.innerHTML = `
        <div class="empty-state">
          Couldn't load today's Guess the Card: ${escapeHtml(err.message)}<br />
          <button class="next-btn" id="fogged-retry" style="margin-top:0.8rem;">Retry</button>
        </div>
      `;
      const retryBtn = document.getElementById("fogged-retry");
      if (retryBtn) retryBtn.addEventListener("click", () => renderFoggedView());
      console.error(err);
      return;
    }
  }

  state.fogged.gs = gs;
  renderFoggedGame();
}

function renderFoggedGame() {
  const gs = state.fogged.gs;
  const stats = loadFoggedStats();
  const guessesLeft = FOGGED_MAX_GUESSES - gs.guessesUsed;
  const applicableQuestions = foggedApplicableQuestions(gs.card);
  const applicableRegions = foggedApplicableRegions(gs.card);

  const chipHtml = (region, label, value) => {
    if (!applicableRegions.includes(region)) return "";
    const revealed = gs.solved || gs.lost || gs.revealedRegions.includes(region);
    return `
      <div class="fogged-chip${revealed ? " revealed" : ""}">
        <span class="fogged-chip-label">${label}</span>
        <span class="fogged-chip-value${revealed ? "" : " hidden-value"}">${revealed ? escapeHtml(value) : "?????"}</span>
      </div>
    `;
  };

  const manaCostDisplay = gs.card.mana_cost ? `${gs.card.mana_cost} (MV ${gs.card.cmc})` : `No mana cost (MV ${gs.card.cmc})`;
  const ptDisplay = `${gs.card.power}/${gs.card.toughness}`;
  const keywordsDisplay = gs.card.keywords.length ? gs.card.keywords.join(", ") : "None";
  const rarityDisplay = gs.card.rarity ? gs.card.rarity[0].toUpperCase() + gs.card.rarity.slice(1) : "";
  const matchedEffectTags = FOGGED_QUESTIONS.filter((q) => q.tag && gs.answers[q.id] === true).map((q) => q.tag);
  const effectsDisplay = matchedEffectTags.length ? matchedEffectTags.join(", ") : "None";

  const gameOver = gs.solved || gs.lost;
  const blur = foggedBlurPx(gs);

  const questionsHtml = applicableQuestions
    .map((q) => {
      const answer = gs.answers[q.id];
      let cls = "question-btn";
      if (answer === true) cls += " answered-yes";
      else if (answer === false) cls += " answered-no";
      const disabled = gameOver || answer !== undefined || guessesLeft <= 0;
      return `<button class="${cls}" data-qid="${q.id}" ${disabled ? "disabled" : ""}>${escapeHtml(q.text)}</button>`;
    })
    .join("");

  const nameHistoryHtml = gs.nameGuesses.length
    ? `<div class="name-guess-history">${gs.nameGuesses.map((n) => `<span class="name-guess-chip">${escapeHtml(n)}</span>`).join("")}</div>`
    : "";

  let bannerHtml = "";
  if (gs.solved) {
    bannerHtml = `
      <div class="fogged-banner win">
        <h3>🏆 Solved in ${gs.guessesUsed}/${FOGGED_MAX_GUESSES} guesses!</h3>
        <div>${escapeHtml(gs.card.name)}</div>
        <button class="fogged-share-btn" id="fogged-share">Copy result</button>
      </div>
    `;
  } else if (gs.lost) {
    bannerHtml = `
      <div class="fogged-banner loss">
        <h3>Out of guesses</h3>
        <div>The card was <strong>${escapeHtml(gs.card.name)}</strong></div>
        <button class="fogged-share-btn" id="fogged-share">Copy result</button>
      </div>
    `;
  }

  const trophies = loadFoggedTrophies();
  const trophyHtml = trophies.length
    ? `
      <section>
        <h3 style="font-size:0.9rem;color:var(--text-dim);text-transform:uppercase;letter-spacing:0.04em;margin:0 0 0.6rem;">Trophy case</h3>
        <div class="trophy-case">
          ${trophies
            .slice()
            .reverse()
            .map(
              (t) => `
            <div class="trophy-item">
              <img src="${t.imageUrl}" alt="${escapeHtml(t.name)}" title="${escapeHtml(t.name)}" />
              <div class="trophy-guesses">${t.guessesUsed}/${FOGGED_MAX_GUESSES}</div>
            </div>`
            )
            .join("")}
        </div>
      </section>
    `
    : "";

  root.innerHTML = `
    <div class="fogged-layout">
      <section class="fogged-topbar">
        <div class="fogged-guesses">${Math.max(0, guessesLeft)} <span class="dim">guesses left</span></div>
        <div class="fogged-stats-row">
          <div class="stat"><span class="stat-value">${stats.dailyStreak}</span><span class="stat-label">Streak</span></div>
          <div class="stat"><span class="stat-value">${stats.bestStreak}</span><span class="stat-label">Best</span></div>
        </div>
      </section>

      <div class="fogged-card-frame">
        <div class="fogged-image-wrap">
          ${gs.card.image_url ? `<img id="fogged-img" src="${gs.card.image_url}" alt="Mystery card" style="filter: blur(${blur}px);" />` : `<div class="empty-state">No image available</div>`}
        </div>
      </div>

      <div class="fogged-chips">
        ${chipHtml("type_line", "Type line", gs.card.type_line)}
        ${chipHtml("mana_cost", "Mana cost", manaCostDisplay)}
        ${chipHtml("pt_box", "Power/Toughness", ptDisplay)}
        ${chipHtml("keywords", "Keywords", keywordsDisplay)}
        ${chipHtml("rarity", "Rarity", rarityDisplay)}
        ${chipHtml("effects", "Effects", effectsDisplay)}
      </div>

      ${bannerHtml}

      ${
        !gameOver
          ? `
      <section>
        <h3 style="font-size:0.9rem;color:var(--text-dim);text-transform:uppercase;letter-spacing:0.04em;margin:0 0 0.6rem;">Ask a question (costs 1 guess)</h3>
        <div class="question-grid">${questionsHtml}</div>
      </section>

      <section class="deck-input">
        <label for="fogged-name-input">Guess the card name (costs 1 guess)</label>
        <div class="name-guess-row">
          <input type="text" id="fogged-name-input" placeholder="Card name…" ${guessesLeft <= 0 ? "disabled" : ""} />
          <button class="next-btn" id="fogged-name-submit" ${guessesLeft <= 0 ? "disabled" : ""}>Guess</button>
        </div>
        ${nameHistoryHtml}
      </section>
      `
          : ""
      }

      ${trophyHtml}

      <div class="fogged-credit">Card data and images via <a href="https://scryfall.com" target="_blank" rel="noopener">Scryfall</a>.</div>
    </div>
  `;

  if (!gameOver) {
    root.querySelectorAll(".question-btn").forEach((btn) => {
      btn.addEventListener("click", () => handleFoggedQuestion(btn.dataset.qid));
    });
    const nameInput = document.getElementById("fogged-name-input");
    const nameSubmit = document.getElementById("fogged-name-submit");
    const submitName = () => handleFoggedNameGuess(nameInput.value);
    nameSubmit.addEventListener("click", submitName);
    nameInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") submitName();
    });
  }

  const shareBtn = document.getElementById("fogged-share");
  if (shareBtn) {
    shareBtn.addEventListener("click", async () => {
      const text = foggedShareText(gs);
      try {
        await navigator.clipboard.writeText(text);
        shareBtn.textContent = "Copied!";
        setTimeout(() => {
          shareBtn.textContent = "Copy result";
        }, 1500);
      } catch (err) {
        console.warn("Clipboard write failed, falling back to prompt", err);
        window.prompt("Copy your result:", text);
      }
    });
  }
}

function foggedCheckEndState(gs) {
  if (!gs.solved && gs.guessesUsed >= FOGGED_MAX_GUESSES) {
    gs.lost = true;
    const stats = loadFoggedStats();
    stats.dailyStreak = 0;
    saveJSON(FOGGED_STATS_KEY, stats);
  }
}

function handleFoggedQuestion(qid) {
  const gs = state.fogged.gs;
  if (gs.solved || gs.lost || gs.answers[qid] !== undefined || gs.guessesUsed >= FOGGED_MAX_GUESSES) return;

  const q = FOGGED_QUESTIONS.find((x) => x.id === qid);
  const answer = q.check(gs.card);
  gs.answers[qid] = answer;
  gs.guessesUsed += 1;
  gs.guessLog.push(answer ? "yes" : "no");
  if (answer) {
    q.region.forEach((r) => {
      if (!gs.revealedRegions.includes(r)) gs.revealedRegions.push(r);
    });
  }
  foggedCheckEndState(gs);
  foggedSaveState(gs);
  renderFoggedGame();
}

function handleFoggedNameGuess(rawGuess) {
  const gs = state.fogged.gs;
  const guess = (rawGuess || "").trim();
  if (!guess || gs.solved || gs.lost || gs.guessesUsed >= FOGGED_MAX_GUESSES) return;

  gs.guessesUsed += 1;
  const correct = nameMatches(guess, gs.card.name);
  if (correct) {
    gs.solved = true;
    gs.guessLog.push("name-win");
    const stats = loadFoggedStats();
    stats.dailyStreak += 1;
    stats.bestStreak = Math.max(stats.bestStreak, stats.dailyStreak);
    stats.totalSolved += 1;
    stats.bestGuesses = stats.bestGuesses === null ? gs.guessesUsed : Math.min(stats.bestGuesses, gs.guessesUsed);
    saveJSON(FOGGED_STATS_KEY, stats);

    const trophies = loadFoggedTrophies();
    trophies.push({ date: gs.date, name: gs.card.name, imageUrl: gs.card.image_url, guessesUsed: gs.guessesUsed });
    if (trophies.length > FOGGED_TROPHY_LIMIT) trophies.splice(0, trophies.length - FOGGED_TROPHY_LIMIT);
    saveJSON(FOGGED_TROPHIES_KEY, trophies);
  } else {
    gs.nameGuesses.push(guess);
    gs.guessLog.push("name-wrong");
    foggedCheckEndState(gs);
  }
  foggedSaveState(gs);
  renderFoggedGame();
}

// ---------- tab wiring ----------

function renderActiveTab() {
  if (state.activeTab === "practice") renderPracticeView();
  else if (state.activeTab === "daily") renderDailyView();
  else if (state.activeTab === "log") renderLogView();
  else if (state.activeTab === "deck") renderDeckView();
  else if (state.activeTab === "fogged") renderFoggedView();
}

document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    state.activeTab = btn.dataset.tab;
    document.querySelectorAll(".tab-btn").forEach((b) => {
      const active = b === btn;
      b.classList.toggle("active", active);
      b.setAttribute("aria-selected", active ? "true" : "false");
    });
    renderActiveTab();
  });
});

// ---------- init ----------

async function init() {
  try {
    const res = await fetch("mtg-puzzle-bank.json");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    state.allScenarios = data.scenarios || [];
    puzzleCountEl.textContent = `${state.allScenarios.length} scenarios loaded`;
    renderActiveTab();
  } catch (err) {
    root.innerHTML = `<div class="empty-state">Couldn't load puzzle bank: ${escapeHtml(err.message)}</div>`;
    console.error(err);
  }
}

init();
