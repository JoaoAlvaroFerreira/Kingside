import React, { useRef, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, Alert, Platform, ActivityIndicator } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import { PGNService } from '@services/pgn/PGNService';
import { OpeningClassifier } from '@services/openings/OpeningClassifier';
import { LichessService } from '@services/lichess/LichessService';
import { useStore } from '@store';
import { RepertoireColor, BookImportError } from '@types';
import { BookService } from '@services/books/BookService';
import { MoveTree } from '@utils/MoveTree';

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

/** Each rejection reason gets the action that actually fixes it. */
function bookErrorMessage(error: BookImportError): string {
  switch (error.reason) {
    case 'not-a-database':
      return 'That file is not a SQLite database. Pick the .kbook file produced by the book generator.';
    case 'not-a-book':
      return 'That database is not an opening book - it has no book tables. Pick a .kbook file.';
    case 'unsupported-version':
      return error.message;
    case 'copy-failed':
      return `The file could not be copied into the app: ${error.message}`;
  }
}

function generateId(): string {
  return Math.random().toString(36).substr(2, 9);
}

const IMPORT_TIMEOUT_MS = 600000; // 10 minutes for the whole import

/**
 * Thrown to unwind an import that the user cancelled or that outran its
 * deadline. Both cases must leave the database untouched, so this is raised
 * before any write and never treated as a parse failure.
 */
class ImportAbortedError extends Error {
  constructor(public reason: 'cancelled' | 'timeout') {
    super(reason === 'cancelled' ? 'Import cancelled' : 'Import timed out');
  }
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
  const [masterGameCount, setMasterGameCount] = useState('50');
  const [masterDaysBack, setMasterDaysBack] = useState('0');
  const [isImportingLichess, setIsImportingLichess] = useState(false);
  const [lichessStudyUrl, setLichessStudyUrl] = useState('');
  const [chessableMode, setChessableMode] = useState(false);
  const [chessableDirectMode, setChessableDirectMode] = useState(false);
  const [isImportingBook, setIsImportingBook] = useState(false);
  const addRepertoire = useStore(s => s.addRepertoire);
  const addUserGames = useStore(s => s.addUserGames);
  const addMasterGames = useStore(s => s.addMasterGames);
  const cancelRequestedRef = useRef(false);
  const deadlineRef = useRef(0);

  // Import work is synchronous between batch yields, so an abort can only be
  // observed at a yield point. Every loop that yields calls this first.
  const throwIfAborted = () => {
    if (cancelRequestedRef.current) throw new ImportAbortedError('cancelled');
    if (deadlineRef.current && Date.now() > deadlineRef.current) {
      throw new ImportAbortedError('timeout');
    }
  };

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
        type: '*/*',
        copyToCacheDirectory: true,
      });
      console.log('File picker result:', result);

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const file = result.assets[0];
        console.log('Reading file:', file.uri);

        cancelRequestedRef.current = false;
        setFileSelected(true);
        setProgress({ current: 0, total: 0, phase: 'Reading file...' });

        let content: string;

        try {
          content = await readFileWithTimeout(file.uri, 15000);
        } catch (timeoutError) {
          setFileSelected(false);
          Alert.alert(
            'File Read Timed Out',
            'The file could not be read within 15 seconds. It may be too large or corrupted. Nothing was saved.'
          );
          return;
        }

        // The read itself can't be interrupted, so a cancel pressed during it
        // is honoured here - before any parsing or writing begins.
        if (cancelRequestedRef.current) {
          cancelRequestedRef.current = false;
          setFileSelected(false);
          Alert.alert('Import Cancelled', 'The import was cancelled. Nothing was saved.');
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
      throwIfAborted();
      const batch = items.slice(i, i + batchSize);
      const batchResults = batch.map((item, localIndex) => processor(item, i + localIndex));
      results.push(...batchResults);

      setProgress({
        current: Math.min(i + batchSize, items.length),
        total: items.length,
        phase
      });

      // Yield to UI between batches
      await new Promise(resolve => requestAnimationFrame(resolve));
    }

    return results;
  };

  const handleLichessImport = async (mode: 'master' | 'user') => {
    const username = lichessUsername.trim();

    if (!username) {
      const msg = 'Please enter a Lichess username';
      Alert.alert('Error', msg);
      return;
    }

    setIsImportingLichess(true);
    setProgress({ current: 0, total: 0, phase: 'Fetching games from Lichess...' });

    try {
      console.log('[ImportPGN] Fetching games for username:', username);

      // Both targets take the same controls now: the username is entered here rather than
      // read from a global setting, so one account is not silently assumed to be yours.
      const max = parseInt(masterGameCount, 10) || 50;
      const daysBack = parseInt(masterDaysBack, 10) || 0;
      const pgns = mode === 'master'
        ? await LichessService.fetchMasterGames(username, max, daysBack || undefined)
        : await LichessService.fetchUserGames(username, max, daysBack || undefined);

      if (pgns.length === 0) {
        Alert.alert('No Games', `No games found for user "${username}"`);
        setIsImportingLichess(false);
        return;
      }

      console.log('[ImportPGN] Fetched', pgns.length, 'PGNs from Lichess');

      const combinedPgn = pgns.join('\n\n');

      setIsImporting(true);
      const imported = await handleImport(combinedPgn);
      if (!imported) return;

      Alert.alert('Success', `Imported ${pgns.length} games from ${username}`);
      if (mode === 'master') setLichessUsername('');
    } catch (error: any) {
      console.error('[ImportPGN] Lichess import error:', error);
      Alert.alert('Import Error', error?.message || String(error));
    } finally {
      setIsImportingLichess(false);
      setIsImporting(false);
    }
  };

  const handleLichessStudyImport = async () => {
    const studyId = LichessService.parseStudyId(lichessStudyUrl);
    if (!studyId) {
      Alert.alert('Invalid Study', 'Please enter a valid Lichess study URL or ID.');
      return;
    }

    setIsImportingLichess(true);
    setProgress({ current: 0, total: 0, phase: 'Fetching study from Lichess...' });

    try {
      const pgn = await LichessService.fetchStudyPGN(studyId);

      setIsImporting(true);
      const imported = await handleImport(pgn);
      if (!imported) return;

      setLichessStudyUrl('');
    } catch (error: any) {
      console.error('[ImportPGN] Lichess study import error:', error);
      Alert.alert('Import Error', error?.message || String(error));
    } finally {
      setIsImportingLichess(false);
      setIsImporting(false);
    }
  };

  const handleCancelImport = () => {
    cancelRequestedRef.current = true;
    setProgress(p => ({ ...p, phase: 'Cancelling...' }));
  };

  const handleImport = async (textOverride?: string): Promise<boolean> => {
    // Ensure textOverride is a string (not an event object from button press)
    const text = (typeof textOverride === 'string' ? textOverride : pgnText);
    if (!text || !text.trim()) {
      Alert.alert('Error', 'Please enter or select a PGN');
      return false;
    }

    setIsImporting(true);
    setProgress({ current: 0, total: 0, phase: 'Parsing PGN...' });

    cancelRequestedRef.current = false;
    deadlineRef.current = Date.now() + IMPORT_TIMEOUT_MS;

    try {
      console.log('Starting PGN import, target:', target);
      console.log('PGN text length:', text.length);

      const games = PGNService.parseMultipleGames(text);
      console.log('Parsed games:', games.length);

      setProgress({ current: 0, total: games.length, phase: `Processing ${games.length} games...` });

      if (games.length === 0) {
        Alert.alert('Error', 'No valid games found in PGN');
        setIsImporting(false);
        return false;
      }

      if (target === 'repertoire') {
        if (!name.trim()) {
          Alert.alert('Error', 'Please enter a repertoire name');
          setIsImporting(false);
          setFileSelected(false);
          return false;
        }

        if (chessableMode) {
          // Chessable import: merge variations into chapters
          setProgress({ current: 0, total: 0, phase: 'Grouping chapters...' });
          const { chapters: grouped, modelGames } = PGNService.processChessableRepertoire(games);

          // Built now, written only once the chapter loop below has finished:
          // an abort partway through must not leave these behind.
          const modelMasterGames = modelGames.map(g => ({
            id: generateId(),
            ...PGNService.toUserGame(g),
            pgn: PGNService.toPGNString(g),
            importedAt: new Date(),
          }));

          const groupEntries = Array.from(grouped.entries());
          const chapters = [];
          let chapterOrder = 0;

          if (chessableDirectMode) {
            // Direct mode: merge mainlines per group (one chapter per white name),
            // keeping only the intended trainable line without sub-variations.
            for (let gi = 0; gi < groupEntries.length; gi++) {
              const [groupName, groupGames] = groupEntries[gi];
              setProgress({
                current: gi + 1,
                total: groupEntries.length,
                phase: `Processing group ${gi + 1} of ${groupEntries.length}...`,
              });

              throwIfAborted();
              const standardGames = groupGames.filter(g => !g.headers.FEN);
              const customFenGames = groupGames.filter(g => g.headers.FEN);

              if (standardGames.length > 0) {
                const tree = new MoveTree();
                for (const game of standardGames) {
                  PGNService.mergeMainlineIntoTree(game, tree);
                }
                chapters.push({
                  id: generateId(),
                  name: groupName,
                  pgn: '',
                  moveTree: tree.toJSON(),
                  order: chapterOrder++,
                  createdAt: new Date(),
                  updatedAt: new Date(),
                });
              }

              const fenGroups = new Map<string, typeof customFenGames>();
              for (const game of customFenGames) {
                const fen = game.headers.FEN!;
                const group = fenGroups.get(fen);
                if (group) { group.push(game); } else { fenGroups.set(fen, [game]); }
              }
              for (const [fen, fenGames] of fenGroups) {
                const tree = new MoveTree(fen);
                for (const game of fenGames) {
                  PGNService.mergeMainlineIntoTree(game, tree);
                }
                chapters.push({
                  id: generateId(),
                  name: groupName,
                  pgn: '',
                  moveTree: tree.toJSON(),
                  order: chapterOrder++,
                  createdAt: new Date(),
                  updatedAt: new Date(),
                });
              }

              await new Promise(resolve => requestAnimationFrame(resolve));
            }
          } else {
            // Merge mode: merge variations into chapters, splitting by starting FEN.
            // Games with standard starting position merge together;
            // games with a custom FEN become separate chapters.
            for (let gi = 0; gi < groupEntries.length; gi++) {
              const [groupName, groupGames] = groupEntries[gi];
              setProgress({
                current: gi + 1,
                total: groupEntries.length,
                phase: `Merging chapter ${gi + 1} of ${groupEntries.length}...`,
              });

              throwIfAborted();
              // Split into standard-start games and custom-FEN games
              const standardGames = groupGames.filter(g => !g.headers.FEN);
              const customFenGames = groupGames.filter(g => g.headers.FEN);

              // Merge standard-start games into one chapter
              if (standardGames.length > 0) {
                const tree = new MoveTree();
                for (const game of standardGames) {
                  PGNService.mergeGameIntoTree(game, tree);
                }
                chapters.push({
                  id: generateId(),
                  name: groupName,
                  pgn: '',
                  moveTree: tree.toJSON(),
                  order: chapterOrder++,
                  createdAt: new Date(),
                  updatedAt: new Date(),
                });
              }

              // Group custom-FEN games by their FEN, merge games sharing the same start position
              const fenGroups = new Map<string, typeof customFenGames>();
              for (const game of customFenGames) {
                const fen = game.headers.FEN!;
                const group = fenGroups.get(fen);
                if (group) { group.push(game); } else { fenGroups.set(fen, [game]); }
              }
              for (const [fen, fenGames] of fenGroups) {
                const tree = new MoveTree(fen);
                for (const game of fenGames) {
                  PGNService.mergeGameIntoTree(game, tree);
                }
                chapters.push({
                  id: generateId(),
                  name: groupName,
                  pgn: '',
                  moveTree: tree.toJSON(),
                  order: chapterOrder++,
                  createdAt: new Date(),
                  updatedAt: new Date(),
                });
              }

              // Yield to UI between groups
              await new Promise(resolve => requestAnimationFrame(resolve));
            }
          }

          const classification = OpeningClassifier.classifyRepertoire(
            games,
            g => PGNService.toUserGame(g).moves,
            g => PGNService.getECO(g),
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

          throwIfAborted();
          setProgress({ current: chapters.length, total: chapters.length, phase: 'Saving repertoire...' });
          if (modelMasterGames.length > 0) await addMasterGames(modelMasterGames);
          await addRepertoire(repertoire);

          setIsImporting(false);
          setFileSelected(false);
          navigation.goBack();

        } else {
          // Standard import: 1 game = 1 chapter
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

          const classification = OpeningClassifier.classifyRepertoire(
            games,
            g => PGNService.toUserGame(g).moves,
            g => PGNService.getECO(g),
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

          throwIfAborted();
          setProgress({ current: chapters.length, total: chapters.length, phase: 'Saving repertoire...' });
          await addRepertoire(repertoire);

          setIsImporting(false);
          setFileSelected(false);
          navigation.goBack();
        }

      } else if (target === 'my-games') {
        // Process user games in batches
        const userGames = await processBatch(games, 50, (g) => ({
          id: generateId(),
          ...PGNService.toUserGame(g),
          pgn: PGNService.toPGNString(g),
          importedAt: new Date(),
        }), 'Processing user games');

        throwIfAborted();
        setProgress({ current: userGames.length, total: userGames.length, phase: 'Saving games...' });
        await addUserGames(userGames);

        setIsImporting(false);
        setFileSelected(false);

        // Auto-navigate back
        navigation.goBack();

      } else if (target === 'master-games') {
        // Process master games in batches
        const masterGames = await processBatch(games, 50, (g) => ({
          id: generateId(),
          ...PGNService.toUserGame(g),
          pgn: PGNService.toPGNString(g),
          importedAt: new Date(),
        }), 'Processing master games');

        throwIfAborted();
        setProgress({ current: masterGames.length, total: masterGames.length, phase: 'Saving games...' });
        await addMasterGames(masterGames);

        setIsImporting(false);
        setFileSelected(false);

        // Auto-navigate back
        navigation.goBack();
      }
    } catch (error: any) {
      setIsImporting(false);
      setFileSelected(false);

      if (error instanceof ImportAbortedError) {
        console.log('[ImportPGN] Import aborted:', error.reason);
        Alert.alert(
          error.reason === 'cancelled' ? 'Import Cancelled' : 'Import Timed Out',
          error.reason === 'cancelled'
            ? 'The import was cancelled. Nothing was saved.'
            : `The import ran longer than ${IMPORT_TIMEOUT_MS / 60000} minutes and was stopped. Nothing was saved - try importing a smaller file.`
        );
        return false;
      }

      console.error('Import error:', error);
      const errorMessage = error?.message || String(error);
      Alert.alert(
        'Import Failed',
        `Failed to parse PGN. Please ensure the file contains valid chess notation. Nothing was saved.\n\nError: ${errorMessage}`
      );
      return false;
    } finally {
      cancelRequestedRef.current = false;
      deadlineRef.current = 0;
    }
    return true;
  };

  const getTitle = () => {
    switch (target) {
      case 'repertoire': return 'Import Repertoire';
      case 'my-games': return 'Import My Games';
      case 'master-games': return 'Import Master Games';
    }
  };

  /**
   * Import a prebuilt opening book (.kbook).
   *
   * Deliberately does NOT go through readFileWithTimeout: a book is a 100MB+ SQLite file
   * and reading one into a JS string is the exact failure this format exists to avoid.
   * The file is copied and opened, never parsed.
   */
  const handleBookImport = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets || result.assets.length === 0) return;

      const file = result.assets[0];
      setIsImportingBook(true);
      const suggested = (file.name || '').replace(/\.kbook$/i, '');
      const record = await BookService.importBook(file.uri, suggested);
      setIsImportingBook(false);

      const summary = [
        record.name,
        '',
        `${record.gameCount.toLocaleString()} games`,
        `${record.positionCount.toLocaleString()} positions indexed`,
        `${(record.sizeBytes / 1048576).toFixed(0)} MB`,
        ...(record.hasGames ? [] : ['', 'Counts only - individual games are not included.']),
      ].join('\n');

      Alert.alert('Book Imported', summary, [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (error: any) {
      setIsImportingBook(false);
      const message = error instanceof BookImportError
        ? bookErrorMessage(error)
        : `The book could not be imported: ${error?.message ?? error}`;
      Alert.alert('Import Failed', message);
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
          <TouchableOpacity
            style={styles.cancelImportButton}
            onPress={handleCancelImport}
            activeOpacity={0.7}
          >
            <Text style={styles.cancelImportText}>Cancel Import</Text>
          </TouchableOpacity>
          <Text style={styles.cancelImportHint}>Cancelling discards the import - nothing is saved.</Text>
        </View>
      )}

      {!isImporting && !fileSelected && !isImportingLichess && (
        <>
          {/* Lichess import (Master Games) */}
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
              <View style={styles.inlineRow}>
                <View style={styles.inlineField}>
                  <Text style={styles.label}>Game count</Text>
                  <TextInput
                    style={styles.input}
                    value={masterGameCount}
                    onChangeText={setMasterGameCount}
                    placeholder="50"
                    placeholderTextColor="#666"
                    keyboardType="numeric"
                  />
                </View>
                <View style={styles.inlineField}>
                  <Text style={styles.label}>Days back (0 = all time)</Text>
                  <TextInput
                    style={styles.input}
                    value={masterDaysBack}
                    onChangeText={setMasterDaysBack}
                    placeholder="0"
                    placeholderTextColor="#666"
                    keyboardType="numeric"
                  />
                </View>
              </View>
              <TouchableOpacity
                style={[styles.lichessButton, (!lichessUsername.trim() || isImportingLichess) && styles.buttonDisabled]}
                onPress={() => handleLichessImport('master')}
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

              {/* A book is a prebuilt frequency index, not games to parse — a corpus far
                  too large to import as PGN arrives this way instead. */}
              <Text style={styles.sectionTitle}>Opening Book</Text>
              <Text style={styles.bookHint}>
                A book is a move-frequency index over a whole account — far more games than
                can be imported one by one. Its moves join the Master arrows on the board.
              </Text>
              <TouchableOpacity
                style={styles.lichessButton}
                onPress={() => navigation.navigate('BuildBook')}
              >
                <Text style={styles.buttonText}>Build From Account…</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.secondaryButton, isImportingBook && styles.buttonDisabled]}
                onPress={handleBookImport}
                disabled={isImportingBook}
              >
                <Text style={styles.buttonText}>
                  {isImportingBook ? 'Importing book…' : 'Import .kbook File'}
                </Text>
              </TouchableOpacity>

              <View style={styles.divider}>
                <View style={styles.dividerLine} />
                <Text style={styles.dividerText}>OR</Text>
                <View style={styles.dividerLine} />
              </View>
            </View>
          )}

          {/* Lichess import (My Games) */}
          {target === 'my-games' && (
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
              <View style={styles.inlineRow}>
                <View style={styles.inlineField}>
                  <Text style={styles.label}>Game count</Text>
                  <TextInput
                    style={styles.input}
                    value={masterGameCount}
                    onChangeText={setMasterGameCount}
                    placeholder="50"
                    placeholderTextColor="#666"
                    keyboardType="numeric"
                  />
                </View>
                <View style={styles.inlineField}>
                  <Text style={styles.label}>Days back (0 = all time)</Text>
                  <TextInput
                    style={styles.input}
                    value={masterDaysBack}
                    onChangeText={setMasterDaysBack}
                    placeholder="0"
                    placeholderTextColor="#666"
                    keyboardType="numeric"
                  />
                </View>
              </View>
              <TouchableOpacity
                style={[styles.lichessButton, (!lichessUsername.trim() || isImportingLichess) && styles.buttonDisabled]}
                onPress={() => handleLichessImport('user')}
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

              {/* Chessable mode toggle */}
              <TouchableOpacity
                style={styles.chessableToggle}
                onPress={() => {
                  if (chessableMode) setChessableDirectMode(false);
                  setChessableMode(!chessableMode);
                }}
                activeOpacity={0.7}
              >
                <View style={[styles.checkbox, chessableMode && styles.checkboxActive]}>
                  {chessableMode && <Text style={styles.checkmark}>✓</Text>}
                </View>
                <Text style={styles.chessableLabel}>Chessable import (merge variations)</Text>
              </TouchableOpacity>

              {chessableMode && (
                <TouchableOpacity
                  style={[styles.chessableToggle, { marginTop: 8, marginLeft: 32 }]}
                  onPress={() => setChessableDirectMode(!chessableDirectMode)}
                  activeOpacity={0.7}
                >
                  <View style={[styles.checkbox, chessableDirectMode && styles.checkboxActive]}>
                    {chessableDirectMode && <Text style={styles.checkmark}>✓</Text>}
                  </View>
                  <Text style={styles.chessableLabel}>Direct variations (mainlines only, merged by name)</Text>
                </TouchableOpacity>
              )}
            </>
          )}

          {/* Lichess Study Import */}
          <View style={styles.lichessSection}>
            <Text style={styles.sectionTitle}>Import from Lichess Study</Text>
            <TextInput
              style={styles.input}
              value={lichessStudyUrl}
              onChangeText={setLichessStudyUrl}
              placeholder="Lichess study URL or ID"
              placeholderTextColor="#666"
              autoCapitalize="none"
              autoCorrect={false}
            />
            <TouchableOpacity
              style={[styles.lichessButton, (!lichessStudyUrl.trim() || isImportingLichess) && styles.buttonDisabled]}
              onPress={handleLichessStudyImport}
              disabled={!lichessStudyUrl.trim() || isImportingLichess}
            >
              <Text style={styles.buttonText}>
                {isImportingLichess ? 'Importing Study...' : 'Import Study'}
              </Text>
            </TouchableOpacity>
            <View style={styles.divider}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>OR</Text>
              <View style={styles.dividerLine} />
            </View>
          </View>

          <TouchableOpacity
            style={[styles.button, (isImporting || fileSelected) && styles.buttonDisabled]}
            onPress={handleFilePick}
            disabled={isImporting || fileSelected}
          >
            <Text style={styles.buttonText}>Select PGN File</Text>
          </TouchableOpacity>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  cancelImportButton: {
    marginTop: 18,
    paddingVertical: 10,
    paddingHorizontal: 24,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#a33',
  },
  cancelImportText: {
    color: '#e06666',
    fontSize: 15,
    fontWeight: '600',
  },
  cancelImportHint: {
    color: '#888',
    fontSize: 12,
    marginTop: 8,
    textAlign: 'center',
  },
  container: {
    flex: 1,
    padding: 10,
    backgroundColor: '#2c2c2c',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#e0e0e0',
    marginBottom: 12,
  },
  input: {
    backgroundColor: '#3a3a3a',
    borderRadius: 8,
    padding: 12,
    color: '#e0e0e0',
    marginBottom: 10,
    fontSize: 16,
  },
  label: {
    color: '#e0e0e0',
    fontSize: 14,
    marginBottom: 8,
  },
  colorToggle: {
    marginBottom: 10,
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
    marginBottom: 10,
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
    marginBottom: 10,
  },
  importButton: {
    backgroundColor: '#34C759',
    padding: 14,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 24,
  },
  loadingContainer: {
    padding: 20,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 200,
  },
  loadingPhase: {
    color: '#4a9eff',
    fontSize: 16,
    fontWeight: '600',
    marginTop: 10,
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
    marginBottom: 16,
    padding: 10,
    backgroundColor: '#3a3a3a',
    borderRadius: 8,
  },
  sectionTitle: {
    color: '#e0e0e0',
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 8,
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
    marginTop: 16,
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
  secondaryButton: {
    backgroundColor: '#2c2c2e',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  bookHint: {
    color: '#888',
    fontSize: 12,
    lineHeight: 17,
    marginBottom: 10,
  },
  inlineRow: {
    flexDirection: 'row',
    gap: 12,
  },
  inlineField: {
    flex: 1,
  },
  chessableToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    paddingVertical: 8,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: '#666',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  checkboxActive: {
    backgroundColor: '#007AFF',
    borderColor: '#007AFF',
  },
  checkmark: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  chessableLabel: {
    color: '#e0e0e0',
    fontSize: 14,
  },
});
