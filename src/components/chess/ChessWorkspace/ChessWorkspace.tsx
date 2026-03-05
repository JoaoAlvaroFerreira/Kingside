/**
 * ChessWorkspace - Unified chess board layout with settings
 * Composes: EvalBar, InteractiveChessBoard, MoveHistory, Settings gear
 *
 * Wide mode:  [EvalBar | Board]  [EngineLines / MoveHistory]  (side-by-side, same height)
 * Narrow mode: [EvalBar | Board] stacked above [EngineLines] above [MoveHistory]
 */

import React, { useState, useMemo } from 'react';
import { View, StyleSheet, Text, ScrollView, TouchableOpacity, useWindowDimensions } from 'react-native';
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
  onDeleteMove?: (nodeId: string) => void;

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

  // Hint arrow (UCI format e.g. "e2e4") — shown independently of engine state
  hintArrow?: string;
  hintArrowColor?: string;

  // Override move index for eval bar (e.g. game review without MoveTree)
  currentMoveIndexOverride?: number;

  // Extra vertical px already consumed by siblings (e.g. game lists below).
  // Subtracted from available height when computing board size.
  verticalOffset?: number;

  // Hard cap on board size (px). Used when ChessWorkspace is placed inside a
  // constrained container whose width is smaller than what useWindowDimensions reports.
  maxBoardSize?: number;
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
  onDeleteMove,
  currentEval,
  moveEvals = [],
  keyMoves = [],
  screenKey,
  showMoveHistory = true,
  showSettingsGear = true,
  orientationOverride,
  hintArrow,
  hintArrowColor,
  currentMoveIndexOverride,
  verticalOffset = 0,
  maxBoardSize,
}) => {
  const { width, height } = useWindowDimensions();
  const { screenSettings } = useStore();
  const settings = screenSettings[screenKey];

  const [settingsVisible, setSettingsVisible] = useState(false);

  const orientation = orientationOverride || settings.orientation;
  const engineEnabled = Boolean(settings.engineEnabled);
  const coordinatesVisible = settings.coordinatesVisible;
  const moveHistoryVisible = showMoveHistory && settings.moveHistoryVisible;

  // Run the engine internally when no external eval is provided.
  // This keeps rapid Stockfish state updates isolated to ChessWorkspace's render tree,
  // preventing parent screens from re-rendering on every Stockfish info line.
  const internalEngineEnabled = engineEnabled && currentEval === undefined;
  const { evaluation: internalEval } = useEngine(fen, internalEngineEnabled);
  const activeEval = currentEval !== undefined ? currentEval : internalEval;

  // Show eval bar when engine is on OR when pre-computed evals are provided (e.g. game review)
  const hasPrecomputedEval = currentEval !== undefined;
  const evalBarVisible = engineEnabled || hasPrecomputedEval;

  const isWideScreen = width > 700 && width > height;

  // Board fills available width, capped by height so it stays on screen.
  // The eval bar occupies 10px + 3px gap to the left of the board.
  const EVAL_BAR_WIDTH = 13;
  const evalBarReserved = evalBarVisible ? EVAL_BAR_WIDTH : 0;
  const boardBorder = 4; // 2px border each side

  const availableForBoard = isWideScreen
    ? Math.min(width * 0.5 - evalBarReserved - boardBorder, height - 80 - verticalOffset)
    : Math.min(width - evalBarReserved - boardBorder, height - 80 - verticalOffset);

  // Board size setting scales the board down from max available.
  // XL = 100% (current behavior), smaller sizes free up space for move history / tabs.
  const BOARD_SIZE_SCALE: Record<string, number> = {
    tiny: 0.55, small: 0.65, medium: 0.78, large: 0.9, xlarge: 1.0,
  };
  const sizeScale = BOARD_SIZE_SCALE[settings.boardSize] ?? 1.0;

  const cappedForBoard = maxBoardSize ? Math.min(availableForBoard, maxBoardSize) : availableForBoard;
  const actualBoardSize = Math.max(140, Math.floor(cappedForBoard * sizeScale));

  // Narrow mode: move history sits below the board and can be a bit smaller
  const narrowHistoryHeight = Math.max(80, Math.floor(actualBoardSize * 0.45));

  // Only recompute flat moves when the tree structure changes (add/delete/promote),
  // NOT on every navigation. This avoids O(n) work on each arrow-key press.
  const structureVersion = moveTree?.structureVersion ?? 0;
  const flatMoves = useMemo(
    () => (moveTree ? moveTree.getFlatMoves() : []),
    [moveTree, structureVersion] // eslint-disable-line react-hooks/exhaustive-deps
  );

  const canGoBack = moveTree ? !moveTree.isAtStart() : false;
  const canGoForward = moveTree ? !moveTree.isAtEnd() : false;

  const handleGoBack = () => { if (onGoBack) onGoBack(); else moveTree?.goBack(); };
  const handleGoForward = () => { if (onGoForward) onGoForward(); else moveTree?.goForward(); };
  const handleGoToStart = () => { if (onGoToStart) onGoToStart(); else moveTree?.goToStart(); };
  const handleGoToEnd = () => { if (onGoToEnd) onGoToEnd(); else moveTree?.goToEnd(); };

  const currentComment = moveTree?.isAtStart()
    ? moveTree.getRootComment()
    : moveTree?.getCurrentNode()?.comment;
  // MoveHistory renders only when visible AND has required props
  const isMoveHistoryRendered = Boolean(moveHistoryVisible && moveTree && onNavigate);

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
                currentMoveIndex={currentMoveIndexOverride ?? flatMoves.findIndex(m => m.id === currentNodeId)}
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
              bestMove={hintArrow || (evalBarVisible ? activeEval?.bestMove : undefined)}
              arrowColor={hintArrow ? (hintArrowColor || 'rgba(198, 40, 40, 0.75)') : undefined}
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
                  onDeleteMove={onDeleteMove}
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
          <View style={styles.engineLinesNarrow}>
            <EngineLines evaluation={activeEval} />
          </View>
        )}
        {!isWideScreen && moveHistoryVisible && moveTree && onNavigate && (
          <View style={{ alignSelf: 'stretch', marginHorizontal: 8, height: narrowHistoryHeight }}>
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
              onDeleteMove={onDeleteMove}
              onSettingsPress={showSettingsGear ? () => setSettingsVisible(true) : undefined}
              canGoBack={canGoBack}
              canGoForward={canGoForward}
            />
          </View>
        )}
      </View>

      {/* Floating settings gear when MoveHistory is not rendered */}
      {showSettingsGear && !isMoveHistoryRendered && (
        <TouchableOpacity
          onPress={() => setSettingsVisible(true)}
          style={styles.floatingGear}
        >
          <Text style={styles.floatingGearText}>⚙️</Text>
        </TouchableOpacity>
      )}

      {/* Comment — spans full width in both modes */}
      {currentComment && (
        <View style={[
          styles.commentBox,
          isWideScreen ? styles.commentBoxWide : styles.commentBoxNarrow,
        ]}>
          <ScrollView
            style={styles.commentScroll}
            contentContainerStyle={{ paddingBottom: 8 }}
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
    gap: 4,
  },
  mainContentWide: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
    alignSelf: 'stretch',
    gap: 8,
  },
  boardSection: {
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
  commentBoxNarrow: {
    alignSelf: 'stretch',
    marginHorizontal: 8,
  },
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
    alignSelf: 'stretch',
    marginHorizontal: 8,
  },
  floatingGear: {
    alignSelf: 'center',
    marginTop: 4,
    padding: 6,
    backgroundColor: '#2a2a2a',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#444',
  },
  floatingGearText: {
    fontSize: 16,
  },
});
