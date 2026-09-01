# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## Project Overview

Kingside is a React Native/Expo chess training app. Personal tool for a 2000+ rated player focused on deep repertoire understanding and efficient drilling through intelligent spaced repetition.

**Core Philosophy:** Learn from your own games, not just memorize theory.

**Primary Goals:**
- Build lasting chess knowledge through context-aware spaced repetition
- Connect patterns across different openings and positions
- Track and learn from personal mistakes
- Support deep variation analysis with decision tree visualization

**What This Is Not:**
- Not a generic opening database viewer
- Not a social platform or multiplayer app
- Not optimized for beginners (assumes strong foundational knowledge)

## Architecture

**Tech Stack:** React Native 0.76.9, Expo SDK 52, TypeScript (strict), chess.js 1.0.0-beta.8, Zustand, react-native-svg, React Navigation

**Android Build Requirements:**
- JDK 17 (configured in `android/gradle.properties`)
- Android SDK 35, Gradle 8.10.2
- Minimum SDK 23, Target SDK 35

**Path Aliases** (use these, not relative imports):
```
@/*           → src/*
@components/* → src/components/*
@screens/*    → src/screens/*
@services/*   → src/services/*
@hooks/*      → src/hooks/*
@utils/*      → src/utils/*
@store/*      → src/store/*
@types        → src/types
```

**State Management:**
- Zustand store (`src/store/index.ts`) — all data persists through `DatabaseService` (SQLite). `lineStats` is held in the store as a synchronous read model and written back one row at a time
- **Subscribe with selectors** (`useStore(s => s.x)`), never bare `useStore()` — the bare form subscribes to the whole store, so every write re-renders every consumer
- Date objects serialized/deserialized with custom reviver

**Navigation:**
- Drawer navigator for main screens (Analysis Board, Repertoire, Training, Game Review, Game List, Settings)
- Stack navigator for modals (ImportPGN, GameReviewScreen)

## Core Features & Status

### ✅ Implemented
- **PGN Import/Export**: Three import paths (Repertoire, My Games, Master Games) with file picker, text paste, and Lichess username import. Lichess import supports `evals=true` (parses `[%eval]` / `[%clk]` annotations into MoveTree nodes).
- **Repertoire Management**: Fixed 4-level hierarchy (Color → Opening Type → Variation → Sub-variation → Chapters), auto-categorization via ECO codes, chapter select modal, `lastStudiedAt` tracking
- **Game Review**: Engine analysis integration (local Stockfish), FEN-based repertoire matching with complete transposition detection, Lichess win-probability classification (blunder ≥30%, mistake ≥20%, inaccuracy ≥10%), eval graph, 4-tab UI (Key Moves / Graph / Your Games / Master Games)
- **Interactive Chess Board**: Full variation support, comment display (💬 indicators), touch handling optimized for mobile
- **Screen Settings**: Per-screen UI preferences (orientation, engine, eval bar, coordinates, move history, per-tab visibility for Your Games / Master Games / Find Position)
- **Backup/Restore**: Settings screen exports the SQLite file to a user-picked folder (Storage Access Framework) and restores one back. The WAL is checkpointed before copying, and a restore verifies the SQLite header before deleting anything. Android only.
- **Database**: SQLite storage for games, repertoires, settings, FEN position indexes, line stats and game review statuses. `StorageService` (AsyncStorage) survives only as the migration source.
- **ChessWorkspace**: Centralized board+engine+movehistory layout. Engine runs internally via `useEngine` — **do not call `useEngine` in screens that use ChessWorkspace**. Percentage-based board sizing. Wide/narrow responsive layout.
- **Orientation**: Full landscape/tablet support (`app.json "orientation": "default"`, `AndroidManifest screenOrientation="fullSensor"`)
- **Training System**: `TrainingDashboardScreen` + `TrainingSessionScreen` (full drill UI), `TrainingService` (SM2-based scheduling), `SM2Service`, `LineExtractor` (pulls drillable lines out of a MoveTree), `BreadthFirstTrainer` (BFS queue for user-move positions). At end of line, "Analyse on Board" pushes the `LineAnalysis` stack route (AnalysisBoardScreen with a `line` param) **on top of** the session — navigating to the drawer's Analysis screen instead would pop the session, which is rebuilt from route params on mount and would lose the drill.
- **FEN Position Index**: `searchUserGamesByFEN` / `searchMasterGamesByFEN` — SQLite FEN index ready, UI not yet wired
- **Find Position**: "Find Position" tab on Analysis Board / Repertoire Study lists which repertoire chapters contain the current FEN (indexed SQLite lookup via `DatabaseService.findChaptersByFen`), tap to jump to that chapter
- **Opening Books**: a `.kbook` is a prebuilt position→move frequency index, generated
  off-device from a PGN corpus far too large to import as games. Imported from Import Master
  Games, listed and deleted in Settings. Book moves join the **Master** arrow source and
  their per-move game samples feed the position game list.
- **Candidate-move arrows**: the board draws up to `CANDIDATE_MOVE_LIMIT` (4) continuations for the current position, thickness and opacity scaled to frequency. The source **follows the active tab** — Find Position → repertoire, Your Games → user games, Master → master games, Moves → engine arrow only — so one kind of arrow is on the board at a time. Wide/landscape layout has no tab bar and currently shows none.

### 🚧 In Progress
- **Local Stockfish**: Rewritten 2026-02-16, verify works correctly on device
- **Mistake-Driven Training**: Game Review flags deviations; training hasn't been wired to boost those line priorities yet

### 📋 TODO

- **Open a game and a repertoire *at the position you came from*.** Not urgent, but both
  halves are the same bug: you tap something from a position on the board, and what opens
  has thrown that position away.

  *Games.* Tapping a game in Your Games / Master / an opponent tab should switch to the
  **Moves** tab and select the move that reaches the position you were just looking at —
  falling back to the first move when the game somehow does not contain it. Today
  `AnalysisBoardScreen` loads via `route.params.game` (or `.line`) and calls
  `newTree.goToStart()` on both paths, so it *should* land at move 0; the report from the
  device is that it shows the last move, so confirm which is actually happening before
  changing anything — the entry point may not be the one it looks like. Either way neither
  end of the game is what is wanted: the point of tapping that game was this position.

  *Repertoires.* `Find Position` lists the chapters containing the current FEN and then
  navigates with `{ repertoireId, chapterId }` only — **the FEN is dropped**. A big chapter
  therefore opens at its root and the line you were looking for is somewhere inside a tree
  with hundreds of nodes, which is exactly the search the tab just did for you. Pass the
  normalized FEN through and have `RepertoireStudyScreen` walk its MoveTree to the first
  node whose stored `fen` matches, then select it.
- **Wire Review → Training**: When Game Review flags a deviation, reset/boost that line's SM2 interval in `lineStats`
- **Position Browser**: "Your games / Master games from this position" panel on Analysis Board (DB layer done, needs UI)
- **Decision Tree Visualization**: Show branching points explicitly in repertoire study
- **Linked Positions**: Connect similar structures across different openings
- **Further Lichess integration for position look-up**: Query Lichess for the current position (opening explorer / masters + player databases, and the tablebase at low piece counts) so the board's tabs can show moves played from here beyond what is imported locally. Online-only, so it must degrade cleanly when offline - the local FEN index stays the source of truth.
- **Backend & Sync**: Export/restore DB file to Google Drive as a low-cost alternative to full cloud sync

## Key Implementation Patterns

### MoveTree Serialization

MoveTree has `toJSON()` and `fromJSON()` for persistence:

```typescript
const moveTree = new MoveTree();
moveTree.addMove('e4');
const serialized = moveTree.toJSON();
await StorageService.save(serialized);

const data = await StorageService.load();
const restoredTree = MoveTree.fromJSON(data);
```

**Important:** MoveTree mutates internal state. Force re-renders after mutations:

```typescript
const [moveTree] = useState(() => new MoveTree());
const [, forceUpdate] = useState(0);

moveTree.addMove(san);
forceUpdate(n => n + 1);  // Trigger re-render
```

### Repertoire Matching (FEN-Based)

Game review checks if the RESULTING position (after playing a move) exists in repertoire, not if the move is expected from the current position. This handles ALL transpositions correctly.

```typescript
// Build position map from all repertoire chapters
const positionMap = buildRepertoirePositionMap(repertoires, userColor);
// Returns Map<moveCount, Map<normalizedFEN, Set<possibleMoves>>>

// During review, check if the RESULTING position is in repertoire
const repertoireMatch = checkRepertoireMatchFEN(
  preFen,        // Position BEFORE the move
  movePlayed,    // The move that was played
  moveCount,     // Ply count (0-indexed)
  isBlackMove,   // Whether this was Black's move
  userColor,
  positionMap
);
```

**Key Benefits:**
- Complete transposition detection - move order doesn't matter, only positions reached
- Performance optimization - first checks expected ply, then falls back to full search
- Handles end-of-line positions correctly

**Move Color Detection:**
After `chess.move(san)`, `chess.turn()` returns whose turn it is NOW, not who just moved:
- `chess.turn() === 'w'` → Black just moved
- `chess.turn() === 'b'` → White just moved

### PGN Parsing

**CRITICAL:** The `@mliebelt/pgn-parser` returns `game.tags` NOT `game.headers`, and Date is an object:

```typescript
// Parser output structure:
{
  tags: {
    White: "João Álvaro Ferreira",
    Black: "João Matos",
    Date: { value: "2025.01.04", year: 2025, month: 1, day: 4 },  // Object!
    Event: "2025 OTB: 2a Divisão",
    Result: "*",
    ECO: "E11"
  },
  moves: [...],
  gameComment: {...}
}

// Normalize Date extraction:
const rawTags = game.tags || game.headers || {};
const normalizedHeaders: Record<string, string> = {};
for (const [key, value] of Object.entries(rawTags)) {
  if (key === 'Date' && typeof value === 'object' && value !== null && 'value' in value) {
    normalizedHeaders[key] = value.value;  // Extract "2025.01.04"
  } else if (typeof value === 'string') {
    normalizedHeaders[key] = value;
  } else if (value !== null && value !== undefined) {
    normalizedHeaders[key] = String(value);
  }
}
```

**Comments:** Extract from `move.commentAfter` during `buildMoveTree()`:

```typescript
const currentNode = moveTree.getCurrentNode();
if (currentNode && move.commentAfter) {
  currentNode.comment = move.commentAfter;
}
```

### Platform-Specific File Reading

```typescript
import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system';

if (Platform.OS === 'web') {
  const response = await fetch(file.uri);
  const content = await response.text();
} else {
  const content = await FileSystem.readAsStringAsync(file.uri);
}
```

### React Native Conditional Rendering

**CRITICAL:** Always use logical AND (`&&`) for conditional rendering, NOT ternary with null:

```typescript
// ❌ Wrong - can cause "Unexpected text node" errors
{move.isCritical ? <Text>★</Text> : null}

// ✅ Correct
{move.isCritical && <Text>★</Text>}
```

### Mobile Touch Handling

**React Native coordinate bug:** `locationX` and `locationY` are unreliable in nested layouts.

**Solution:** Use absolute coordinates (`pageX`, `pageY`) and subtract measured board position:

```typescript
// In InteractiveChessBoard - measure via onLayout
const relX = touch.pageX - boardOrigin.current.x;
const relY = touch.pageY - boardOrigin.current.y;
const square = getSquareFromPosition(relX, relY);
```

**Performance:** Avoid console.log in touch handlers (causes lag).

## File Structure

```
src/
├── components/chess/
│   ├── InteractiveChessBoard/  # Main playable board
│   ├── MoveHistory/            # Move list with variations
│   ├── ChessWorkspace/         # Board + settings container
│   └── ChessBoard/             # Display-only board
├── navigation/
│   └── AppNavigator.tsx        # Drawer + Stack navigation
├── screens/
│   ├── AnalysisBoardScreen.tsx     # Default home screen
│   ├── RepertoireScreen.tsx        # List repertoires
│   ├── RepertoireStudyScreen.tsx   # Study with variations
│   ├── GameListScreen.tsx          # User/master games tabs
│   ├── ImportPGNScreen.tsx         # Import UI for 3 paths
│   ├── SettingsScreen.tsx          # Engine + review settings
│   ├── TrainingScreen.tsx          # Spaced repetition (TODO)
│   └── gameReview/
│       ├── GameReviewDashboardScreen.tsx  # Game list + color selection
│       └── GameReviewScreen.tsx           # Review UI
├── components/
│   └── ChapterSelectModal.tsx          # Full-screen chapter picker with search
├── services/
│   ├── pgn/PGNService.ts               # Parse & convert PGN (+ Lichess eval/clock annotations)
│   ├── openings/OpeningClassifier.ts   # Auto-categorize by ECO
│   ├── storage/StorageService.ts       # AsyncStorage wrapper (legacy)
│   ├── lichess/LichessService.ts       # Fetch games from Lichess API (evals=true)
│   ├── engine/
│   │   ├── StockfishContext.tsx         # React Context wrapping native hook
│   │   └── EngineAnalyzer.ts           # UCI protocol, parsing, cache
│   ├── gameReview/GameReviewService.ts # Analysis + Lichess win-prob classification
│   ├── settings/
│   │   ├── SettingsService.ts          # Review settings
│   │   └── ScreenSettingsService.ts    # Per-screen UI preferences
│   ├── database/
│   │   ├── DatabaseService.ts          # SQLite (games + repertoires + settings)
│   │   ├── WebDatabaseService.ts       # Web stub
│   │   └── MigrationService.ts         # Schema migrations + AsyncStorage→SQLite
│   ├── backup/BackupService.ts         # Export/restore the SQLite file (SAF + document picker)
│   └── training/
│       ├── LineExtractor.ts            # Drillable lines from a MoveTree
│       └── BreadthFirstTrainer.ts      # BFS queue of user-decision positions
├── store/index.ts              # Zustand store (reads/writes via DatabaseService)
├── utils/
│   ├── MoveTree.ts             # Core data structure
│   └── chapterUtils.ts         # countMoveTreeNodes, formatLastStudied
└── types/
    ├── repertoire.types.ts     # Repertoire, Chapter types
    ├── game.types.ts           # UserGame, MasterGame types
    ├── gameReview.types.ts     # Review types
    └── index.ts                # Type exports
```

## Development Commands

```bash
# Development
npm start              # Expo dev server (Metro bundler)
npm run android        # Run on Android device/emulator
npm run ios            # Run on iOS simulator
npm run web            # Run in web browser
npx tsc --noEmit       # Type check
npm test               # Run tests
npm run test:watch     # Run tests in watch mode

# Android Builds (Windows)
cd android && ./gradlew assembleDebug         # Build debug APK
cd android && ./gradlew assembleRelease       # Build release APK
adb install -r android/app/build/outputs/apk/debug/app-debug.apk

# Quick Scripts (in project root)
quick-rebuild.bat                             # Fast debug rebuild + install
build-release-apk.bat                         # Generate standalone release APK
release.bat v1.3.0                            # Bump version + build APK + commit + tag + push + GitHub release (gh CLI)
release.bat v1.0.0-beta.1                     # Prereleases work too (see Versioning below)
```

**Batch script gotcha (Claude Code / git-bash):** these `.bat` files call sibling scripts (`build-release-apk.bat`, `gradlew`) by bare filename. Some shells that hand off `.bat` execution to `cmd.exe` — including git-bash's sandboxed invocation used by Claude Code's Bash tool — don't replicate cmd's implicit "search current directory first" behavior for bare command names, so `call gradlew ...` fails with "not recognized" even though the file is right there. All three scripts now use explicit paths (`%~dp0` for sibling scripts, `.\` for `gradlew`) to work around this; a normal Windows terminal was never affected. If you add a new `call` to another script/binary in one of these files, qualify the path the same way.

## APK Size

The release APK is dominated by Stockfish. `libstockfish.so` is ~48MB **per ABI**, and
that is not debug symbols - AGP already strips it (54MB -> 48MB). `.rodata` is ~47MB
against ~740KB of `.text`, because the NNUE evaluation network is compiled into the
binary (`gEmbeddedNNUEData`). It is functional data: stripping cannot remove it, and
removing it would break the engine. Don't go looking for a strip flag that fixes this.

The only real lever is shipping fewer ABIs. Release builds are limited to
`arm64-v8a` + `armeabi-v7a` via `ndk.abiFilters` in the `release` buildType; **debug
builds deliberately keep all four** so the x86_64 emulator still runs. Re-adding x86
to release adds ~55MB each.

Further options, if size still matters:
- Drop `armeabi-v7a` (32-bit ARM, pre-~2017 devices) - roughly halves what is left.
- ABI splits (`splits.abi`) to publish one APK per ABI instead of a fat one; this
  changes `release.bat`, which assumes a single `app-release.apk`.

## Before a public 1.0.0: hide the personal-use features

The app is currently built for one user, and some features only make sense to that user.
They stay for now, but **1.0.0 is a public release and must not ship them visible**:

- **`.kbook` import** (Import Master Games → *Import .kbook File*). The format is a private
  SQLite schema invented for this app — it is not a standard, nothing else reads or writes
  one, and the only way to produce one is the generator in `D:\Projects\MyLands`. Shipping
  the button without shipping MyLands offers the public a file they cannot obtain.
  **Build From Account… stays** — that path needs no desktop step and is the public story.
- **Chessable import** (Import Repertoire → the Chessable modes). Personal workflow.

Hide, do not delete: they are still how the maintainer works. A build-time flag or a
hidden/debug settings toggle is enough — the underlying `BookService.importBook` is also
what `registerBuiltBook` validates through, so removing the *service* would break the
public path too.

**Everything else here is public-facing and stays**, including Prepare Against and Build
From Account. Note that `BuildBookScreen` is now reached from two entry points — Import
Master Games and Prepare Against's *Add Opponent* — so hiding the `.kbook` button must not
touch the screen or the route, only that one button in `ImportPGNScreen`.

## Prepare Against

An opponent profile is an opening book with `kind = 'opponent'`. Two rules make it
preparation rather than just another book, and both are load-bearing:

- **Opponent books never join the Master arrows.** `getMoveCandidates` with no `bookId`
  reads `listBooks('master')` only. Letting one player's blitz history into "master games"
  would quietly redefine that statistic — the board would show a club player's habits
  labelled as master practice.
- **They are always read hero-only.** For preparation you want what *they* chose, not the
  blend with whatever their opponents replied. This is inherent to the query, not the
  global Player Moves Only toggle, which still governs the Master source.
- **A colour is picked when the board opens, not inferred.** A player's book holds both of
  their colours, and hero-only alone alternates every ply — their openings as White, then
  their answers as Black — which is preparation against two different opponents at once.
  Prepare Against therefore opens with *Prepare as White* / *Prepare as Black*, and passes
  `opponentColor` (the colour *they* had); the board turns to face you.

  Two things follow from that colour, and they differ because the book stores different
  things about the two cases:
  - **Their arrows appear only on the plies they move** (`opponentMovesHere`). On your own
    ply they made no choice to prepare for.
  - **Their games are filtered per game**, by which side the book's `player` had. On their
    ply the hero counts are already the per-colour counts, so the total is exact; on your
    ply the book does not record how its games split by colour, so `totalGames` is 0 and
    the list shows its own size rather than a number that would be wrong.

The board gains one tab, present only when opened from Prepare Against, beside the Find
Position tab that already says which of your own chapters cover the position — which is the
whole point: their move and your preparation for it, on the same screen.

**OTB games arrive as a PGN, deliberately.** No public API hands you an arbitrary player's
over-the-board games — ChessBase and chesstempo have no open game export, and TWIC-scale
downloads would just be rebuilding Caissabase. `addGamesFromPgn` merges a file into the
*same* profile, so one opponent stays one profile whatever the games' origin. The file's
content hash is stored and re-importing it is refused: exactly the rule that stops a month
being fetched twice, for exactly the same reason.

## Opening a position on a board

Every "open this elsewhere" action carries the position it was fired from, because all of
them previously landed somewhere the reader had to correct by hand:

- **A game tapped from the games list keeps the board where it is.** `handleSelectGame`
  records the current node before appending the continuation and navigates back to it —
  `addMove` advances the cursor, so appending 50 moves otherwise left the board on the
  game's *final* position, the one place the reader did not ask about.
- **A game opened from another screen takes `atFen`.** `RepertoireStudyScreen` passes the
  position it was showing; without it the game opens at move one.
- **Find Position passes `atFen` to `RepertoireStudy`.** A chapter runs to hundreds of
  moves, so opening at its root discards the very thing the lookup just found. Missing the
  position falls back to the root: the index can lag an edit.
- The seek uses `MoveTree.findNodeIdByFen`, breadth-first over normalized FENs — shallowest
  match wins, and transpositions match despite differing move counters.
- Loading anything **switches to the Moves tab** via `showMovesSignal`, a counter (not a
  boolean) on `ChessAnalysisLayout` so a second load from the same list switches back again.

**The opponent tab is screen state, not a route param.** `AnalysisBoardScreen` copies
`opponentBookId`/`opponentName` into state on arrival and clears the params immediately.
A drawer route keeps its params, so reading them directly left an opponent's tab on the
board for every later visit; the focus reset that rebuilds the board clears the opponent
with it.

## Import is bounded by time, not by months

`BUILD_BUDGET_MS` (120s) stops a build or refresh at the next month boundary and hands back
a usable book, with `remaining` saying how many months are left; Refresh continues.

It is a **time** budget rather than a month cap because months are not comparable between
accounts. Measured at ~35 games/sec on device, two minutes is ~4,150 games — about **1.7
months** of a streamer's bullet output and **over 130 months** of a casual player's. Any
fixed month count that suited one would be absurd for the other. Time also self-corrects
for a slower phone, which a game count would not.

Two consequences:

- **Months are walked newest-first.** A budgeted run has to leave behind the months a
  player actually prepares against; oldest-first would spend the entire budget on games
  from a decade ago and stop before reaching anything current.
- **The budget is only checked at month boundaries**, because a month is the resume unit
  and a partial month cannot be marked complete without risking its games being fetched
  twice. Overshoot is bounded by one month.

## Versioning

The app is pre-1.0 on purpose: **1.0.0 is reserved for the Play Store release.**
Ship betas as `1.0.0-beta.N`.

`scripts/bump-version.js` accepts `X.Y.Z` or `X.Y.Z-(alpha|beta|rc).N` and stamps
package.json, app.json and `android/app/build.gradle`. Android `versionCode` is derived:

```
versionCode = major*1000000 + minor*10000 + patch*100 + slot
slot: alpha.N -> N,  beta.N -> 30+N,  rc.N -> 60+N,  final release -> 99
```

Each patch level owns a block of 100 codes, so a prerelease always sorts *below* the
release it precedes while still rising monotonically. The scheme deliberately sits far
above the old `major*10000` codes (v1.0.0 shipped as `10000`) — otherwise Android
refuses the upgrade as a downgrade and the tester has to uninstall first. Don't
renumber downwards.

## App Icon / Splash

- Source design: `logo.svg` (project root) — 680x680 rook icon, bg `#080e1a`, accent `#7eb8e8`.
- Generated assets in `assets/images/`: `icon.png`, `adaptive-icon.png`, `favicon.png` (full design), `splash-icon.png`/`.svg` (rook only, transparent, for splash).
- Referenced from `app.json` (`icon`, `android.adaptiveIcon`, `web.favicon`, `expo-splash-screen` plugin).
- Android native resources (`android/app/src/main/res/mipmap-*/ic_launcher*.webp`, `drawable-*/splashscreen_logo.png`, `values/colors.xml` splashscreen_background) are **manually generated** from the SVGs — this project does NOT use `expo prebuild` (would risk clobbering custom native Stockfish integration). To regenerate after changing `logo.svg`, re-run `rsvg-convert` at each density (mdpi 48/288, hdpi 72/432, xhdpi 96/576, xxhdpi 144/864, xxxhdpi 192/1152 for icon/splash respectively) and rebuild.

## Startup Performance (fixed 2026-08-04 — keep these invariants)

A multi-minute "infinite loading" stall on launch with large repertoires had four
distinct causes, fixed across v1.4.0–v1.4.2. Regressing any one brings it back:

1. **Never index during `initialize()`.** `DatabaseService.backfillRepertoirePositionsIfNeeded()`
   is called by the store *after* startup data has loaded, not from `initialize()`. It shares the
   single SQLite connection with `getAllRepertoires()`; "fire and forget" is not enough, because
   the work still queues ahead of the startup reads on the same connection.
2. **Index completion is tracked per repertoire**, via a `rep_pos_indexed:<id>` marker in
   `settings`, cleared before writing and set only after all batches commit. A single
   end-of-loop flag meant an interrupted backfill redid *everything* on every later launch.
3. **No `JSON.parse` reviver on repertoire blobs.** A reviver fires per key across the whole
   move tree to catch a handful of dates. `reviveRepertoireDates()` touches only the known
   `createdAt`/`updatedAt`/`lastStudiedAt` fields.
4. **Find Position queries SQLite; it never builds an in-memory index.**
   `repertoire_moves` carries `chapter_id` (schema v6), so `findChaptersByFen()` is one
   indexed lookup for the current position and names resolve from the store's repertoires.
   Rows are written **per chapter** — do not merge chapters when indexing or chapter identity
   is lost.
5. **`extractChapterMoves` reads each node's stored `fen`; it does not replay moves.**
   A node's pre-move position is its parent's FEN, so no `Chess` instance is needed except as
   a per-node fallback when `fen` is absent. Replaying through chess.js to recompute FENs
   already on disk was ~50x slower and was what made indexing noticeable on import.
   `extractRepertoirePositions.bench.test.ts` guards the cost and checks the stored-FEN path
   agrees with the replay fallback.

Indexing is cheap enough to stay inline: `addRepertoire`/`updateRepertoire` await it so the
index is never out of sync with the data. Renames go through `updateRepertoireMetadata`, which
skips indexing — the index depends only on chapter ids and move trees.

## Position → Move Frequency Index (schema v6)

Two indexes answer "what gets played from this position, and how often":

- **`repertoire_moves`** — one row per (chapter, position, move), replacing v3-v5's
  `repertoire_positions` and its JSON `next_moves` blob. Normalized so ranking is a
  `GROUP BY` over an index; the blob form meant fetching a row per chapter and
  `JSON.parse`-ing each in JS, and after `1. d4 Nf6` that is thousands of rows on every
  board move.
- **`game_positions.next_move`** — the SAN played from each indexed game position.
  Written on import; **deliberately not backfilled**, so rows imported before v6 keep
  `next_move` NULL and simply don't feed the frequency query.

**`var_depth` is how main-line a move is**, and it is what ranks repertoire arrows.
It counts the steps on the path from the chapter root that were *not* a first child:
following first children keeps it 0, entering a sideline makes it 1 and everything below
that sideline stays ≥1, a sideline of a sideline is 2. Queries take `MIN(var_depth)` across
chapters — if any chapter treats a move as its main line, it ranks as one — then break ties
on chapter count. `extractChapterMoves.test.ts` pins these semantics.

**Arrow weight = frequency x main-line factor**, not frequency alone (`candidateWeight` in
`useCandidateMoves.ts`, dimming depth 1 to 0.75 and depth 2+ to 0.55). Frequency alone made a
chapter's main line and its sideline render identically, since both have a count of 1 — the
ranking was computed and then thrown away visually. Game sources have no `varDepth` and are
never dimmed.

**The display cap is applied after aggregation, never before.** `LIMIT 4` following the
`GROUP BY` is correct; capping scanned rows would silently corrupt the frequencies at exactly
the early positions where the ranking matters most. This is a different cap from
`POSITION_MATCH_LIMIT`, which bounds list lookups.

Repertoire candidates are **not filtered by color** by default, matching Find Position: what
matters is which chapters contain the position, not which side's repertoire they came from.

## Training Configuration: three axes, not one "mode"

A drill is three independent choices, and `TrainingConfig` keeps them apart:

- **`selection`** — which lines go in the pool (`all`, `due`, `recommended`, `from-position`)
- **`order`** — how the pool is walked (`depth-first`, `width-first`, `random`)
- **`guidance`** — whether the board shows the answer (`none`, `learn`, `semi-learn`)

`maxDepth` and `opponentBranchingOnly` are pool filters and sit outside the three.

These were previously a `mode` enum plus a row of booleans (`includeOnlyDueLines`,
`learnMode`), which put a traversal order, a pool filter and a display setting side by side
as peers — so every new drilling idea added a boolean that multiplied against all the
others. **Add a new drilling idea by extending one of the three, never by adding a flag.**

`TrainingSession` mirrors `order` and `guidance`; it does not keep `selection`, which has
already done its work by the time the pool exists. Route params for the `TrainingSession`
screen are the `TrainingConfig` itself — the session is rebuilt from them on mount, so the
params and the config must stay the same shape.

Things worth knowing about the individual values:

- **`random` shuffles before the active/holdback split**, not after. Shuffling the active
  batch alone just reorders the same first hundred lines and never reaches the rest of a
  large repertoire. The exception is `recommended`, where priority order is the point: there
  the batch is still the highest-priority lines and `random` shuffles only within it.
- **`recommended` scores by mistake rate**, with a never-drilled line pinned at
  `UNSEEN_LINE_SCORE` (0.5) so new material ranks above lines you mostly get right and below
  ones you are actively failing. Ties break on how overdue. The dashboard surfaces the same
  signal as "Struggling With" / "Never Drilled".
- **`from-position` trims each line** to start at the given FEN (`trimLineToPosition`) and
  drops lines that never reach it. The line keeps its id, so the scheduler still treats the
  drill as evidence about that same line. Seeded from the Analysis Board's "Drill from this
  position", which hands the FEN to the dashboard — the repertoire is still chosen there,
  because a position usually sits in several.
- **`semi-learn` reads and writes `seen_moves`.** A move is marked seen on the first
  *correct* answer and the row is deleted on a mistake, so the arrow comes back. Full `learn`
  skips the SM2 rating; `semi-learn` does not — it is still a test, and its ratings are what
  feed `recommended`.

## "Alternatives": the branches a drill did not take

Mid-drill you often want to know what your repertoire says against their *other* replies to
the move you just played. Depth-first will not reach those branches for a long time, so the
session header has an **Alternatives** button beside End Session.

- **The anchor is the position the line branched from** — where the move *before* your
  current one was played, which is normally their reply. Alternatives are every other move
  from that position, each followed by the answer prepared for it.
- **One user move deep, never more.** It is a detour, not a second session; a line that runs
  twenty plies past the branch contributes only its next answer.
- **Searched across all the session's chapters.** A repertoire files the opponent's other
  replies as separate chapters, so restricting to the current chapter would find nothing —
  drilling the Sicilian and asking what meets 1...e5 is the case it was built for.
- **Nothing is written to SM-2.** The fragments carry synthetic `alt:` ids: crediting a whole
  line's schedule for two moves of it would push out a line that was never drilled. So a
  detour line finishes by advancing, with no rating prompt.
- **The interrupted session is untouched**, because it is simply held in screen state while
  a second session object is drilled — `TrainingService` mutates whichever session it is
  handed. It resumes at the same position when the detour ends or you press Resume Line.

Fixed alongside it: `completeLineAndAdvance` now records the finished line's progress.
`processUserMove` answers the *last* move of a line with `line-complete` and so never reaches
`advanceWidthFirst`, which is what normally writes progress — leaving the width-first search
to find the line unfinished and ask its final move again. With one-move detour lines that
loop was immediate.

## Opening Books (`.kbook`)

A book answers "what gets played from this position, and how often" for a corpus that
cannot be imported as games. The case it was built for: 139,588 chess.com games, 452MB,
~13.2M position-instances. As games that is ~13.2M `game_positions` rows plus 452MB of PGN
text in a column; the first step alone — `readAsStringAsync` on a 452MB file — exhausts
memory before parsing starts.

**The corpus is far larger than the information in it.** Over the full file, first 30
plies: 2,147,309 unique (position, move) pairs, of which only **232,561 (10.8%) occur more
than once** — and by ply 23–30 that falls to 3.2%. A singleton says nothing about what a
player *usually* does. So a book keeps every pair to ply 16 and only repeated pairs beyond:
**593,450 rows, 121MB**, imported in seconds.

Generated by `make_book.py` in `D:\Projects\MyLands\Game Extraction`; the format contract
is `BOOK_FORMAT.md` there. Regenerating is minutes, which is why books are **excluded from
backups** — backup exists for what cannot be rebuilt.

Things that are load-bearing:

- **A book is a separate SQLite file on its own connection**, never ATTACHed and never
  merged into `kingside.db`. Nothing needs a cross-database join: candidates come from
  `book_moves` alone, games from `book_games` alone. Separate files are also what make a
  book deletable as one `unlink` and keep 100MB+ out of every backup copy.
- **The file is copied, never read.** `BookService.importBook` does `copyAsync` and opens
  the result. Reading a book into a JS string is the exact failure the format exists to
  avoid, so the `.kbook` path must never reach `readFileWithTimeout`.
- **`hero_n` splits the player from their opponents.** Every game in a player book has the
  same player on one side, so raw counts blend his choices with his opponents' replies.
  Surfaced as the **Player Moves Only** setting, which filters to `hero_n > 0` *and ranks by
  `hero_n`* — ranking by the blended `n` under a player filter would put a move his
  opponents chose hundreds of times above one he actually plays. In this corpus it moves
  Nf3 ahead of d4 at the start position, which is the real answer to "what does he open
  with". On a position where the opponent is to move it yields nothing, which is honest
  rather than falling back to everyone's moves.
- **A position's game count and its openable games are different numbers.** Each move keeps
  at most `SAMPLE_GAMES` ids, so what can be opened at a position is `distinct moves x
  SAMPLE_GAMES` — never the position's real total. At the starting position of a
  139,513-game book that was 160; for an opponent with three first moves it was **24**,
  which reads as "that is all they played". So the tab and list show the true count from
  the aggregate's own `n`/`hero_n` ("51+ of 2,000"), which needs no rebuild, and
  `SAMPLE_GAMES` is **50**, matching `POSITION_SAMPLE_LIMIT` so one move can fill the list
  on its own. Raising it is nearly free: measured on a real 593,450-pair book only 0.8% of
  pairs even have 50 games, so id text grows 8.0MB → 10.9MB on a 121MB book.
- **`rebuildIndex` re-indexes from the games a book already holds.** `book_games` keeps
  every game's moves, so build-time choices — the sample cap, the prune thresholds — can be
  improved on an existing book without fetching the account again. Cost is the original
  build's replay: seconds for a small profile, an hour for a very large one, so where a
  source PGN still exists on a desktop, regenerating there is faster. A *refresh* is not a
  substitute: it only re-samples the pairs its new months touch.
- **`sample_games` replaces a full position index.** Answering "every game that reached
  here" needs a row per game per ply — the 13M-row table being avoided. Each move instead
  carries a bounded set of recent games, so drill-down is a *sample*, by construction. The
  UI shows `50+` rather than `50` for exactly this reason: the count is a sample size, and
  a bare number reads as a total. The same applies to the local game sources, which are
  capped by `POSITION_MATCH_LIMIT`: `searchUserGamesByFEN`/`searchMasterGamesByFEN` return
  `PositionGames<T>` and select one row **past** the cap, so truncation is known without a
  second `COUNT(*)` over the join — which at an early position would scan most of the index
  just to produce a number.
- **Samples rank by game date, never by id.** Ids follow file order, and chess.com writes
  newest-first while other exports run oldest-first — ranking on id silently picked 2010
  games out of a 2025 archive.
- **No index on `book_moves(fen)`.** The table is `WITHOUT ROWID` with `PRIMARY KEY (fen,
  move)`, so it already *is* a B-tree ordered by fen. Adding one cost 40MB of a 162MB book
  and produced an identical query plan.
- **Position lookups are keyed on every input, not just the FEN.** `useGameSearch`
  memoizes on `fen|playerMovesOnly|bookRevision`. Keying on the FEN alone left the board
  showing the previous answer whenever a filter changed or a book was installed under a
  stationary position — the position is only one of the things that decides the result.
- **A book records how it was fetched, and which months it has.** `book_meta` carries the
  fetch `spec` plus a `period:YYYY-MM` marker per covered month, which is what makes
  *refresh* cost minutes instead of the hour a rebuild takes. `BookBuilder.refresh` fetches
  only unmarked months and merges them into the existing aggregate with an UPSERT.
  Two consequences worth knowing: the original build pruned rare deep pairs and dropped
  `staging`, so a pruned pair cannot be resurrected — new rows survive only if they are
  shallow, repeat within the batch, or already exist. And a month is **never re-fetched**,
  because refresh has no dedupe: re-reading a month already in the book would add its games
  a second time. A book built before this (or by an older generator) has no `spec` and says
  so rather than guessing filters.
- **Lichess answers throttled requests with a 404**, not a 429, on the game-export
  endpoint — the same status a missing account gives. `httpGet`'s `notFound: 'throttled'`
  says "this endpoint's 404 means back off"; `LichessService` instead probes the *profile*
  endpoint, which is not throttled the same way, to tell the two apart. Reporting "user not
  found" for a rate limit sends the user off checking a username that was correct.
- **The registry and the files drift.** A restore swaps `kingside.db`, and with it
  `master_books`, while the book files stay on disk. `listBooks()` forgets records whose
  file is missing; `pruneOrphanFiles()` deletes files no record points at. Both run after a
  restore.
- **FEN and SAN must match chess.js exactly.** The book is built with python-chess and
  queried with chess.js. Verified byte-identical over 12,134 FENs and 15,788 SANs — both
  print the en-passant square only when an ep capture is legal. A convention change on
  either side would make every key miss silently rather than error, so re-run that
  comparison if either library is upgraded.

## Stored game cost (`master_games` / `user_games`)

Measured against a real chess.com corpus, one stored game cost **~18.5 KB** — 0.42 GB for
a 24k-game master database:

| | per game |
|---|---|
| `pgn` (raw, with `[%clk]`) | 3,326 B |
| `moves` (JSON array) | 659 B |
| `game_positions` rows (94 plies) | 8,084 B |
| its FEN index | 6,768 B |

**`game_positions` is 81% of that**, because every ply of every game was indexed.
`POSITION_INDEX_MAX_PLY` (40) caps it, roughly halving the cost of a stored game.

This is a real trade-off, not a free win: **a position deeper than ply 40 is no longer
findable** by the Your Games / Master / Find Position lookups. It is defensible because
past that depth positions are nearly always unique — the match returns the single game you
were already looking at — but raise the constant if middlegame search matters more than
the space. Existing rows keep their original depth; the cap applies to what is indexed
next, the same way `game_positions.next_move` was deliberately not backfilled.

**The raw PGN is no longer stored** (schema v8). Measured over 3,000 real games, the
movetext is ~2,800 B of which ~1,862 B is `[%clk]` comments *nothing in the app reads*; the
SAN itself is ~844 B and the ~617 B of headers are already columns. So a game is stored as
its parts and the PGN is rebuilt on read by `gameStorage.buildPgn`.

The one annotation that is **not** dead weight is `[%eval]`: `GameReviewService` reads those
to skip Stockfish for positions Lichess already analysed. They get their own column and are
written back into the reconstructed PGN, so that parser keeps working untouched. Dropping
them would have made review quietly slower, not just lossier — check for this before
trimming anything else from a stored game.

`moves` is now space-separated SAN rather than a JSON array. Legacy rows are detected by
their leading `[` (SAN never starts with one) and are read unchanged — **existing rows are
deliberately not rewritten**, because a full-table migration of tens of thousands of games
at startup is exactly what the startup-performance rules above exist to prevent.

`pgn` is written as `''`, not `NULL`: the column is `NOT NULL` on installs predating v8, and
a device run rejected `NULL` outright where the mocked DB in the unit tests did not.

Note the division of labour: even fully reshaped, this is the wrong home for a 100k-game
corpus — that is what a book is for. The reshape matters for the master database you browse
game-by-game and for user-game volume.

## Known Issues

### 1. Storage Migration
**Status:** RESOLVED 2026-08-26. `lineStats` and `gameReviewStatuses` live in SQLite (`line_stats`,
`game_review_statuses`). Three things follow, and each is load-bearing:

- **`deleteRepertoire` is one transaction** covering the repertoire, its index marker, its
  `repertoire_moves` rows and its `line_stats` rows. Anything else keyed to a repertoire
  belongs in that same transaction.
- **`updateLineStats` writes one row**, not the whole array. The store still holds the full
  array as a synchronous read model so `getDueLineStats` and its consumers stay sync — that is
  a deliberate choice, not an oversight. Revisit only if the row count actually hurts.
- **Dates are stored as epoch ms**, so `next_review_date <= ?` is an indexed comparison and this
  data needs no date reviver.

Training data is now inside the SQLite file, so **backup/restore finally covers it** — before
this, a restore silently brought back repertoires without their training progress.

`MigrationService.migrateTrainingData()` moves the AsyncStorage copy across, behind its own
`migration_training_v1` flag: the games and repertoire flags are already set on every existing
install, so reusing either would have skipped this forever. The AsyncStorage keys are
deliberately **left in place** — that copy is the only backup of the history. Delete them a
release later.

### 2. MoveHistory nav arrows — partially diagnosed
**Status:** one trigger fixed 2026-08-04, not confirmed closed.

The arrows aren't actually floating: they're a normal flex row after the ScrollView in `MoveHistory`, with `flexShrink: 0`. So **any** time MoveHistory's container is given less height than its content needs, the row is pushed out of view. One cause was the ChessWorkspace comment box not being reserved from the wide-mode board budget (fixed). Others may remain — check container height budgets first.

The "lose state" half of the symptom is likely unrelated: `canGoBack`/`canGoForward` read `moveTree.isAtStart()/isAtEnd()` directly, and MoveTree is mutable, so a screen mutating it without forcing a re-render leaves the arrows stale. Unverified.

### 3. Console.log in production code
**Status:** RESOLVED 2026-08-18. `babel-plugin-transform-remove-console` strips `console.log` from
release builds only (`env.production` in `babel.config.js`); `error` and `warn` are kept so a
tester's logcat still explains a crash. The ~130 calls remain in source and are fine in dev — but
still avoid adding them to touch handlers, which is where they measurably lag the board.

## Important Notes

### General
- **Long lists must not render whole.** Repertoires reach 1000+ chapters and the master DB
  holds ~24k games, so every list is either a `FlatList` (`ChapterList`, `GameList`,
  `RepertoireMatchList`, `ChapterSelectModal`) or paged behind a "Show more"
  (`RepertoireScreen` chapters — it is inside a `ScrollView`, so it cannot virtualize).
  `RepertoireScreen` rows call `getChapterStats`, which walks the chapter's move tree, so
  row count is real work, not just layout. Position lookups
  (`searchUserGamesByFEN`/`searchMasterGamesByFEN`/`findChaptersByFen`) are capped at
  `POSITION_MATCH_LIMIT` — an early position otherwise matches most of the database.
- **Path aliases required**: Use `@components/*` not `../../components`
- **MoveTree is mutable**: Always force-update React after mutations
- **chess.js is beta**: v1.0.0-beta.8 API may differ from docs
- **Validate FEN**: Board components crash on invalid FEN
- **Offline-first**: All features work without internet
- **Engine disabled by default**: All screens start with engine OFF

### PGN Import
- **Aborts must not write.** Cancel and timeout both raise `ImportAbortedError`, which
  unwinds *before* any `addRepertoire`/`addUserGames`/`addMasterGames` call, and the user
  is told nothing was saved. The old code set a `setTimeout` that only flipped a flag, so
  a "timed out" import still finished and saved. Any new write in the import path must sit
  after a `throwIfAborted()` — including chessable model games, which are built early but
  written only once the chapter loop completes.
- **Aborts are only observed at yield points** (`processBatch` batches, the chessable group
  loops). A new long synchronous loop needs its own `throwIfAborted()`.
- **BOM handling**: Files starting with ﻿ are cleaned automatically
- **Moves-only accepted**: Simple move lists like "1. e4 e5 2. Nf3" work
- **Multi-game support**: Single file can contain multiple PGNs
- **Platform differences**: Web uses `fetch()`, native uses `FileSystem`
- **Parser quirk**: Returns `game.tags` NOT `game.headers`, Date is object not string
- **Comments**: Extracted from `move.commentAfter`, shown with 💬 indicator

### Storage & Persistence
- **Date objects**: Automatically serialized/deserialized with custom reviver
- **SQLite via DatabaseService**: Repertoires, games, settings, FEN indexes, line stats, review statuses. Always use this for new data.
- **AsyncStorage via StorageService**: migration source only — no app code writes to it any more
- **Automatic save**: Store mutations write to DB immediately
- **Store initialization**: `App.tsx` calls `initialize()`, which runs migrations then loads everything from SQLite
- **Migration**: `MigrationService` runs once on first launch to move AsyncStorage data to SQLite

### Game Review
- **FEN-based matching**: Uses position map built from MoveTree
- **Transposition detection**: Different move orders to same position recognized
- **Color selection**: Always prompted per review session
- **First deviation only**: Only first repertoire deviation marked as key move
- **Engine optional**: When disabled, only repertoire deviations tracked

### ChessWorkspace Engine Architecture
**CRITICAL**: `useEngine` is called **inside** `ChessWorkspace`, not in screens. This isolates Stockfish state updates to the workspace subtree, preventing full-screen re-renders on every analysis line.

- Screens pass `fen`, `moveTree`, navigation handlers — **never** `currentEval` for live analysis
- `currentEval` prop is only for **pre-computed** data (e.g. GameReview replay). Omitting it = internal engine.
- `useEngine` throttles partial updates to 250ms to prevent flooding the render queue
- `evalBarReserved = 13px` is subtracted from `availableForBoard` when eval bar is visible, preventing board overflow

### Debugging
- **Log prefixes**: "Store:", "RepertoireScreen:", "[GameReview]", "[FEN-Match]"
- **Storage keys**: `@kingside/repertoires`, `@kingside/user-games`, `@kingside/master-games`
- **Performance**: Avoid console.log in touch handlers

## Testing

**Test Framework:** Jest with TypeScript (ts-jest preset)

**Running Tests:**
```bash
npm test                          # Run all tests once
npm run test:watch                # Run tests in watch mode
npm test -- <filename>            # Run specific test file
npm test -- --coverage            # Generate coverage report
```

**Test Helpers:**
- `buildMoveTreeFromMoves(moves: string[])` - Create MoveTree from move sequence
- `buildMoveTreeWithVariations(lines: string[][])` - Create MoveTree with multiple variations
- `createTestRepertoire(name, color, lines)` - Generate test repertoire with multiple chapters
- `createTestRepertoireWithVariations(name, color, lines)` - Generate test repertoire with variations

**Current Coverage:**
- `GameReviewService` - FEN-based repertoire matching with transposition detection (18 tests)
- `MoveTree` - core data structure (full coverage)
- `TrainingService` - SM2 scheduling and line stats
- `DatabaseService`, `PGNService`, `StorageService`, `ScreenSettingsService`, `OpeningClassifier`

## Next Steps

### Phase 1 — Complete Storage Migration ✅ done 2026-08-26
1. ~~Migrate `lineStats` and `gameReviewStatuses` to SQLite with per-row writes~~
2. ~~Make `deleteRepertoire` cascade in a single transaction across both stores~~
3. Drop the legacy `lineStats` / `gameReviewStatuses` AsyncStorage keys once the SQLite copy
   has proven itself on device

### Phase 2 — The Differentiator: Wire Review → Training
4. When Game Review flags a repertoire deviation, reset/boost that line's SM2 interval in `lineStats` — this closes the loop between the two halves that already exist

### Phase 3 — Cash In the FEN Index
5. ~~Position Browser: "Your games / Master games from this position" on Analysis Board~~ — done (Your Games / Master Games tabs); Find Position tab (repertoire chapters) added 2026-07-31
6. **Decision Tree Visualization**: Render branching points in repertoire study

### Phase 4 — Long-Term
7. **Move Categorization**: Tag moves as forced / main line / sideline / dubious / novelty
8. **Linked Positions**: Connect similar pawn structures across different openings
9. **Backup/Restore**: Export/restore DB file to Google Drive (90% of sync value, 5% of the effort vs. full backend)
10. **Further Lichess integration for position look-up**: Opening explorer / masters / tablebase queries for the current position, alongside the local FEN index
