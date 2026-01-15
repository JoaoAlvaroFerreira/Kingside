/**
 * GameReviewDashboardScreen - Dashboard for game review with status tracking
 */

import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Platform,
  Alert,
  Modal,
} from 'react-native';
import { useStore } from '@store';

interface GameReviewDashboardScreenProps {
  navigation: any;
}

type FilterTab = 'all' | 'reviewed' | 'unreviewed';

export default function GameReviewDashboardScreen({ navigation }: GameReviewDashboardScreenProps) {
  const { userGames, gameReviewStatuses, startGameReview } = useStore();
  const [filterTab, setFilterTab] = useState<FilterTab>('all');
  const [startingReview, setStartingReview] = useState(false);
  const [colorPromptGameId, setColorPromptGameId] = useState<string | null>(null);

  // Filter games based on tab
  const filteredGames = useMemo(() => {
    const reviewedIds = new Set(gameReviewStatuses.filter(s => s.reviewed).map(s => s.gameId));

    switch (filterTab) {
      case 'reviewed':
        return userGames.filter(g => reviewedIds.has(g.id));
      case 'unreviewed':
        return userGames.filter(g => !reviewedIds.has(g.id));
      default:
        return userGames;
    }
  }, [userGames, gameReviewStatuses, filterTab]);

  // Count stats
  const stats = useMemo(() => {
    const reviewedIds = new Set(gameReviewStatuses.filter(s => s.reviewed).map(s => s.gameId));
    return {
      total: userGames.length,
      reviewed: userGames.filter(g => reviewedIds.has(g.id)).length,
      unreviewed: userGames.filter(g => !reviewedIds.has(g.id)).length,
    };
  }, [userGames, gameReviewStatuses]);

  const handleColorSelected = async (gameId: string, color: 'white' | 'black') => {
    setColorPromptGameId(null);
    setStartingReview(true);
    try {
      await startGameReview(gameId, color);
      navigation.navigate('GameReview', { gameId });
    } catch (error) {
      console.error('Failed to start review:', error);
      const errorMsg = error instanceof Error ? error.message : 'Unknown error occurred';
      if (Platform.OS === 'web') {
        window.alert(`Failed to start review: ${errorMsg}`);
      } else {
        Alert.alert('Error', `Failed to start review: ${errorMsg}`);
      }
    } finally {
      setStartingReview(false);
    }
  };

  const handleStartReviewAll = async () => {
    const unreviewedGames = userGames.filter(g => {
      const status = gameReviewStatuses.find(s => s.gameId === g.id);
      return !status || !status.reviewed;
    });

    if (unreviewedGames.length === 0) {
      return;
    }

    // Always show color selection modal
    setColorPromptGameId(unreviewedGames[0].id);
  };

  const handleReviewGame = async (gameId: string) => {
    // Always show color selection modal
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
          disabled={stats.unreviewed === 0 || startingReview}
        >
          {startingReview ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.startButtonText}>Start Review ({stats.unreviewed})</Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Stats */}
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

      {/* Filter Tabs */}
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

      {/* Game List */}
      <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
        {filteredGames.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No games found</Text>
          </View>
        ) : (
          filteredGames.map(game => {
            const status = getStatus(game.id);
            return (
              <TouchableOpacity
                key={game.id}
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
                      <Text style={styles.repertoireMatch}>✓ Followed repertoire</Text>
                    )}
                  </View>
                )}
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>

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
              const game = userGames.find(g => g.id === colorPromptGameId);
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
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#2a2a2a',
    borderBottomWidth: 1,
    borderBottomColor: '#444',
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    color: '#fff',
  },
  startButton: {
    backgroundColor: '#4a9eff',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
    minWidth: 140,
    alignItems: 'center',
  },
  startButtonDisabled: {
    backgroundColor: '#444',
  },
  startButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  statsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 16,
    backgroundColor: '#2a2a2a',
    borderBottomWidth: 1,
    borderBottomColor: '#444',
  },
  statItem: {
    alignItems: 'center',
  },
  statValue: {
    fontSize: 24,
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
    fontSize: 12,
    color: '#bbb',
    marginTop: 4,
  },
  tabs: {
    flexDirection: 'row',
    backgroundColor: '#2a2a2a',
    borderBottomWidth: 1,
    borderBottomColor: '#444',
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    borderBottomColor: '#4a9eff',
  },
  tabText: {
    fontSize: 14,
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
    padding: 12,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingTop: 60,
  },
  emptyText: {
    fontSize: 16,
    color: '#999',
  },
  gameCard: {
    backgroundColor: '#2a2a2a',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#444',
  },
  gameHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  gameInfo: {
    flex: 1,
  },
  gameOpponent: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 4,
  },
  gameDate: {
    fontSize: 12,
    color: '#bbb',
  },
  reviewedBadge: {
    backgroundColor: '#4caf50',
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reviewedBadgeText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  gameDetails: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 8,
  },
  gameResult: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  gameEvent: {
    fontSize: 12,
    color: '#999',
  },
  gameStats: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#444',
  },
  gameStatText: {
    fontSize: 12,
    color: '#bbb',
  },
  repertoireMatch: {
    fontSize: 12,
    color: '#4caf50',
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#2a2a2a',
    borderRadius: 12,
    padding: 24,
    width: '100%',
    maxWidth: 400,
    borderWidth: 1,
    borderColor: '#444',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 16,
    textAlign: 'center',
  },
  modalGameInfo: {
    backgroundColor: '#1e1e1e',
    borderRadius: 8,
    padding: 12,
    marginBottom: 20,
  },
  modalPlayerText: {
    fontSize: 14,
    color: '#bbb',
    marginBottom: 4,
  },
  modalButtons: {
    gap: 12,
    marginBottom: 16,
  },
  modalButton: {
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 8,
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
    fontSize: 16,
    fontWeight: '600',
  },
  whiteButtonText: {
    color: '#1e1e1e',
  },
  blackButtonText: {
    color: '#fff',
  },
  modalCancelButton: {
    paddingVertical: 10,
    alignItems: 'center',
  },
  modalCancelText: {
    fontSize: 14,
    color: '#888',
  },
});
