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
- Zustand store (`src/store/index.ts`) with AsyncStorage persistence
- Separate arrays: `repertoires[]`, `userGames[]`, `masterGames[]`, `reviewCards[]`, `gameReviewStatuses[]`, `reviewSettings`
- Date objects serialized/deserialized with custom reviver

**Navigation:**
- Drawer navigator for main screens (Analysis Board, Repertoire, Training, Game Review, Game List, Settings)
- Stack navigator for modals (ImportPGN, GameReviewScreen)

## Core Features & Status

### ✅ Implemented
- **PGN Import/Export**: Three import paths (Repertoire, My Games, Master Games) with file picker, text paste, and Lichess username import
- **Repertoire Management**: Fixed 4-level hierarchy (Color → Opening Type → Variation → Sub-variation → Chapters), auto-categorization via ECO codes
- **Game Review**: Engine analysis integration (local Stockfish), FEN-based repertoire matching with complete transposition detection, color-coded key move indicators
- **Interactive Chess Board**: Full variation support, comment display (💬 indicators), touch handling optimized for mobile
- **Screen Settings**: Per-screen UI preferences (orientation, engine, eval bar, coordinates, move history)
- **Database**: SQLite storage for games with migration system

### 🚧 In Progress
- **Analysis Board**: Basic implementation, needs variation support and keyboard shortcuts
- **Training System**: UI placeholder only, spaced repetition not implemented

### 📋 TODO
- **Spaced Repetition**: SM2 algorithm with context-aware cards, mistake-driven priority, difficulty scaling
- **Decision Tree Visualization**: Show branching points explicitly
- **Linked Positions**: Connect similar structures across different openings
- **Local Stockfish verification**: Rebuild and test on device (rewritten 2026-02-16)
- **Backend & Sync**: User authentication, cloud storage, multi-device sync

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
├── services/
│   ├── pgn/PGNService.ts               # Parse & convert PGN
│   ├── openings/OpeningClassifier.ts   # Auto-categorize by ECO
│   ├── storage/StorageService.ts       # AsyncStorage wrapper
│   ├── lichess/LichessService.ts       # Fetch games from Lichess API
│   ├── engine/
│   │   ├── StockfishContext.tsx         # React Context wrapping native hook
│   │   └── EngineAnalyzer.ts           # UCI protocol, parsing, cache
│   ├── gameReview/GameReviewService.ts # Analysis + repertoire matching
│   ├── settings/
│   │   ├── SettingsService.ts          # Review settings
│   │   └── ScreenSettingsService.ts    # Per-screen UI preferences
│   ├── database/
│   │   ├── DatabaseService.ts          # SQLite database
│   │   └── MigrationService.ts         # Schema migrations
│   └── spaced-repetition/              # SM2Service (TODO)
├── store/index.ts              # Zustand store
├── utils/MoveTree.ts           # Core data structure
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
```

## Known Issues

### 1. Database Migration
**Status:** ONGOING - Games stored in SQLite

User games and master games moved to SQLite database. Repertoires still in AsyncStorage. Migration service handles schema updates.

## Important Notes

### General
- **Path aliases required**: Use `@components/*` not `../../components`
- **MoveTree is mutable**: Always force-update React after mutations
- **chess.js is beta**: v1.0.0-beta.8 API may differ from docs
- **Validate FEN**: Board components crash on invalid FEN
- **Offline-first**: All features work without internet
- **Engine disabled by default**: All screens start with engine OFF

### PGN Import
- **BOM handling**: Files starting with ﻿ are cleaned automatically
- **Moves-only accepted**: Simple move lists like "1. e4 e5 2. Nf3" work
- **Multi-game support**: Single file can contain multiple PGNs
- **Platform differences**: Web uses `fetch()`, native uses `FileSystem`
- **Parser quirk**: Returns `game.tags` NOT `game.headers`, Date is object not string
- **Comments**: Extracted from `move.commentAfter`, shown with 💬 indicator

### Storage & Persistence
- **Date objects**: Automatically serialized/deserialized with custom reviver
- **Separate arrays**: `repertoires[]`, `userGames[]`, `masterGames[]` stored separately
- **Automatic save**: Store mutations trigger AsyncStorage save immediately
- **Store initialization**: `App.tsx` calls `initialize()` on mount

### Game Review
- **FEN-based matching**: Uses position map built from MoveTree
- **Transposition detection**: Different move orders to same position recognized
- **Color selection**: Always prompted per review session
- **First deviation only**: Only first repertoire deviation marked as key move
- **Engine optional**: When disabled, only repertoire deviations tracked

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

## Next Steps

### Immediate Priority
1. **Verify Engine on Device**: Rebuild and test local Stockfish (rewritten 2026-02-16)
2. **Training System**: Implement spaced repetition review flow with color-based testing
3. **Review Card Generation**: Auto-create cards from repertoire positions
4. **Analysis Board**: Add variation support, keyboard shortcuts

### Short-Term
5. **SM2 Algorithm**: Implement spaced repetition scheduling with difficulty scaling
6. **Position Filtering**: Filter user/master games by current board position (FEN matching)
7. **Decision Tree Visualization**: Show branching points explicitly

### Long-Term
8. **Linked Positions**: Connect similar structures across different openings
9. **Move Categorization**: Tag moves as forced, main line, sideline, dubious, or novelty
10. **Backend & Sync**: User authentication, cloud storage, multi-device sync
