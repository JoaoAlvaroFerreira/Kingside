import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, FlatList, Alert, Platform, ActivityIndicator } from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { useStore } from '@store';
import { UserGame, MasterGame } from '@types';
import { DatabaseService } from '@services/database/DatabaseService';
import { useFocusEffect } from '@react-navigation/native';

interface GameListScreenProps {
  navigation: any;
}

type TabType = 'my-games' | 'master-games';

export default function GameListScreen({ navigation }: GameListScreenProps) {
  const [activeTab, setActiveTab] = useState<TabType>('my-games');
  const [games, setGames] = useState<(UserGame | MasterGame)[]>([]);
  const [currentPage, setCurrentPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [isLoadingGames, setIsLoadingGames] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const userGamesCount = useStore(s => s.userGamesCount);
  const masterGamesCount = useStore(s => s.masterGamesCount);
  const deleteUserGame = useStore(s => s.deleteUserGame);
  const deleteMasterGame = useStore(s => s.deleteMasterGame);
  const deleteAllUserGames = useStore(s => s.deleteAllUserGames);
  const deleteAllMasterGames = useStore(s => s.deleteAllMasterGames);
  const refreshUserGamesCount = useStore(s => s.refreshUserGamesCount);
  const refreshMasterGamesCount = useStore(s => s.refreshMasterGamesCount);

  const totalCount = activeTab === 'my-games' ? userGamesCount : masterGamesCount;

  // Load initial page when tab changes
  useEffect(() => {
    loadGames(0, true);
  }, [activeTab]);

  // Refresh when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      refreshGames();
    }, [activeTab])
  );

  const loadGames = async (page: number, replace: boolean = false) => {
    if (isLoadingGames) return;

    setIsLoadingGames(true);
    try {
      const result = activeTab === 'my-games'
        ? await DatabaseService.getUserGames(page)
        : await DatabaseService.getMasterGames(page);

      setGames(prev => replace ? result.items : [...prev, ...result.items]);
      setHasMore(result.hasMore);
      setCurrentPage(page);
    } catch (error) {
      console.error('Failed to load games:', error);
    } finally {
      setIsLoadingGames(false);
    }
  };

  const refreshGames = async () => {
    setIsRefreshing(true);
    if (activeTab === 'my-games') {
      await refreshUserGamesCount();
    } else {
      await refreshMasterGamesCount();
    }
    await loadGames(0, true);
    setIsRefreshing(false);
  };

  const loadMoreGames = () => {
    if (hasMore && !isLoadingGames) {
      loadGames(currentPage + 1, false);
    }
  };

  const handleImport = () => {
    navigation.navigate('ImportPGN', { target: activeTab });
  };


  const handleGamePress = (game: UserGame | MasterGame) => {
    // Navigate to Analysis Board with this game loaded
    navigation.navigate('Analysis', { game });
  };

  const handleDelete = async (gameId: string) => {
    if (Platform.OS === 'web') {
      const confirmed = window.confirm('Are you sure you want to delete this game?');
      if (confirmed) {
        if (activeTab === 'my-games') {
          await deleteUserGame(gameId);
        } else {
          await deleteMasterGame(gameId);
        }
        await refreshGames();
      }
    } else {
      Alert.alert(
        'Delete Game',
        'Are you sure you want to delete this game?',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Delete',
            style: 'destructive',
            onPress: async () => {
              if (activeTab === 'my-games') {
                await deleteUserGame(gameId);
              } else {
                await deleteMasterGame(gameId);
              }
              await refreshGames();
            },
          },
        ]
      );
    }
  };

  const handleDeleteAll = async () => {
    const gameType = activeTab === 'my-games' ? 'user games' : 'master games';
    const count = totalCount;

    if (Platform.OS === 'web') {
      const confirmed = window.confirm(`Are you sure you want to delete all ${count} ${gameType}? This cannot be undone.`);
      if (confirmed) {
        if (activeTab === 'my-games') {
          await deleteAllUserGames();
        } else {
          await deleteAllMasterGames();
        }
        await refreshGames();
      }
    } else {
      Alert.alert(
        'Delete All Games',
        `Are you sure you want to delete all ${count} ${gameType}? This cannot be undone.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Delete All',
            style: 'destructive',
            onPress: async () => {
              if (activeTab === 'my-games') {
                await deleteAllUserGames();
              } else {
                await deleteAllMasterGames();
              }
              await refreshGames();
            },
          },
        ]
      );
    }
  };

  const renderRightActions = (gameId: string) => {
    return (
      <TouchableOpacity
        style={styles.deleteButton}
        onPress={() => handleDelete(gameId)}
      >
        <Text style={styles.deleteButtonText}>Delete</Text>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      {/* Tabs */}
      <View style={styles.tabs}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'my-games' && styles.tabActive]}
          onPress={() => setActiveTab('my-games')}
        >
          <Text style={[styles.tabText, activeTab === 'my-games' && styles.tabTextActive]}>
            My Games
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'master-games' && styles.tabActive]}
          onPress={() => setActiveTab('master-games')}
        >
          <Text style={[styles.tabText, activeTab === 'master-games' && styles.tabTextActive]}>
            Master Games
          </Text>
        </TouchableOpacity>
      </View>

      {/* Header with import and delete all buttons */}
      <View style={styles.header}>
        <Text style={styles.count}>{totalCount} game{totalCount !== 1 ? 's' : ''}</Text>
        <View style={styles.headerButtons}>
          {games.length > 0 && (
            <TouchableOpacity style={styles.deleteAllButton} onPress={handleDeleteAll}>
              <Text style={styles.deleteAllButtonText}>Delete All</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={styles.importButton} onPress={handleImport}>
            <Text style={styles.importButtonText}>+ Import</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Game list */}
      {games.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>No Games Yet</Text>
          <Text style={styles.emptySubtitle}>
            {activeTab === 'my-games'
              ? 'Import your own games to track positions and learn from mistakes'
              : 'Import master games to see how the best players handle key positions'}
          </Text>
          <TouchableOpacity style={styles.emptyButton} onPress={handleImport}>
            <Text style={styles.emptyButtonText}>Import Games</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={games}
          keyExtractor={(item) => item.id}
          onEndReached={loadMoreGames}
          onEndReachedThreshold={0.5}
          refreshing={isRefreshing}
          onRefresh={refreshGames}
          ListFooterComponent={
            isLoadingGames ? (
              <View style={styles.loadingFooter}>
                <ActivityIndicator size="small" color="#007AFF" />
                <Text style={styles.loadingFooterText}>Loading more games...</Text>
              </View>
            ) : null
          }
          renderItem={({ item }) => (
            <Swipeable
              renderRightActions={() => renderRightActions(item.id)}
              overshootRight={false}
            >
              <TouchableOpacity
                style={styles.gameCard}
                onPress={() => handleGamePress(item)}
                activeOpacity={0.7}
              >
                <View style={styles.players}>
                  <Text style={styles.playerName}>{item.white}</Text>
                  <Text style={styles.vs}>vs</Text>
                  <Text style={styles.playerName}>{item.black}</Text>
                </View>
                <View style={styles.gameInfo}>
                  <Text style={styles.result}>{item.result}</Text>
                  <Text style={styles.separator}>•</Text>
                  <Text style={styles.date}>{item.date}</Text>
                  {item.eco && (
                    <>
                      <Text style={styles.separator}>•</Text>
                      <Text style={styles.eco}>{item.eco}</Text>
                    </>
                  )}
                </View>
                {item.event && <Text style={styles.event}>{item.event}</Text>}
              </TouchableOpacity>
            </Swipeable>
          )}
          contentContainerStyle={styles.listContent}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#2c2c2c',
  },
  tabs: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#3a3a3a',
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    borderBottomColor: '#007AFF',
  },
  tabText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#888',
  },
  tabTextActive: {
    color: '#007AFF',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#3a3a3a',
  },
  count: {
    fontSize: 13,
    color: '#aaa',
  },
  headerButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  deleteAllButton: {
    backgroundColor: '#FF3B30',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
  },
  deleteAllButtonText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '600',
  },
  lichessButton: {
    backgroundColor: '#5a5a5a',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    minWidth: 64,
    alignItems: 'center',
  },
  lichessButtonDisabled: {
    backgroundColor: '#3a3a3a',
  },
  lichessButtonText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '600',
  },
  importButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
  },
  importButtonText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '600',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 12,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#e0e0e0',
    marginBottom: 6,
  },
  emptySubtitle: {
    fontSize: 12,
    color: '#888',
    textAlign: 'center',
    marginBottom: 10,
  },
  emptyButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
  },
  emptyButtonText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  listContent: {
    padding: 10,
  },
  gameCard: {
    backgroundColor: '#3a3a3a',
    borderRadius: 8,
    padding: 10,
    marginBottom: 8,
  },
  players: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  playerName: {
    fontSize: 13,
    fontWeight: '600',
    color: '#e0e0e0',
  },
  vs: {
    fontSize: 11,
    color: '#888',
    marginHorizontal: 6,
  },
  gameInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  result: {
    fontSize: 11,
    fontWeight: '600',
    color: '#34C759',
  },
  separator: {
    fontSize: 11,
    color: '#666',
    marginHorizontal: 6,
  },
  date: {
    fontSize: 11,
    color: '#aaa',
  },
  eco: {
    fontSize: 11,
    color: '#aaa',
  },
  event: {
    fontSize: 10,
    color: '#888',
    marginTop: 2,
  },
  deleteButton: {
    backgroundColor: '#FF3B30',
    justifyContent: 'center',
    alignItems: 'center',
    width: 64,
    marginBottom: 8,
    borderRadius: 8,
  },
  deleteButtonText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '600',
  },
  loadingFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    gap: 8,
  },
  loadingFooterText: {
    color: '#aaa',
    fontSize: 11,
  },
});
