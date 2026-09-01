/**
 * PrepareAgainstScreen - saved preparation against specific opponents.
 *
 * An opponent profile is an opening book like any other; what makes it preparation is that
 * it is read on its own (never mixed into the Master statistics) and always filtered to
 * that player's own choices. Opening one goes to the analysis board with an extra tab
 * showing their moves and games from the position in front of you — alongside Find
 * Position, which is already telling you which of your own chapters cover it.
 */

import React, { useCallback, useState } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet, Alert, ActivityIndicator,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import { BookRecord, FetchError } from '@types';
import { BookService } from '@services/books/BookService';
import { BookBuilder } from '@services/books/BookBuilder';

interface Props {
  navigation: any;
}

export default function PrepareAgainstScreen({ navigation }: Props) {
  const [opponents, setOpponents] = useState<BookRecord[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    BookService.listBooks('opponent').then(setOpponents);
  }, []);

  // Refresh on focus: an opponent added on the build screen must appear on the way back.
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const addOpponent = () => {
    navigation.navigate('BuildBook', { kind: 'opponent' });
  };

  const openOpponent = (book: BookRecord) => {
    navigation.navigate('Main', {
      screen: 'Analysis',
      params: { opponentBookId: book.id, opponentName: book.name },
    });
  };

  /**
   * Add over-the-board games from a PGN.
   *
   * No public API hands you an arbitrary player's OTB games, so they arrive as a file the
   * user already has. They merge into the same profile rather than becoming a second
   * entry — one opponent is one profile, whatever the games' origin.
   */
  const addOtbGames = async (book: BookRecord) => {
    try {
      const picked = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        copyToCacheDirectory: true,
      });
      if (picked.canceled || !picked.assets?.length) return;

      setBusy(book.id);
      const pgn = await FileSystem.readAsStringAsync(picked.assets[0].uri);
      const controller = new AbortController();
      const result = await BookBuilder.addGamesFromPgn(book, pgn, () => {}, controller.signal);
      setBusy(null);
      load();

      Alert.alert(
        'Games Added',
        `${result.newGames.toLocaleString()} games added to ${book.name}\n` +
        `${result.newPositions.toLocaleString()} new positions`
      );
    } catch (error: any) {
      setBusy(null);
      Alert.alert(
        'Could Not Add Games',
        error instanceof FetchError ? error.message : `${error?.message ?? error}`
      );
    }
  };

  const removeOpponent = (book: BookRecord) => {
    Alert.alert('Remove Opponent', `Delete the preparation for "${book.name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await BookService.deleteBook(book.id);
          load();
        },
      },
    ]);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Prepare Against</Text>
      <Text style={styles.subtitle}>
        Saved preparation for specific opponents. Open one to study the board with their
        moves from each position beside your own repertoire.
      </Text>

      {opponents.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>No opponents yet</Text>
          <Text style={styles.emptyText}>
            Add one from their Chess.com or Lichess account. You can add their
            over-the-board games from a PGN afterwards.
          </Text>
        </View>
      ) : (
        opponents.map(book => (
          <View key={book.id} style={styles.card}>
            <TouchableOpacity style={styles.cardMain} onPress={() => openOpponent(book)}>
              <Text style={styles.cardName}>{book.name}</Text>
              <Text style={styles.cardMeta}>
                {book.gameCount.toLocaleString()} games ·{' '}
                {book.positionCount.toLocaleString()} positions
              </Text>
            </TouchableOpacity>
            <View style={styles.cardActions}>
              {busy === book.id ? (
                <ActivityIndicator size="small" color="#4a9eff" />
              ) : (
                <>
                  <TouchableOpacity
                    style={styles.action}
                    onPress={() => navigation.navigate('BuildBook', { refreshBookId: book.id })}
                  >
                    <Text style={styles.actionText}>Refresh</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.action} onPress={() => addOtbGames(book)}>
                    <Text style={styles.actionText}>Add OTB PGN</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.remove} onPress={() => removeOpponent(book)}>
                    <Text style={styles.removeText}>Delete</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          </View>
        ))
      )}

      <TouchableOpacity style={styles.addButton} onPress={addOpponent}>
        <Text style={styles.addButtonText}>+ Add Opponent</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#121212' },
  content: { padding: 20, paddingBottom: 48 },
  title: { color: '#fff', fontSize: 24, fontWeight: '700', marginBottom: 6 },
  subtitle: { color: '#888', fontSize: 13, lineHeight: 19, marginBottom: 20 },
  empty: {
    backgroundColor: '#1c1c1e', borderRadius: 8, padding: 24, alignItems: 'center',
    marginBottom: 16,
  },
  emptyTitle: { color: '#e0e0e0', fontSize: 16, fontWeight: '600', marginBottom: 8 },
  emptyText: { color: '#888', fontSize: 13, lineHeight: 19, textAlign: 'center' },
  card: {
    backgroundColor: '#1c1c1e', borderRadius: 8, padding: 16, marginBottom: 10,
    borderLeftWidth: 3, borderLeftColor: '#e8834a',
  },
  cardMain: { marginBottom: 12 },
  cardName: { color: '#fff', fontSize: 17, fontWeight: '600', marginBottom: 4 },
  cardMeta: { color: '#888', fontSize: 13 },
  cardActions: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  action: {
    backgroundColor: '#2c2c2e', borderRadius: 6, paddingHorizontal: 14, paddingVertical: 8,
  },
  actionText: { color: '#4a9eff', fontSize: 13, fontWeight: '600' },
  remove: {
    backgroundColor: '#3a1f1f', borderRadius: 6, paddingHorizontal: 14, paddingVertical: 8,
  },
  removeText: { color: '#ff6b6b', fontSize: 13, fontWeight: '600' },
  addButton: {
    backgroundColor: '#27ae60', borderRadius: 8, paddingVertical: 16,
    alignItems: 'center', marginTop: 12,
  },
  addButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
