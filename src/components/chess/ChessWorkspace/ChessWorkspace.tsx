/**
 * ChessWorkspace - Unified chess board layout with settings
 * Composes: EvalBar, InteractiveChessBoard, MoveHistory, Settings gear
 */

import React, { useState, useMemo } from 'react';
import { View, StyleSheet, TouchableOpacity, Text, useWindowDimensions } from 'react-native';
import { InteractiveChessBoard } from '@components/chess/InteractiveChessBoard/InteractiveChessBoard';
import { MoveHistory } from '@components/chess/MoveHistory/MoveHistory';
import { EvalBar, KeyMoveMarker } from '@components/chess/EvalBar/EvalBar';
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
  const maxBoardSize = Math.min(width, height) - 40;
  const sizeMap = {
    tiny: 280,
    small: 320,
    medium: 380,
    large: 440,
    xlarge: 500,
  };
  const maxSize = sizeMap[boardSizeSetting];
  const actualBoardSize = Math.min(maxBoardSize, maxSize);

  // Debug logging for board size
  console.log('[ChessWorkspace] Board size calculation:', {
    boardSizeSetting,
    maxSize,
    maxBoardSize,
    actualBoardSize,
    width,
    height,
  });

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
            evalBarVisible && { width: actualBoardSize + 48 } // Board + EvalBar (40px) + margin (8px)
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
            />
          </View>

          {/* Comment Display */}
          {currentComment && (
            <View style={[
              styles.commentBox,
              { maxWidth: evalBarVisible ? actualBoardSize + 48 : actualBoardSize }
            ]}>
              <Text style={styles.commentText}>{currentComment}</Text>
            </View>
          )}
        </View>

        {/* Move History */}
        {moveHistoryVisible && moveTree && onNavigate && (
          <View style={[
            styles.moveHistorySection,
            isWideScreen && styles.moveHistorySectionWide,
            !isWideScreen && { maxWidth: evalBarVisible ? actualBoardSize + 48 : actualBoardSize }
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
    gap: 8,
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
    marginTop: 8,
    padding: 8,
    backgroundColor: '#3a3a3a',
    borderRadius: 6,
    borderLeftWidth: 3,
    borderLeftColor: '#87CEEB',
  },
  commentText: {
    color: '#e0e0e0',
    fontSize: 12,
    lineHeight: 18,
  },
  moveHistorySection: {
    width: '100%',
    maxHeight: 350,
    paddingHorizontal: 8,
  },
  moveHistorySectionWide: {
    width: 'auto',
    marginLeft: 12,
    maxHeight: 500,
    paddingHorizontal: 0,
  },
});
