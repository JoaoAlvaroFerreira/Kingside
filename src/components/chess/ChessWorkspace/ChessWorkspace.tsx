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
  const { width } = useWindowDimensions();
  const { screenSettings } = useStore();
  const settings = screenSettings[screenKey];

  const [settingsVisible, setSettingsVisible] = useState(false);

  // Use override orientation if provided, otherwise use settings
  const orientation = orientationOverride || settings.orientation;
  const evalBarVisible = settings.evalBarVisible && settings.engineEnabled;
  const coordinatesVisible = settings.coordinatesVisible;
  const moveHistoryVisible = showMoveHistory && settings.moveHistoryVisible;

  const isWideScreen = width > 700;

  // Compute flat moves for MoveHistory
  const flatMoves = useMemo(
    () => (moveTree ? moveTree.getFlatMoves() : []),
    [moveTree, currentNodeId]
  );

  // Navigation handlers
  const canGoBack = moveTree ? !moveTree.isAtStart() : false;
  const canGoForward = moveTree ? !moveTree.isAtEnd() : false;

  const handleGoBack = () => moveTree?.goBack();
  const handleGoForward = () => moveTree?.goForward();
  const handleGoToStart = () => moveTree?.goToStart();
  const handleGoToEnd = () => moveTree?.goToEnd();

  // Current move comment
  const currentNode = moveTree?.getCurrentNode();
  const currentComment = currentNode?.comment;

  return (
    <View style={styles.container}>
      {/* Settings Gear */}
      {showSettingsGear && (
        <View style={styles.settingsGearContainer}>
          <TouchableOpacity
            style={styles.settingsGear}
            onPress={() => setSettingsVisible(true)}
          >
            <Text style={styles.settingsGearText}>⚙️</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Main Content */}
      <View style={[styles.mainContent, isWideScreen && styles.mainContentWide]}>
        {/* Board Section with Optional EvalBar */}
        <View style={styles.boardSection}>
          <View style={styles.boardRow}>
            {evalBarVisible && (
              <EvalBar
                currentEval={currentEval}
                orientation={orientation}
                moveHistory={moveEvals}
                currentMoveIndex={flatMoves.findIndex(m => m.id === currentNodeId)}
                keyMoves={keyMoves}
                height={Math.min(width - 80, 500)}
                visible={evalBarVisible}
              />
            )}
            <InteractiveChessBoard
              fen={fen}
              onMove={onMove}
              orientation={orientation}
              showCoordinates={coordinatesVisible}
              disabled={disabled}
            />
          </View>

          {/* Comment Display */}
          {currentComment && (
            <View style={styles.commentBox}>
              <Text style={styles.commentText}>{currentComment}</Text>
            </View>
          )}
        </View>

        {/* Move History */}
        {moveHistoryVisible && moveTree && onNavigate && (
          <View style={[styles.moveHistorySection, isWideScreen && styles.moveHistorySectionWide]}>
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
    justifyContent: 'center',
    position: 'relative',
  },
  settingsGearContainer: {
    position: 'absolute',
    top: 16,
    right: 16,
    zIndex: 100,
  },
  settingsGear: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#3a3a3a',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#555',
  },
  settingsGearText: {
    fontSize: 20,
  },
  mainContent: {
    flexDirection: 'column',
    alignItems: 'center',
    gap: 16,
    maxWidth: '100%',
  },
  mainContentWide: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  boardSection: {
    alignItems: 'center',
  },
  boardRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  commentBox: {
    marginTop: 12,
    padding: 12,
    backgroundColor: '#3a3a3a',
    borderRadius: 6,
    borderLeftWidth: 3,
    borderLeftColor: '#87CEEB',
    maxWidth: 500,
  },
  commentText: {
    color: '#e0e0e0',
    fontSize: 13,
    lineHeight: 20,
  },
  moveHistorySection: {
    width: '100%',
    maxWidth: 500,
  },
  moveHistorySectionWide: {
    width: 'auto',
    marginLeft: 20,
  },
});
