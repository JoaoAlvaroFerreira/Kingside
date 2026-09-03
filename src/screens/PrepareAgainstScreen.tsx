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
import { BookRecord, FetchError, HeroColor } from '@types';
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

  /**
   * Open the board prepared for one colour.
   *
   * The colour is chosen here rather than inferred on the board, because a player's book
   * holds both of their colours: without picking one, their arrows alternate every ply
   * between what they play as White and what they answer as Black, which is preparation
   * for two different opponents at once. `opponentColour` is the colour *they* had, so
   * you take the other one.
   */
  const openOpponent = (book: BookRecord, opponentColor: HeroColor) => {
    navigation.navigate('Main', {
      screen: 'Analysis',
      params: { opponentBookId: book.id, opponentName: book.name, opponentColor },
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

  /**
   * Re-index from the games already stored, so improvements to how books are built reach an
   * existing profile without fetching the account again.
   */
  const rebuild = (book: BookRecord) => {
    Alert.alert(
      'Rebuild Index?',
      `Re-reads the ${book.gameCount.toLocaleString()} games already stored for ${book.name}. ` +
      'Nothing is downloaded. Larger profiles take a few minutes.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Rebuild',
          onPress: async () => {
            setBusy(book.id);
            try {
              const controller = new AbortController();
              const result = await BookBuilder.rebuildIndex(book, () => {}, controller.signal);
              setBusy(null);
              load();
              Alert.alert(
                'Index Rebuilt',
                `${result.newPositions.toLocaleString()} positions · ${Math.round(result.seconds)}s`
              );
            } catch (error: any) {
              setBusy(null);
              Alert.alert(
                'Rebuild Failed',
                error instanceof FetchError ? error.message : `${error?.message ?? error}`
              );
            }
          },
        },
      ]
    );
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
        Saved preparation for specific opponents. Pick the colour you will have — their
        moves from each position then show beside your own repertoire.
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
            <View style={styles.cardMain}>
              <Text style={styles.cardName}>{book.name}</Text>
              <Text style={styles.cardMeta}>
                {book.gameCount.toLocaleString()} games ·{' '}
                {book.positionCount.toLocaleString()} positions
              </Text>
            </View>
            <View style={styles.prepRow}>
              <TouchableOpacity
                style={[styles.prep, styles.prepWhite]}
                onPress={() => openOpponent(book, 'b')}
              >
                <Text style={styles.prepWhiteText}>Prepare as White</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.prep, styles.prepBlack]}
                onPress={() => openOpponent(book, 'w')}
              >
                <Text style={styles.prepBlackText}>Prepare as Black</Text>
              </TouchableOpacity>
            </View>
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
                  <TouchableOpacity style={styles.action} onPress={() => rebuild(book)}>
                    <Text style={styles.actionText}>Rebuild</Text>
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
  prepRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  prep: { flex: 1, borderRadius: 6, paddingVertical: 12, alignItems: 'center' },
  prepWhite: { backgroundColor: '#e8e6e3' },
  prepWhiteText: { color: '#1c1c1e', fontSize: 14, fontWeight: '600' },
  prepBlack: { backgroundColor: '#2c2c2e', borderWidth: 1, borderColor: '#4a4a4c' },
  prepBlackText: { color: '#e8e6e3', fontSize: 14, fontWeight: '600' },
  cardName: { color: '#fff', fontSize: 17, fontWeight: '600', marginBottom: 4 },
  cardMeta: { color: '#888', fontSize: 13 },
  // Four actions do not fit one phone-width row, and the last of them — Delete — was the
  // one pushed off the edge.
  cardActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
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
