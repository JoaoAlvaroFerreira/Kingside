# Chess Board Extraction Checklist

Quick reference for extracting the board implementation to a new project.

## Files to Copy

### Essential Files (Minimum Viable Board)

```
✓ Copy these files to get a working board:

src/components/chess/ChessBoard/
  ├── ChessBoard.tsx            [75 lines]
  ├── Square.tsx                [44 lines]
  └── Piece.tsx                 [47 lines]

src/components/chess/InteractiveChessBoard/
  └── InteractiveChessBoard.tsx [165 lines]

src/services/chess/
  └── ChessService.ts           [140 lines]

src/hooks/chess/
  └── useChessGame.ts           [23 lines]

Total: ~494 lines (~15.3 KB)
```

### Optional Files (For Type Safety)

```
src/types/
  └── repertoire.types.ts       [Type definitions]
```

---

## Installation Steps

### 1. Install Dependencies

```bash
npm install chess.js@^1.0.0-beta.8
```

### 2. Configure Path Aliases

Add to `babel.config.js`:

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
        },
      },
    ],
  ],
};
```

Add to `tsconfig.json`:

```json
{
  "compilerOptions": {
    "paths": {
      "@components/*": ["./src/components/*"],
      "@services/*": ["./src/services/*"],
      "@hooks/*": ["./src/hooks/*"]
    }
  }
}
```

### 3. Verify Installation

Create a test file:

```tsx
// TestBoard.tsx
import React, { useState } from 'react';
import { View, Button } from 'react-native';
import { ChessBoard } from './components/chess/ChessBoard/ChessBoard';

export const TestBoard = () => {
  const [fen, setFen] = useState('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');

  return (
    <View>
      <ChessBoard fen={fen} orientation="white" />
      <Button title="Flip" onPress={() => {/* flip logic */}} />
    </View>
  );
};
```

---

## Complete File Paths

For easy copying:

```
D:\Projects\Kingside\src\components\chess\ChessBoard\ChessBoard.tsx
D:\Projects\Kingside\src\components\chess\ChessBoard\Square.tsx
D:\Projects\Kingside\src\components\chess\ChessBoard\Piece.tsx
D:\Projects\Kingside\src\components\chess\InteractiveChessBoard\InteractiveChessBoard.tsx
D:\Projects\Kingside\src\services\chess\ChessService.ts
D:\Projects\Kingside\src\hooks\chess\useChessGame.ts
D:\Projects\Kingside\src\types\repertoire.types.ts
```

---

## Quick Integration Examples

### Example 1: Display-Only Board

```tsx
import { ChessBoard } from '@components/chess/ChessBoard/ChessBoard';

<ChessBoard
  fen="rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
  orientation="white"
/>
```

### Example 2: Interactive Board

```tsx
import { useState } from 'react';
import { InteractiveChessBoard } from '@components/chess/InteractiveChessBoard/InteractiveChessBoard';
import { ChessService } from '@services/chess/ChessService';

const [chess] = useState(() => new ChessService());
const [fen, setFen] = useState(chess.getFEN());

const handleMove = (from: string, to: string) => {
  if (chess.makeMove({ from, to, promotion: 'q' })) {
    setFen(chess.getFEN());
  }
};

<InteractiveChessBoard fen={fen} onMove={handleMove} />
```

### Example 3: With Move Navigation

```tsx
import { useState } from 'react';
import { ChessBoard } from '@components/chess/ChessBoard/ChessBoard';
import { useChessGame } from '@hooks/chess/useChessGame';

const moves = ['e4', 'c5', 'Nf3', 'd6'];
const [moveIndex, setMoveIndex] = useState(0);
const { fen } = useChessGame(moves, moveIndex);

<ChessBoard fen={fen} />
<Button title="Next" onPress={() => setMoveIndex(moveIndex + 1)} />
```

---

## Component Dependencies

```
ChessBoard
  ├─ chess.js (external)
  ├─ Square
  │   └─ Piece
  └─ React Native

InteractiveChessBoard
  ├─ chess.js (external)
  └─ React Native

ChessService
  └─ chess.js (external)

useChessGame
  └─ ChessService
```

---

## Testing Checklist

After extraction, verify:

- [ ] `npm install` completes without errors
- [ ] TypeScript compiles without errors
- [ ] Board renders in app
- [ ] All 12 piece types display correctly
- [ ] Light/dark squares alternate properly
- [ ] Board flips between white/black orientation
- [ ] Interactive board allows piece selection
- [ ] Valid moves are highlighted
- [ ] Illegal moves are rejected
- [ ] Move callback triggers correctly

---

## Known Issues to Handle

1. **Pawn Promotion**: Auto-promotes to queen (add UI if needed)
2. **No Drag Support**: Uses click/tap (implement drag if needed)
3. **Unicode Pieces**: Appearance varies by device (consider using images)

---

## Common Customizations

### Change Board Colors

In `Square.tsx` and `InteractiveChessBoard.tsx`:

```typescript
lightSquare: '#f0d9b5',  // Change this
darkSquare: '#b58863',   // And this
```

### Change Board Size

In both board components:

```typescript
const boardSize = Math.min(width - 40, 400);  // Adjust max size
```

### Add Coordinates

Wrap board and add labels:

```tsx
<View>
  <View style={styles.fileLabels}>
    {['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map(file => (
      <Text key={file}>{file}</Text>
    ))}
  </View>
  <ChessBoard fen={fen} />
</View>
```

---

## Package.json Dependencies

Ensure these are in your `package.json`:

```json
{
  "dependencies": {
    "chess.js": "^1.0.0-beta.8",
    "react": ">=18.0.0",
    "react-native": ">=0.70.0"
  },
  "devDependencies": {
    "@types/react": "~18.2.45",
    "typescript": "^5.3.3",
    "babel-plugin-module-resolver": "^5.0.0"
  }
}
```

---

## Alternative: Relative Imports

If you don't want to use path aliases, update imports:

**Before:**
```typescript
import { ChessService } from '@services/chess/ChessService';
```

**After:**
```typescript
import { ChessService } from '../../../services/chess/ChessService';
```

---

## Minimal Working App

Complete minimal example:

```tsx
// App.tsx
import React, { useState } from 'react';
import { SafeAreaView, View, Button, StyleSheet } from 'react-native';
import { InteractiveChessBoard } from './src/components/chess/InteractiveChessBoard/InteractiveChessBoard';
import { ChessService } from './src/services/chess/ChessService';

export default function App() {
  const [chess] = useState(() => new ChessService());
  const [fen, setFen] = useState(chess.getFEN());
  const [orientation, setOrientation] = useState<'white' | 'black'>('white');

  const handleMove = (from: string, to: string) => {
    if (chess.makeMove({ from, to, promotion: 'q' } as any)) {
      setFen(chess.getFEN());

      if (chess.isCheckmate()) alert('Checkmate!');
      else if (chess.isCheck()) alert('Check!');
    }
  };

  const handleReset = () => {
    chess.reset();
    setFen(chess.getFEN());
  };

  const handleFlip = () => {
    setOrientation(orientation === 'white' ? 'black' : 'white');
  };

  const handleUndo = () => {
    if (chess.undo()) {
      setFen(chess.getFEN());
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <InteractiveChessBoard
          fen={fen}
          onMove={handleMove}
          orientation={orientation}
        />

        <View style={styles.controls}>
          <Button title="Flip" onPress={handleFlip} />
          <Button title="Undo" onPress={handleUndo} />
          <Button title="Reset" onPress={handleReset} />
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  controls: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 20,
  },
});
```

---

## File Size Reference

```
Total extracted code:  ~494 lines
Total size:            ~15.3 KB
Dependencies:          chess.js only
Compatibility:         React Native 0.70+, React 18+
TypeScript:            Full support
```

---

## Support

For detailed documentation, see `BOARD_DOCUMENTATION.md`.

For chess.js API reference: https://github.com/jhlywa/chess.js
