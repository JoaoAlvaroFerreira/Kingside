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
- Zustand store (`src/store/index.ts`) — most data via `DatabaseService` (SQLite), but `lineStats` and `gameReviewStatuses` still persist through `StorageService` (AsyncStorage) pending migration
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
- **Database**: SQLite storage for games, repertoires, settings, and FEN position indexes. `lineStats` and `gameReviewStatuses` still in AsyncStorage — pending migration.
- **ChessWorkspace**: Centralized board+engine+movehistory layout. Engine runs internally via `useEngine` — **do not call `useEngine` in screens that use ChessWorkspace**. Percentage-based board sizing. Wide/narrow responsive layout.
- **Orientation**: Full landscape/tablet support (`app.json "orientation": "default"`, `AndroidManifest screenOrientation="fullSensor"`)
- **Training System**: `TrainingDashboardScreen` + `TrainingSessionScreen` (full drill UI), `TrainingService` (SM2-based scheduling), `SM2Service`, `LineGenerator` (lazy DFS batches), `BreadthFirstTrainer` (BFS queue for user-move positions). At end of line, "Analyse on Board" pushes the `LineAnalysis` stack route (AnalysisBoardScreen with a `line` param) **on top of** the session — navigating to the drawer's Analysis screen instead would pop the session, which is rebuilt from route params on mount and would lose the drill.
- **FEN Position Index**: `searchUserGamesByFEN` / `searchMasterGamesByFEN` — SQLite FEN index ready, UI not yet wired
- **Find Position**: "Find Position" tab on Analysis Board / Repertoire Study lists which repertoire chapters contain the current FEN (indexed SQLite lookup via `DatabaseService.findChaptersByFen`), tap to jump to that chapter

### 🚧 In Progress
- **Local Stockfish**: Rewritten 2026-02-16, verify works correctly on device
- **Mistake-Driven Training**: Game Review flags deviations; training hasn't been wired to boost those line priorities yet

### 📋 TODO
- **Wire Review → Training**: When Game Review flags a deviation, reset/boost that line's SM2 interval in `lineStats`
- **Position Browser**: "Your games / Master games from this position" panel on Analysis Board (DB layer done, needs UI)
- **Decision Tree Visualization**: Show branching points explicitly in repertoire study
- **Linked Positions**: Connect similar structures across different openings
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
│       ├── LineGenerator.ts            # Lazy DFS line batches from MoveTree
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
   `repertoire_positions` carries `chapter_id` (schema v5), so `findChaptersByFen()` is one
   indexed lookup for the current position and names resolve from the store's repertoires.
   Rows are written **per chapter** — do not merge chapters when indexing or chapter identity
   is lost.
5. **`extractChapterPositions` reads each node's stored `fen`; it does not replay moves.**
   A node's pre-move position is its parent's FEN, so no `Chess` instance is needed except as
   a per-node fallback when `fen` is absent. Replaying through chess.js to recompute FENs
   already on disk was ~50x slower and was what made indexing noticeable on import.
   `extractRepertoirePositions.bench.test.ts` guards the cost and checks the stored-FEN path
   agrees with the replay fallback.

Indexing is cheap enough to stay inline: `addRepertoire`/`updateRepertoire` await it so the
index is never out of sync with the data. Renames go through `updateRepertoireMetadata`, which
skips indexing — the index depends only on chapter ids and move trees.

## Known Issues

### 1. Incomplete Storage Migration
**Status:** ONGOING — `lineStats` and `gameReviewStatuses` still persist via `StorageService` (AsyncStorage), not SQLite. `DatabaseService` handles everything else. The `deleteRepertoire` action cascades across both stores with no transaction — a crash mid-delete can leave orphaned line stats. `updateLineStats` rewrites the full array to AsyncStorage on every training answer; fine now, painful at scale.

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
- **SQLite via DatabaseService**: Repertoires, games, settings, and FEN indexes. Always use this for new data.
- **AsyncStorage via StorageService**: `lineStats`, `gameReviewStatuses` — legacy, not yet migrated
- **Automatic save**: Store mutations write to DB immediately
- **Store initialization**: `App.tsx` calls `initialize()` which loads from both stores
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

### Phase 1 — Complete Storage Migration
1. Migrate `lineStats` and `gameReviewStatuses` to SQLite with per-row writes
2. Make `deleteRepertoire` cascade in a single transaction across both stores

### Phase 2 — The Differentiator: Wire Review → Training
4. When Game Review flags a repertoire deviation, reset/boost that line's SM2 interval in `lineStats` — this closes the loop between the two halves that already exist

### Phase 3 — Cash In the FEN Index
5. ~~Position Browser: "Your games / Master games from this position" on Analysis Board~~ — done (Your Games / Master Games tabs); Find Position tab (repertoire chapters) added 2026-07-31
6. **Decision Tree Visualization**: Render branching points in repertoire study

### Phase 4 — Long-Term
7. **Move Categorization**: Tag moves as forced / main line / sideline / dubious / novelty
8. **Linked Positions**: Connect similar pawn structures across different openings
9. **Backup/Restore**: Export/restore DB file to Google Drive (90% of sync value, 5% of the effort vs. full backend)
