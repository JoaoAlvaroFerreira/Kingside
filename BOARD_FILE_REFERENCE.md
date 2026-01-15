# Chess Board Implementation - Complete File Reference

This document provides a comprehensive list of all files related to the chess board implementation, organized by category.

**Last Updated:** 2026-01-06

---

## Core Board Components (Required)

These files are essential for the board to function:

### Display Components

| File | Lines | Description | Extract? |
|------|-------|-------------|----------|
| `src/components/chess/ChessBoard/ChessBoard.tsx` | 75 | Display-only board component | ✅ Yes |
| `src/components/chess/ChessBoard/Square.tsx` | 44 | Individual square component | ✅ Yes |
| `src/components/chess/ChessBoard/Piece.tsx` | 47 | Piece rendering with Unicode symbols | ✅ Yes |

### Interactive Components

| File | Lines | Description | Extract? |
|------|-------|-------------|----------|
| `src/components/chess/InteractiveChessBoard/InteractiveChessBoard.tsx` | 165 | Interactive board with move validation | ✅ Yes |

---

## Services & Utilities (Required)

### Chess Logic

| File | Lines | Description | Extract? |
|------|-------|-------------|----------|
| `src/services/chess/ChessService.ts` | 140 | Wrapper around chess.js for position management | ✅ Yes |

### React Hooks

| File | Lines | Description | Extract? |
|------|-------|-------------|----------|
| `src/hooks/chess/useChessGame.ts` | 23 | Hook for computing FEN at specific move index | ✅ Yes |

---

## Type Definitions (Optional)

| File | Lines | Description | Extract? |
|------|-------|-------------|----------|
| `src/types/repertoire.types.ts` | 74 | TypeScript type definitions for board, moves, positions | ⚠️ Optional |
| `src/types/index.ts` | - | Type re-exports | ❌ No |

---

## State Management (Not Required for Extraction)

These files manage global state but aren't required if using local state:

| File | Description | Extract? |
|------|-------------|----------|
| `src/store/index.ts` | Root Zustand store | ❌ No |
| `src/store/slices/repertoireSlice.ts` | Board orientation and position state | ❌ No |
| `src/store/slices/reviewSlice.ts` | Review session state with positions | ❌ No |

---

## Screens Using Board (Reference Only)

These screens demonstrate board usage but aren't part of the core implementation:

| File | Description | Extract? |
|------|-------------|----------|
| `src/screens/AnalysisBoardScreen.tsx` | Interactive analysis board with move history | 📖 Reference |
| `src/screens/repertoire/RepertoireViewerScreen.tsx` | Repertoire viewer with board display | 📖 Reference |
| `src/screens/repertoire/ReviewSessionScreen.tsx` | Spaced repetition training screen | 📖 Reference |

---

## Supporting Files (Reference Only)

| File | Description | Extract? |
|------|-------------|----------|
| `src/services/chess/PGNService.ts` | PGN parsing (uses ChessService) | 📖 Reference |
| `src/services/spaced-repetition/SM2Service.ts` | Spaced repetition algorithm | ❌ No |
| `src/services/storage/LocalStorage.ts` | Storage service | ❌ No |
| `src/navigation/AppNavigator.tsx` | Navigation setup | ❌ No |
| `src/screens/HomeScreen.tsx` | Home screen | ❌ No |
| `src/screens/ImportPGNScreen.tsx` | PGN import screen | ❌ No |
| `src/screens/repertoire/RepertoireLibraryScreen.tsx` | Library management | ❌ No |

---

## Dependency Graph

```
┌─────────────────────────────────────────────────────┐
│  External Dependencies                               │
│  - chess.js (^1.0.0-beta.8)                         │
│  - react-native                                      │
│  - react                                             │
└─────────────────────────────────────────────────────┘
                         ↑
                         │
┌────────────────────────┴────────────────────────────┐
│  Core Services (EXTRACT)                             │
│  - ChessService.ts                                   │
└─────────────────────────────────────────────────────┘
                         ↑
                         │
        ┌────────────────┴────────────────┐
        │                                  │
┌───────┴─────────┐              ┌────────┴────────┐
│  Hooks (EXTRACT) │              │  Components     │
│  - useChessGame  │              │  (EXTRACT)      │
└──────────────────┘              └─────────────────┘
                                           ↑
                    ┌──────────────────────┼──────────────────────┐
                    │                      │                       │
        ┌───────────┴────────┐  ┌─────────┴──────┐  ┌────────────┴────────┐
        │  ChessBoard        │  │  Interactive   │  │  Primitives         │
        │  (display-only)    │  │  ChessBoard    │  │  - Square           │
        │                    │  │                │  │  - Piece            │
        └────────────────────┘  └────────────────┘  └─────────────────────┘
                    │                      │                       │
                    └──────────────────────┴───────────────────────┘
                                           ↓
┌─────────────────────────────────────────────────────┐
│  Screens (REFERENCE ONLY)                            │
│  - AnalysisBoardScreen                               │
│  - RepertoireViewerScreen                            │
│  - ReviewSessionScreen                               │
└─────────────────────────────────────────────────────┘
```

---

## Extraction Priority

### Priority 1: Minimum Viable Board (6 files)

Extract these for a working board:

```
✅ ChessBoard.tsx
✅ Square.tsx
✅ Piece.tsx
✅ InteractiveChessBoard.tsx
✅ ChessService.ts
✅ useChessGame.ts
```

### Priority 2: Type Safety (1 file)

Add for full TypeScript support:

```
⚠️ repertoire.types.ts (or create your own types)
```

### Priority 3: Reference Examples (3 files)

Study these for usage patterns:

```
📖 AnalysisBoardScreen.tsx
📖 RepertoireViewerScreen.tsx
📖 ReviewSessionScreen.tsx
```

---

## File Size Summary

### Essential Files (Required)

| Category | Files | Lines | Size |
|----------|-------|-------|------|
| Components | 4 | 331 | ~10 KB |
| Services | 1 | 140 | ~4 KB |
| Hooks | 1 | 23 | ~1 KB |
| **Total** | **6** | **494** | **~15 KB** |

### Optional Files

| Category | Files | Lines | Size |
|----------|-------|-------|------|
| Types | 1 | 74 | ~2 KB |
| Reference Screens | 3 | ~600 | ~20 KB |

---

## Import Statements Reference

### Component Imports

```typescript
// Display-only board
import { ChessBoard } from '@components/chess/ChessBoard/ChessBoard';

// Interactive board
import { InteractiveChessBoard } from '@components/chess/InteractiveChessBoard/InteractiveChessBoard';

// Primitives (usually not imported directly)
import { Square } from '@components/chess/ChessBoard/Square';
import { Piece } from '@components/chess/ChessBoard/Piece';
```

### Service Imports

```typescript
// Chess logic service
import { ChessService } from '@services/chess/ChessService';

// Position calculation hook
import { useChessGame } from '@hooks/chess/useChessGame';
```

### Type Imports

```typescript
// Type definitions
import type {
  ChessMove,
  ChessVariation,
  BoardPosition,
  ReviewCard,
} from '@types/repertoire.types';
```

---

## Quick Copy Commands

### Copy All Essential Files (Windows PowerShell)

```powershell
# Create directory structure
New-Item -ItemType Directory -Force -Path ".\extracted\components\chess\ChessBoard"
New-Item -ItemType Directory -Force -Path ".\extracted\components\chess\InteractiveChessBoard"
New-Item -ItemType Directory -Force -Path ".\extracted\services\chess"
New-Item -ItemType Directory -Force -Path ".\extracted\hooks\chess"

# Copy files
Copy-Item ".\src\components\chess\ChessBoard\ChessBoard.tsx" ".\extracted\components\chess\ChessBoard\"
Copy-Item ".\src\components\chess\ChessBoard\Square.tsx" ".\extracted\components\chess\ChessBoard\"
Copy-Item ".\src\components\chess\ChessBoard\Piece.tsx" ".\extracted\components\chess\ChessBoard\"
Copy-Item ".\src\components\chess\InteractiveChessBoard\InteractiveChessBoard.tsx" ".\extracted\components\chess\InteractiveChessBoard\"
Copy-Item ".\src\services\chess\ChessService.ts" ".\extracted\services\chess\"
Copy-Item ".\src\hooks\chess\useChessGame.ts" ".\extracted\hooks\chess\"
```

### Copy All Essential Files (Unix/Mac)

```bash
# Create directory structure
mkdir -p ./extracted/components/chess/ChessBoard
mkdir -p ./extracted/components/chess/InteractiveChessBoard
mkdir -p ./extracted/services/chess
mkdir -p ./extracted/hooks/chess

# Copy files
cp ./src/components/chess/ChessBoard/ChessBoard.tsx ./extracted/components/chess/ChessBoard/
cp ./src/components/chess/ChessBoard/Square.tsx ./extracted/components/chess/ChessBoard/
cp ./src/components/chess/ChessBoard/Piece.tsx ./extracted/components/chess/ChessBoard/
cp ./src/components/chess/InteractiveChessBoard/InteractiveChessBoard.tsx ./extracted/components/chess/InteractiveChessBoard/
cp ./src/services/chess/ChessService.ts ./extracted/services/chess/
cp ./src/hooks/chess/useChessGame.ts ./extracted/hooks/chess/
```

---

## Integration Checklist

After copying files to a new project:

- [ ] Copy 6 essential files
- [ ] Install `chess.js@^1.0.0-beta.8`
- [ ] Configure path aliases in `babel.config.js`
- [ ] Update `tsconfig.json` paths
- [ ] Verify imports resolve correctly
- [ ] Test display board renders
- [ ] Test interactive board accepts moves
- [ ] Verify ChessService works standalone
- [ ] Test useChessGame hook computes FEN
- [ ] Add TypeScript types if needed
- [ ] Run full build to check for errors

---

## Compatibility Matrix

| Dependency | Minimum Version | Tested Version | Required? |
|------------|----------------|----------------|-----------|
| React | 18.0.0 | 18.3.1 | ✅ Yes |
| React Native | 0.70.0 | 0.76.5 | ✅ Yes |
| chess.js | 1.0.0-beta.8 | 1.0.0-beta.8 | ✅ Yes |
| TypeScript | 5.0.0 | 5.3.3 | ⚠️ Recommended |
| Zustand | - | 4.4.7 | ❌ No (state) |

---

## File Responsibilities

### ChessBoard.tsx
- Parse FEN to board representation
- Render 8x8 grid of squares
- Handle board orientation (white/black)
- Error handling for invalid FEN
- Responsive sizing

### Square.tsx
- Render individual square
- Determine light/dark color
- Display piece via Piece component
- Accept size prop for responsive layout

### Piece.tsx
- Map piece codes to Unicode symbols
- Render piece text with correct sizing
- Handle null pieces (empty squares)

### InteractiveChessBoard.tsx
- All features of ChessBoard, plus:
- Track selected square
- Calculate valid moves
- Highlight legal destinations
- Handle touch/click events
- Trigger move callbacks

### ChessService.ts
- Wrap chess.js API
- Load/get FEN positions
- Execute moves (with validation)
- Track move history
- Query game state (check, mate, draw)
- Navigate position history

### useChessGame.ts
- Calculate FEN for move index
- Memoize expensive computations
- React to moves/index changes
- Return current position FEN

---

## External Dependencies Detail

### chess.js (^1.0.0-beta.8)

Used by:
- ChessBoard.tsx (parse FEN)
- InteractiveChessBoard.tsx (parse FEN, validate moves)
- ChessService.ts (all chess logic)

Key methods used:
- `new Chess(fen)` - Create game instance
- `game.board()` - Get 8x8 board array
- `game.moves({ square, verbose })` - Get legal moves
- `game.move(move)` - Execute move
- `game.fen()` - Get current FEN
- `game.history()` - Get move list
- `game.isCheck()`, `game.isCheckmate()`, etc.

---

## Standalone Usage

The board implementation is **completely standalone**. It requires:

1. **chess.js** for game logic
2. **React Native** for UI
3. **No state management library** (uses React state)
4. **No navigation library**
5. **No storage/persistence**

You can drop the 6 core files into any React Native project and use them immediately with local component state.

---

## Related Documentation

- **BOARD_DOCUMENTATION.md** - Full API reference and usage guide
- **BOARD_EXTRACTION_CHECKLIST.md** - Step-by-step extraction guide
- **package.json** - Dependency versions

---

## Version Information

- **Implementation Version:** 1.0
- **chess.js Version:** 1.0.0-beta.8
- **React Version:** 18.3.1
- **React Native Version:** 0.76.5
- **TypeScript Version:** 5.3.3

---

**End of File Reference**
