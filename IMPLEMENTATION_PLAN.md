# Implementation Plan — Kingside Improvement

This plan is designed for Sonnet to implement step-by-step. Each section is a self-contained workstream with clear inputs, outputs, and test requirements. **All new features require ≥90% code coverage.**

---

## Workstream 1: PGN Parsing — Lichess Eval & Clock Extraction

**Goal:** Parse Lichess-style inline annotations (`{ [%eval 0.17] }`, `{ [%eval #-3] }`, `{ [%clk 0:10:00] }`) from PGN comments and attach them to MoveTree nodes.

### 1.1 Extend MoveTree Node Type

**File:** `src/utils/MoveTree.ts`

Add optional fields to each node:
```typescript
eval?: number;       // Centipawns (e.g., 17 for 0.17 pawns, multiply float by 100)
evalMate?: number;   // Mate in N (positive = white mates, negative = black mates)
clock?: number;      // Clock time in seconds
```

Ensure `toJSON()` and `fromJSON()` serialize/deserialize these new fields.

### 1.2 Parse Annotations in PGNService

**File:** `src/services/pgn/PGNService.ts`

In `buildMoveTree()`, after setting `currentNode.comment`, also parse Lichess annotations from the comment text:

```
{ [%eval 0.17] }           → eval: 17 (centipawns)
{ [%eval -1.53] }          → eval: -153
{ [%eval #3] }             → evalMate: 3
{ [%eval #-5] }            → evalMate: -5
{ [%clk 0:10:00] }         → clock: 600 (seconds)
{ [%clk 0:01:30] }         → clock: 90
{ [%eval 0.17] [%clk ...] } → both fields
```

**Regex patterns:**
- Eval: `\[%eval\s+([#]?-?\d+\.?\d*)\]`
- Clock: `\[%clk\s+(\d+):(\d+):(\d+)\]`

After extracting annotations, strip them from the comment text so `node.comment` contains only the human-readable comment (if any remains after stripping).

### 1.3 Also Handle Comments in GameReviewService

**File:** `src/services/gameReview/GameReviewService.ts`

Currently (line 82), `GameReviewService.startReview()` strips ALL comments with `pgnMovesText.replace(/\{[^}]*\}/g, '')`. This destroys eval annotations.

**Change:** Before stripping comments, extract `[%eval ...]` values per-move and store them alongside the positions array. When Lichess eval is available for a position, it can be used as a fallback (or primary) evaluation, potentially skipping engine analysis for that position.

Add to `MoveAnalysis` type:
```typescript
lichessEval?: number;      // Centipawns from Lichess annotation
lichessEvalMate?: number;  // Mate from Lichess annotation
```

### 1.4 Tests

**File:** `src/services/pgn/__tests__/PGNService.test.ts`

Add test cases:
- Parse PGN with `[%eval]` annotations → verify `node.eval` values
- Parse PGN with `[%eval #N]` mate annotations → verify `node.evalMate`
- Parse PGN with `[%clk]` annotations → verify `node.clock` in seconds
- Parse PGN with mixed annotations and human comments → verify both extracted
- Parse PGN with no annotations → verify no crash, fields undefined
- **Expand null-move regression tests:** Add 5+ real-world PGN examples that previously caused parsing failures. Include games with:
  - Annotations like `$1`, `$2` (NAG symbols)
  - Nested variations `(1. e4 (1. d4 d5) e5)`
  - Clock + eval in same comment block
  - Games ending mid-variation
  - Games with only result markers and no moves
  - Moves-only format (no headers) with annotations

**Coverage target:** PGNService ≥90%, MoveTree serialization of new fields ≥90%

---

## Workstream 2: Database — Repertoires & Review Settings in SQLite

**Goal:** Migrate repertoires and review settings from AsyncStorage to SQLite for consistency and performance.

### 2.1 Add Repertoire Table

**File:** `src/services/database/DatabaseService.ts`

Add to `initialize()`:
```sql
CREATE TABLE IF NOT EXISTS repertoires (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  color TEXT NOT NULL,          -- 'white' | 'black'
  data TEXT NOT NULL,           -- JSON blob (full Repertoire object with chapters/MoveTree)
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_repertoires_color ON repertoires(color);
```

**Why JSON blob for data:** Repertoires contain deeply nested MoveTree structures with variations. Normalizing this into relational tables would be extremely complex with minimal query benefit. Store the full serialized object and deserialize on read.

Add methods:
- `addRepertoire(repertoire: Repertoire): Promise<void>`
- `updateRepertoire(repertoire: Repertoire): Promise<void>`
- `deleteRepertoire(id: string): Promise<void>`
- `getAllRepertoires(): Promise<Repertoire[]>`
- `getRepertoireById(id: string): Promise<Repertoire | null>`
- `getRepertoiresCount(): Promise<number>`

**Serialization:** Use `JSON.stringify()` with MoveTree's `toJSON()`. On read, use `JSON.parse()` then `MoveTree.fromJSON()` for each chapter's moveTree. Handle Date objects with the existing reviver pattern.

### 2.2 Add Review Settings Table

**File:** `src/services/database/DatabaseService.ts`

```sql
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
```

Methods:
- `saveSetting(key: string, value: any): Promise<void>` — stores `JSON.stringify(value)`
- `getSetting<T>(key: string): Promise<T | null>` — returns `JSON.parse(value)`

Store `reviewSettings` under key `'reviewSettings'`.

### 2.3 Migration from AsyncStorage

**File:** `src/services/database/MigrationService.ts`

Add a migration step that:
1. Reads `@kingside/repertoires` from AsyncStorage
2. If data exists, writes each repertoire to the new SQLite table
3. Reads `@kingside/review-settings` from AsyncStorage (check actual key in StorageService)
4. If data exists, writes to the settings table
5. Clears the migrated AsyncStorage keys after successful migration
6. Records migration version to avoid re-running

### 2.4 Update Zustand Store

**File:** `src/store/index.ts`

- `initialize()`: Load repertoires from `DatabaseService.getAllRepertoires()` instead of `StorageService`
- `addRepertoire()`, `updateRepertoire()`, `deleteRepertoire()`: Write to `DatabaseService` instead of `StorageService`
- `reviewSettings`: Load/save via `DatabaseService.getSetting('reviewSettings')` / `DatabaseService.saveSetting('reviewSettings', ...)`
- Remove the old `StorageService` calls for repertoires and settings (keep it for anything else that still needs it like `gameReviewStatuses`, `reviewCards`, `lineStats`)

### 2.5 Update WebDatabaseService

**File:** `src/services/database/WebDatabaseService.ts`

Add equivalent IndexedDB methods for repertoires and settings so web platform continues to work.

### 2.6 Tests

**File:** `src/services/database/__tests__/DatabaseService.test.ts`

Add tests for:
- CRUD operations on repertoires table
- Settings save/load round-trip
- Migration from AsyncStorage to SQLite (mock AsyncStorage)
- Repertoire serialization/deserialization (MoveTree survives round-trip)
- Empty database returns empty arrays/null

**Coverage target:** DatabaseService new methods ≥90%, MigrationService ≥90%

---

## Workstream 3: Master Games Lichess Import (Inline UI)

**Goal:** Move Lichess master game import configuration into the ImportPGNScreen itself, with username + game count + days back inputs.

### 3.1 Update ImportPGNScreen UI

**File:** `src/screens/ImportPGNScreen.tsx`

When `target === 'master-games'`, the Lichess section should show:
- **Username input** (required) — no default, user types the master's Lichess handle
- **Game count input** (optional, default 50) — number picker or text input
- **Days back input** (optional, default: all time / 0) — how far back to fetch

Remove the dependency on `reviewSettings.lichess` for master game imports. The settings screen Lichess config is only for the user's own account (user games import).

### 3.2 Wire Up `since` Parameter in LichessService

**File:** `src/services/lichess/LichessService.ts`

The Lichess API `GET /api/games/user/{username}` supports:
- `max` — max games to return
- `since` — Unix timestamp in milliseconds, only games played since this time
- `opening` — include opening info (keep `true`)
- `pgnInJson` — include PGN string (keep `true`)
- `evals` — **add `true`** to include Lichess eval annotations in PGN

Update `fetchUserGames()` signature:
```typescript
async fetchUserGames(
  username: string,
  max: number = 50,
  sinceDaysBack?: number
): Promise<string[]>
```

When `sinceDaysBack` is provided and > 0, compute `since = Date.now() - (sinceDaysBack * 86400000)` and append `&since=${since}` to the URL.

**Also add `&evals=true`** to the URL to get Lichess evaluations in the PGN. This enables Workstream 1's eval extraction.

Update `fetchMasterGames()` to accept and pass through the same parameters.

### 3.3 Tests

**File:** `src/services/lichess/__tests__/LichessService.test.ts` (new)

- Test URL construction with various parameter combinations
- Test `since` calculation from days back
- Test NDJSON parsing (mock fetch)
- Test error handling (404, network error, empty response)
- Test that `evals=true` is always included in the URL

**Coverage target:** LichessService ≥90%

---

## Workstream 4: Game Review — Full Pre-Analysis & Move Classification

**Goal:** Always run engine analysis before showing review. Classify moves using Lichess-style win-probability loss. Display eval graph. Tab-based UI below board.

### 4.1 Win Probability Conversion

**File:** `src/services/gameReview/GameReviewService.ts`

Add a `centipawnsToWinProbability()` function using Lichess's formula:

```typescript
// Lichess formula: win% = 50 + 50 * (2 / (1 + exp(-0.00368208 * cp)) - 1)
function centipawnsToWinProbability(cp: number): number {
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * cp)) - 1);
}
```

For mate scores: `mate in N > 0` → 100%, `mate in N < 0` → 0%.

### 4.2 Replace Threshold-Based Classification

**File:** `src/services/gameReview/GameReviewService.ts`

Replace `identifyKeyMove()`'s eval-based section. Instead of comparing centipawn delta against flat thresholds:

1. Convert `evalBefore` and `evalAfter` to win probability (from the perspective of the player who moved)
2. Compute `winProbLoss = winProbBefore - winProbAfter`
3. **Gate check — no blunders in lost positions:** If the player's win probability was already ≤30% before the move, do NOT classify as blunder/mistake (the position was already lost). Inaccuracy can still apply.
4. Classify:
   - **Blunder (`??`):** `winProbLoss ≥ 30%` (e.g., 80% → 50%, or winning → drawn)
   - **Mistake (`?`):** `winProbLoss ≥ 20%`
   - **Inaccuracy (`?!`):** `winProbLoss ≥ 10%`
   - **Missing forced mate** is always a blunder (eval was mate-in-N, now it's not), regardless of the gate check
   - **Brilliant:** the move significantly improved position against engine expectation (eval gain > 10% win prob AND engine's best move was different) — optional, implement if straightforward

**Remove `EvalThresholds` from `ReviewSettings`** — the thresholds are no longer user-configurable since they're baked into the win-probability model.

**Update `ReviewSettings` type** in `src/types/gameReview.types.ts` to remove `thresholds` field. Also remove the thresholds section from `SettingsScreen.tsx`.

### 4.3 Mandatory Engine Analysis with Loading Screen

**File:** `src/screens/gameReview/GameReviewScreen.tsx` (or create a wrapper)

When `startGameReview()` is called:
1. Show a loading screen (reuse the `ActivityIndicator` + progress pattern from `ImportPGNScreen`)
2. Run engine analysis on ALL positions before entering the review
3. Show progress: "Analyzing move 15/47..."
4. On completion, display the review UI

**File:** `src/store/index.ts` → `startGameReview()`

Remove the `analyzer?: EngineAnalyzer` optional parameter — engine is now always required. The store action should:
1. Initialize the engine (if not already running)
2. Call `GameReviewService.startReview()` with the engine
3. The loading state can be tracked in the store (`isAnalyzing: boolean`, `analysisProgress: { current: number, total: number }`)

**Remove** from `GameReviewScreen.tsx`:
- The "engine analysis disabled" notice
- The option to review without engine
- The conditional `analyzer` parameter

### 4.4 Lichess Eval Fallback

When Lichess evals are available from PGN annotations (Workstream 1), use them as pre-filled evaluations. Only run Stockfish on positions that lack a Lichess eval. This significantly speeds up review for Lichess-imported games.

In `GameReviewService.startReview()`:
1. First, extract Lichess evals from the PGN (if present)
2. For positions with Lichess eval, use those directly
3. For positions without, run Stockfish
4. Progress bar counts only positions needing engine analysis

### 4.5 Eval Graph Component

**File:** `src/components/chess/EvalGraph.tsx` (new)

A lightweight line chart showing evaluation over the game:
- X-axis: move number (1, 2, 3, ...)
- Y-axis: evaluation in pawns (capped at ±10, with mate shown as ±10)
- Line color: white above 0, black below 0 (or single line with colored fill)
- Current move highlighted with a vertical indicator/dot
- Tappable: tap on the graph to jump to that move
- Use `react-native-svg` (already a dependency) to draw the chart — no additional library needed

Props:
```typescript
interface EvalGraphProps {
  evaluations: (EngineEvaluation | null)[];  // Per-position evals
  currentMoveIndex: number;
  onMoveSelect: (moveIndex: number) => void;
  width: number;
  height?: number;  // Default ~100-120px
}
```

### 4.6 Tab UI Below Board

**File:** `src/screens/gameReview/GameReviewScreen.tsx`

Replace the current bottom section with a tab bar. Tabs:

1. **Key Moves** — the current key-move info panel (deviation details, best move suggestion), plus a scrollable list of all key moves in the game for quick navigation
2. **Eval Graph** — the `EvalGraph` component
3. **Your Games** — user games matching the current board position (FEN-based lookup via `DatabaseService`)
4. **Master Games** — master games matching current position (same FEN lookup)

For tabs 3 and 4: query `DatabaseService` by current FEN. This requires a FEN search method.

### 4.7 FEN-Based Game Search in DatabaseService

**File:** `src/services/database/DatabaseService.ts`

Add method to search games by FEN position:
```typescript
async searchUserGamesByFEN(fen: string): Promise<UserGame[]>
async searchMasterGamesByFEN(fen: string): Promise<MasterGame[]>
```

**Approach:** Since games store PGN text, we need to replay moves and check positions. This is expensive for large databases. Two options:

**Option A (simpler, acceptable for now):** Load games into memory lazily, replay their moves, and check if the position appears. Cache results per-session. This works fine for <1000 games.

**Option B (future optimization):** Create a `positions` index table mapping FEN → game IDs. Built during import. Query becomes a simple lookup. Save for later if Option A is too slow.

**Implement Option A** for now.

### 4.8 Tests

**Files:**
- `src/services/gameReview/__tests__/GameReviewService.test.ts` — update existing tests:
  - Test `centipawnsToWinProbability()` with known values
  - Test move classification with win-probability logic:
    - +300 to -100 → blunder (large win% swing near equality, ≥30%)
    - +1000 to +600 → NOT a blunder (tiny win% change when already winning)
    - 0 to -80 → inaccuracy or mistake (depending on exact win% swing)
    - Mate in 5 to +200 → blunder (missed forced mate, always a blunder)
    - -800 to -1200 → NOT a blunder (position already lost, win prob was ≤30%)
    - -200 to -600 → could still be mistake/blunder (win prob was ~30-40%, context-dependent)
    - +200 to mate in 3 → brilliant (if implemented)
  - Test Lichess eval fallback (positions with Lichess eval skip engine)
- `src/components/chess/__tests__/EvalGraph.test.ts` (new) — snapshot/render tests
- Update store tests for mandatory engine flow

**Coverage target:** GameReviewService classification ≥90%, EvalGraph ≥90%

---

## Workstream 5: UI — Reduced Padding & Basic Responsiveness

**Goal:** Global padding reduction. Ensure the app doesn't break on different screen sizes (reference: 5.8" screen, 18.5:9 aspect ratio).

### 5.1 Global Padding Pass

Across all screens, reduce inner padding:
- **Current typical pattern:** `padding: 20` or `padding: 16` on containers
- **New pattern:** `padding: 12` on screen containers, `paddingHorizontal: 12` on edge containers
- Keep `marginBottom`/`marginTop` between sections at `8-12` instead of `16-20`
- Board components should use `padding: 0` with only a small margin from screen edges

**Files to touch (at minimum):**
- `src/screens/AnalysisBoardScreen.tsx`
- `src/screens/RepertoireScreen.tsx`
- `src/screens/RepertoireStudyScreen.tsx`
- `src/screens/GameListScreen.tsx`
- `src/screens/ImportPGNScreen.tsx`
- `src/screens/SettingsScreen.tsx`
- `src/screens/TrainingScreen.tsx`
- `src/screens/gameReview/GameReviewDashboardScreen.tsx`
- `src/screens/gameReview/GameReviewScreen.tsx`

### 5.2 Dynamic Layout

Use `useWindowDimensions()` and `Dimensions` API consistently:
- Board size should fill available width minus edge padding (no hardcoded sizes)
- On wider screens (>500px), use side-by-side layouts where applicable (board + move list)
- On narrow screens, stack vertically
- Avoid fixed heights for content areas — use `flex: 1` and `ScrollView`

### 5.3 No New Tests Required

UI padding changes are visual and don't require unit tests. Verify manually on target device.

---

## Workstream 6: Repertoire Study — Chapter Select Modal

**Goal:** Replace horizontal chapter scroll with a vertical modal list that shows metadata.

### 6.1 Chapter Select Modal Component

**File:** `src/components/ChapterSelectModal.tsx` (new)

- Opens as a modal/bottom sheet on button tap
- Vertical scrollable `FlatList` of chapters
- Each chapter row shows:
  - **Chapter name** (full text, wrapping allowed)
  - **Move count** (number of moves/positions in the chapter's MoveTree)
  - **Last studied** date (if tracked — may need a new field, or skip if not yet tracked)
  - **Completion %** (positions drilled / total positions — only if training data exists)
- Search/filter bar at top for large lists
- Selected chapter highlighted
- On wide screens: can optionally render as a sidebar instead of modal

### 6.2 Integrate into RepertoireStudyScreen

**File:** `src/screens/RepertoireStudyScreen.tsx`

Replace the current `ChapterList` horizontal scroll with:
- A button/header showing current chapter name
- Tapping it opens `ChapterSelectModal`
- On chapter select, close modal and switch chapter

### 6.3 Tests

- Test modal renders chapter list correctly
- Test chapter selection callback
- Test metadata display (move count computation)

**Coverage target:** ChapterSelectModal ≥90%

---

## Workstream 7: Repertoire Study — Progressive Variation Loading

**Goal:** Fix the slow/memory-heavy training flow in `RepertoireStudyScreen` for large repertoires (500+ lines) by generating and holding only ~50 lines in memory at a time.

### 7.1 Lazy Line Generator

**File:** `src/services/training/LineGenerator.ts` (new)

Currently, all lines are extracted from the MoveTree upfront before drilling begins. Replace this with a lazy generator:

```typescript
interface LineGenerator {
  totalLines: number;         // Pre-counted without loading all lines
  loadedLines: Line[];        // Currently held in memory
  loadNextBatch(): Line[];    // Load next N lines, discarding completed ones
  markCompleted(line: Line): void;
  hasMore(): boolean;
  reset(): void;
}

function createLineGenerator(moveTree: MoveTree, batchSize: number = 50): LineGenerator
```

Line extraction uses DFS traversal (depth-first is the default study order). The generator tracks a traversal cursor so it can resume from where it left off without re-traversing the whole tree. Only `batchSize` lines are held in `loadedLines` at any time — completed lines are dropped and the next batch loaded automatically when the remaining count falls below a threshold (e.g., 10).

**Total line count** is computed in a single cheap pass (count leaf nodes) without storing lines, so the progress indicator is accurate from the start.

### 7.2 Integrate into RepertoireStudyScreen

**File:** `src/screens/RepertoireStudyScreen.tsx`

Replace the current upfront line extraction with `createLineGenerator`. On chapter load, create a generator and display the first batch. When the user completes lines, call `markCompleted()` — when remaining lines drop below threshold, transparently load the next batch in the background without resetting the board.

### 7.3 Tests

**File:** `src/services/training/__tests__/LineGenerator.test.ts` (new)

- Line extraction from a small MoveTree matches all expected root-to-leaf paths
- `totalLines` count is accurate before any lines are loaded
- First `loadNextBatch()` returns exactly `batchSize` lines (or all if fewer)
- After marking lines completed, `loadNextBatch()` returns the next batch without overlap
- `hasMore()` returns false only after all lines are exhausted
- Single-line tree (no variations): works correctly
- Tree with variations at every level: all branches covered across batches

**Coverage target:** LineGenerator ≥90%

---

## Workstream 8: Breadth-First Training — Bug Fix

**Goal:** Fix the broken BFS traversal in `RepertoireStudyScreen`. Currently each variation repeats the first move; the correct behavior tests each unique decision point once per tree level.

### 8.1 Correct BFS Algorithm

**File:** `src/services/training/BreadthFirstTrainer.ts` (new — extract BFS logic from `RepertoireStudyScreen`)

**Current broken behavior:** BFS repeats the first move (`1.e4`) for every variation, making it redundant and annoying for large repertoires.

**Correct behavior:**

1. **Test the first user move** (e.g., `1.e4`) — tested exactly once from the starting position
2. **Auto-play all opponent replies** at the branch (`e5`, `c5`, `e6`) — these are not tested, just shown
3. **Test the user's reply** to each opponent move — this is the first set of BFS "level 1" questions:
   - Board at `1.e4 e5` → user plays `2.Nf3`
   - Board at `1.e4 c5` → user plays `2.Nf3`
   - Board at `1.e4 e6` → user plays `2.d4`
4. **Go deeper BFS:** For each of those positions, auto-play the opponent's responses and queue the next user decisions
5. **Transposition rule:** Track tested FENs — if two branches reach the same position, test it only once

**Data structure:** Queue of `{ fen: string, expectedMove: string, moveNumber: number }`. Process the queue FIFO — each dequeued item shows the board at `fen` and waits for the user to play `expectedMove`.

### 8.2 Integration

**File:** `src/screens/RepertoireStudyScreen.tsx`

Replace the current BFS line-building logic with `BreadthFirstTrainer.buildQueue(moveTree, userColor)` which returns the ordered queue. The screen then works through the queue sequentially, handling correct/incorrect responses as it does today.

### 8.3 Tests

**File:** `src/services/training/__tests__/BreadthFirstTrainer.test.ts` (new)

- **Simple tree** `1.e4 → (e5, c5)`: queue order is `[1.e4, 1.e4 e5 ?, 1.e4 c5 ?]` — first move tested once, then replies at each branch
- **Deep tree**: verify BFS level-by-level — all level-1 questions before any level-2 questions
- **Transposition**: two branches reaching same FEN → position appears in queue only once
- **Single-line repertoire**: degenerates to sequential move testing
- **User plays black**: first user move is the reply to white's first move; white's moves are auto-played
- **Empty tree / single-move tree**: edge cases don't crash

**Coverage target:** BreadthFirstTrainer ≥90%

---

## Implementation Order (Recommended)

These workstreams have dependencies:

```
1. PGN Parsing (eval extraction)     ← No dependencies, foundation for others
2. Database (repertoire + settings)   ← No dependencies, foundation for others
3. Lichess Import (master games)      ← Depends on 1 (evals in URL)
4. Game Review (classification + UI)  ← Depends on 1 (Lichess eval), 2 (settings migration)
5. UI Padding                         ← Independent
6. Chapter Select Modal               ← Independent
7. Progressive Loading                ← Independent (targets RepertoireStudyScreen)
8. BFS Fix                            ← Independent (targets RepertoireStudyScreen)
```

**Suggested execution order:** 1 → 2 → 3 → 4 → 5/6/7/8 (all parallel)

---

## Files to Delete / Clean Up

- Remove `EvalThresholds` from `src/types/gameReview.types.ts` (replaced by win-probability)
- Remove thresholds section from `src/screens/SettingsScreen.tsx`
- Remove `thresholds` field from `ReviewSettings` type
- Remove any "no engine analysis" UI from `GameReviewScreen.tsx`
- Clean up `StorageService` calls for repertoires after migration is verified
