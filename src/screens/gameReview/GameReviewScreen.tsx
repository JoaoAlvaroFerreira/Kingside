/**
 * GameReviewScreen - Active game review session with board and analysis
 */

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  useWindowDimensions,
  ActivityIndicator,
} from 'react-native';
import { useStore } from '@store';
import { InteractiveChessBoard } from '@components/chess/InteractiveChessBoard/InteractiveChessBoard';

interface GameReviewScreenProps {
  navigation: any;
  route: {
    params: {
      gameId: string;
    };
  };
}

export default function GameReviewScreen({ navigation, route: _route }: GameReviewScreenProps) {
  const { currentReviewSession, advanceReviewMove, completeGameReview } = useStore();
  const { width } = useWindowDimensions();
  const [completing, setCompleting] = useState(false);

  useEffect(() => {
    if (!currentReviewSession) {
      // Session not loaded, go back
      navigation.goBack();
    }
  }, [currentReviewSession, navigation]);

  if (!currentReviewSession) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#4a9eff" />
        <Text style={styles.loadingText}>Loading review...</Text>
      </View>
    );
  }

  const currentMove = currentReviewSession.moves[currentReviewSession.currentMoveIndex];

  // Handle empty moves array or invalid index
  if (!currentMove) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.errorText}>No moves found in this game</Text>
        <TouchableOpacity
          style={styles.backButtonError}
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.backButtonText}>← Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const isFirstMove = currentReviewSession.currentMoveIndex === 0;
  const isLastMove = currentReviewSession.currentMoveIndex === currentReviewSession.moves.length - 1;

  // Check if engine analysis is available
  const hasEngineAnalysis = currentReviewSession.moves.some(m => m.evalBefore !== null && m.evalBefore !== undefined);

  const handleComplete = async () => {
    setCompleting(true);
    try {
      await completeGameReview();
      navigation.goBack();
    } catch (error) {
      console.error('Failed to complete review:', error);
    } finally {
      setCompleting(false);
    }
  };

  const getKeyMoveColor = (reason?: string): string => {
    switch (reason) {
      case 'blunder':
        return '#c62828';
      case 'mistake':
        return '#f57c00';
      case 'inaccuracy':
        return '#fbc02d';
      case 'repertoire-deviation':
      case 'opponent-novelty':
        return '#8e24aa';
      case 'brilliant':
        return '#00897b';
      default:
        return '#fff';
    }
  };

  const formatEval = (score?: number, mate?: number): string => {
    if (mate !== undefined) {
      return `M${Math.abs(mate)}`;
    }
    if (score !== undefined) {
      const pawns = (score / 100).toFixed(2);
      return score > 0 ? `+${pawns}` : pawns;
    }
    return '--';
  };

  const isWideScreen = width > 900;

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Text style={styles.backButtonText}>← Back</Text>
        </TouchableOpacity>
        <View style={styles.headerInfo}>
          <Text style={styles.headerText}>
            Move {currentReviewSession.currentMoveIndex + 1} / {currentReviewSession.moves.length}
          </Text>
          {currentReviewSession.keyMoveIndices.length > 0 && (
            <Text style={styles.headerSubtext}>
              {currentReviewSession.keyMoveIndices.length} key moves
            </Text>
          )}
        </View>
        <TouchableOpacity
          onPress={handleComplete}
          style={styles.completeButton}
          disabled={completing}
        >
          {completing ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.completeButtonText}>Complete</Text>
          )}
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scrollContainer}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Engine disabled notice */}
        {!hasEngineAnalysis && (
          <View style={styles.engineNotice}>
            <Text style={styles.engineNoticeText}>
              ℹ️ Engine analysis disabled. Configure engine in Settings to detect blunders and mistakes.
              Only repertoire deviations are being tracked.
            </Text>
          </View>
        )}

        {/* Main Content */}
        <View style={[styles.mainContent, isWideScreen && styles.mainContentWide]}>
          {/* Board with evaluation */}
          <View style={styles.boardSection}>
            {currentMove.evalBefore && (
              <View style={styles.evalDisplay}>
                <Text style={styles.evalText}>
                  Eval: {formatEval(currentMove.evalBefore.score, currentMove.evalBefore.mate)}
                </Text>
                {currentMove.evalDelta !== undefined && (
                  <Text
                    style={[
                      styles.evalDeltaText,
                      currentMove.evalDelta < 0 ? styles.evalNegative : styles.evalPositive,
                    ]}
                  >
                    {currentMove.evalDelta < 0 ? '' : '+'}
                    {(currentMove.evalDelta / 100).toFixed(2)}
                  </Text>
                )}
              </View>
            )}
            <View style={styles.boardContainer}>
              <InteractiveChessBoard
                fen={currentMove.fen}
                onMove={() => {}}
                disabled={true}
                orientation={currentReviewSession.userColor}
              />
            </View>
          </View>

          {/* Move History */}
          {isWideScreen && (
            <View style={styles.moveHistoryPanel}>
              <Text style={styles.panelTitle}>Moves</Text>
              <ScrollView style={styles.moveList} showsVerticalScrollIndicator={true}>
                {currentReviewSession.moves.map((move, index) => {
                  const isCurrent = index === currentReviewSession.currentMoveIndex;
                  const moveColor = move.isKeyMove ? getKeyMoveColor(move.keyMoveReason) : '#fff';

                  return (
                    <TouchableOpacity
                      key={index}
                      style={[
                        styles.moveItem,
                        isCurrent && styles.moveItemCurrent,
                        move.isKeyMove && styles.moveItemKey,
                      ]}
                      onPress={() => {
                        // Jump to move
                        const session = currentReviewSession;
                        useStore.setState({
                          currentReviewSession: {
                            ...session,
                            currentMoveIndex: index,
                          },
                        });
                      }}
                    >
                      <Text style={[styles.moveNumber, { color: moveColor }]}>
                        {Math.floor(index / 2) + 1}{index % 2 === 0 ? '.' : '...'}
                      </Text>
                      <Text style={[styles.moveSan, { color: moveColor }]}>{move.san}</Text>
                      {move.isKeyMove && (
                        <View style={[styles.keyMoveBadge, { backgroundColor: moveColor }]}>
                          <Text style={styles.keyMoveBadgeText}>!</Text>
                        </View>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>
          )}
        </View>

        {/* Key Move Info */}
        {currentMove.isKeyMove && (
          <View style={styles.keyMovePanel}>
            <Text style={styles.keyMoveTitle}>
              Key Move: {currentMove.keyMoveReason?.toUpperCase()}
            </Text>
            {currentMove.evalDelta !== undefined && (
              <Text style={styles.keyMoveDetail}>
                Evaluation change: {(currentMove.evalDelta / 100).toFixed(2)} pawns
              </Text>
            )}
            {currentMove.repertoireMatch && !currentMove.repertoireMatch.matched && (
              <View style={styles.deviationInfo}>
                <Text style={styles.deviationTitle}>Repertoire Deviation</Text>
                <Text style={styles.deviationText}>
                  Type: {currentMove.repertoireMatch.deviationType}
                </Text>
                {currentMove.repertoireMatch.expectedMoves && currentMove.repertoireMatch.expectedMoves.length > 0 && (
                  <Text style={styles.deviationText}>
                    Expected: {currentMove.repertoireMatch.expectedMoves.join(', ')}
                  </Text>
                )}
              </View>
            )}
            {currentMove.evalBefore?.bestMoveSan && currentMove.evalBefore.bestMoveSan !== currentMove.san && (
              <Text style={styles.keyMoveDetail}>
                Best move: {currentMove.evalBefore.bestMoveSan}
              </Text>
            )}
          </View>
        )}

        {/* Navigation Controls */}
        <View style={styles.navigationPanel}>
          <View style={styles.navRow}>
            <TouchableOpacity
              style={[styles.navButton, isFirstMove && styles.navButtonDisabled]}
              onPress={() => advanceReviewMove('prev')}
              disabled={isFirstMove}
            >
              <Text style={styles.navButtonText}>← Prev</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.navButton}
              onPress={() => advanceReviewMove('prevKey')}
            >
              <Text style={styles.navButtonText}>← Key</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.navButton}
              onPress={() => advanceReviewMove('nextKey')}
            >
              <Text style={styles.navButtonText}>Key →</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.navButton, isLastMove && styles.navButtonDisabled]}
              onPress={() => advanceReviewMove('next')}
              disabled={isLastMove}
            >
              <Text style={styles.navButtonText}>Next →</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1e1e1e',
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: '#1e1e1e',
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    color: '#fff',
    fontSize: 16,
    marginTop: 12,
  },
  errorText: {
    color: '#ff5252',
    fontSize: 16,
    marginBottom: 16,
    textAlign: 'center',
  },
  backButtonError: {
    backgroundColor: '#4a9eff',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 6,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#2a2a2a',
    borderBottomWidth: 1,
    borderBottomColor: '#444',
  },
  backButton: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  backButtonText: {
    color: '#4a9eff',
    fontSize: 14,
    fontWeight: '600',
  },
  headerInfo: {
    flex: 1,
    alignItems: 'center',
  },
  headerText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  headerSubtext: {
    color: '#bbb',
    fontSize: 11,
    marginTop: 2,
  },
  completeButton: {
    backgroundColor: '#4caf50',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 4,
    minWidth: 80,
    alignItems: 'center',
  },
  completeButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  scrollContainer: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: 20,
  },
  engineNotice: {
    backgroundColor: '#2a3a4a',
    marginHorizontal: 12,
    marginTop: 8,
    padding: 10,
    borderRadius: 6,
    borderLeftWidth: 3,
    borderLeftColor: '#4a9eff',
  },
  engineNoticeText: {
    color: '#bbb',
    fontSize: 12,
    lineHeight: 18,
  },
  mainContent: {
    paddingTop: 8,
    maxWidth: '100%',
  },
  mainContentWide: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'flex-start',
    gap: 12,
    paddingHorizontal: 12,
    maxWidth: '100%',
  },
  boardSection: {
    alignItems: 'center',
  },
  evalDisplay: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 8,
  },
  evalText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  evalDeltaText: {
    fontSize: 14,
    fontWeight: '700',
  },
  evalPositive: {
    color: '#4caf50',
  },
  evalNegative: {
    color: '#c62828',
  },
  boardContainer: {
    alignItems: 'center',
  },
  moveHistoryPanel: {
    backgroundColor: '#2a2a2a',
    borderRadius: 6,
    padding: 8,
    minWidth: 200,
    maxWidth: 280,
    maxHeight: 500,
  },
  panelTitle: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 8,
  },
  moveList: {
    maxHeight: 450,
  },
  moveItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: 6,
    borderRadius: 3,
    marginBottom: 2,
    gap: 6,
  },
  moveItemCurrent: {
    backgroundColor: '#2a3a4a',
  },
  moveItemKey: {
    borderLeftWidth: 3,
    borderLeftColor: '#fbc02d',
  },
  moveNumber: {
    fontSize: 11,
    fontWeight: '600',
    width: 30,
  },
  moveSan: {
    fontSize: 11,
    fontWeight: '500',
    flex: 1,
  },
  keyMoveBadge: {
    width: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  keyMoveBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
  },
  keyMovePanel: {
    marginHorizontal: 12,
    marginTop: 8,
    padding: 12,
    backgroundColor: '#2a2a2a',
    borderRadius: 6,
    borderLeftWidth: 4,
    borderLeftColor: '#fbc02d',
  },
  keyMoveTitle: {
    color: '#fbc02d',
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 8,
  },
  keyMoveDetail: {
    color: '#fff',
    fontSize: 13,
    marginBottom: 4,
  },
  deviationInfo: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#444',
  },
  deviationTitle: {
    color: '#8e24aa',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 4,
  },
  deviationText: {
    color: '#bbb',
    fontSize: 12,
    marginBottom: 2,
  },
  navigationPanel: {
    marginHorizontal: 12,
    marginTop: 12,
  },
  navRow: {
    flexDirection: 'row',
    gap: 8,
  },
  navButton: {
    flex: 1,
    backgroundColor: '#2a2a2a',
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 6,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#444',
  },
  navButtonDisabled: {
    opacity: 0.3,
  },
  navButtonText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
});
