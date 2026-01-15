# QoL Features - Debugging Guide

## Completed Features

### 1. Edit and Delete Repertoires ✅
**Location:** `src/screens/RepertoireScreen.tsx`

- Edit and Delete buttons added to each repertoire card
- Edit mode shows TextInput with Save/Cancel buttons
- Delete shows confirmation dialog
- Both functions persist changes to AsyncStorage

**Testing Delete:**
- Open Repertoire screen
- Click Delete button on any repertoire
- Confirm deletion in the alert dialog
- Check console for these logs:
  ```
  RepertoireScreen: Attempting to delete repertoire: [name] [id]
  RepertoireScreen: Delete confirmed for: [id]
  Store: Deleting repertoire: [id]
  Store: Found repertoire to delete: [name]
  Store: Repertoires after filter: X was: Y
  Store: Review cards after filter: X was: Y
  Store: Repertoire deleted successfully
  RepertoireScreen: Delete successful
  ```

**If delete doesn't work:**
- Check console logs to see where it fails
- Verify Alert dialog appears
- Confirm you clicked "Delete" not "Cancel"

### 2. Edit Chapter Titles ✅
**Location:** `src/screens/RepertoireScreen.tsx`

- Edit button on each chapter
- Inline editing with TextInput
- Save/Cancel buttons when editing

**Testing:**
- Expand a repertoire
- Click Edit button on a chapter
- Change the name
- Click Save

### 3. PGN Variation Parsing ✅
**Location:** `src/services/pgn/PGNService.ts`

- Added recursive variation processing in `buildMoveTree()`
- Variations are parsed from RAV format (moves in parentheses)
- Variations are added as alternative branches in MoveTree

**Testing Variations:**
1. Import the test file `test_variations.pgn` as a repertoire:
   ```
   1. e4 e5 (1... c5 2. Nf3 d6) 2. Nf3 Nc6 3. Bb5 a6 (3... Nf6 4. O-O) 4. Ba4 Nf6 *
   ```

2. Expected variations:
   - After 1. e4, there should be a variation starting with 1... c5
   - After 3. Bb5, there should be a variation starting with 3... Nf6

3. Check console logs:
   ```
   PGNService.toMoveTree: Starting with X move sequences
   PGNService: Found X variations after [move]
   PGNService: Processing variation, current node: [move] parent: [move]
   PGNService: Navigated back to parent, current: [move]
   PGNService: Navigated back to main line: [move]
   PGNService.toMoveTree: Built tree, flat moves: X
   ```

4. Open the chapter in RepertoireStudyScreen
5. Check MoveHistory component - variations should appear in parentheses like:
   ```
   1. e4 e5 (1... c5 2. Nf3 d6) 2. Nf3 Nc6 3. Bb5 a6 (3... Nf6 4. O-O) 4. Ba4
   ```

**If variations don't show:**
- Check console for variation parsing logs
- Verify the PGN has variations in parentheses format
- Check that MoveHistory is receiving moves with `isVariationStart: true`

### 4. Game Metadata Extraction ✅
**Location:** `src/services/pgn/PGNService.ts:61-72`

Already working correctly! Extracts:
- Player names from `[White "Name"]` and `[Black "Name"]` headers
- Dates from `[Date "YYYY.MM.DD"]` header
- Event, ECO code, result from respective headers

**Testing:**
- Import `example_pgns/my_games.pgn` to My Games
- Open Game List screen
- Verify player names and dates appear correctly

## Known Issues

### Issue 1: Variations Not Showing in Move History
**Status:** Under investigation with logging

**Possible Causes:**
1. Parser not detecting variations in PGN
2. buildMoveTree not adding variations correctly
3. MoveTree navigation logic issue
4. MoveHistory component not rendering variations

**Debug Steps:**
1. Import test_variations.pgn
2. Check console for "PGNService: Found X variations" logs
3. If variations found but not showing, issue is in rendering
4. If variations not found, issue is in parsing

### Issue 2: Delete Repertoire Not Working
**Status:** Under investigation with logging

**Possible Causes:**
1. Alert dialog not confirming
2. Async operation not completing
3. Store update not triggering re-render
4. Storage save failing

**Debug Steps:**
1. Click Delete button
2. Check console logs in sequence
3. If logs stop partway, that's where the error is
4. Check for any error messages in console

## Next Steps

1. Test delete functionality with console open
2. Test variation import with test_variations.pgn
3. Report which console logs appear and which don't
4. This will pinpoint exactly where each issue is occurring

## Files Modified

- `src/screens/RepertoireScreen.tsx` - Added edit/delete UI for repertoires and chapters
- `src/store/index.ts` - Added updateRepertoire action, enhanced deleteRepertoire logging
- `src/services/pgn/PGNService.ts` - Fixed variation parsing, added debug logging
- `test_variations.pgn` - Created test file with clear variations
