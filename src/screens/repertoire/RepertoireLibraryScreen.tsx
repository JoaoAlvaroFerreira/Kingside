/**
 * Repertoire Library Screen - Display list of imported repertoires
 */

import React, { useEffect, useState } from 'react';
import {
  SafeAreaView,
  View,
  StyleSheet,
  FlatList,
  Text,
  Button,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '@navigation/AppNavigator';
import { useStore } from '@store/index';
import type { Repertoire } from '@types';

type RepertoireLibraryScreenNavigationProp = StackNavigationProp<RootStackParamList, 'Library'>;

interface RepertoireLibraryScreenProps {
  navigation: RepertoireLibraryScreenNavigationProp;
}

export const RepertoireLibraryScreen: React.FC<RepertoireLibraryScreenProps> = ({
  navigation,
}) => {
  const {
    repertoires,
    initializeRepertoires,
    deleteRepertoire,
    loadRepertoire,
    initializeReviewCards,
    generateCardsFromRepertoire,
    getDueCount,
    getRepertoireDueCount,
  } = useStore();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const initialize = async () => {
      try {
        await initializeRepertoires();
        await initializeReviewCards();
      } finally {
        setLoading(false);
      }
    };
    initialize();
  }, []);

  const handleSelectRepertoire = (repertoire: Repertoire) => {
    loadRepertoire(repertoire);
    navigation.navigate('Viewer');
  };

  const handleDeleteRepertoire = (id: string, name: string) => {
    Alert.alert('Delete Repertoire', `Are you sure you want to delete "${name}"?`, [
      { text: 'Cancel', onPress: () => {}, style: 'cancel' },
      {
        text: 'Delete',
        onPress: async () => {
          try {
            await deleteRepertoire(id);
            Alert.alert('Success', 'Repertoire deleted successfully');
          } catch (error) {
            Alert.alert('Error', 'Failed to delete repertoire');
          }
        },
        style: 'destructive',
      },
    ]);
  };

  const handleGenerateCards = async (repertoire: Repertoire) => {
    try {
      setLoading(true);
      await generateCardsFromRepertoire(repertoire);
      Alert.alert('Success', 'Review cards generated successfully');
    } catch (error) {
      Alert.alert('Error', 'Failed to generate review cards');
    } finally {
      setLoading(false);
    }
  };

  const handleStartReview = () => {
    const dueCount = getDueCount();
    if (dueCount === 0) {
      Alert.alert('No Reviews Due', 'You have no cards due for review right now.');
      return;
    }
    navigation.navigate('Training');
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator size="large" color="#007AFF" />
      </SafeAreaView>
    );
  }

  const renderRepertoireItem = ({ item }: { item: Repertoire }) => {
    const dueCount = getRepertoireDueCount(item.id);

    return (
      <View style={styles.repertoireCard}>
        <View style={styles.repertoireInfo}>
          <Text style={styles.repertoireName}>{item.name}</Text>
          <Text style={styles.repertoireChapters}>
            {item.chapters.length} chapter{item.chapters.length !== 1 ? 's' : ''}
          </Text>
          {dueCount > 0 && (
            <Text style={styles.dueCount}>
              {dueCount} card{dueCount !== 1 ? 's' : ''} due
            </Text>
          )}
          <Text style={styles.repertoireDate}>
            {new Date(item.createdAt).toLocaleDateString()}
          </Text>
        </View>
        <View style={styles.repertoireActions}>
          <Button
            title="View"
            onPress={() => handleSelectRepertoire(item)}
            color="#007AFF"
          />
          <Button
            title="Cards"
            onPress={() => handleGenerateCards(item)}
            color="#34C759"
          />
          <Button
            title="Delete"
            onPress={() => handleDeleteRepertoire(item.id, item.name)}
            color="#FF3B30"
          />
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Button title="← Home" onPress={() => navigation.navigate('Home')} />
        <View style={styles.headerContent}>
          <Text style={styles.title}>My Repertoires</Text>
          {repertoires.length > 0 && (
            <Text style={styles.subtitle}>{repertoires.length} imported</Text>
          )}
        </View>
      </View>

      <View style={styles.actionBar}>
        <Button
          title="➕ Import PGN"
          onPress={() => navigation.navigate('ImportPGN')}
          color="#34C759"
        />
        {getDueCount() > 0 && (
          <Button
            title={`Start Review (${getDueCount()} due)`}
            onPress={handleStartReview}
            color="#FF9500"
          />
        )}
      </View>

      {repertoires.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>No repertoires imported yet</Text>
          <Text style={styles.emptySubtitle}>Import a PGN file to get started</Text>
          <Button
            title="Import Your First Repertoire"
            onPress={() => navigation.navigate('ImportPGN')}
            color="#34C759"
          />
        </View>
      ) : (
        <FlatList
          data={repertoires}
          renderItem={renderRepertoireItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          scrollEnabled={repertoires.length > 3}
        />
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  headerContent: {
    flex: 1,
    marginLeft: 12,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
  },
  actionBar: {
    flexDirection: 'row',
    gap: 8,
    padding: 16,
    backgroundColor: '#f9f9f9',
  },
  listContent: {
    padding: 16,
  },
  repertoireCard: {
    backgroundColor: '#f9f9f9',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderLeftWidth: 4,
    borderLeftColor: '#007AFF',
  },
  repertoireInfo: {
    flex: 1,
    marginRight: 12,
  },
  repertoireName: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  repertoireChapters: {
    fontSize: 14,
    color: '#007AFF',
    marginBottom: 4,
  },
  dueCount: {
    fontSize: 13,
    color: '#FF9500',
    fontWeight: '600',
    marginBottom: 4,
  },
  repertoireDate: {
    fontSize: 12,
    color: '#999',
  },
  repertoireActions: {
    gap: 8,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 8,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
  },
});
