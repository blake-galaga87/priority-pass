// ---------- storage helpers ----------

const PRACTICE_STATS_KEY = "priority-pass:practice-stats";
const DAILY_STATE_KEY = "priority-pass:daily-state";
const HISTORY_KEY = "priority-pass:history";
const HISTORY_LIMIT = 1000;
const DECK_KEY = "priority-pass:deck";
const DECK_STATS_KEY = "priority-pass:deck-stats";

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

// ---------- tab wiring ----------

function renderActiveTab() {
  if (state.activeTab === "practice") renderPracticeView();
  else if (state.activeTab === "daily") renderDailyView();
  else if (state.activeTab === "log") renderLogView();
  else if (state.activeTab === "deck") renderDeckView();
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
