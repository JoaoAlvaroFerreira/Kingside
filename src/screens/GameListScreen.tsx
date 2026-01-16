import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, FlatList, Alert, Platform, ActivityIndicator } from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { useStore } from '@store';
import { UserGame, MasterGame } from '@types';
import { PGNService } from '@services/pgn/PGNService';

interface GameListScreenProps {
  navigation: any;
}

type TabType = 'my-games' | 'master-games';

export default function GameListScreen({ navigation }: GameListScreenProps) {
  const [activeTab, setActiveTab] = useState<TabType>('my-games');
  const [importingFromLichess, setImportingFromLichess] = useState(false);
  const {
    userGames,
    masterGames,
    deleteUserGame,
    deleteMasterGame,
    deleteAllUserGames,
    deleteAllMasterGames,
    addUserGames,
    reviewSettings
  } = useStore();

  const games = activeTab === 'my-games' ? userGames : masterGames;

  useEffect(() => {
    console.log('GameListScreen: User games count:', userGames.length);
    console.log('GameListScreen: Master games count:', masterGames.length);
  }, [userGames, masterGames]);

  const handleImport = () => {
    navigation.navigate('ImportPGN', { target: activeTab });
  };

  const handleLichessImport = async () => {
    const { username, importDaysBack } = reviewSettings.lichess;

    if (!username || !username.trim()) {
      const msg = 'Please configure your Lichess username in Settings first.';
      if (Platform.OS === 'web') {
        window.alert(msg);
      } else {
        Alert.alert('Configuration Required', msg);
      }
      return;
    }

    setImportingFromLichess(true);

    try {
      // Calculate timestamps
      const now = Date.now();
      const daysBackMs = importDaysBack * 24 * 60 * 60 * 1000;
      const since = now - daysBackMs;

      // Build API URL
      const apiUrl = `https://lichess.org/api/games/user/${username}?tags=true&clocks=false&evals=false&opening=false&literate=false&since=${since}&until=${now}`;

      console.log('Fetching Lichess games from:', apiUrl);

      const response = await fetch(apiUrl);

      if (!response.ok) {
        throw new Error(`Lichess API returned ${response.status}: ${response.statusText}`);
      }

      const pgnText = await response.text();

      if (!pgnText || !pgnText.trim()) {
        const msg = `No games found for user "${username}" in the last ${importDaysBack} day(s).`;
        if (Platform.OS === 'web') {
          window.alert(msg);
        } else {
          Alert.alert('No Games Found', msg);
        }
        return;
      }

      console.log('Lichess PGN fetched, length:', pgnText.length);

      // Parse games
      const games = PGNService.parseMultipleGames(pgnText);
      console.log('Parsed Lichess games:', games.length);

      if (games.length === 0) {
        const msg = 'No valid games found in Lichess response.';
        if (Platform.OS === 'web') {
          window.alert(msg);
        } else {
          Alert.alert('Import Failed', msg);
        }
        return;
      }

      // Convert to UserGame format
      const userGames = games.map((g) => ({
        id: Math.random().toString(36).substr(2, 9),
        ...PGNService.toUserGame(g),
        pgn: PGNService.toPGNString(g),
        importedAt: new Date(),
      }));

      await addUserGames(userGames);

      const msg = `Successfully imported ${userGames.length} game(s) from Lichess!`;
      if (Platform.OS === 'web') {
        window.alert(msg);
      } else {
        Alert.alert('Import Success', msg);
      }
    } catch (error: any) {
      console.error('Lichess import error:', error);
      const msg = `Failed to import games from Lichess: ${error.message || String(error)}`;
      if (Platform.OS === 'web') {
        window.alert(msg);
      } else {
        Alert.alert('Import Failed', msg);
      }
    } finally {
      setImportingFromLichess(false);
    }
  };

  const handleGamePress = (game: UserGame | MasterGame) => {
    // Navigate to Analysis Board with this game loaded
    navigation.navigate('Analysis', { game });
  };

  const handleDelete = (gameId: string) => {
    if (Platform.OS === 'web') {
      const confirmed = window.confirm('Are you sure you want to delete this game?');
      if (confirmed) {
        if (activeTab === 'my-games') {
          deleteUserGame(gameId);
        } else {
          deleteMasterGame(gameId);
        }
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
            },
          },
        ]
      );
    }
  };

  const handleDeleteAll = () => {
    const gameType = activeTab === 'my-games' ? 'user games' : 'master games';
    const count = games.length;

    if (Platform.OS === 'web') {
      const confirmed = window.confirm(`Are you sure you want to delete all ${count} ${gameType}? This cannot be undone.`);
      if (confirmed) {
        if (activeTab === 'my-games') {
          deleteAllUserGames();
        } else {
          deleteAllMasterGames();
        }
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
        <Text style={styles.count}>{games.length} game{games.length !== 1 ? 's' : ''}</Text>
        <View style={styles.headerButtons}>
          {games.length > 0 && (
            <TouchableOpacity style={styles.deleteAllButton} onPress={handleDeleteAll}>
              <Text style={styles.deleteAllButtonText}>Delete All</Text>
            </TouchableOpacity>
          )}
          {activeTab === 'my-games' && (
            <TouchableOpacity
              style={[styles.lichessButton, importingFromLichess && styles.lichessButtonDisabled]}
              onPress={handleLichessImport}
              disabled={importingFromLichess}
            >
              {importingFromLichess ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.lichessButtonText}>↓ Lichess</Text>
              )}
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
    paddingVertical: 14,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    borderBottomColor: '#007AFF',
  },
  tabText: {
    fontSize: 16,
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
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#3a3a3a',
  },
  count: {
    fontSize: 16,
    color: '#aaa',
  },
  headerButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  deleteAllButton: {
    backgroundColor: '#FF3B30',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  deleteAllButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  lichessButton: {
    backgroundColor: '#5a5a5a',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    minWidth: 80,
    alignItems: 'center',
  },
  lichessButtonDisabled: {
    backgroundColor: '#3a3a3a',
  },
  lichessButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  importButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  importButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#e0e0e0',
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#888',
    textAlign: 'center',
    marginBottom: 24,
  },
  emptyButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  emptyButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  listContent: {
    padding: 16,
  },
  gameCard: {
    backgroundColor: '#3a3a3a',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  players: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  playerName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#e0e0e0',
  },
  vs: {
    fontSize: 14,
    color: '#888',
    marginHorizontal: 8,
  },
  gameInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  result: {
    fontSize: 14,
    fontWeight: '600',
    color: '#34C759',
  },
  separator: {
    fontSize: 14,
    color: '#666',
    marginHorizontal: 8,
  },
  date: {
    fontSize: 14,
    color: '#aaa',
  },
  eco: {
    fontSize: 14,
    color: '#aaa',
  },
  event: {
    fontSize: 12,
    color: '#888',
    marginTop: 4,
  },
  deleteButton: {
    backgroundColor: '#FF3B30',
    justifyContent: 'center',
    alignItems: 'center',
    width: 80,
    marginBottom: 12,
    borderRadius: 12,
  },
  deleteButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
});
