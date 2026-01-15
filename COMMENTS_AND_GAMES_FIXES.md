# Comment Display and Game List Improvements

## Issues Fixed

### ✅ 1. Comments/Annotations Not Appearing

**Problem:** PGN comments were being parsed but not stored in the MoveTree, so they never appeared in the UI.

**Solution:** Modified `PGNService.buildMoveTree()` to extract `move.commentAfter` from parsed moves and attach to MoveTree nodes.

**File Modified:** `src/services/pgn/PGNService.ts`

**Code Added:**
```typescript
// Add comment/annotation if present
const currentNode = moveTree.getCurrentNode();
if (currentNode && move.commentAfter) {
  currentNode.comment = move.commentAfter;
}
```

**Result:** Comments like engine evaluations (e.g., `{ [%eval 0.17] }`) now display below the board when navigating to moves with annotations.

**Note:** Only works for **newly imported PGNs**. Old repertoires need to be re-imported to have comments.

---

### ✅ 2. Added "Delete All Games" Button

**Problem:** No easy way to clear all games from a game list without deleting them one by one.

**Solution:**
1. Added `deleteAllUserGames` and `deleteAllMasterGames` actions to store
2. Added "Delete All" button to GameListScreen header (only visible when games exist)
3. Platform-specific confirmation (window.confirm on web, Alert on native)

**Files Modified:**
- `src/store/index.ts` - Added delete all actions
- `src/screens/GameListScreen.tsx` - Added button and handler

**Features:**
- Red "Delete All" button appears next to "Import" when games exist
- Shows count in confirmation: "Delete all X user games?"
- Warns: "This cannot be undone"
- Works on both web and native platforms

---

### 🔍 3. Player Names Investigation

**Problem:** Game list shows "Unknown vs Unknown" instead of actual player names from PGN headers.

**Solution Added:** Debug logging to investigate the issue.

**File Modified:** `src/services/pgn/PGNService.ts`

**Debug Logging Added:**
```typescript
console.log('PGNService.toUserGame: Headers:', JSON.stringify(parsed.headers));
```

**Next Steps:**
1. Import a PGN file with games
2. Check console for log: `PGNService.toUserGame: Headers: {...}`
3. Report what the headers object contains
4. If headers are empty or have different keys, we'll fix the parser

**Expected Header Format:**
```json
{
  "White": "João Álvaro Ferreira",
  "Black": "João Matos",
  "Result": "*",
  "Date": "2025.01.04",
  "Event": "...",
  "ECO": "E11"
}
```

---

## Testing Instructions

### Test Comments:
1. Re-import a PGN with comments (e.g., my_games.pgn)
2. Open the repertoire in Study screen
3. Navigate to moves that had comments in the original PGN
4. Comments should appear in a blue-bordered box below the board

### Test Delete All:
1. Go to Game List screen
2. Ensure you have games imported (My Games or Master Games)
3. Click "Delete All" button (red button next to Import)
4. Confirm the deletion
5. All games in that tab should be deleted

### Test Player Names (Debug):
1. Import a PGN with player names in headers
2. Open browser console
3. Look for log entries starting with "PGNService.toUserGame: Headers:"
4. Report what the headers object contains

---

## Files Modified Summary

1. **src/services/pgn/PGNService.ts**
   - Added comment extraction in `buildMoveTree()`
   - Added debug logging in `toUserGame()`

2. **src/store/index.ts**
   - Added `deleteAllUserGames()` action
   - Added `deleteAllMasterGames()` action

3. **src/screens/GameListScreen.tsx**
   - Added Platform import
   - Added delete all handler with web/native compatibility
   - Added "Delete All" button to header
   - Added headerButtons, deleteAllButton, deleteAllButtonText styles

4. **src/screens/RepertoireStudyScreen.tsx** (from previous work)
   - Already displaying comments via `currentComment` variable

---

## Known Limitations

1. **Comments only in newly imported PGNs** - Old repertoires don't have comments because they were imported before the fix

2. **Player names issue still under investigation** - Needs testing to see what headers are actually being parsed

---

## Next Steps

1. Test comment display with freshly imported PGNs
2. Import a game PGN and check console for header debug logs
3. Report header structure so we can fix player name extraction if needed
4. Consider removing debug logging once issue is resolved

