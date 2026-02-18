import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, Alert, Platform, ActivityIndicator } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import { PGNService } from '@services/pgn/PGNService';
import { OpeningClassifier } from '@services/openings/OpeningClassifier';
import { LichessService } from '@services/lichess/LichessService';
import { useStore } from '@store';
import { RepertoireColor } from '@types';

// Three import types: repertoire, user games, master games
type ImportType = 'repertoire' | 'my-games' | 'master-games';

interface ImportPGNScreenProps {
  route: {
    params: {
      target: ImportType;
    };
  };
  navigation: any;
}

function generateId(): string {
  return Math.random().toString(36).substr(2, 9);
}

export default function ImportPGNScreen({ route, navigation }: ImportPGNScreenProps) {
  const { target } = route.params;
  const [pgnText, setPgnText] = useState('');
  const [name, setName] = useState('');
  const [color, setColor] = useState<RepertoireColor>('white');
  const [isImporting, setIsImporting] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0, phase: '' });
  const [fileSelected, setFileSelected] = useState(false);
  const [lichessUsername, setLichessUsername] = useState('');
  const [isImportingLichess, setIsImportingLichess] = useState(false);
  const { addRepertoire, addUserGames, addMasterGames } = useStore();

  const readFileWithTimeout = async (uri: string, timeoutMs: number = 15000): Promise<string> => {
    const fileReadPromise = Platform.OS === 'web'
      ? fetch(uri).then(r => r.text())
      : FileSystem.readAsStringAsync(uri);

    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('File read timeout after 15 seconds')), timeoutMs)
    );

    return Promise.race([fileReadPromise, timeoutPromise]);
  };

  const handleFilePick = async () => {
    try {
      // Accept .pgn, .txt, and other text files
      // Using '*/*' to work around web file picker limitations
      const result = await DocumentPicker.getDocumentAsync({
        type: Platform.OS === 'web' ? '*/*' : ['text/plain', 'application/x-chess-pgn', 'application/vnd.chess-pgn', 'text/*'],
        copyToCacheDirectory: true,
      });
      console.log('File picker result:', result);

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const file = result.assets[0];
        console.log('Reading file:', file.uri);

        setFileSelected(true);
        setProgress({ current: 0, total: 0, phase: 'Reading file...' });

        let content: string;

        try {
          content = await readFileWithTimeout(file.uri, 15000);
        } catch (timeoutError) {
          setFileSelected(false);
          Alert.alert('Error', 'File read timed out. File may be too large or corrupted.');
          return;
        }

        console.log('File content length:', content.length);

        // Don't set pgnText for large files (would freeze UI)
        // Only show in text area if < 100KB
        if (content.length < 100000) {
          setPgnText(content);
        }

        // Auto-submit for game imports, but not for repertoire (needs name)
        if (target === 'my-games' || target === 'master-games') {
          // Import immediately
          await handleImport(content);
        } else if (target === 'repertoire') {
          // For repertoire, check if name is filled
          if (name.trim()) {
            await handleImport(content);
          } else {
            // Name not filled, show the text (if small enough) and wait
            setFileSelected(false);
            Alert.alert('Info', 'Please enter a repertoire name and click Import');
          }
        }
      }
    } catch (error) {
      console.error('File pick error:', error);
      setFileSelected(false);
      Alert.alert('Error', 'Failed to read file: ' + error);
    }
  };

  const processBatch = async <T,>(
    items: T[],
    batchSize: number,
    processor: (item: T, index: number) => any,
    phase: string
  ): Promise<any[]> => {
    const results: any[] = [];
    const _totalBatches = Math.ceil(items.length / batchSize);

    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize);
      const batchResults = batch.map((item, localIndex) => processor(item, i + localIndex));
      results.push(...batchResults);

      setProgress({
        current: Math.min(i + batchSize, items.length),
        total: items.length,
        phase
      });

      // Allow UI to update more frequently for large imports
      await new Promise(resolve => setTimeout(resolve, 10));
    }

    return results;
  };

  const handleLichessImport = async () => {
    if (!lichessUsername.trim()) {
      Alert.alert('Error', 'Please enter a Lichess username');
      return;
    }

    setIsImportingLichess(true);
    setProgress({ current: 0, total: 0, phase: 'Fetching games from Lichess...' });

    try {
      console.log('[ImportPGN] Fetching games for username:', lichessUsername);

      const pgns = await LichessService.fetchMasterGames(lichessUsername, 50);

      if (pgns.length === 0) {
        Alert.alert('No Games', `No games found for user "${lichessUsername}"`);
        setIsImportingLichess(false);
        return;
      }

      console.log('[ImportPGN] Fetched', pgns.length, 'PGNs from Lichess');

      // Combine all PGNs with double newline separator
      const combinedPgn = pgns.join('\n\n');

      // Use existing import logic
      setIsImporting(true);
      await handleImport(combinedPgn);

      Alert.alert('Success', `Imported ${pgns.length} games from ${lichessUsername}`);
      setLichessUsername('');
    } catch (error: any) {
      console.error('[ImportPGN] Lichess import error:', error);
      Alert.alert('Import Error', error?.message || String(error));
    } finally {
      setIsImportingLichess(false);
      setIsImporting(false);
    }
  };

  const handleImport = async (textOverride?: string) => {
    // Ensure textOverride is a string (not an event object from button press)
    const text = (typeof textOverride === 'string' ? textOverride : pgnText);
    if (!text || !text.trim()) {
      Alert.alert('Error', 'Please enter or select a PGN');
      return;
    }

    setIsImporting(true);
    setProgress({ current: 0, total: 0, phase: 'Parsing PGN...' });

    // Set timeout for entire import process
    const importTimeout = setTimeout(() => {
      setIsImporting(false);
      setFileSelected(false);
      Alert.alert('Import Timeout', 'Import took too long. Try importing smaller batches.');
    }, 120000); // 2 minute max for entire import

    try {
      console.log('Starting PGN import, target:', target);
      console.log('PGN text length:', text.length);

      const games = PGNService.parseMultipleGames(text);
      console.log('Parsed games:', games.length);

      setProgress({ current: 0, total: games.length, phase: `Processing ${games.length} games...` });

      if (games.length === 0) {
        Alert.alert('Error', 'No valid games found in PGN');
        setIsImporting(false);
        return;
      }

      if (target === 'repertoire') {
        if (!name.trim()) {
          Alert.alert('Error', 'Please enter a repertoire name');
          setIsImporting(false);
          setFileSelected(false);
          return;
        }

        // Process chapters in batches
        const chapters = await processBatch(games, 50, (parsed, index) => {
          const moveTree = PGNService.toMoveTree(parsed);
          const classification = OpeningClassifier.classify(
            PGNService.toUserGame(parsed).moves,
            PGNService.getECO(parsed)
          );

          return {
            id: generateId(),
            name: PGNService.getOpeningName(parsed) || classification.name || `Chapter ${index + 1}`,
            pgn: PGNService.toPGNString(parsed),
            moveTree: moveTree.toJSON(),
            order: index,
            createdAt: new Date(),
            updatedAt: new Date(),
          };
        }, 'Processing chapters');

        const firstGame = games[0];
        const classification = OpeningClassifier.classify(
          PGNService.toUserGame(firstGame).moves,
          PGNService.getECO(firstGame)
        );

        const repertoire = {
          id: generateId(),
          name,
          color,
          openingType: classification.openingType,
          eco: classification.eco,
          chapters,
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        setProgress({ current: chapters.length, total: chapters.length, phase: 'Saving repertoire...' });
        await addRepertoire(repertoire);

        clearTimeout(importTimeout);
        setIsImporting(false);
        setFileSelected(false);

        // Auto-navigate back
        navigation.goBack();

      } else if (target === 'my-games') {
        // Process user games in batches
        const userGames = await processBatch(games, 100, (g) => ({
          id: generateId(),
          ...PGNService.toUserGame(g),
          pgn: PGNService.toPGNString(g),
          importedAt: new Date(),
        }), 'Processing user games');

        setProgress({ current: userGames.length, total: userGames.length, phase: 'Saving games...' });
        await addUserGames(userGames);

        clearTimeout(importTimeout);
        setIsImporting(false);
        setFileSelected(false);

        // Auto-navigate back
        navigation.goBack();

      } else if (target === 'master-games') {
        // Process master games in batches
        const masterGames = await processBatch(games, 100, (g) => ({
          id: generateId(),
          ...PGNService.toUserGame(g),
          pgn: PGNService.toPGNString(g),
          importedAt: new Date(),
        }), 'Processing master games');

        setProgress({ current: masterGames.length, total: masterGames.length, phase: 'Saving games...' });
        await addMasterGames(masterGames);

        clearTimeout(importTimeout);
        setIsImporting(false);
        setFileSelected(false);

        // Auto-navigate back
        navigation.goBack();
      }
    } catch (error: any) {
      console.error('Import error:', error);
      clearTimeout(importTimeout);
      setIsImporting(false);
      setFileSelected(false);
      const errorMessage = error?.message || String(error);
      Alert.alert(
        'Import Failed',
        `Failed to parse PGN. Please ensure the file contains valid chess notation.\n\nError: ${errorMessage}`
      );
    }
  };

  const getTitle = () => {
    switch (target) {
      case 'repertoire': return 'Import Repertoire';
      case 'my-games': return 'Import My Games';
      case 'master-games': return 'Import Master Games';
    }
  };

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>{getTitle()}</Text>

      {(isImporting || fileSelected) && (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#007AFF" />
          {progress.phase && (
            <Text style={styles.loadingPhase}>
              {progress.phase}
            </Text>
          )}
          {progress.total > 0 && (
            <>
              <Text style={styles.loadingText}>
                {progress.current} / {progress.total}
              </Text>
              <Text style={styles.loadingSubtext}>
                {Math.round((progress.current / progress.total) * 100)}%
              </Text>
            </>
          )}
        </View>
      )}

      {!isImporting && !fileSelected && !isImportingLichess && (
        <>
          {/* Lichess import (Master Games only) */}
          {target === 'master-games' && (
            <View style={styles.lichessSection}>
              <Text style={styles.sectionTitle}>Import from Lichess</Text>
              <TextInput
                style={styles.input}
                value={lichessUsername}
                onChangeText={setLichessUsername}
                placeholder="Enter Lichess username"
                placeholderTextColor="#666"
                autoCapitalize="none"
                autoCorrect={false}
              />
              <TouchableOpacity
                style={[styles.lichessButton, (!lichessUsername.trim() || isImportingLichess) && styles.buttonDisabled]}
                onPress={handleLichessImport}
                disabled={!lichessUsername.trim() || isImportingLichess}
              >
                <Text style={styles.buttonText}>
                  {isImportingLichess ? 'Importing from Lichess...' : 'Import from Lichess'}
                </Text>
              </TouchableOpacity>
              <View style={styles.divider}>
                <View style={styles.dividerLine} />
                <Text style={styles.dividerText}>OR</Text>
                <View style={styles.dividerLine} />
              </View>
            </View>
          )}

          {/* Repertoire-specific fields */}
          {target === 'repertoire' && (
            <>
              <TextInput
                style={styles.input}
                placeholder="Repertoire name"
                placeholderTextColor="#888"
                value={name}
                onChangeText={setName}
                editable={!isImporting && !fileSelected}
              />

              {/* Color toggle */}
              <View style={styles.colorToggle}>
                <Text style={styles.label}>Playing as:</Text>
                <View style={styles.colorButtons}>
                  <TouchableOpacity
                    style={[styles.colorBtn, color === 'white' && styles.colorBtnActive]}
                    onPress={() => setColor('white')}
                  >
                    <Text style={[styles.colorBtnText, color === 'white' && styles.colorBtnTextActive]}>
                      White
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.colorBtn, color === 'black' && styles.colorBtnActive]}
                    onPress={() => setColor('black')}
                  >
                    <Text style={[styles.colorBtnText, color === 'black' && styles.colorBtnTextActive]}>
                      Black
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            </>
          )}

          <TouchableOpacity
            style={[styles.button, (isImporting || fileSelected) && styles.buttonDisabled]}
            onPress={handleFilePick}
            disabled={isImporting || fileSelected}
          >
            <Text style={styles.buttonText}>Select PGN File</Text>
          </TouchableOpacity>

          <Text style={styles.label}>Or paste PGN:</Text>

          <TextInput
            style={styles.textArea}
            placeholder="1. e4 e5 2. Nf3 Nc6..."
            placeholderTextColor="#888"
            value={pgnText}
            onChangeText={setPgnText}
            multiline
            numberOfLines={10}
            editable={!isImporting && !fileSelected}
          />

          <TouchableOpacity
            style={[styles.importButton, (isImporting || fileSelected || !pgnText.trim()) && styles.buttonDisabled]}
            onPress={() => handleImport()}
            disabled={isImporting || fileSelected || !pgnText.trim()}
          >
            <Text style={styles.buttonText}>Import</Text>
          </TouchableOpacity>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    backgroundColor: '#2c2c2c',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#e0e0e0',
    marginBottom: 20,
  },
  input: {
    backgroundColor: '#3a3a3a',
    borderRadius: 8,
    padding: 12,
    color: '#e0e0e0',
    marginBottom: 16,
    fontSize: 16,
  },
  label: {
    color: '#e0e0e0',
    fontSize: 14,
    marginBottom: 8,
  },
  colorToggle: {
    marginBottom: 16,
  },
  colorButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  colorBtn: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    backgroundColor: '#3a3a3a',
    alignItems: 'center',
  },
  colorBtnActive: {
    backgroundColor: '#007AFF',
  },
  colorBtnText: {
    color: '#888',
    fontSize: 16,
    fontWeight: '600',
  },
  colorBtnTextActive: {
    color: '#fff',
  },
  button: {
    backgroundColor: '#007AFF',
    padding: 14,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 16,
  },
  buttonDisabled: {
    backgroundColor: '#555',
    opacity: 0.5,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  textArea: {
    backgroundColor: '#3a3a3a',
    borderRadius: 8,
    padding: 12,
    color: '#e0e0e0',
    fontSize: 14,
    fontFamily: 'monospace',
    minHeight: 200,
    textAlignVertical: 'top',
    marginBottom: 16,
  },
  importButton: {
    backgroundColor: '#34C759',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 32,
  },
  loadingContainer: {
    padding: 32,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 200,
  },
  loadingPhase: {
    color: '#4a9eff',
    fontSize: 16,
    fontWeight: '600',
    marginTop: 16,
  },
  loadingText: {
    color: '#e0e0e0',
    fontSize: 16,
    marginTop: 8,
  },
  loadingSubtext: {
    color: '#888',
    fontSize: 14,
    marginTop: 8,
  },
  lichessSection: {
    marginBottom: 24,
    padding: 16,
    backgroundColor: '#3a3a3a',
    borderRadius: 8,
  },
  sectionTitle: {
    color: '#e0e0e0',
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 12,
  },
  lichessButton: {
    backgroundColor: '#4a9eff',
    padding: 14,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 8,
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 24,
    marginBottom: 8,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#555',
  },
  dividerText: {
    color: '#888',
    fontSize: 12,
    fontWeight: '600',
    marginHorizontal: 12,
  },
});
