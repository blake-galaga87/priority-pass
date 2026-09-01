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
