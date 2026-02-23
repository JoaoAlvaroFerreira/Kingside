/**
 * ChessWorkspace - Unified chess board layout with settings
 * Composes: EvalBar, InteractiveChessBoard, MoveHistory, Settings gear
 */

import React, { useState, useMemo } from 'react';
import { View, StyleSheet, Text, useWindowDimensions } from 'react-native';
import { InteractiveChessBoard } from '@components/chess/InteractiveChessBoard/InteractiveChessBoard';
import { MoveHistory } from '@components/chess/MoveHistory/MoveHistory';
import { EvalBar, KeyMoveMarker } from '@components/chess/EvalBar/EvalBar';
import { EngineLines } from '@components/chess/EngineLines/EngineLines';
import { MoveTree } from '@utils/MoveTree';
import { EngineEvaluation, ScreenKey } from '@types';
import { SettingsModal } from './SettingsModal';
import { useStore } from '@store';

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

  // Engine analysis (optional)
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
}) => {
  const { width, height } = useWindowDimensions();
  const { screenSettings } = useStore();
  const settings = screenSettings[screenKey];

  const [settingsVisible, setSettingsVisible] = useState(false);

  // Use override orientation if provided, otherwise use settings
  const orientation = orientationOverride || settings.orientation;
  const evalBarVisible = Boolean(settings.engineEnabled); // Eval bar shows when engine enabled
  const coordinatesVisible = settings.coordinatesVisible;
  const moveHistoryVisible = showMoveHistory && settings.moveHistoryVisible;
  const boardSizeSetting = settings.boardSize || 'small';

  // Calculate actual board size in pixels
  const maxBoardSize = Math.min(width, height - 100) - 40;
  const sizeMap = {
    tiny: 200,
    small: 240,
    medium: 300,
    large: 340,
    xlarge: 380,
  };
  const maxSize = sizeMap[boardSizeSetting];
  const actualBoardSize = Math.min(maxBoardSize, maxSize);

  const isWideScreen = width > 700;

  // Compute flat moves for MoveHistory
  const flatMoves = useMemo(
    () => (moveTree ? moveTree.getFlatMoves() : []),
    [moveTree, currentNodeId]
  );

  // Navigation handlers
  const canGoBack = moveTree ? !moveTree.isAtStart() : false;
  const canGoForward = moveTree ? !moveTree.isAtEnd() : false;

  const handleGoBack = () => {
    if (onGoBack) {
      onGoBack();
    } else {
      moveTree?.goBack();
    }
  };

  const handleGoForward = () => {
    if (onGoForward) {
      onGoForward();
    } else {
      moveTree?.goForward();
    }
  };

  const handleGoToStart = () => {
    if (onGoToStart) {
      onGoToStart();
    } else {
      moveTree?.goToStart();
    }
  };

  const handleGoToEnd = () => {
    if (onGoToEnd) {
      onGoToEnd();
    } else {
      moveTree?.goToEnd();
    }
  };

  // Current move comment
  const currentNode = moveTree?.getCurrentNode();
  const currentComment = currentNode?.comment;

  return (
    <View style={styles.container}>
      {/* Main Content */}
      <View style={[styles.mainContent, isWideScreen && styles.mainContentWide]}>
        {/* Board Section with Optional EvalBar */}
        <View style={styles.boardSection}>
          <View style={[
            styles.boardRow,
            evalBarVisible && { width: actualBoardSize + 13 } // Board + EvalBar (14px) + margin (4px)
          ]}>
            {evalBarVisible && (
              <EvalBar
                currentEval={currentEval}
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
              bestMove={evalBarVisible ? currentEval?.bestMove : undefined}
            />
          </View>

          {/* Comment Display */}
          {currentComment && (
            <View style={[
              styles.commentBox,
              { maxWidth: evalBarVisible ? actualBoardSize + 13 : actualBoardSize }
            ]}>
              <Text style={styles.commentText}>{currentComment}</Text>
            </View>
          )}
        </View>

        {/* Engine lines (top 3 PVs) */}
        {evalBarVisible && currentEval && (
          <View style={[
            styles.engineLinesSection,
            { maxWidth: evalBarVisible ? actualBoardSize + 13 : actualBoardSize }
          ]}>
            <EngineLines evaluation={currentEval} />
          </View>
        )}

        {/* Move History */}
        {moveHistoryVisible && moveTree && onNavigate && (
          <View style={[
            styles.moveHistorySection,
            isWideScreen && styles.moveHistorySectionWide,
            !isWideScreen && { maxWidth: evalBarVisible ? actualBoardSize + 13 : actualBoardSize }
          ]}>
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

      {/* Settings Modal */}
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
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-start',
    position: 'relative',
    paddingTop: 4,
  },
  mainContent: {
    flexDirection: 'column',
    alignItems: 'center',
    gap: 4,
    maxWidth: '100%',
  },
  mainContentWide: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  boardSection: {
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  boardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  commentBox: {
    marginTop: 4,
    padding: 4,
    backgroundColor: '#3a3a3a',
    borderRadius: 6,
    borderLeftWidth: 3,
    borderLeftColor: '#87CEEB',
  },
  commentText: {
    color: '#e0e0e0',
    fontSize: 10,
    lineHeight: 14,
  },
  engineLinesSection: {
    width: '100%',
    paddingHorizontal: 4,
  },
  moveHistorySection: {
    width: '100%',
    maxHeight: 180,
    paddingHorizontal: 4,
  },
  moveHistorySectionWide: {
    width: 'auto',
    marginLeft: 8,
    maxHeight: 350,
    paddingHorizontal: 0,
  },
});
