/**
 * GameReviewDashboardScreen - Dashboard for game review with status tracking
 */

import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  Platform,
  Alert,
  Modal,
} from 'react-native';
import { useStore } from '@store';
import { DatabaseService } from '@services/database/DatabaseService';
import { UserGame } from '@types';
import { useFocusEffect } from '@react-navigation/native';

interface GameReviewDashboardScreenProps {
  navigation: any;
}

type FilterTab = 'all' | 'reviewed' | 'unreviewed';

export default function GameReviewDashboardScreen({ navigation }: GameReviewDashboardScreenProps) {
  const { userGamesCount, gameReviewStatuses, startGameReview, isAnalyzing, analysisProgress } = useStore();
  const [filterTab, setFilterTab] = useState<FilterTab>('all');
  const [startingReview, setStartingReview] = useState(false);
  const [colorPromptGameId, setColorPromptGameId] = useState<string | null>(null);
  const [games, setGames] = useState<UserGame[]>([]);
  const [isLoadingGames, setIsLoadingGames] = useState(false);
  const pendingGameId = useRef<string | null>(null);

  // Navigate to GameReview once analysis completes
  useEffect(() => {
    if (!isAnalyzing && pendingGameId.current) {
      const gameId = pendingGameId.current;
      pendingGameId.current = null;
      setStartingReview(false);
      navigation.navigate('GameReview', { gameId });
    }
  }, [isAnalyzing, navigation]);

  // Load games when tab changes or screen focuses
  useEffect(() => {
    loadGames();
  }, [filterTab]);

  useFocusEffect(
    useCallback(() => {
      loadGames();
    }, [filterTab])
  );

  const loadGames = async () => {
    setIsLoadingGames(true);
    try {
      const allGames = await DatabaseService.getAllUserGames();
      const reviewedIds = new Set(gameReviewStatuses.filter(s => s.reviewed).map(s => s.gameId));

      let filtered: UserGame[];
      switch (filterTab) {
        case 'reviewed':
          filtered = allGames.filter(g => reviewedIds.has(g.id));
          break;
        case 'unreviewed':
          filtered = allGames.filter(g => !reviewedIds.has(g.id));
          break;
        default:
          filtered = allGames;
      }

      setGames(filtered);
    } catch (error) {
      console.error('Failed to load games:', error);
    } finally {
      setIsLoadingGames(false);
    }
  };

  // Count stats
  const stats = useMemo(() => {
    const reviewedIds = new Set(gameReviewStatuses.filter(s => s.reviewed).map(s => s.gameId));
    return {
      total: userGamesCount,
      reviewed: games.filter(g => reviewedIds.has(g.id)).length,
      unreviewed: games.filter(g => !reviewedIds.has(g.id)).length,
    };
  }, [games, gameReviewStatuses, userGamesCount]);

  const handleColorSelected = async (gameId: string, color: 'white' | 'black') => {
    setColorPromptGameId(null);
    setStartingReview(true);
    pendingGameId.current = gameId;
    try {
      await startGameReview(gameId, color);
    } catch (error) {
      pendingGameId.current = null;
      console.error('Failed to start review:', error);
      const errorMsg = error instanceof Error ? error.message : 'Unknown error occurred';
      if (Platform.OS === 'web') {
        window.alert(`Failed to start review: ${errorMsg}`);
      } else {
        Alert.alert('Error', `Failed to start review: ${errorMsg}`);
      }
      setStartingReview(false);
    }
  };

  const handleStartReviewAll = async () => {
    const unreviewedGames = games.filter(g => {
      const status = gameReviewStatuses.find(s => s.gameId === g.id);
      return !status || !status.reviewed;
    });

    if (unreviewedGames.length === 0) {
      return;
    }

    setColorPromptGameId(unreviewedGames[0].id);
  };

  const handleReviewGame = async (gameId: string) => {
    setColorPromptGameId(gameId);
  };

  const getStatus = (gameId: string) => {
    return gameReviewStatuses.find(s => s.gameId === gameId);
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Game Review</Text>
        <TouchableOpacity
          style={[styles.startButton, stats.unreviewed === 0 && styles.startButtonDisabled]}
          onPress={handleStartReviewAll}
          disabled={stats.unreviewed === 0 || startingReview || isAnalyzing}
        >
          {startingReview ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.startButtonText}>Start Review ({stats.unreviewed})</Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Analysis Loading Overlay */}
      {isAnalyzing && (
        <View style={styles.analysisOverlay}>
          <ActivityIndicator size="large" color="#4a9eff" />
          {analysisProgress && (
            <>
              <Text style={styles.analysisPhase}>{analysisProgress.phase}</Text>
              {analysisProgress.total > 0 && (
                <>
                  <Text style={styles.analysisCount}>
                    {analysisProgress.current} / {analysisProgress.total}
                  </Text>
                  <Text style={styles.analysisPercent}>
                    {Math.round((analysisProgress.current / analysisProgress.total) * 100)}%
                  </Text>
                </>
              )}
            </>
          )}
        </View>
      )}

      {/* Stats */}
      {!isAnalyzing && (
        <View style={styles.statsContainer}>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{stats.total}</Text>
            <Text style={styles.statLabel}>Total</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={[styles.statValue, styles.reviewedColor]}>{stats.reviewed}</Text>
            <Text style={styles.statLabel}>Reviewed</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={[styles.statValue, styles.unreviewedColor]}>{stats.unreviewed}</Text>
            <Text style={styles.statLabel}>Unreviewed</Text>
          </View>
        </View>
      )}

      {/* Filter Tabs */}
      {!isAnalyzing && (
        <View style={styles.tabs}>
          <TouchableOpacity
            style={[styles.tab, filterTab === 'all' && styles.tabActive]}
            onPress={() => setFilterTab('all')}
          >
            <Text style={[styles.tabText, filterTab === 'all' && styles.tabTextActive]}>
              All ({stats.total})
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, filterTab === 'reviewed' && styles.tabActive]}
            onPress={() => setFilterTab('reviewed')}
          >
            <Text style={[styles.tabText, filterTab === 'reviewed' && styles.tabTextActive]}>
              Reviewed ({stats.reviewed})
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, filterTab === 'unreviewed' && styles.tabActive]}
            onPress={() => setFilterTab('unreviewed')}
          >
            <Text style={[styles.tabText, filterTab === 'unreviewed' && styles.tabTextActive]}>
              Unreviewed ({stats.unreviewed})
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Game List */}
      {!isAnalyzing && (
        <>
          {isLoadingGames ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#4a9eff" />
              <Text style={styles.loadingText}>Loading games...</Text>
            </View>
          ) : (
            <FlatList
              style={styles.list}
              contentContainerStyle={styles.listContent}
              data={games}
              keyExtractor={(item) => item.id}
              ListEmptyComponent={
                <View style={styles.emptyContainer}>
                  <Text style={styles.emptyText}>No games found</Text>
                </View>
              }
              renderItem={({ item: game }) => {
                const status = getStatus(game.id);
                return (
                  <TouchableOpacity
                    style={styles.gameCard}
                    onPress={() => handleReviewGame(game.id)}
                  >
                    <View style={styles.gameHeader}>
                      <View style={styles.gameInfo}>
                        <Text style={styles.gameOpponent}>
                          {game.white} vs {game.black}
                        </Text>
                        <Text style={styles.gameDate}>{game.date}</Text>
                      </View>
                      {status?.reviewed && (
                        <View style={styles.reviewedBadge}>
                          <Text style={styles.reviewedBadgeText}>✓</Text>
                        </View>
                      )}
                    </View>
                    <View style={styles.gameDetails}>
                      <Text style={styles.gameResult}>{game.result}</Text>
                      {game.event && <Text style={styles.gameEvent}>{game.event}</Text>}
                    </View>
                    {status?.reviewed && (
                      <View style={styles.gameStats}>
                        <Text style={styles.gameStatText}>
                          {status.keyMovesCount} key moves
                        </Text>
                        {status.followedRepertoire && (
                          <Text style={styles.repertoireMatch}>Followed repertoire</Text>
                        )}
                      </View>
                    )}
                  </TouchableOpacity>
                );
              }}
            />
          )}
        </>
      )}

      {/* Color Selection Modal */}
      <Modal
        visible={colorPromptGameId !== null}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setColorPromptGameId(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Select Your Color</Text>
            {colorPromptGameId && (() => {
              const game = games.find(g => g.id === colorPromptGameId);
              return game ? (
                <View style={styles.modalGameInfo}>
                  <Text style={styles.modalPlayerText}>White: {game.white}</Text>
                  <Text style={styles.modalPlayerText}>Black: {game.black}</Text>
                </View>
              ) : null;
            })()}
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.whiteButton]}
                onPress={() => colorPromptGameId && handleColorSelected(colorPromptGameId, 'white')}
              >
                <Text style={[styles.modalButtonText, styles.whiteButtonText]}>Review as White</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.blackButton]}
                onPress={() => colorPromptGameId && handleColorSelected(colorPromptGameId, 'black')}
              >
                <Text style={[styles.modalButtonText, styles.blackButtonText]}>Review as Black</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity
              style={styles.modalCancelButton}
              onPress={() => setColorPromptGameId(null)}
            >
              <Text style={styles.modalCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1e1e1e',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: '#2a2a2a',
    borderBottomWidth: 1,
    borderBottomColor: '#444',
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  startButton: {
    backgroundColor: '#4a9eff',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 4,
    minWidth: 110,
    alignItems: 'center',
  },
  startButtonDisabled: {
    backgroundColor: '#444',
  },
  startButtonText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '600',
  },
  analysisOverlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
  },
  analysisPhase: {
    color: '#4a9eff',
    fontSize: 14,
    fontWeight: '600',
    marginTop: 16,
    textAlign: 'center',
  },
  analysisCount: {
    color: '#fff',
    fontSize: 14,
    marginTop: 8,
  },
  analysisPercent: {
    color: '#bbb',
    fontSize: 12,
    marginTop: 4,
  },
  statsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 10,
    backgroundColor: '#2a2a2a',
    borderBottomWidth: 1,
    borderBottomColor: '#444',
  },
  statItem: {
    alignItems: 'center',
  },
  statValue: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
  },
  reviewedColor: {
    color: '#4caf50',
  },
  unreviewedColor: {
    color: '#ff9800',
  },
  statLabel: {
    fontSize: 10,
    color: '#bbb',
    marginTop: 2,
  },
  tabs: {
    flexDirection: 'row',
    backgroundColor: '#2a2a2a',
    borderBottomWidth: 1,
    borderBottomColor: '#444',
  },
  tab: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    borderBottomColor: '#4a9eff',
  },
  tabText: {
    fontSize: 11,
    color: '#bbb',
  },
  tabTextActive: {
    color: '#4a9eff',
    fontWeight: '600',
  },
  list: {
    flex: 1,
  },
  listContent: {
    padding: 8,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingTop: 60,
  },
  emptyText: {
    fontSize: 13,
    color: '#999',
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
  },
  loadingText: {
    color: '#bbb',
    fontSize: 11,
    marginTop: 8,
  },
  gameCard: {
    backgroundColor: '#2a2a2a',
    borderRadius: 6,
    padding: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#444',
  },
  gameHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 4,
  },
  gameInfo: {
    flex: 1,
  },
  gameOpponent: {
    fontSize: 13,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 2,
  },
  gameDate: {
    fontSize: 10,
    color: '#bbb',
  },
  reviewedBadge: {
    backgroundColor: '#4caf50',
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reviewedBadgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },
  gameDetails: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  gameResult: {
    fontSize: 11,
    fontWeight: '600',
    color: '#fff',
  },
  gameEvent: {
    fontSize: 10,
    color: '#999',
  },
  gameStats: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingTop: 4,
    borderTopWidth: 1,
    borderTopColor: '#444',
  },
  gameStatText: {
    fontSize: 10,
    color: '#bbb',
  },
  repertoireMatch: {
    fontSize: 10,
    color: '#4caf50',
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 12,
  },
  modalContent: {
    backgroundColor: '#2a2a2a',
    borderRadius: 10,
    padding: 10,
    width: '100%',
    maxWidth: 320,
    borderWidth: 1,
    borderColor: '#444',
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 12,
    textAlign: 'center',
  },
  modalGameInfo: {
    backgroundColor: '#1e1e1e',
    borderRadius: 6,
    padding: 8,
    marginBottom: 12,
  },
  modalPlayerText: {
    fontSize: 12,
    color: '#bbb',
    marginBottom: 2,
  },
  modalButtons: {
    gap: 8,
    marginBottom: 10,
  },
  modalButton: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 6,
    alignItems: 'center',
  },
  whiteButton: {
    backgroundColor: '#f0f0f0',
  },
  blackButton: {
    backgroundColor: '#2c2c2c',
    borderWidth: 1,
    borderColor: '#555',
  },
  modalButtonText: {
    fontSize: 13,
    fontWeight: '600',
  },
  whiteButtonText: {
    color: '#1e1e1e',
  },
  blackButtonText: {
    color: '#fff',
  },
  modalCancelButton: {
    paddingVertical: 6,
    alignItems: 'center',
  },
  modalCancelText: {
    fontSize: 12,
    color: '#888',
  },
});
