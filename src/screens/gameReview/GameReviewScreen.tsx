/**
 * GameReviewScreen - Active game review session with board, tabs, and analysis
 */

import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  FlatList,
  useWindowDimensions,
  ActivityIndicator,
} from 'react-native';
import { useStore } from '@store';
import { InteractiveChessBoard } from '@components/chess/InteractiveChessBoard/InteractiveChessBoard';
import { EvalGraph } from '@components/chess/EvalGraph';
import { DatabaseService } from '@services/database/DatabaseService';
import { UserGame, MasterGame, MoveAnalysis } from '@types';

type ReviewTab = 'keyMoves' | 'graph' | 'yourGames' | 'masterGames';

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
  const [activeTab, setActiveTab] = useState<ReviewTab>('keyMoves');

  // FEN search state
  const [fenUserGames, setFenUserGames] = useState<UserGame[]>([]);
  const [fenMasterGames, setFenMasterGames] = useState<MasterGame[]>([]);
  const [loadingUserGames, setLoadingUserGames] = useState(false);
  const [loadingMasterGames, setLoadingMasterGames] = useState(false);
  const [lastSearchedFenUser, setLastSearchedFenUser] = useState<string | null>(null);
  const [lastSearchedFenMaster, setLastSearchedFenMaster] = useState<string | null>(null);

  useEffect(() => {
    if (!currentReviewSession) {
      navigation.goBack();
    }
  }, [currentReviewSession, navigation]);

  const currentMove = currentReviewSession?.moves[currentReviewSession.currentMoveIndex];
  const currentFen = currentMove?.fen;

  // Load user games when tab becomes active or FEN changes
  const loadUserGames = useCallback(async (fen: string) => {
    if (lastSearchedFenUser === fen) return;
    setLoadingUserGames(true);
    try {
      const games = await DatabaseService.searchUserGamesByFEN(fen);
      setFenUserGames(games);
      setLastSearchedFenUser(fen);
    } catch {
      setFenUserGames([]);
    } finally {
      setLoadingUserGames(false);
    }
  }, [lastSearchedFenUser]);

  const loadMasterGames = useCallback(async (fen: string) => {
    if (lastSearchedFenMaster === fen) return;
    setLoadingMasterGames(true);
    try {
      const games = await DatabaseService.searchMasterGamesByFEN(fen);
      setFenMasterGames(games);
      setLastSearchedFenMaster(fen);
    } catch {
      setFenMasterGames([]);
    } finally {
      setLoadingMasterGames(false);
    }
  }, [lastSearchedFenMaster]);

  // Trigger search when tab becomes active or position changes
  useEffect(() => {
    if (!currentFen) return;
    if (activeTab === 'yourGames') {
      loadUserGames(currentFen);
    } else if (activeTab === 'masterGames') {
      loadMasterGames(currentFen);
    }
  }, [activeTab, currentFen, loadUserGames, loadMasterGames]);

  // Reset last searched FENs when move changes so next tab activation re-fetches
  useEffect(() => {
    setLastSearchedFenUser(null);
    setLastSearchedFenMaster(null);
  }, [currentReviewSession?.currentMoveIndex]);

  if (!currentReviewSession || !currentMove) {
    return (
      <View style={styles.loadingContainer}>
        {currentReviewSession ? (
          <>
            <Text style={styles.errorText}>No moves found in this game</Text>
            <TouchableOpacity
              style={styles.backButtonError}
              onPress={() => navigation.goBack()}
            >
              <Text style={styles.backButtonText}>← Go Back</Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <ActivityIndicator size="large" color="#4a9eff" />
            <Text style={styles.loadingText}>Loading review...</Text>
          </>
        )}
      </View>
    );
  }

  const isFirstMove = currentReviewSession.currentMoveIndex === 0;
  const isLastMove = currentReviewSession.currentMoveIndex === currentReviewSession.moves.length - 1;

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
      case 'transposition':
        return '#00897b';
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

  const handleMoveSelect = (moveIndex: number) => {
    useStore.setState({
      currentReviewSession: {
        ...currentReviewSession,
        currentMoveIndex: moveIndex,
      },
    });
  };

  const keyMoves = currentReviewSession.moves.filter(m => m.isKeyMove);

  const isWideScreen = width > 900;
  const boardWidth = isWideScreen ? Math.min(width * 0.5, 500) : width;
  const graphWidth = isWideScreen ? boardWidth : width - 16;

  const renderKeyMoveItem = ({ item }: { item: MoveAnalysis }) => {
    const color = getKeyMoveColor(item.keyMoveReason);
    const moveNum = Math.floor(item.moveIndex / 2) + 1;
    const isWhite = item.moveIndex % 2 === 0;
    const isCurrent = item.moveIndex === currentReviewSession.currentMoveIndex;
    return (
      <TouchableOpacity
        style={[styles.keyMoveListItem, isCurrent && styles.keyMoveListItemActive]}
        onPress={() => handleMoveSelect(item.moveIndex)}
      >
        <Text style={[styles.keyMoveListNum, { color }]}>
          {moveNum}{isWhite ? '.' : '...'}
        </Text>
        <Text style={[styles.keyMoveListSan, { color }]}>{item.san}</Text>
        <View style={[styles.keyMoveReasonBadge, { backgroundColor: color }]}>
          <Text style={styles.keyMoveReasonText}>
            {item.keyMoveReason?.replace('-', ' ')}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  const renderGameItem = ({ item }: { item: UserGame | MasterGame }) => (
    <View style={styles.gameListItem}>
      <Text style={styles.gameListPlayers}>{item.white} vs {item.black}</Text>
      <View style={styles.gameListDetails}>
        <Text style={styles.gameListResult}>{item.result}</Text>
        <Text style={styles.gameListDate}>{item.date}</Text>
      </View>
    </View>
  );

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

          {/* Move History (wide screen) */}
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
                      onPress={() => handleMoveSelect(index)}
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

        {/* Tab Bar */}
        <View style={styles.tabBar}>
          {(['keyMoves', 'graph', 'yourGames', 'masterGames'] as ReviewTab[]).map(tab => (
            <TouchableOpacity
              key={tab}
              style={[styles.tabButton, activeTab === tab && styles.tabButtonActive]}
              onPress={() => setActiveTab(tab)}
            >
              <Text style={[styles.tabButtonText, activeTab === tab && styles.tabButtonTextActive]}>
                {tab === 'keyMoves' ? 'Key Moves' :
                 tab === 'graph' ? 'Graph' :
                 tab === 'yourGames' ? 'Your Games' : 'Master Games'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Tab Content */}
        <View style={styles.tabContent}>
          {/* Tab 1: Key Moves */}
          {activeTab === 'keyMoves' && (
            <View>
              {/* Current key move info */}
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

              {/* All key moves list */}
              {keyMoves.length > 0 ? (
                <FlatList
                  data={keyMoves}
                  keyExtractor={item => item.moveIndex.toString()}
                  renderItem={renderKeyMoveItem}
                  scrollEnabled={false}
                />
              ) : (
                <Text style={styles.emptyTabText}>No key moves in this game</Text>
              )}
            </View>
          )}

          {/* Tab 2: Eval Graph */}
          {activeTab === 'graph' && (
            <View style={styles.graphContainer}>
              <EvalGraph
                evaluations={currentReviewSession.moves.map(m => m.evalAfter ?? null)}
                currentMoveIndex={currentReviewSession.currentMoveIndex}
                onMoveSelect={handleMoveSelect}
                width={graphWidth}
                height={100}
              />
            </View>
          )}

          {/* Tab 3: Your Games */}
          {activeTab === 'yourGames' && (
            <View>
              {loadingUserGames ? (
                <View style={styles.tabLoading}>
                  <ActivityIndicator size="small" color="#4a9eff" />
                  <Text style={styles.tabLoadingText}>Searching games...</Text>
                </View>
              ) : fenUserGames.length > 0 ? (
                <FlatList
                  data={fenUserGames}
                  keyExtractor={item => item.id}
                  renderItem={renderGameItem}
                  scrollEnabled={false}
                />
              ) : (
                <Text style={styles.emptyTabText}>No games found at this position</Text>
              )}
            </View>
          )}

          {/* Tab 4: Master Games */}
          {activeTab === 'masterGames' && (
            <View>
              {loadingMasterGames ? (
                <View style={styles.tabLoading}>
                  <ActivityIndicator size="small" color="#4a9eff" />
                  <Text style={styles.tabLoadingText}>Searching games...</Text>
                </View>
              ) : fenMasterGames.length > 0 ? (
                <FlatList
                  data={fenMasterGames}
                  keyExtractor={item => item.id}
                  renderItem={renderGameItem}
                  scrollEnabled={false}
                />
              ) : (
                <Text style={styles.emptyTabText}>No games found at this position</Text>
              )}
            </View>
          )}
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
    fontSize: 13,
    marginTop: 8,
  },
  errorText: {
    color: '#ff5252',
    fontSize: 13,
    marginBottom: 12,
    textAlign: 'center',
  },
  backButtonError: {
    backgroundColor: '#4a9eff',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 4,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 6,
    backgroundColor: '#2a2a2a',
    borderBottomWidth: 1,
    borderBottomColor: '#444',
  },
  backButton: {
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  backButtonText: {
    color: '#4a9eff',
    fontSize: 11,
    fontWeight: '600',
  },
  headerInfo: {
    flex: 1,
    alignItems: 'center',
  },
  headerText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '600',
  },
  headerSubtext: {
    color: '#bbb',
    fontSize: 9,
    marginTop: 1,
  },
  completeButton: {
    backgroundColor: '#4caf50',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 3,
    minWidth: 64,
    alignItems: 'center',
  },
  completeButtonText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '600',
  },
  scrollContainer: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: 12,
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
    gap: 8,
    paddingVertical: 4,
  },
  evalText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '600',
  },
  evalDeltaText: {
    fontSize: 11,
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
    borderRadius: 4,
    padding: 4,
    minWidth: 160,
    maxWidth: 220,
    maxHeight: 380,
  },
  panelTitle: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 4,
  },
  moveList: {
    maxHeight: 350,
  },
  moveItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 2,
    paddingHorizontal: 4,
    borderRadius: 2,
    marginBottom: 1,
    gap: 4,
  },
  moveItemCurrent: {
    backgroundColor: '#2a3a4a',
  },
  moveItemKey: {
    borderLeftWidth: 3,
    borderLeftColor: '#fbc02d',
  },
  moveNumber: {
    fontSize: 9,
    fontWeight: '600',
    width: 24,
  },
  moveSan: {
    fontSize: 9,
    fontWeight: '500',
    flex: 1,
  },
  keyMoveBadge: {
    width: 12,
    height: 12,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  keyMoveBadgeText: {
    color: '#fff',
    fontSize: 8,
    fontWeight: '700',
  },
  navigationPanel: {
    marginHorizontal: 8,
    marginTop: 8,
  },
  navRow: {
    flexDirection: 'row',
    gap: 4,
  },
  navButton: {
    flex: 1,
    backgroundColor: '#2a2a2a',
    paddingVertical: 6,
    paddingHorizontal: 6,
    borderRadius: 4,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#444',
  },
  navButtonDisabled: {
    opacity: 0.3,
  },
  navButtonText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '600',
  },
  // Tab bar
  tabBar: {
    flexDirection: 'row',
    marginHorizontal: 8,
    marginTop: 8,
    backgroundColor: '#2a2a2a',
    borderRadius: 4,
    overflow: 'hidden',
  },
  tabButton: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabButtonActive: {
    borderBottomColor: '#4a9eff',
    backgroundColor: '#333',
  },
  tabButtonText: {
    color: '#999',
    fontSize: 9,
    fontWeight: '600',
  },
  tabButtonTextActive: {
    color: '#4a9eff',
  },
  tabContent: {
    marginHorizontal: 8,
    marginTop: 4,
    minHeight: 100,
  },
  // Key moves tab
  keyMovePanel: {
    padding: 8,
    backgroundColor: '#2a2a2a',
    borderRadius: 4,
    borderLeftWidth: 3,
    borderLeftColor: '#fbc02d',
    marginBottom: 8,
  },
  keyMoveTitle: {
    color: '#fbc02d',
    fontSize: 11,
    fontWeight: '700',
    marginBottom: 4,
  },
  keyMoveDetail: {
    color: '#fff',
    fontSize: 10,
    marginBottom: 2,
  },
  deviationInfo: {
    marginTop: 4,
    paddingTop: 4,
    borderTopWidth: 1,
    borderTopColor: '#444',
  },
  deviationTitle: {
    color: '#8e24aa',
    fontSize: 10,
    fontWeight: '600',
    marginBottom: 2,
  },
  deviationText: {
    color: '#bbb',
    fontSize: 10,
    marginBottom: 1,
  },
  keyMoveListItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 6,
    backgroundColor: '#2a2a2a',
    borderRadius: 3,
    marginBottom: 2,
    gap: 6,
  },
  keyMoveListItemActive: {
    backgroundColor: '#2a3a4a',
  },
  keyMoveListNum: {
    fontSize: 10,
    fontWeight: '600',
    width: 28,
  },
  keyMoveListSan: {
    fontSize: 10,
    fontWeight: '600',
    width: 36,
  },
  keyMoveReasonBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 3,
  },
  keyMoveReasonText: {
    color: '#fff',
    fontSize: 8,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  // Graph tab
  graphContainer: {
    alignItems: 'center',
    paddingVertical: 4,
  },
  // Game list tabs
  tabLoading: {
    alignItems: 'center',
    padding: 12,
  },
  tabLoadingText: {
    color: '#bbb',
    fontSize: 11,
    marginTop: 8,
  },
  emptyTabText: {
    color: '#999',
    fontSize: 11,
    textAlign: 'center',
    paddingVertical: 12,
  },
  gameListItem: {
    padding: 6,
    backgroundColor: '#2a2a2a',
    borderRadius: 3,
    marginBottom: 2,
  },
  gameListPlayers: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 2,
  },
  gameListDetails: {
    flexDirection: 'row',
    gap: 8,
  },
  gameListResult: {
    color: '#bbb',
    fontSize: 10,
    fontWeight: '600',
  },
  gameListDate: {
    color: '#999',
    fontSize: 10,
  },
});
