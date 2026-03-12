# Training & Annotation Improvements Plan

Detailed implementation plan for the 6 features in `NEW_IMPROVEMENTS.md`. Each feature is self-contained. All new logic requires ≥90% test coverage.

---

## Feature 1: Opponent-Only Branching for Training

**Goal:** When enabled, training lines only branch on opponent moves. User's alternative moves (siblings in the MoveTree) are skipped — only the first child (main line) is followed at user-move positions. Opponent-move positions branch normally.

**Example (White repertoire):**
Tree: `1. e4 (1. d4) e5 (1...c5) 2. Nf3`
- `1. d4` is a user alternative → skipped
- `1...e5` / `1...c5` are opponent alternatives → two lines: `1. e4 e5 2. Nf3` and `1. e4 c5`

### Changes

**`src/types/training.types.ts`**
- Add `opponentBranchingOnly?: boolean` to `TrainingConfig`

**`src/services/training/LineExtractor.ts`**
- Add `opponentBranchingOnly?: boolean` parameter to `extractLines()`, pass through to `extractLinesRecursive()`
- In `extractLinesRecursive()`, before processing variations (`nodes[1+]`), check:
  ```typescript
  // All sibling nodes share the same isBlack — check nodes[0]
  const isWhiteMove = !nodes[0].isBlack;
  const isUserMove = (color === 'white') === isWhiteMove;

  // If opponent-only branching is on AND these are user moves, skip alternatives
  if (opponentBranchingOnly && isUserMove) {
    // Only process nodes[0] (main line), skip nodes[1+]
    return;
  }
  // Otherwise process all variations as before
  ```

**`src/screens/training/TrainingDashboardScreen.tsx`**
- Add state: `const [opponentBranchingOnly, setOpponentBranchingOnly] = useState(false)`
- Add checkbox after "Learn mode" checkbox:
  `"Main line only for my moves (branch on opponent moves only)"`
- Pass `opponentBranchingOnly` in navigation params and in stats calculation `extractLines()` calls

**`src/services/training/TrainingService.ts`**
- In `startSession()`, pass `config.opponentBranchingOnly` to `LineExtractor.extractLines()`

### Tests — `src/services/training/__tests__/LineExtractor.opponentBranching.test.ts`

1. White repertoire, user alternatives skipped: `1. e4 (1. d4) e5 2. Nf3` → 1 line
2. White repertoire, opponent alternatives branch: `1. e4 e5 (1...c5) 2. Nf3` → 2 lines
3. Black repertoire, mirrored: Black's alternatives skipped, White's branch
4. Nested: `1. e4 e5 (1...c5 2. Nf3 (2. d4)) 2. Nf3` → correct count
5. Flag disabled → all branches create lines (existing behavior)
6. Single-line tree → 1 line regardless
7. 3+ opponent alternatives → 3+ lines

---

## Feature 2: Chessable Direct Variations Import

**Goal:** Sub-option under Chessable import. Each PGN game becomes its own chapter (no MoveTree merging). Still grouped by White header for repertoire organization.

**Current flow:** Chessable mode → `processChessableRepertoire()` → group by White header → merge games per group into one MoveTree → one chapter per group.

**New flow:** Chessable + Direct → still group by White header → but each game = its own chapter. Name: `"{GroupName} — Var {N}"` (omit suffix if only 1 game in group).

### Changes

**`src/screens/ImportPGNScreen.tsx`**
- Add state: `const [chessableDirectMode, setChessableDirectMode] = useState(false)`
- Show indented sub-checkbox when `chessableMode` is true:
  `"Direct variations (one chapter per game, no merging)"`
- In the Chessable import branch, when `chessableDirectMode` is true:
  - Still call `processChessableRepertoire()` for grouping + model game filtering
  - Instead of merging games per group, create one chapter per game:
    ```typescript
    for (const [groupName, games] of chapters) {
      for (let i = 0; i < games.length; i++) {
        const chapterName = games.length > 1
          ? `${groupName} — Var ${i + 1}`
          : groupName;
        const moveTree = PGNService.buildMoveTree(games[i].moves);
        newChapters.push({ id: generateId(), name: chapterName, moveTree: moveTree.toJSON(), ... });
      }
    }
    ```

### Tests — `src/screens/__tests__/ImportChessableDirect.test.ts`

1. Direct mode: 3 games in same group → 3 chapters
2. Naming: multi-game groups get `"— Var N"` suffix
3. Single-game group: no suffix
4. Each chapter's MoveTree matches original game (no cross-contamination)
5. Non-direct mode: same input → merged chapters (existing behavior preserved)

---

## Feature 3: Auto-Scroll Variation List

**Goal:** VariationSelector auto-scrolls to current line and highlights it with a lighter background.

### Changes

**`src/components/training/VariationSelector.tsx`**
- Add `scrollViewRef = useRef<ScrollView>(null)`
- Track Y offsets per item via `onLayout` on each `TouchableOpacity`:
  ```typescript
  const itemOffsets = useRef<Record<number, number>>({});
  // On each item: onLayout={(e) => { itemOffsets.current[index] = e.nativeEvent.layout.y; }}
  ```
- `useEffect` on `currentLineIndex`:
  ```typescript
  useEffect(() => {
    const y = itemOffsets.current[currentLineIndex];
    if (y !== undefined) {
      scrollViewRef.current?.scrollTo({ y: Math.max(0, y - 20), animated: true });
    }
  }, [currentLineIndex]);
  ```
- Update `lineItemCurrent` background from `'#2a3a4a'` → `'#344a5e'` (lighter, more visible)

### Tests

Visual/scroll behavior — manual verification on device. No unit tests needed.

---

## Feature 4: Opponent Move Annotations in Training

**Goal:** In learn mode, show opponent move's annotation before the user's input. If both moves have annotations, show two boxes with different colors.

### Changes

**`src/screens/training/TrainingSessionScreen.tsx`**

- Add state: `const [opponentComment, setOpponentComment] = useState<string | undefined>(undefined)`
- Update `updateComment()`:
  ```typescript
  const updateComment = (sess: TrainingSession) => {
    if (!sess.learnMode) {
      setCurrentComment(undefined);
      setOpponentComment(undefined);
      return;
    }
    const currentLine = sess.lines[sess.currentLineIndex];
    const userMoves = currentLine.moves.filter(m => m.isUserMove);
    const currentUserMove = userMoves[sess.currentMoveIndex];
    setCurrentComment(currentUserMove?.comment || undefined);

    // Find preceding opponent move's comment
    if (currentUserMove) {
      const idx = currentLine.moves.findIndex(m => m.nodeId === currentUserMove.nodeId);
      const prevMove = idx > 0 ? currentLine.moves[idx - 1] : null;
      setOpponentComment(prevMove && !prevMove.isUserMove ? (prevMove.comment || undefined) : undefined);
    } else {
      setOpponentComment(undefined);
    }
  };
  ```
- Update comment box JSX — two boxes when both exist:
  - **Opponent comment:** amber left border (`#FFA726`), label `"Opponent's move:"` when both shown
  - **User comment:** blue left border (`#87CEEB`, existing), label `"Your move:"` when both shown
  - Single comment (either): no label, use appropriate border color
- Clear `opponentComment` on line completion and line switch

### Tests — `src/screens/training/__tests__/OpponentAnnotations.test.ts`

1. Opponent comment before user move → `opponentComment` populated
2. Both comments → two boxes rendered
3. Only user comment → single blue box
4. Only opponent comment → single amber box
5. Comments cleared on line switch

---

## Feature 5: No Auto-Skip on Variation Completion

**Goal:** Always show rating buttons after completing a line, in both learn and drill mode. Remove the learn-mode auto-advance.

### Changes

**`src/screens/training/TrainingSessionScreen.tsx`**

Replace all 3 learn-mode auto-advance patterns with `awaitingRating: true`:

**Location 1 — line 140-147** (correct move + line complete):
```typescript
// BEFORE:
if (isLearnMode) {
  setTimeout(() => { setFeedback(null); completeLineAndAdvance(); }, timing.lineCompleteDelayMs);
} else {
  setSession({ ...session, awaitingRating: true });
}
// AFTER:
setSession({ ...session, awaitingRating: true });
```

**Location 2 — line 189-191** (after opponent move + no more moves):
```typescript
// Same pattern — replace isLearnMode branch with awaitingRating: true
```

**Location 3 — line 224-226** (next user position + no more moves):
```typescript
// Same pattern — replace isLearnMode branch with awaitingRating: true
```

**Also:** Add a "Delete Line" button in the rating section when `awaitingRating` is true:
```tsx
{session.awaitingRating && (
  <View style={styles.ratingContainer}>
    {/* existing rating title + buttons */}
    <TouchableOpacity
      style={styles.deleteLineButton}
      onPress={() => handleLongPressLine(session.currentLineIndex)}
    >
      <Text style={styles.deleteLineText}>Delete Line</Text>
    </TouchableOpacity>
  </View>
)}
```

`handleRating()` already handles advance-to-next correctly for both modes — no changes needed.

### Tests

Behavioral change is removing 3 `setTimeout` auto-advance calls. Verify manually that both modes show rating buttons.

---

## Feature 6: NAG Badges on Board + PGN Arrow Support

Largest feature, broken into sub-tasks.

### 6A: Parse `[%cal]` and `[%csl]` from PGN

**`src/types/annotation.types.ts`** (new)
```typescript
export interface PGNArrow {
  color: string;   // hex color
  from: string;    // square e.g. "c1"
  to: string;      // square e.g. "e3"
}

export interface PGNHighlight {
  color: string;
  square: string;
}
```

Color mapping: `G` → `#15781B`, `R` → `#882020`, `Y` → `#E6A817`, `B` → `#003088`

**`src/utils/MoveTree.ts`**
- Add to `MoveNode`:
  ```typescript
  arrows?: PGNArrow[];
  highlights?: PGNHighlight[];
  ```
- These are plain objects — serialize naturally in `toJSON()`/`fromJSON()`

**`src/services/pgn/PGNService.ts`**
- In `parseCommentDiag()`, add:
  ```typescript
  if (diag.cal) {
    node.arrows = diag.cal.map((entry: string) => ({
      color: CAL_COLORS[entry[0]] || '#15781B',
      from: entry.substring(1, 3),
      to: entry.substring(3, 5),
    }));
  }
  if (diag.csl) {
    node.highlights = diag.csl.map((entry: string) => ({
      color: CAL_COLORS[entry[0]] || '#15781B',
      square: entry.substring(1, 3),
    }));
  }
  ```

### 6B: Render Arrows on Board

**`src/components/chess/InteractiveChessBoard/InteractiveChessBoard.tsx`**
- Add prop: `arrows?: Array<{ from: string; to: string; color: string }>`
- Render multiple arrows using existing `getArrowPath()` + `<Path>`, looping over array
- Keep existing `bestMove` prop working (backward compatible, rendered as single arrow)
- Layer order: PGN arrows (bottom) → engine arrow (`bestMove`) → hint arrow

**`src/components/chess/ChessWorkspace/ChessWorkspace.tsx`**
- Read `arrows` from current MoveNode, pass to InteractiveChessBoard with 0.7 opacity applied to colors

### 6C: Arrow Colors by Source

| Source | Color | Opacity |
|--------|-------|---------|
| Engine (Stockfish `bestMove`) | Green `rgba(39, 174, 96, 0.7)` | existing |
| Learn/hint arrows (training) | Purple `rgba(156, 39, 176, 0.7)` | **changed from blue** |
| Incorrect hint (training) | Red (unchanged) | existing |
| PGN arrows (`[%cal]`) | Original PGN color (G/R/Y/B) | 0.7 |

**`src/screens/training/TrainingSessionScreen.tsx`**
- Update `hintArrowColor` for learn mode: `'rgba(156, 39, 176, 0.7)'`

### 6D: NAG Floating Badge on Board

**`src/utils/nagSymbols.ts`** (new shared file)
- Extract `NAG_SYMBOLS` map from `MoveHistory.tsx`:
  ```typescript
  export const NAG_SYMBOLS: Record<number, string> = {
    1: '!', 2: '?', 3: '!!', 4: '??', 5: '!?', 6: '?!',
    10: '=', 14: '+=', 15: '=+', 16: '±', 17: '∓', 18: '+-', 19: '-+',
  };
  ```
- `MoveHistory.tsx` imports from here (remove local copy)

**`src/components/chess/InteractiveChessBoard/InteractiveChessBoard.tsx`**
- Add prop: `nagBadge?: { square: string; symbol: string }`
- Render floating badge at top-right corner of the destination square:
  - Small rounded rect, dark semi-transparent background (`rgba(0,0,0,0.75)`), white bold text
  - Offset: `{ x: squareX + squareSize * 0.6, y: squareY - squareSize * 0.1 }`
  - Use `<View>` with absolute positioning overlaid on the board

**`src/components/chess/ChessWorkspace/ChessWorkspace.tsx`**
- When current node has `nags`, compute:
  ```typescript
  const nagBadge = currentNode?.nags?.length
    ? { square: lastMoveToSquare, symbol: NAG_SYMBOLS[currentNode.nags[0]] || '' }
    : undefined;
  ```
- Pass to InteractiveChessBoard
- Need to track `lastMoveToSquare` — derive from the move that led to current position

### Tests — `src/services/pgn/__tests__/PGNArrowParsing.test.ts`

1. Parse single arrow: `[%cal Gc1e3]` → correct structure
2. Parse multiple arrows: `[%cal Gc1e3,Rd4f5]` → 2 arrows, correct colors
3. Parse highlights: `[%csl Ge4,Rd5]` → correct squares/colors
4. Unknown color code → falls back to green
5. Mixed: comment with `[%cal]` + `[%eval]` → both parsed
6. Serialization round-trip: `toJSON()` → `fromJSON()` preserves arrows
7. All standard NAGs (1-19) map to correct symbols in `nagSymbols.ts`

---

## Implementation Order

By complexity (smallest first):

1. **Feature 5** — No auto-skip (~10 lines changed, 3 `setTimeout` removals)
2. **Feature 3** — Auto-scroll variation list (small component change)
3. **Feature 1** — Opponent-only branching (core training logic, moderate)
4. **Feature 4** — Opponent annotations (UI + state, moderate)
5. **Feature 2** — Chessable direct import (import flow, moderate)
6. **Feature 6** — NAG + arrows (parser → data model → rendering, largest)

---

## Files Modified Summary

| File | Features |
|------|----------|
| `src/types/training.types.ts` | 1 |
| `src/services/training/LineExtractor.ts` | 1 |
| `src/services/training/TrainingService.ts` | 1 |
| `src/screens/training/TrainingDashboardScreen.tsx` | 1 |
| `src/screens/training/TrainingSessionScreen.tsx` | 3, 4, 5, 6C |
| `src/components/training/VariationSelector.tsx` | 3 |
| `src/screens/ImportPGNScreen.tsx` | 2 |
| `src/utils/MoveTree.ts` | 6A |
| `src/services/pgn/PGNService.ts` | 6A |
| `src/components/chess/InteractiveChessBoard/InteractiveChessBoard.tsx` | 6B, 6D |
| `src/components/chess/ChessWorkspace/ChessWorkspace.tsx` | 6B, 6D |
| `src/components/chess/MoveHistory/MoveHistory.tsx` | 6D (import shared NAG_SYMBOLS) |

**New files:**

| File | Purpose |
|------|---------|
| `src/utils/nagSymbols.ts` | Shared NAG_SYMBOLS map |
| `src/types/annotation.types.ts` | PGNArrow, PGNHighlight types |
| `src/services/training/__tests__/LineExtractor.opponentBranching.test.ts` | Feature 1 tests |
| `src/screens/__tests__/ImportChessableDirect.test.ts` | Feature 2 tests |
| `src/screens/training/__tests__/OpponentAnnotations.test.ts` | Feature 4 tests |
| `src/services/pgn/__tests__/PGNArrowParsing.test.ts` | Feature 6 tests |
