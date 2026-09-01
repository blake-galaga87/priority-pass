# Priority Pass — MTG Stack & Rules Timing Trainer

## Concept
An interactive puzzle app that trains players to correctly resolve Magic: The
Gathering stack interactions, priority, triggered abilities, and layers —
rather than just looking up a ruling after the fact. Existing tools
(Scryfall, Gatherer, EDHREC) are reference-based; this is training-based.

Primary format focus: Commander/EDH, given the added complexity of
multiplayer APNAP ordering and politics.

## Core Game Loop ("Priority Pass")
1. **Scenario setup** — Present a board-state snapshot: player boards, life
   totals, open mana, relevant hand cards, and current stack contents.
2. **Decision point** — Player picks from several legal (and some
   intentionally-tempting-but-wrong) actions.
3. **Resolution reveal** — Step-by-step walkthrough of what actually
   happens: stack resolves LIFO, state-based actions checked, triggers
   ordered APNAP, layers applied in CR 613 order, etc.
4. **Score/streak** — Points for correct sequencing; bonus for *optimal*
   play, not just legal play.

## Difficulty Tiers
- **Beginner** — single opponent, 2–3 item stack, foundational LIFO/priority
- **Intermediate** — triggered abilities, replacement effects, layers
  (auras/equipment), APNAP basics
- **Commander/Multiplayer** — 3–4 player APNAP order, politics/signaling,
  commander tax, 5+ item stacks

## Feature Ideas (rough priority order for v1)
1. Core puzzle loop with hardcoded scenario set (MVP)
2. Scoring/streak tracking
3. "Judge Mode" — daily puzzle from real judge-call forums/threads
4. Deck-aware scenarios — import decklist via Moxfield/Archidekt API,
   generate puzzles using the player's own cards
5. Personal "interaction log" — save learned rulings, searchable later

## Sample Puzzle Schema (JSON)
```json
{
  "id": "scenario_007",
  "tier": "beginner",
  "title": "The Redundant Counter",
  "board_state": {
    "players": 3,
    "description": "You control Counterspell. Opponent casts a spell. You counter it. In response, a third player casts their own Counterspell targeting yours."
  },
  "options": [
    { "id": "a", "text": "Your Counterspell is countered; original spell resolves", "correct": true },
    { "id": "b", "text": "Your Counterspell still resolves first", "correct": false },
    { "id": "c", "text": "Both Counterspells cancel out and the original also fizzles", "correct": false }
  ],
  "reveal": "LIFO (last in, first out). The third player's Counterspell resolves first, countering yours. Since your Counterspell never resolves, the original spell resolves normally.",
  "rules_refs": ["CR 405.5", "CR 608.2b"]
}
```

## Puzzle Bank
The full 100-scenario puzzle bank lives in `mtg-puzzle-bank.json` (same
output folder as this spec). It's organized by tier (beginner/intermediate/
commander) and tagged by `concept` for filtering. Load that file directly
into the app's scenario engine — it already matches the schema above.

**Concepts covered (by tag):**
- `stack_priority` — LIFO resolution, passing priority, mana abilities skipping the stack, sorcery-speed timing, responding to your own spells/triggers, split second
- `state_based_actions` — 0 toughness/loyalty, legend rule, illegal Aura attachment, 0 life
- `targeting` — fizzling, illegal targets at cast vs. resolution, targeting spells on the stack
- `triggered_abilities` — same-controller ordering, blocks/attacks triggers
- `replacement_effects` — regeneration, "enters tapped," multiple replacement effects on one event, prevention shields
- `layers` — full CR 613 walkthrough: CDAs, set effects, +X/+X, switch, control/text/type/color layers, timestamp order, dependency
- `combat` — first/double strike steps, trample + deathtouch math, damage assignment order, vigilance, blocked-creature-stays-blocked
- `keywords_evasion` — flying, menace, fear, intimidate, skulk, "must be blocked by 2+"
- `protection_keywords` — protection (DEBT), hexproof vs. shroud, ward
- `casting_costs_alt` — kicker, convoke, affinity, storm, cascade, suspend, foretell, blitz, madness, cycling, adventure, ninjutsu, delve, escape
- `copies` — spell copies and "can't be countered"
- `counters` — +1/+1 vs -1/-1 annihilation
- `planeswalkers` — loyalty activation limits, damage redirection on block
- `mulligan` — London mulligan mechanics
- `commander_specific` — commander tax, 21 damage rule, color identity, partners, Backgrounds, companion, singleton, 40 life, command-zone replacement choice
- `multiplayer_apnap` — APNAP for triggers, targets, choices, and priority passing in a pod

**Tier breakdown:** ~30 beginner, ~40 intermediate, ~30 commander/multiplayer.

## Daily Challenge: "Fogged Card"
A separate, generalized daily mode inspired by "pick the card, win the
card" reel-style content — but built on real Scryfall card data instead of
hand-authored scenarios, so it scales to any card with zero manual content
work per day.

### Concept
One card is selected per day. Its image starts fully blurred/fogged and
every attribute (mana cost, color, type line, P/T, rarity, keywords) is
hidden. The player has **10 total guesses** shared across a bank of yes/no
attribute questions and a final name-guess field. Correct yes-answers unfog
the associated attribute region on the card and increase the image's
sharpness. Every guess — right, wrong, or the name field — consumes one of
the 10, so budget management is the core tension.

### Mechanics (as decided)
- **A "No" answer still costs a guess.** It gives elimination info (that
  option is struck out / grayed) but unfogs nothing. This is what makes
  10 guesses a real constraint rather than free information.
- **The name-guess field draws from the same 10-guess pool.** One name
  attempt = one guess, identical cost to a yes/no tap. This stops players
  from spamming name guesses for free once enough is revealed.
- **Image sharpness scales with percent of attributes revealed**, not with
  specific questions — so even a run of mostly-wrong guesses still leaves
  the image partially visible by guess 10, as a consolation/last-resort
  visual cue before the pool runs out.
- **Win condition:** correct name guess (via the text field) at any point.
  **Loss condition:** all 10 guesses used without a correct name guess —
  card is then fully revealed.

### Question Bank
Each question maps directly to a real Scryfall JSON field, so no manual
authoring is needed per card — the same question bank works for every card
pulled from the API. Expanded from the original type-line-only set so
guesses unfog genuinely distinct regions of the card (mana cost, color
pips, type line, P/T box, rarity symbol) rather than all re-confirming type.

| Question | Scryfall field check | Unfogs |
|---|---|---|
| Is it a permanent? | `type_line` excludes Instant/Sorcery | Type line |
| Is it a creature? | `type_line` contains "Creature" | Type line + P/T box |
| Is it an enchantment? | `type_line` contains "Enchantment" | Type line |
| Is it a sorcery? | `type_line` contains "Sorcery" | Type line |
| Is it an instant? | `type_line` contains "Instant" | Type line |
| Is it a land? | `type_line` contains "Land" | Type line (no mana cost region) |
| Is it an artifact? | `type_line` contains "Artifact" | Type line |
| Is it multicolored? | `colors.length > 1` | Color pips on mana cost |
| Is it white / blue / black / red / green? | `colors` includes symbol | Color pips on mana cost |
| Is it colorless? | `colors.length === 0` | Color pips on mana cost |
| Is its mana value 4 or less? | `cmc <= 4` | Mana cost region |
| Is its mana value 3 or less? | `cmc <= 3` | Mana cost region |
| Is its power 4 or greater? *(creatures only)* | `power >= 4` | P/T box |
| Does it have a keyword ability? | `keywords.length > 0` | One keyword line (not full text) |
| Is it rare or mythic? | `rarity` in [rare, mythic] | Rarity symbol |

Not every question is relevant to every card (e.g., power questions don't
apply to a land) — the app should filter the offered question set to ones
that are actually answerable for that day's card, so players never see a
dead-end option.

### Sample Daily Challenge Schema (JSON)
```json
{
  "date": "2026-09-01",
  "scryfall_id": "example-uuid-from-scryfall",
  "card_name": "Example Card Name",
  "image_url": "https://cards.scryfall.io/large/front/...",
  "max_guesses": 10,
  "questions": [
    { "id": "q_permanent", "text": "Is it a permanent?", "field": "type_line_excludes", "check": ["Instant","Sorcery"], "unfogs": "type_line" },
    { "id": "q_creature", "text": "Is it a creature?", "field": "type_line_contains", "check": "Creature", "unfogs": ["type_line","pt_box"] },
    { "id": "q_multicolor", "text": "Is it multicolored?", "field": "colors_length_gt", "check": 1, "unfogs": "mana_cost_pips" },
    { "id": "q_cmc4", "text": "Is its mana value 4 or less?", "field": "cmc_lte", "check": 4, "unfogs": "mana_cost_region" },
    { "id": "q_rare", "text": "Is it rare or mythic?", "field": "rarity_in", "check": ["rare","mythic"], "unfogs": "rarity_symbol" }
  ],
  "name_guess_enabled": true,
  "name_guess_cost": 1
}
```
This is a template, not the full daily-card generation logic — actual
question *availability* per card (filtering out inapplicable ones) and
random/curated daily card selection are implementation details for the
build phase.

### Scryfall Integration Notes
- Free public REST API, no key required — nothing to "install," just an
  HTTP client in the app.
- Don't hit the live API per user per request for a daily challenge: fetch
  and cache the selected card's data once server-side when the day's card
  is chosen, and serve the image from Scryfall's CDN URL directly.
- [Bulk data downloads](https://scryfall.com/docs/api/bulk-data) are worth
  using if daily card selection becomes procedural (e.g., "creature,
  CMC 3–5, not too obscure") rather than hand-picked.
- Community/fan-app image and data usage is permitted under Scryfall's
  policy; attribute card data/images to Scryfall in the app.

### Shareability
- End-of-day result as an emoji-style guess grid (spoiler-free), similar
  to Wordle share cards.
- Daily streak counter and "solved in N guesses" as the bragging stat.
- Digital "trophy case" of solved cards as a lightweight collection hook,
  in place of any real-world prize mechanic.

## Tech/Scope Notes
- Start as a free web app (or even a Discord bot) — value is in
  well-written scenarios + correct rules logic, not visuals.
- Mobile build is a later-stage consideration, not MVP.
- Content correctness matters more than UI polish for v1 — rules mistakes
  in the reveal text would undermine the whole premise.

## Open Questions for Build Phase
- Web app framework preference (React? Plain HTML/JS?) or start as CLI/Discord bot?
- Where does the scenario bank live — flat JSON file, or a small DB?
- Single-player only for v1, or build multiplayer/shared-state from the start?
- Auth/accounts needed for v1, or fully anonymous/local scoring?
