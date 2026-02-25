/**
 * ChessWorkspace - Unified chess board layout with settings
 * Composes: EvalBar, InteractiveChessBoard, MoveHistory, Settings gear
 *
 * Wide mode:  [EvalBar | Board]  [EngineLines / MoveHistory]  (side-by-side, same height)
 * Narrow mode: [EvalBar | Board] stacked above [EngineLines] above [MoveHistory]
 */

import React, { useState, useMemo } from 'react';
import { View, StyleSheet, Text, ScrollView, useWindowDimensions } from 'react-native';
import { InteractiveChessBoard } from '@components/chess/InteractiveChessBoard/InteractiveChessBoard';
import { MoveHistory } from '@components/chess/MoveHistory/MoveHistory';
import { EvalBar, KeyMoveMarker } from '@components/chess/EvalBar/EvalBar';
import { EngineLines } from '@components/chess/EngineLines/EngineLines';
import { MoveTree } from '@utils/MoveTree';
import { EngineEvaluation, ScreenKey } from '@types';
import { SettingsModal } from './SettingsModal';
import { useStore } from '@store';
import { useEngine } from '@hooks/useEngine';

interface ChessWorkspaceProps {
  // Board control
  fen: string;
  onMove?: (from: string, to: string) => void;
  disabled?: boolean;

  // Move tree (optional)
  moveTree?: MoveTree | null;
  currentNodeId?: string | null;
  onNavigate?: (nodeId: string | null) => void;
  onGoBack?: () => void;
  onGoForward?: () => void;
  onGoToStart?: () => void;
  onGoToEnd?: () => void;
  onMarkCritical?: (nodeId: string, isCritical: boolean) => void;
  onPromoteToMainLine?: (nodeId: string) => void;

  // Engine analysis — leave undefined to let ChessWorkspace run the engine internally.
  // Pass an explicit value (including null) to override with pre-computed data (e.g. GameReview).
  currentEval?: EngineEvaluation | null;
  moveEvals?: Array<{ evaluation?: EngineEvaluation | null }>;
  keyMoves?: KeyMoveMarker[];

  // Screen identification (for settings)
  screenKey: ScreenKey;

  // Feature toggles (override screen settings)
  showMoveHistory?: boolean;
  showSettingsGear?: boolean;

  // Orientation override (e.g., from repertoire.color)
  orientationOverride?: 'white' | 'black';

  // Extra vertical px already consumed by siblings (e.g. game lists below).
  // Subtracted from available height when computing board size.
  verticalOffset?: number;
}

export const ChessWorkspace: React.FC<ChessWorkspaceProps> = ({
  fen,
  onMove,
  disabled = false,
  moveTree,
  currentNodeId,
  onNavigate,
  onGoBack,
  onGoForward,
  onGoToStart,
  onGoToEnd,
  onMarkCritical,
  onPromoteToMainLine,
  currentEval,
  moveEvals = [],
  keyMoves = [],
  screenKey,
  showMoveHistory = true,
  showSettingsGear = true,
  orientationOverride,
  verticalOffset = 0,
}) => {
  const { width, height } = useWindowDimensions();
  const { screenSettings } = useStore();
  const settings = screenSettings[screenKey];

  const [settingsVisible, setSettingsVisible] = useState(false);

  const orientation = orientationOverride || settings.orientation;
  const engineEnabled = Boolean(settings.engineEnabled);
  const coordinatesVisible = settings.coordinatesVisible;
  const moveHistoryVisible = showMoveHistory && settings.moveHistoryVisible;
  const boardSizeSetting = settings.boardSize || 'small';

  // Run the engine internally when no external eval is provided.
  // This keeps rapid Stockfish state updates isolated to ChessWorkspace's render tree,
  // preventing parent screens from re-rendering on every Stockfish info line.
  const internalEngineEnabled = engineEnabled && currentEval === undefined;
  const { evaluation: internalEval } = useEngine(fen, internalEngineEnabled);
  const activeEval = currentEval !== undefined ? currentEval : internalEval;

  const evalBarVisible = engineEnabled; // show bar whenever engine is on in settings

  const isWideScreen = width > 700;

  // Board size: % of available space, scales naturally across screen sizes.
  // In wide mode the board is on the left; cap by half-width and available height.
  // The eval bar occupies 10px + 3px gap to the left of the board.
  // Subtract it from available space so board + bar together never overflow the left column.
  const EVAL_BAR_WIDTH = 13;
  const evalBarReserved = evalBarVisible ? EVAL_BAR_WIDTH : 0;

  const availableForBoard = isWideScreen
    ? Math.min(width * 0.5 - 24 - evalBarReserved, height - 80 - verticalOffset)
    : Math.min(width - 24 - evalBarReserved, height - 80 - verticalOffset);

  const sizePercentages: Record<string, number> = {
    tiny: 0.30,
    small: 0.42,
    medium: 0.55,
    large: 0.68,
    xlarge: 0.82,
  };
  const sizePct = sizePercentages[boardSizeSetting] ?? 0.42;
  const actualBoardSize = Math.max(140, Math.min(600, Math.floor(availableForBoard * sizePct)));

  // Narrow mode: move history sits below the board and can be a bit smaller
  const narrowHistoryHeight = Math.max(80, Math.floor(actualBoardSize * 0.45));

  const flatMoves = useMemo(
    () => (moveTree ? moveTree.getFlatMoves() : []),
    [moveTree, currentNodeId]
  );

  const canGoBack = moveTree ? !moveTree.isAtStart() : false;
  const canGoForward = moveTree ? !moveTree.isAtEnd() : false;

  const handleGoBack = () => { if (onGoBack) onGoBack(); else moveTree?.goBack(); };
  const handleGoForward = () => { if (onGoForward) onGoForward(); else moveTree?.goForward(); };
  const handleGoToStart = () => { if (onGoToStart) onGoToStart(); else moveTree?.goToStart(); };
  const handleGoToEnd = () => { if (onGoToEnd) onGoToEnd(); else moveTree?.goToEnd(); };

  const currentComment = moveTree?.getCurrentNode()?.comment;
  // Total width of board area including eval bar (9 px bar + 4 px gap)
  const contentWidth = evalBarVisible ? actualBoardSize + 13 : actualBoardSize;

  return (
    // Wide: flex:1 to fill parent. Narrow: no flex so it sizes to content (works in ScrollViews).
    <View style={[styles.container, isWideScreen && styles.containerWide]}>
      {/* Row in wide mode, column in narrow mode */}
      <View style={[styles.mainContent, isWideScreen && styles.mainContentWide]}>

        {/* ── Left / top: board + optional eval bar ── */}
        <View style={styles.boardSection}>
          <View style={styles.boardRow}>
            {evalBarVisible && (
              <EvalBar
                currentEval={activeEval}
                orientation={orientation}
                moveHistory={moveEvals}
                currentMoveIndex={flatMoves.findIndex(m => m.id === currentNodeId)}
                keyMoves={keyMoves}
                height={actualBoardSize}
                visible={evalBarVisible}
              />
            )}
            <InteractiveChessBoard
              fen={fen}
              onMove={onMove}
              orientation={orientation}
              showCoordinates={coordinatesVisible}
              disabled={disabled}
              boardSizePixels={actualBoardSize}
              bestMove={evalBarVisible ? activeEval?.bestMove : undefined}
            />
          </View>
        </View>

        {/* ── Wide: right column — same height as board ── */}
        {isWideScreen && (
          <View style={[styles.rightColumn, { height: actualBoardSize }]}>
            {evalBarVisible && activeEval && (
              <View style={styles.engineLinesWide}>
                <EngineLines evaluation={activeEval} />
              </View>
            )}
            {moveHistoryVisible && moveTree && onNavigate && (
              <View style={styles.moveHistoryWide}>
                <MoveHistory
                  moves={flatMoves}
                  currentNodeId={currentNodeId || null}
                  onNavigate={onNavigate}
                  onGoBack={handleGoBack}
                  onGoForward={handleGoForward}
                  onGoToStart={handleGoToStart}
                  onGoToEnd={handleGoToEnd}
                  onPromoteToMainLine={onPromoteToMainLine}
                  onMarkCritical={onMarkCritical}
                  onSettingsPress={showSettingsGear ? () => setSettingsVisible(true) : undefined}
                  canGoBack={canGoBack}
                  canGoForward={canGoForward}
                />
              </View>
            )}
          </View>
        )}

        {/* ── Narrow: engine lines + move history below board ── */}
        {!isWideScreen && evalBarVisible && activeEval && (
          <View style={[styles.engineLinesNarrow, { width: contentWidth }]}>
            <EngineLines evaluation={activeEval} />
          </View>
        )}
        {!isWideScreen && moveHistoryVisible && moveTree && onNavigate && (
          <View style={{ width: contentWidth, height: narrowHistoryHeight }}>
            <MoveHistory
              moves={flatMoves}
              currentNodeId={currentNodeId || null}
              onNavigate={onNavigate}
              onGoBack={handleGoBack}
              onGoForward={handleGoForward}
              onGoToStart={handleGoToStart}
              onGoToEnd={handleGoToEnd}
              onPromoteToMainLine={onPromoteToMainLine}
              onMarkCritical={onMarkCritical}
              onSettingsPress={showSettingsGear ? () => setSettingsVisible(true) : undefined}
              canGoBack={canGoBack}
              canGoForward={canGoForward}
            />
          </View>
        )}
      </View>

      {/* Comment — spans the full workspace width, scrollable for long texts */}
      {currentComment && (
        <View style={[
          styles.commentBox,
          isWideScreen ? styles.commentBoxWide : { width: contentWidth },
        ]}>
          <ScrollView
            style={styles.commentScroll}
            nestedScrollEnabled
            showsVerticalScrollIndicator={true}
          >
            <Text style={styles.commentText}>{currentComment}</Text>
          </ScrollView>
        </View>
      )}

      <SettingsModal
        visible={settingsVisible}
        onClose={() => setSettingsVisible(false)}
        screenKey={screenKey}
        currentSettings={settings}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  // Narrow: no flex so height = content (works inside ScrollViews)
  container: {
    paddingTop: 4,
    alignItems: 'center',
  },
  // Wide: fill the parent flex container
  containerWide: {
    flex: 1,
    alignItems: 'stretch',
  },
  mainContent: {
    alignItems: 'center',
    gap: 4,
  },
  mainContentWide: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
    alignSelf: 'stretch',
    paddingHorizontal: 8,
    gap: 8,
  },
  boardSection: {
    alignItems: 'center',
  },
  boardRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  // Narrow: width is set inline to match board+evalbar
  commentBox: {
    marginTop: 4,
    backgroundColor: '#3a3a3a',
    borderRadius: 6,
    borderLeftWidth: 3,
    borderLeftColor: '#87CEEB',
  },
  // Wide: stretch to the full workspace width (within paddingHorizontal)
  commentBoxWide: {
    alignSelf: 'stretch',
    marginHorizontal: 8,
  },
  commentScroll: {
    maxHeight: 100,
    padding: 6,
  },
  commentText: {
    color: '#e0e0e0',
    fontSize: 11,
    lineHeight: 16,
  },
  rightColumn: {
    flex: 1,
    minWidth: 200,
    flexDirection: 'column',
  },
  engineLinesWide: {
    width: '100%',
    paddingHorizontal: 4,
    marginBottom: 6,
  },
  moveHistoryWide: {
    flex: 1,
    width: '100%',
  },
  engineLinesNarrow: {
    paddingHorizontal: 4,
  },
});
