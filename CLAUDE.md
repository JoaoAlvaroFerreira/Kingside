# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Kingside is a React Native/Expo chess training app. Personal tool for a 2000+ rated player focused on deep repertoire understanding and efficient drilling through intelligent spaced repetition.

## Vision & Goals

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

## Core Features

### 1. Intelligent Spaced Repetition

**Unique approach - not standard SM-2 flashcards:**

- **Context-aware cards**: Include surrounding moves and themes, not isolated positions. A card for move 10 should show the path that led there.
- **Mistake-driven priority**: Positions where you've failed in your own games get higher review frequency.
- **Difficulty scaling**: Intervals adjust based on position complexity (tactical positions vs quiet positional moves) not just recall success.
- **Game reference**: Your own games serve as the training data source. Import via PGN files, future Chess.com/Lichess API integration.

### 2. Variation Analysis

**Unique approach - beyond linear move lists:**

- **Decision trees**: Visualize critical branching points explicitly. At move 8, there are 3 main responses - show this structure clearly.
- **Linked positions**: Connect similar pawn structures, themes, or piece configurations across different opening lines. Recognize when your Sicilian structure resembles your French structure.
- **Move categorization**: Tag moves as forced, main line, sideline, dubious, or novelty.

### 3. PGN Import/Export

- Import games from PGN files (batch import supported)
- Parse variations and comments
- Export repertoire to standard PGN format
- Future: Direct Chess.com/Lichess account linking

### 4. Engine Analysis (Future)

- Local Stockfish integration
- Position evaluation display
- Blunder detection in imported games
- Suggested improvements for failed positions

## UI Structure

**Navigation:** Hamburger menu → Sidebar drawer

**Five Main Sections:**

| Screen | Purpose | Home? |
|--------|---------|-------|
| **Analysis Board** | Free-form position analysis, default landing page | Yes |
| **Repertoire** | Browse and study opening repertoires | |
| **Training** | Spaced repetition review sessions | |
| **Game Review** | Analyze games with engine + repertoire deviation detection | |
| **Game List** | Browse/import your games for reference and mistake analysis | |

**Screen Flow:**
- App opens to Analysis Board (home)
- Hamburger icon (top-left) opens sidebar with all five sections
- Each section is self-contained with its own state
- Games from Game List can be sent to Analysis Board, Game Review, or linked to Repertoire

## Repertoire Structure

**Fixed 4-Level Hierarchy:**
```
Color → Opening Type → Variation → Sub-variation → Chapters
```

**Example:**
```
Black
└── 1. d4
    └── King's Indian Defense
        └── Saemisch Variation
            ├── Main Line
            ├── 6...c5 Sideline
            └── Exchange Variation
```

**Opening Types:** `1. e4` | `1. d4` | `Irregular` (everything else)

**Auto-categorization:** On PGN import, system detects opening/variation via ECO codes and move patterns. User doesn't manually organize.

**Import-only:** No manual repertoire creation UI. All content comes from PGN imports.

## Repertoire Study Screen

**Layout Components:**

| Component | Purpose |
|-----------|---------|
| **Hierarchy Browser** | Navigate Color → Opening → Variation → Sub-variation |
| **Chapter List** | Flat list of chapters within selected sub-variation |
| **Board + Move History** | Interactive board with full variation tree |
| **Your Games** | Scrollable list of user's games containing current position |
| **Master Games** | Scrollable list of master games containing current position |

**Layout Behavior:**
- All panels are collapsible on all platforms
- On phone: panels collapsed by default
- On tablet: panels expanded by default

**Game List Behavior:**
- Lists filter dynamically based on current board position (FEN computed on-demand)
- Selecting a game adds its continuation to the MoveTree as a variation
- Shows game metadata: opponent, date, result, move number where position occurs

**Master Games:** User imports master game PGNs via separate import path (distinct library from user games)

## PGN Import (IMPLEMENTED)

**Current Status:** Fully functional with three separate import paths

**Three Import Paths (ImportPGNScreen):**

| Import Type | Fields | Storage | Output |
|-------------|--------|---------|--------|
| **Repertoire** | PGN, name, color (White/Black) | `repertoires[]` in store | Creates chapters from each game in PGN |
| **My Games** | PGN only | `userGames[]` in store | Stores each game separately |
| **Master Games** | PGN only | `masterGames[]` in store | Stores each game separately |

**Import Methods:**
- File picker (native & web supported)
- Text paste in textarea

**PGN Parsing Features:**
- Handles BOM characters (﻿ at start of file)
- Accepts moves-only input (e.g., "1. e4 e5 2. Nf3") - auto-wraps with headers
- Accepts full PGN with headers in brackets
- Supports multiple games per file (splits into separate entries)
- Uses @mliebelt/pgn-parser with 'games' startRule (returns `game.tags` not `game.headers`)
- Each game stored with reconstructed PGN (PGNService.toPGNString)
- **Comments/Annotations:** Extracted from `move.commentAfter` and stored in MoveTree nodes
- **Comment Display:** Moves with comments show 💬 indicator in move history; full comment appears in box below board

**Key Implementation Files:**
- `src/services/pgn/PGNService.ts` - Parsing & conversion
- `src/services/openings/OpeningClassifier.ts` - Auto-categorization by ECO
- `src/screens/ImportPGNScreen.tsx` - Import UI with three paths

## Training Logic

**Color-Based Testing:**
- Repertoire has explicit color (user selects during import)
- Only test user on their color's moves
- Opponent moves auto-play with animation (~200ms, configurable later)
- User can mark specific positions as "critical" (always tested regardless of color)

**Critical Position Marking:**
- Long-press on move in MoveHistory → context menu → "Mark as Critical"
- Critical positions shown with star indicator

**Review Session Flow:**
1. Show position (user's turn)
2. User makes move → validate
3. If correct: animate opponent's response (200ms)
4. Show next position (user's turn again)
5. Repeat until end of line or incorrect

## Game Review (IMPLEMENTED)

**Purpose:** Analyze games to identify key moves through engine analysis and repertoire deviation detection.

**Key Move Detection:**
- **Blunders/Mistakes/Inaccuracies** (when engine configured): Large eval losses based on configurable thresholds
- **Repertoire Deviations**: First move where user deviates from their repertoire (only the first, not subsequent moves)
- **Opponent Novelties**: First move where opponent plays outside user's repertoire
- **Transpositions**: Move that transposes back into repertoire after earlier deviation (e.g., game deviates at move 3, then move 6 reaches a known repertoire position)

**Color Selection:**
- User selects which color to review as (white/black) when starting each review
- Color selection not stored permanently - always prompted per session
- Allows analyzing games from either perspective

**Engine Integration:**
- External engine API (user provides endpoint)
- POST requests to endpoint with `{ fen, depth }`
- Expected response: `{ score, mate?, bestMove, pv }`
- Optional - when disabled, only repertoire deviations tracked

**Repertoire Matching Logic (FEN-Based RESULTING Position Check):**
- **Key innovation**: Checks if the RESULTING position (after playing the move) exists in repertoire, not if the move is expected from the current position
- **Complete transposition support**: Move sequences don't matter - only the positions reached. "1. d4 Nf6 2. Nc3 d5" and "1. d4 d5 2. Nc3 Nf6" both reach the same position after move 4, so both are valid
- **Move-count optimization**: First checks resulting position at expected ply (N+1), then falls back to checking all plies for deep transpositions
- **Implementation**: Builds position map indexed by ply count: `Map<moveCount, Map<FEN, Set<possibleMoves>>>`
- Extracts ALL lines from each chapter by recursively walking MoveTree, then plays through each line linearly
- Records BOTH intermediate positions and end-of-line positions (with empty move sets)
- **Deviation detection**: If resulting position not in repertoire, checks if BEFORE position was in repertoire to distinguish user-misplay/opponent-novelty from coverage-gap
- More computationally expensive than path-based matching, but handles ALL transpositions correctly

**UI Features:**
- Dashboard with game list and review status
- Filter tabs: All/Reviewed/Unreviewed
- Review screen with board, move navigation, and key move indicators
- Color-coded key moves: red (blunder), orange (mistake), yellow (inaccuracy), purple (deviation), blue (transposition)
- Engine info notice when disabled
- Expected moves shown in deviation panel
- Transposition indicators show when game returns to repertoire after deviation

**Key Implementation Files:**
- `src/services/engine/EngineService.ts` - External API wrapper
- `src/services/gameReview/GameReviewService.ts` - Analysis orchestration
- `src/services/settings/SettingsService.ts` - Settings persistence
- `src/screens/gameReview/GameReviewDashboardScreen.tsx` - Game list + color selection modal
- `src/screens/gameReview/GameReviewScreen.tsx` - Review UI
- `src/screens/SettingsScreen.tsx` - Engine + threshold configuration
- `src/types/gameReview.types.ts` - Type definitions

## Roadmap

### Phase 1: Core Loop (Current)
- [x] Interactive chess board with variations
- [x] MoveTree data structure for unlimited variations
- [x] MoveTree serialization (toJSON/fromJSON)
- [x] Navigation structure (Drawer + Stack)
- [x] PGN import for all three types (repertoire, my games, master games)
- [x] PGN parsing with @mliebelt/pgn-parser (including comments/annotations)
- [x] OpeningClassifier for auto-categorization
- [x] Zustand store with persistence via AsyncStorage
- [x] RepertoireScreen with list display (edit/delete functionality)
- [x] GameListScreen with tabs (My Games / Master Games, delete all)
- [x] Platform-specific file reading (web vs native)
- [x] Comment extraction and display (💬 indicators + box below board)
- [x] RepertoireStudyScreen with variations and keyboard navigation
- [x] Game Review module (engine integration + repertoire deviation detection)
- [x] SettingsScreen for engine configuration
- [ ] Basic spaced repetition (SM-2 foundation)
- [ ] Review session UI
- [ ] AnalysisBoardScreen implementation

### Phase 2: Smart Training
- [ ] Mistake tracking from imported games
- [ ] Context-aware card generation
- [ ] Difficulty scaling algorithm
- [ ] Batch PGN import with game analysis
- [ ] Progress statistics dashboard

### Phase 3: Advanced Analysis
- [ ] Decision tree visualization
- [ ] Linked positions across repertoire
- [ ] Stockfish integration
- [ ] Move annotations and categorization

### Phase 4: Backend & Multi-Device (Future)
- [ ] Backend API (user authentication, data persistence)
- [ ] Per-user database storage (repertoires, game lists, training progress)
- [ ] Cloud sync across devices
- [ ] Chess.com/Lichess OAuth for direct game import

## Development Commands

```bash
npm start              # Expo dev server
npm run android        # Android device/emulator
npm run ios            # iOS simulator
npm run web            # Web browser
npx tsc --noEmit       # Type check
npx eslint src/        # Lint
npm test               # Run all tests
npm run test:watch     # Run tests in watch mode
```

## Testing

**Test Framework:** Jest with TypeScript (ts-jest preset)

**Test Structure:**
- Unit tests located in `__tests__` directories alongside source files
- Test files use `.test.ts` or `.test.tsx` extension
- Test helpers in `testHelpers.ts` files

**Running Tests:**
```bash
npm test                          # Run all tests once
npm run test:watch                # Run tests in watch mode
npm test -- <filename>            # Run specific test file
npm test -- --coverage            # Generate coverage report
```

**Current Test Coverage:**
- `GameReviewService` - FEN-based repertoire matching with transposition detection (18 tests)
  - Position extraction from MoveTree
  - Repertoire position map building
  - Move matching with coverage gap detection
  - Transposition detection across different move orders
  - Transposition-back detection (returning to repertoire after deviation)
  - User vs opponent move identification
  - Deviation type classification

**Test Helpers:**
- `buildMoveTreeFromMoves(moves: string[])` - Create MoveTree from move sequence
- `buildMoveTreeWithVariations(lines: string[][])` - Create MoveTree with multiple variations
- `createTestRepertoire(name, color, lines)` - Generate test repertoire with multiple chapters
- `createTestRepertoireWithVariations(name, color, lines)` - Generate test repertoire with variations in single chapter

**Best Practices:**
- Use test helpers to build test data instead of manual construction
- Test both matching and deviation cases
- Test transpositions by creating repertoires with multiple move orders
- Verify both user and opponent moves are correctly identified
- Use descriptive test names that explain the scenario being tested

## Architecture

**Tech Stack:** React Native 0.76.5, Expo SDK 52, TypeScript (strict), chess.js 1.0.0-beta.8, Zustand, react-native-svg, React Navigation

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

**Key Services:**
- `PGNService` - PGN parsing via @mliebelt/pgn-parser (IMPLEMENTED)
- `OpeningClassifier` - Auto-categorize by ECO codes (IMPLEMENTED)
- `StorageService` - AsyncStorage wrapper with date revival (IMPLEMENTED)
- `EngineService` - External engine API integration (IMPLEMENTED)
- `GameReviewService` - Game analysis + repertoire matching (IMPLEMENTED)
- `SettingsService` - Review settings persistence (IMPLEMENTED)
- `ChessService` - chess.js wrapper (legacy, being replaced by direct chess.js usage)
- `SM2Service` - Spaced repetition algorithm (TODO)

**State Management:**
- Zustand store (`src/store/index.ts`) with separate arrays:
  - `repertoires[]` - User's opening repertoires
  - `userGames[]` - User's own games
  - `masterGames[]` - Master game library
  - `reviewCards[]` - Spaced repetition cards
  - `gameReviewStatuses[]` - Review completion tracking
  - `reviewSettings` - Engine config + eval thresholds
  - `currentReviewSession` - Active review state
- AsyncStorage persistence with automatic save on each mutation
- Date objects serialized/deserialized with custom reviver

**Navigation:**
- Drawer navigator for main screens (Analysis Board, Repertoire, Training, Game Review, Game List, Settings)
- Stack navigator for modals (ImportPGN, GameReviewScreen)
- React Navigation v6 (Expo SDK 52 compatibility)

## Key Patterns

### MoveTree Serialization (IMPLEMENTED)

MoveTree has `toJSON()` and `fromJSON()` for persistence:

```typescript
// Serialize for storage
const moveTree = new MoveTree();
moveTree.addMove('e4');
const serialized = moveTree.toJSON(); // SerializedMoveTree
await StorageService.save(serialized);

// Deserialize from storage
const data = await StorageService.load();
const moveTree = MoveTree.fromJSON(data);
```

Stored structure:
```typescript
interface SerializedMoveTree {
  rootMoves: SerializedMoveNode[];
  startFen: string;
  nodeIdCounter: number;
}
```

### MoveTree Force-Update

MoveTree mutates internal state. Force re-renders after mutations:

```typescript
const [moveTree] = useState(() => new MoveTree());
const [, forceUpdate] = useState(0);

moveTree.addMove(san);
forceUpdate(n => n + 1);  // Trigger re-render
```

### Repertoire Matching in Game Review (IMPLEMENTED - Resulting Position Check)

**Checks RESULTING Position, Not Move From Current Position:**

The key insight: to handle transpositions correctly, we must check if playing a move reaches a position that exists in the repertoire, regardless of how we got to the current position.

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
// Algorithm:
// 1. Calculate resulting position: play movePlayed from preFen
// 2. Check if resulting position exists at ply moveCount+1 in repertoire
// 3. If yes → match (return expected moves FROM that position)
// 4. If no → check all other plies (for deep transpositions)
// 5. If still no → check if BEFORE position was in repertoire to determine deviation type
```

**Implementation Details:**
1. **Extract all lines**: Recursively walks MoveTree to extract ALL variations as separate lines
2. **Play through linearly**: Uses chess.js to play each line move-by-move (not tree traversal)
3. **Record with ply count**: Stores each position AND end-of-line positions with their ply count
4. **Resulting position check**: During review, calculates where the move leads, not what's expected from here

**Key Benefits:**
- **Complete transposition detection**: Move order doesn't matter, only positions reached
- **Performance optimization**: First checks expected ply, then falls back to full search if needed
- **No tree limitations**: Not constrained by MoveTree structure paths
- **End-of-line handling**: Recognizes when reaching known end-of-line positions (with empty expected moves)

**Trade-offs:**
- More computationally expensive at review start (builds exhaustive position map)
- Worth the cost for handling ALL transpositions correctly, including edge cases

**Move Color Detection:**
After `chess.move(san)`, `chess.turn()` returns whose turn it is NOW, not who just moved:
- `chess.turn() === 'w'` → Black just moved
- `chess.turn() === 'b'` → White just moved

### Platform-Specific File Reading (IMPLEMENTED)

Web and native platforms read files differently:

```typescript
import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system';

if (Platform.OS === 'web') {
  // Web: use fetch for blob URLs
  const response = await fetch(file.uri);
  const content = await response.text();
} else {
  // Native: use expo-file-system
  const content = await FileSystem.readAsStringAsync(file.uri);
}
```

### PGN Parsing Patterns (IMPLEMENTED)

```typescript
// Clean input: strip BOM, handle moves-only
let cleanPgn = pgnString.replace(/^\uFEFF/, '').trim();

// Check if moves-only (no headers)
if (!/^\[/.test(cleanPgn)) {
  cleanPgn = `[Event "?"]\n...\n\n${cleanPgn} *`;
}

// Parse with 'games' startRule for multi-game support
const parsed = parse(cleanPgn, { startRule: 'games' });
```

### PGN Parser Structure (CRITICAL - IMPLEMENTED)

**Important Discovery:** The `@mliebelt/pgn-parser` returns `game.tags` NOT `game.headers`:

```typescript
// Parser output structure:
{
  tags: {
    White: "João Álvaro Ferreira",
    Black: "João Matos",
    Date: { value: "2025.01.04", year: 2025, month: 1, day: 4 },  // Object, not string!
    Event: "2025 OTB: 2a Divisão",
    Result: "*",
    ECO: "E11"
  },
  moves: [...],
  gameComment: {...}
}
```

**Normalization Required:**

```typescript
// Extract tags (not headers!)
const rawTags = game.tags || game.headers || {};

// Normalize: Date is an object, extract the 'value' property
const normalizedHeaders: Record<string, string> = {};
for (const [key, value] of Object.entries(rawTags)) {
  if (key === 'Date' && typeof value === 'object' && value !== null && 'value' in value) {
    normalizedHeaders[key] = value.value;  // Extract "2025.01.04" from object
  } else if (typeof value === 'string') {
    normalizedHeaders[key] = value;
  } else if (value !== null && value !== undefined) {
    normalizedHeaders[key] = String(value);
  }
}
```

**Move Comments:**

Comments are in `move.commentAfter` property. Must be extracted during `buildMoveTree()`:

```typescript
// In buildMoveTree() after adding move:
const currentNode = moveTree.getCurrentNode();
if (currentNode && move.commentAfter) {
  currentNode.comment = move.commentAfter;  // Store comment in node
}
```

### React Native Conditional Rendering (CRITICAL)

**Issue:** Using ternary operators with `null` can cause "Unexpected text node" errors on web.

**Wrong:**
```typescript
{move.isCritical ? <Text>★</Text> : null}
{moveNumberText ? <Text>{moveNumberText}</Text> : null}
```

**Correct:**
```typescript
{move.isCritical && <Text>★</Text>}
{moveNumberText !== '' && <Text>{moveNumberText}</Text>}
```

Always use logical AND (`&&`) for conditional rendering in React Native, not ternary with null.

### Date Serialization (IMPLEMENTED)

AsyncStorage requires custom date handling:

```typescript
// In StorageService.ts
function dateReviver(_key: string, value: any): any {
  if (typeof value === 'string') {
    const datePattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;
    if (datePattern.test(value)) {
      return new Date(value);
    }
  }
  return value;
}

// Usage
const data = JSON.parse(jsonString, dateReviver);
```

### Chess.js Beta API

Using v1.0.0-beta.8 (API differs from stable). Moves throw on invalid:

```typescript
try {
  const move = chess.move({ from, to, promotion });
  if (move) { /* use move.san */ }
} catch {
  // Invalid move
}
```

### Responsive Layout

- Wide (>700px): Side-by-side board and move history
- Narrow: Stacked layout
- Board: `min(screenWidth - 40px, 400px)`

## File Structure

```
src/
├── components/chess/
│   ├── InteractiveChessBoard/  # Main playable board (IMPLEMENTED)
│   ├── MoveHistory/            # Move list with variations (IMPLEMENTED)
│   └── ChessBoard/             # Display-only board (IMPLEMENTED)
├── navigation/
│   └── AppNavigator.tsx        # Drawer + Stack navigation (IMPLEMENTED)
├── screens/
│   ├── AnalysisBoardScreen.tsx     # Default home screen (PLACEHOLDER)
│   ├── RepertoireScreen.tsx        # List repertoires (IMPLEMENTED)
│   ├── GameListScreen.tsx          # User/master games tabs (IMPLEMENTED)
│   ├── ImportPGNScreen.tsx         # Import UI for 3 paths (IMPLEMENTED)
│   ├── SettingsScreen.tsx          # Engine + review settings (IMPLEMENTED)
│   ├── TrainingScreen.tsx          # Spaced repetition (TODO)
│   └── gameReview/
│       ├── GameReviewDashboardScreen.tsx  # Game list + color selection (IMPLEMENTED)
│       └── GameReviewScreen.tsx           # Review UI (IMPLEMENTED)
├── services/
│   ├── pgn/
│   │   └── PGNService.ts           # Parse & convert PGN (IMPLEMENTED)
│   ├── openings/
│   │   └── OpeningClassifier.ts    # Auto-categorize by ECO (IMPLEMENTED)
│   ├── storage/
│   │   └── StorageService.ts       # AsyncStorage wrapper (IMPLEMENTED)
│   ├── engine/
│   │   └── EngineService.ts        # External engine API (IMPLEMENTED)
│   ├── gameReview/
│   │   └── GameReviewService.ts    # Analysis + repertoire matching (IMPLEMENTED)
│   ├── settings/
│   │   └── SettingsService.ts      # Review settings (IMPLEMENTED)
│   └── spaced-repetition/          # SM2Service (TODO)
├── store/
│   └── index.ts                # Zustand store (IMPLEMENTED)
├── utils/
│   └── MoveTree.ts             # Core data structure with serialization (IMPLEMENTED)
├── types/
│   ├── repertoire.types.ts     # Repertoire, Chapter types (IMPLEMENTED)
│   ├── game.types.ts           # UserGame, MasterGame types (IMPLEMENTED)
│   └── index.ts                # Type exports (IMPLEMENTED)
└── hooks/                      # Custom hooks (TODO)
```

## Important Notes

### General
- **Path aliases required**: Use `@components/*` not `../../components`
- **MoveTree is mutable**: Always force-update React after mutations
- **chess.js is beta**: v1.0.0-beta.8 API may differ from docs
- **Validate FEN**: Board components crash on invalid FEN
- **Auto-promotion**: Pawns auto-promote to queen (no dialog yet)
- **Offline-first**: All features work without internet

### PGN Import (Current Implementation)
- **BOM handling**: Files starting with ﻿ are cleaned automatically
- **Moves-only accepted**: Simple move lists like "1. e4 e5 2. Nf3" work
- **Multi-game support**: Single file can contain multiple PGNs
- **Individual storage**: Each game/chapter stores its own PGN string
- **Platform differences**: Web uses `fetch()`, native uses `FileSystem`
- **CRITICAL**: Parser returns `game.tags` NOT `game.headers`, and Date is an object not string
- **Comments**: Must extract from `move.commentAfter` during tree building
- **PGN string issues**: Chapter PGN strings can be malformed (variations flattened incorrectly). Game review uses MoveTree directly instead of parsing PGN strings

### Storage & Persistence
- **Date objects**: Automatically serialized/deserialized with custom reviver
- **Separate arrays**: `repertoires[]`, `userGames[]`, `masterGames[]` stored separately
- **Automatic save**: Store mutations trigger AsyncStorage save immediately
- **Store initialization**: `App.tsx` calls `initialize()` on mount to load persisted data

### Game Review (Current Implementation)
- **FEN-based matching**: Uses position map built from MoveTree, not PGN parsing
- **Transposition detection**: Different move orders to same position automatically recognized
- **Color selection**: Always prompted per review session, not stored permanently
- **Starting position**: Root moves from MoveTree included in position map
- **Move color logic**: After `chess.move()`, `chess.turn()` shows NEXT player (if 'w', black just moved)
- **First deviation only**: Only first repertoire deviation marked as key move, not subsequent
- **Engine optional**: When disabled, only repertoire deviations tracked
- **Extensive logging**: Look for "[GameReview]" and "[FEN-Match]" prefixes

### Debugging
- **Console logging**: Extensive logging added to import flow, store operations, and screen updates
- **Log prefixes**: Look for "Store:", "RepertoireScreen:", "GameListScreen:", "Import error:", "[GameReview]", "[FEN-Match]", "[BuildPositionMap]", "[PositionMap]"
- **Check flow**: File read → Parse → Store save → Screen update
- **Storage keys**:
  - `@kingside/repertoires`
  - `@kingside/user-games`
  - `@kingside/master-games`
  - `@kingside/cards`
  - `@kingside/review-settings`
  - `@kingside/game-review-statuses`

### Type Definitions
- All types in `src/types/` with barrel export at `src/types/index.ts`
- Import as `from '@types'` using path alias
- Key types: `Repertoire`, `Chapter`, `UserGame`, `MasterGame`, `ReviewCard`, `RepertoireColor`, `OpeningType`
- Game Review types: `GameReviewSession`, `GameReviewStatus`, `MoveAnalysis`, `EngineEvaluation`, `ReviewSettings`

## Next Steps (TODO)

1. **Analysis Board**: Convert placeholder to functional screen with board + variations
2. **Training Session**: Implement spaced repetition review flow
3. **Review Card Generation**: Auto-create cards from repertoire positions
4. **SM2 Algorithm**: Implement spaced repetition scheduling
5. **Position Filtering**: Filter user/master games by current board position (FEN matching)
6. **Game Review Enhancements**: Master game references, evaluation bar visualization
