# Layout and Board Size Fixes

## Summary

Fixed severe layout issues where board size settings didn't work and UI was too large for mobile screens.

## Problems Fixed

1. **Board size setting didn't change actual board size** - Settings existed but weren't being used correctly
2. **Board too large by default** - Default sizes were 400/480/560px, too big for mobile
3. **RepertoireStudyScreen didn't use settings** - Hardcoded board size instead of reading user preferences
4. **Excessive padding/spacing** - Too much whitespace throughout UI

## Changes Made

### 1. ScreenSettingsService (src/services/settings/ScreenSettingsService.ts)

**Changed default board size from 'medium' to 'small' for all screens:**
- Analysis: small
- Repertoire: small
- Game Review: small
- Training: small

**New board size values:**
- small: 320px (was 400px)
- medium: 360px (was 480px)
- large: 420px (was 560px)

### 2. ChessWorkspace (src/components/chess/ChessWorkspace/ChessWorkspace.tsx)

**Updated board size calculation:**
- Reduced size map: 320/360/420 (from 400/480/560)
- Added debug logging to diagnose board size issues
- Logs: boardSizeSetting, maxSize, maxBoardSize, actualBoardSize, width, height

**Reduced padding/spacing:**
- container.paddingTop: 4px (was 8px)
- mainContent.gap: 8px (was 16px)
- commentBox.marginTop: 8px (was 12px)
- commentBox.padding: 8px (was 12px)
- commentText.fontSize: 12px (was 13px)
- commentText.lineHeight: 18px (was 20px)
- moveHistorySection.maxHeight: 350px (was 400px)
- moveHistorySection.paddingHorizontal: 8px (was 12px)
- moveHistorySectionWide.marginLeft: 12px (was 20px)
- moveHistorySectionWide.maxHeight: 500px (was 600px)

**Reduced border radius:**
- commentBox.borderRadius: 6px (was kept same)

### 3. MoveHistory (src/components/chess/MoveHistory/MoveHistory.tsx)

**Made component more compact:**

**Container:**
- borderRadius: 6px (was 8px)
- padding: 8px (was 12px)
- minHeight: 200px (was 250px)

**Move list:**
- marginBottom: 8px (was 12px)
- movesWrapper.paddingHorizontal: 6px (was 8px)

**Empty text:**
- paddingVertical: 16px (was 20px)
- fontSize: 12px (added)

**Move containers:**
- paddingHorizontal: 3px (was 4px)
- paddingVertical: 1px (was 2px)

**Typography:**
- moveNumber.fontSize: 11px (was 13px)
- moveText.fontSize: 12px (was 14px)
- variationText.fontSize: 11px (was 13px)
- variationBracket.fontSize: 11px (was 13px)

**Variation:**
- marginVertical: 1px (was 2px)

**Navigation:**
- gap: 6px (was 8px)
- navButton.paddingHorizontal: 12px (was 16px)
- navButton.paddingVertical: 6px (was 8px)
- navButtonText.fontSize: 14px (was 16px)
- settingsButton.paddingHorizontal: 12px (was 16px)
- settingsButton.paddingVertical: 6px (was 8px)
- settingsButton.marginLeft: 6px (was 8px)

**Icons:**
- criticalStar.fontSize: 10px (was 12px)
- criticalStar.marginRight: 1px (was 2px)
- commentIndicator.fontSize: 9px (was 11px)
- commentIndicator.marginLeft: 1px (was 2px)

### 4. RepertoireStudyScreen (src/screens/RepertoireStudyScreen.tsx)

**Added screen settings integration:**
- Import screenSettings from store
- Calculate boardSizePixels using same logic as ChessWorkspace (320/360/420)
- Pass boardSizePixels to InteractiveChessBoard
- Pass showCoordinates from settings
- Added debug logging for board size calculation

**Reduced padding/spacing:**
- leftPanel.width: 220px (was 240px)
- leftPanel.padding: 8px (was 12px)
- topSection.padding: 8px (was 12px)
- topSection.gap: 12px (was 16px)
- commentBox.marginTop: 8px (was 12px)
- commentBox.padding: 8px (was 12px)
- commentBox.borderRadius: 6px (was 8px)
- commentText.fontSize: 12px (was 14px)
- commentText.lineHeight: 18px (was 20px)
- moveHistoryPanel.minWidth: 280px (was 300px)
- moveHistoryPanel.maxWidth: 450px (was 500px)
- moveHistoryPanel.maxHeight: 500px (was 600px)
- bottomSection.minHeight: 180px (was 200px)
- bottomSection.gap: 12px (was 16px)
- bottomSection.padding: 8px (was 12px)
- moveHistoryContainer.maxHeight: 350px (was 400px)
- moveHistoryContainer.marginTop: 12px (was 16px)
- moveHistoryContainer.marginBottom: 12px (was 16px)

**Added comment box max width:**
- Uses boardSizePixels for responsive sizing

### 5. CollapsiblePanel (src/components/repertoire/CollapsiblePanel.tsx)

**Made panels more compact:**
- borderRadius: 6px (was 8px)
- marginBottom: 8px (was 12px)
- header.padding: 8px (was 12px)
- title.fontSize: 13px (was 14px)
- title.marginRight: 8px (was 12px)
- chevron.fontSize: 11px (was 12px)
- content.padding: 8px (was 12px)

## Debug Logging Added

### ChessWorkspace
Logs board size calculation:
```
[ChessWorkspace] Board size calculation: {
  boardSizeSetting: 'small',
  maxSize: 320,
  maxBoardSize: 340,
  actualBoardSize: 320,
  width: 380,
  height: 800
}
```

### RepertoireStudyScreen
Logs board size calculation:
```
[RepertoireStudyScreen] Board size: {
  boardSizeSetting: 'small',
  maxSize: 320,
  maxBoardSize: 340,
  boardSizePixels: 320
}
```

## Testing

To verify fixes:
1. Check console for debug logs showing board size calculations
2. Try changing board size in settings (small/medium/large)
3. Verify board actually changes size
4. Check that all UI fits on screen without cutting off navigation
5. Test on both narrow (phone) and wide (tablet) screens

## Expected Results

- Board is now smaller by default (320px vs 400px)
- Board size setting actually works and triggers re-renders
- RepertoireStudyScreen respects user's board size preference
- All UI components more compact with less wasted space
- Move history navigation buttons always visible
- Collapsible panels take less space

## Files Modified

1. `src/services/settings/ScreenSettingsService.ts` - Changed defaults to 'small'
2. `src/components/chess/ChessWorkspace/ChessWorkspace.tsx` - Reduced sizes, added logging
3. `src/components/chess/MoveHistory/MoveHistory.tsx` - Made more compact
4. `src/screens/RepertoireStudyScreen.tsx` - Added settings integration, reduced padding
5. `src/components/repertoire/CollapsiblePanel.tsx` - Made more compact
