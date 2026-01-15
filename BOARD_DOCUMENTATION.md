# Chess Board Implementation Documentation

## Overview

This document provides comprehensive documentation for the chess board implementation in the Kingside project. The board system is well-structured, reusable, and can be extracted for use in other projects.

**Last Updated:** 2026-01-06

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Component Reference](#component-reference)
3. [Services & Utilities](#services--utilities)
4. [State Management](#state-management)
5. [Type Definitions](#type-definitions)
6. [Usage Examples](#usage-examples)
7. [Dependencies](#dependencies)
8. [Extraction Guide](#extraction-guide)

---

## Architecture Overview

The board implementation follows a layered architecture:

```
┌─────────────────────────────────────┐
│   Screens (AnalysisBoard, Viewer)   │
│   - Use board components            │
│   - Manage move history             │
│   - Handle user interactions        │
└─────────────────────────────────────┘
                 ↓
┌─────────────────────────────────────┐
│   Board Components                   │
│   - ChessBoard (display-only)       │
│   - InteractiveChessBoard           │
│   - Square, Piece (primitives)      │
└─────────────────────────────────────┘
                 ↓
┌─────────────────────────────────────┐
│   Services & Hooks                   │
│   - ChessService (chess.js wrapper) │
│   - useChessGame (position calc)    │
└─────────────────────────────────────┘
                 ↓
┌─────────────────────────────────────┐
│   External Dependencies              │
│   - chess.js (game logic)           │
│   - React Native (UI)               │
└─────────────────────────────────────┘
```

### Design Principles

- **Separation of Concerns**: Display components are separate from interactive components
- **Memoization**: Heavy computations (FEN parsing, board state) are memoized for performance
- **Responsive Design**: Board size adapts to screen dimensions
- **Type Safety**: Full TypeScript coverage with strict typing
- **Reusability**: Components accept minimal props and handle edge cases internally

---

## Component Reference

### 1. ChessBoard (Display-Only)

**File:** `src/components/chess/ChessBoard/ChessBoard.tsx`

A read-only chess board component that displays a position from FEN notation.

#### Props

```typescript
interface ChessBoardProps {
  fen: string;                    // FEN string representing the position
  orientation?: 'white' | 'black'; // Board perspective (default: 'white')
}
```

#### Features

- Displays static chess position
- Responsive sizing (adapts to screen width)
- Supports board flipping (white/black perspective)
- Error handling for invalid FEN
- Memoized board computation for performance

#### Usage

```tsx
import { ChessBoard } from '@components/chess/ChessBoard/ChessBoard';

<ChessBoard
  fen="rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
  orientation="white"
/>
```

#### Implementation Details

- Uses `chess.js` to parse FEN and generate board array
- Board size: `min(screenWidth - 40px, 400px)`
- Square size: `boardSize / 8`
- Color scheme:
  - Light squares: `#f0d9b5`
  - Dark squares: `#b58863`

---

### 2. InteractiveChessBoard

**File:** `src/components/chess/InteractiveChessBoard/InteractiveChessBoard.tsx`

An interactive chess board with piece selection, move validation, and visual feedback.

#### Props

```typescript
interface InteractiveChessBoardProps {
  fen: string;                         // Current position FEN
  onMove?: (from: string, to: string) => void; // Move callback
  orientation?: 'white' | 'black';     // Board perspective
}
```

#### Features

- Click/touch piece selection
- Legal move calculation and highlighting
- Visual feedback:
  - Selected square: Yellow highlight (`#baca44`)
  - Valid moves: Green highlight (`#829769`)
  - Move dots on valid destination squares
- Auto-promotion to queen for pawns
- Support for both orientations

#### Usage

```tsx
import { InteractiveChessBoard } from '@components/chess/InteractiveChessBoard/InteractiveChessBoard';

const handleMove = (from: string, to: string) => {
  console.log(`Move: ${from} → ${to}`);
  // Handle move logic
};

<InteractiveChessBoard
  fen={currentFEN}
  onMove={handleMove}
  orientation="white"
/>
```

#### Interaction Flow

1. User clicks/taps a piece → Square is selected
2. Component calculates valid moves using chess.js
3. Valid destination squares are highlighted
4. User clicks destination → `onMove` callback is triggered
5. Selection is cleared

#### Implementation Details

- State management:
  - `selectedSquare`: Currently selected square (algebraic notation)
  - `validMoves`: Array of valid destination squares
- Square notation conversion: `FILES[file] + RANKS[rank]` → e.g., "e4"
- Uses chess.js `moves({ square, verbose: true })` for validation

---

### 3. Square Component

**File:** `src/components/chess/ChessBoard/Square.tsx`

Primitive component representing a single board square.

#### Props

```typescript
interface SquareProps {
  file: number;      // 0-7 (a-h)
  rank: number;      // 0-7 (8-1 from white's perspective)
  piece: string | null; // Piece code (e.g., "wk", "bp") or null
  size: number;      // Square size in pixels
}
```

#### Features

- Automatic light/dark square coloring
- Renders piece using Piece component
- Minimal, focused responsibility

---

### 4. Piece Component

**File:** `src/components/chess/ChessBoard/Piece.tsx`

Renders a chess piece using Unicode symbols.

#### Props

```typescript
interface PieceProps {
  piece: string | null; // Piece code: color + type (e.g., "wk", "bp")
  size: number;         // Square size for scaling
}
```

#### Piece Mapping

```typescript
const PIECE_SYMBOLS: Record<string, string> = {
  wk: '♔', wq: '♕', wr: '♖', wb: '♗', wn: '♘', wp: '♙',
  bk: '♚', bq: '♛', br: '♜', bb: '♝', bn: '♞', bp: '♟',
};
```

#### Features

- Unicode chess symbols for all 12 pieces
- Automatic font sizing: `size * 0.75`
- Null-safe rendering

---

## Services & Utilities

### ChessService

**File:** `src/services/chess/ChessService.ts`

A wrapper class around chess.js providing a clean API for position management.

#### Class API

```typescript
class ChessService {
  constructor(fen?: string)

  // Position Management
  loadFEN(fen: string): boolean
  getFEN(): string
  getBoard(): Array<Array<Piece | null>>

  // Move Operations
  makeMove(move: string): boolean
  undo(): boolean
  reset(): void
  loadMoves(moves: string[]): boolean

  // History
  getHistory(): string[]
  getPositionHistory(): string[]

  // Game State
  getTurn(): 'w' | 'b'
  isGameOver(): boolean
  isCheck(): boolean
  isCheckmate(): boolean
  isDraw(): boolean
}
```

#### Usage Example

```typescript
import { ChessService } from '@services/chess/ChessService';

const chess = new ChessService();

// Make moves
chess.makeMove('e4');
chess.makeMove('c5');

// Get current position
const fen = chess.getFEN();

// Check game state
if (chess.isCheck()) {
  console.log('Check!');
}

// Navigate history
const history = chess.getHistory(); // ['e4', 'c5']
const positions = chess.getPositionHistory(); // FEN array

// Undo moves
chess.undo();
```

#### Key Methods

**`getPositionHistory(): string[]`**
Returns FEN for every position in the game, including the starting position.

```typescript
const positions = chess.getPositionHistory();
// [startFEN, fenAfterMove1, fenAfterMove2, ...]
```

**`loadMoves(moves: string[]): boolean`**
Loads a complete move sequence from the starting position.

```typescript
chess.loadMoves(['e4', 'c5', 'Nf3', 'd6']);
```

---

### useChessGame Hook

**File:** `src/hooks/chess/useChessGame.ts`

Custom React hook for computing FEN at a specific move index.

#### API

```typescript
function useChessGame(
  moves: string[],    // Array of SAN moves
  moveIndex: number   // Position in the move array
): { fen: string }
```

#### Usage

```tsx
import { useChessGame } from '@hooks/chess/useChessGame';

const MyComponent = () => {
  const moves = ['e4', 'c5', 'Nf3', 'd6'];
  const [moveIndex, setMoveIndex] = useState(2);

  const { fen } = useChessGame(moves, moveIndex);

  return <ChessBoard fen={fen} />;
};
```

#### Implementation

- Uses `useMemo` to cache FEN computation
- Recomputes only when `moves` or `moveIndex` changes
- Applies moves up to `moveIndex` (exclusive)

---

## State Management

The board implementation uses Zustand for global state. Board-related state is in `repertoireSlice`.

**File:** `src/store/slices/repertoireSlice.ts`

### Board State

```typescript
interface RepertoireState {
  // Board state
  boardOrientation: 'white' | 'black';
  currentFEN: string;
  currentMoveIndex: number;
  currentVariationIndex: number;

  // Board actions
  flipBoard: () => void;
  updateFEN: (fen: string) => void;
  nextMove: () => void;
  previousMove: () => void;
  goToMove: (index: number) => void;
  goToStart: () => void;
  goToEnd: () => void;
}
```

### Usage with Store

```tsx
import { useStore } from '@store/index';

const MyScreen = () => {
  const {
    boardOrientation,
    currentFEN,
    flipBoard
  } = useStore();

  return (
    <>
      <ChessBoard
        fen={currentFEN}
        orientation={boardOrientation}
      />
      <Button title="Flip" onPress={flipBoard} />
    </>
  );
};
```

---

## Type Definitions

**File:** `src/types/repertoire.types.ts`

### Core Types

```typescript
// Chess move in SAN notation
interface ChessMove {
  san: string;        // e.g., "e4", "Nf3"
  from: string;       // e.g., "e2"
  to: string;         // e.g., "e4"
  promotion?: string;
}

// Board position snapshot
interface BoardPosition {
  fen: string;
  moveIndex: number;
  chapterId: string;
  variationIndex: number;
}

// Move sequence
interface ChessVariation {
  moves: string[];    // SAN array
  comment?: string;
  annotations?: Record<number, string>;
}

// Spaced repetition card
interface ReviewCard {
  id: string;
  fen: string;              // Position to review
  correctMove: string;      // Expected move
  easeFactor: number;       // SM-2 algorithm
  interval: number;
  repetitions: number;
  nextReviewDate: Date;
  reviewHistory: ReviewAttempt[];
}
```

---

## Usage Examples

### Example 1: Simple Display Board

```tsx
import { ChessBoard } from '@components/chess/ChessBoard/ChessBoard';

export const PositionDisplay = () => {
  const fen = "r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3";

  return (
    <View>
      <Text>Sicilian Defense</Text>
      <ChessBoard fen={fen} orientation="white" />
    </View>
  );
};
```

### Example 2: Interactive Analysis Board

```tsx
import { useState } from 'react';
import { InteractiveChessBoard } from '@components/chess/InteractiveChessBoard/InteractiveChessBoard';
import { ChessService } from '@services/chess/ChessService';

export const AnalysisBoard = () => {
  const [chess] = useState(() => new ChessService());
  const [fen, setFen] = useState(chess.getFEN());
  const [history, setHistory] = useState<string[]>([]);

  const handleMove = (from: string, to: string) => {
    const moved = chess.makeMove({ from, to, promotion: 'q' } as any);

    if (moved) {
      setFen(chess.getFEN());
      setHistory(chess.getHistory());

      if (chess.isCheckmate()) {
        alert('Checkmate!');
      }
    }
  };

  const handleUndo = () => {
    if (chess.undo()) {
      setFen(chess.getFEN());
      setHistory(chess.getHistory());
    }
  };

  return (
    <View>
      <InteractiveChessBoard fen={fen} onMove={handleMove} />
      <Button title="Undo" onPress={handleUndo} />
      <Text>Moves: {history.join(', ')}</Text>
    </View>
  );
};
```

### Example 3: Move Navigation with Hook

```tsx
import { useState } from 'react';
import { ChessBoard } from '@components/chess/ChessBoard/ChessBoard';
import { useChessGame } from '@hooks/chess/useChessGame';

export const MoveNavigator = () => {
  const moves = ['e4', 'c5', 'Nf3', 'd6', 'd4', 'cxd4'];
  const [moveIndex, setMoveIndex] = useState(0);
  const { fen } = useChessGame(moves, moveIndex);

  return (
    <View>
      <ChessBoard fen={fen} />
      <View style={styles.controls}>
        <Button
          title="Previous"
          onPress={() => setMoveIndex(Math.max(0, moveIndex - 1))}
          disabled={moveIndex === 0}
        />
        <Text>Move {moveIndex} / {moves.length}</Text>
        <Button
          title="Next"
          onPress={() => setMoveIndex(Math.min(moves.length, moveIndex + 1))}
          disabled={moveIndex === moves.length}
        />
      </View>
    </View>
  );
};
```

### Example 4: Training Mode

```tsx
import { useState } from 'react';
import { ChessBoard } from '@components/chess/ChessBoard/ChessBoard';
import { ChessService } from '@services/chess/ChessService';

export const TrainingPosition = ({
  fen,
  correctMove
}: {
  fen: string;
  correctMove: string;
}) => {
  const [userInput, setUserInput] = useState('');
  const [feedback, setFeedback] = useState<'correct' | 'incorrect' | null>(null);

  const checkMove = () => {
    const chess = new ChessService(fen);
    const valid = chess.makeMove(userInput);

    if (!valid) {
      setFeedback('incorrect');
      return;
    }

    const history = chess.getHistory();
    const lastMove = history[history.length - 1];

    if (lastMove === correctMove) {
      setFeedback('correct');
    } else {
      setFeedback('incorrect');
    }
  };

  return (
    <View>
      <ChessBoard fen={fen} />
      <TextInput
        placeholder="Enter move (e.g., Nf3)"
        value={userInput}
        onChangeText={setUserInput}
      />
      <Button title="Check" onPress={checkMove} />
      {feedback && (
        <Text style={feedback === 'correct' ? styles.correct : styles.incorrect}>
          {feedback === 'correct' ? '✓ Correct!' : '✗ Try again'}
        </Text>
      )}
    </View>
  );
};
```

---

## Dependencies

### External Packages

```json
{
  "chess.js": "^1.0.0-beta.8",          // Chess game logic
  "react": "18.3.1",                     // React core
  "react-native": "0.76.5",              // React Native
  "zustand": "^4.4.7"                    // State management
}
```

### Internal Dependencies

The board components have minimal internal dependencies:

- **ChessBoard** → Square, Piece, chess.js
- **InteractiveChessBoard** → chess.js (self-contained)
- **ChessService** → chess.js
- **useChessGame** → ChessService

### Peer Dependencies

- React Native: `>=0.70.0`
- React: `>=18.0.0`

---

## Extraction Guide

### Step 1: Copy Core Files

Copy these files to your new project:

```
src/components/chess/
├── ChessBoard/
│   ├── ChessBoard.tsx
│   ├── Square.tsx
│   └── Piece.tsx
└── InteractiveChessBoard/
    └── InteractiveChessBoard.tsx

src/services/chess/
└── ChessService.ts

src/hooks/chess/
└── useChessGame.ts

src/types/
└── repertoire.types.ts (optional, for type reference)
```

### Step 2: Install Dependencies

```bash
npm install chess.js@^1.0.0-beta.8
# or
yarn add chess.js@^1.0.0-beta.8
```

### Step 3: Configure Import Paths

The code uses path aliases. Either:

**Option A: Use the same aliases**

Update `babel.config.js`:

```javascript
module.exports = {
  plugins: [
    [
      'module-resolver',
      {
        alias: {
          '@components': './src/components',
          '@services': './src/services',
          '@hooks': './src/hooks',
          '@types': './src/types',
        },
      },
    ],
  ],
};
```

Update `tsconfig.json`:

```json
{
  "compilerOptions": {
    "paths": {
      "@components/*": ["./src/components/*"],
      "@services/*": ["./src/services/*"],
      "@hooks/*": ["./src/hooks/*"],
      "@types/*": ["./src/types/*"]
    }
  }
}
```

**Option B: Update imports to relative paths**

Replace all imports:
- `@components/...` → `../../components/...`
- `@services/...` → `../../services/...`
- etc.

### Step 4: Standalone Usage (No State Management)

If you don't want to use Zustand, the components work standalone:

```tsx
// No store needed - just local state
const [fen, setFen] = useState('starting-position');
const [orientation, setOrientation] = useState<'white' | 'black'>('white');

<ChessBoard fen={fen} orientation={orientation} />
```

### Step 5: Minimal Working Example

Create a test file to verify extraction:

```tsx
// TestBoard.tsx
import React, { useState } from 'react';
import { View, Button } from 'react-native';
import { InteractiveChessBoard } from './components/chess/InteractiveChessBoard/InteractiveChessBoard';
import { ChessService } from './services/chess/ChessService';

export const TestBoard = () => {
  const [chess] = useState(() => new ChessService());
  const [fen, setFen] = useState(chess.getFEN());

  const handleMove = (from: string, to: string) => {
    if (chess.makeMove({ from, to, promotion: 'q' } as any)) {
      setFen(chess.getFEN());
    }
  };

  return (
    <View>
      <InteractiveChessBoard fen={fen} onMove={handleMove} />
      <Button title="Reset" onPress={() => {
        chess.reset();
        setFen(chess.getFEN());
      }} />
    </View>
  );
};
```

### Step 6: Optional Enhancements

Consider adding these improvements when integrating:

1. **Piece Images**: Replace Unicode symbols with SVG/PNG images
2. **Animations**: Add move animations using `react-native-reanimated`
3. **Sound Effects**: Add sound for moves, captures, check
4. **Premove**: Allow queuing moves before opponent moves
5. **Arrow Drawing**: Add arrow overlay for move annotations
6. **Clock Integration**: Add chess clock component
7. **Move Hints**: Add visual hints for beginners
8. **Undo Stack**: Implement full undo/redo with history

### File Size Breakdown

```
ChessBoard.tsx:         ~75 lines   (~2.5 KB)
InteractiveChessBoard:  ~165 lines  (~5 KB)
Square.tsx:             ~44 lines   (~1.5 KB)
Piece.tsx:              ~47 lines   (~1.5 KB)
ChessService.ts:        ~140 lines  (~4 KB)
useChessGame.ts:        ~23 lines   (~0.8 KB)
─────────────────────────────────────────────
Total:                  ~494 lines  (~15.3 KB)
```

### Testing Checklist

After extraction, verify:

- [ ] Board renders correctly
- [ ] Pieces display properly (all 12 types)
- [ ] Light/dark squares alternate correctly
- [ ] Board flips correctly for black orientation
- [ ] Pieces can be selected (interactive board)
- [ ] Valid moves are highlighted
- [ ] Illegal moves are rejected
- [ ] Move callback is triggered correctly
- [ ] FEN updates reflect board state
- [ ] Invalid FEN doesn't crash the app
- [ ] Board is responsive to screen size

---

## Performance Considerations

### Memoization Strategy

The implementation uses memoization extensively:

```tsx
// Board state is memoized based on FEN
const board = useMemo(() => {
  const game = new Chess(fen);
  return game.board();
}, [fen]);

// Position calculation is memoized
const { fen } = useChessGame(moves, moveIndex); // useMemo internally
```

### Optimization Tips

1. **Avoid Unnecessary Re-renders**: Pass stable references to callbacks
2. **Batch State Updates**: Update FEN and history together
3. **Lazy Loading**: Load board components only when needed
4. **Image Caching**: If using piece images, implement proper caching

---

## Known Limitations

1. **Pawn Promotion**: Interactive board auto-promotes to queen (no selection UI)
2. **No Drag-and-Drop**: Uses click/tap selection (not true dragging)
3. **No Animations**: Pieces teleport to destination (no smooth transitions)
4. **No Coordinates**: Board doesn't show file/rank labels
5. **Unicode Rendering**: Piece appearance depends on device font

---

## Future Improvements

Potential enhancements for future versions:

1. **Drag-and-Drop**: Implement using `react-native-gesture-handler`
2. **Promotion Dialog**: Add UI for selecting promotion piece
3. **Move Animations**: Smooth piece transitions
4. **Last Move Highlighting**: Highlight source/destination of last move
5. **Check Indicator**: Visual indicator when king is in check
6. **Coordinate Labels**: Show rank/file labels on board edges
7. **Custom Themes**: Support for different board color schemes
8. **Piece Sets**: Support for custom piece images
9. **Touch Feedback**: Haptic feedback on move/capture
10. **Accessibility**: Screen reader support, keyboard navigation

---

## License & Attribution

This implementation uses:
- **chess.js** (BSD-2-Clause): Chess game logic
- **React Native** (MIT): UI framework

Original implementation for the Kingside chess trainer project.

---

## Support & Questions

For issues specific to this implementation:

1. Check FEN validity using online validators
2. Ensure chess.js version is `^1.0.0-beta.8`
3. Verify React Native version compatibility
4. Check TypeScript strict mode settings

---

## Version History

- **v1.0** (2026-01-06): Initial extraction and documentation
  - Display-only ChessBoard component
  - Interactive board with move validation
  - ChessService wrapper class
  - useChessGame hook
  - Full TypeScript support

---

## Quick Reference

### Component Import Paths

```typescript
import { ChessBoard } from '@components/chess/ChessBoard/ChessBoard';
import { InteractiveChessBoard } from '@components/chess/InteractiveChessBoard/InteractiveChessBoard';
import { ChessService } from '@services/chess/ChessService';
import { useChessGame } from '@hooks/chess/useChessGame';
```

### Common FEN Strings

```typescript
// Starting position
const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

// After 1.e4
const AFTER_E4 = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1";

// Empty board
const EMPTY = "8/8/8/8/8/8/8/8 w - - 0 1";
```

### Color Scheme Reference

```typescript
const COLORS = {
  lightSquare: '#f0d9b5',
  darkSquare: '#b58863',
  selectedSquare: '#baca44',
  validMoveSquare: '#829769',
  border: '#000',
};
```

---

**End of Documentation**
