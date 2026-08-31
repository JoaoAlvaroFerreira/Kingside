/**
 * BuildBookScreen - build an opening book from an online account, on the device.
 *
 * Replaces the desktop step: enter a username and filters, and the book is fetched,
 * replayed and aggregated here. Long builds are resumable at month granularity, so an
 * interrupted one offers to continue rather than start over.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet,
  Alert, ActivityIndicator, Switch,
} from 'react-native';
import { FetchSpec, GameSourceId, Speed, SPEEDS, FetchError, FetchCancelled } from '@types';
import { BookBuilder, BuildProgress, reviveSpec } from '@services/books/BookBuilder';
import { BookService, PendingBuild } from '@services/books/BookService';
import { BookRecord } from '@types';

const SOURCE_LABEL: Record<GameSourceId, string> = {
  chesscom: 'Chess.com',
  lichess: 'Lichess',
};

/** Speeds worth offering; ultrabullet and correspondence are rarely wanted for a book. */
const SPEED_LABEL: Record<Speed, string> = {
  ultrabullet: 'Ultra',
  bullet: 'Bullet',
  blitz: 'Blitz',
  rapid: 'Rapid',
  classical: 'Classical',
  correspondence: 'Daily',
};

interface Props {
  navigation: any;
  route?: { params?: { refreshBookId?: string } };
}

export default function BuildBookScreen({ navigation, route }: Props) {
  const refreshBookId = route?.params?.refreshBookId;
  const [source, setSource] = useState<GameSourceId>('chesscom');
  const [username, setUsername] = useState('');
  const [speeds, setSpeeds] = useState<Speed[]>(['bullet', 'blitz', 'rapid', 'classical']);
  const [ratedOnly, setRatedOnly] = useState(false);
  const [standardOnly, setStandardOnly] = useState(true);
  const [color, setColor] = useState<'white' | 'black' | undefined>(undefined);
  const [sinceYear, setSinceYear] = useState('');

  const [building, setBuilding] = useState(false);
  const [progress, setProgress] = useState<BuildProgress | null>(null);
  const [pending, setPending] = useState<PendingBuild | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    BookService.getPendingBuild().then(setPending);
  }, []);

  // Arriving with a book id means "top this one up", not "build a new one".
  useEffect(() => {
    if (!refreshBookId) return;
    let cancelled = false;
    BookService.listBooks().then(books => {
      const book = books.find(b => b.id === refreshBookId);
      if (book && !cancelled) runRefresh(book);
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshBookId]);

  const runRefresh = async (book: BookRecord) => {
    const controller = new AbortController();
    abortRef.current = controller;
    setBuilding(true);
    setProgress({ phase: 'Starting…', periodsDone: 0, periodsTotal: 0, games: 0, plies: 0 });

    try {
      const result = await BookBuilder.refresh(book, setProgress, controller.signal);
      setBuilding(false);
      Alert.alert(
        result.upToDate ? 'Already Up To Date' : 'Book Refreshed',
        result.upToDate
          ? `${book.name} already covers every month available.`
          : [
              book.name,
              '',
              `${result.months} new month${result.months === 1 ? '' : 's'}`,
              `${result.newGames.toLocaleString()} games added`,
              `${result.newPositions.toLocaleString()} new positions`,
              `${Math.round(result.seconds)}s`,
            ].join('\n'),
        [{ text: 'OK', onPress: () => navigation.goBack() }]
      );
    } catch (error: any) {
      setBuilding(false);
      if (error instanceof FetchCancelled) {
        // Finished months were marked as they completed, so the next refresh resumes here.
        Alert.alert('Refresh Paused', 'The months already fetched are kept in the book.');
        navigation.goBack();
        return;
      }
      Alert.alert(
        'Refresh Failed',
        error instanceof FetchError ? error.message : `${error?.message ?? error}`
      );
      navigation.goBack();
    }
  };

  const toggleSpeed = (speed: Speed) => {
    setSpeeds(current =>
      current.includes(speed) ? current.filter(s => s !== speed) : [...current, speed]
    );
  };

  const buildSpec = (): FetchSpec | null => {
    const name = username.trim();
    if (!name) {
      Alert.alert('Username Required', `Enter the ${SOURCE_LABEL[source]} account to build from.`);
      return null;
    }
    if (speeds.length === 0) {
      Alert.alert('No Speeds Selected', 'Pick at least one time control.');
      return null;
    }
    const year = parseInt(sinceYear, 10);
    if (sinceYear.trim() && (isNaN(year) || year < 2000 || year > new Date().getFullYear())) {
      Alert.alert('Invalid Year', 'Enter a four-digit year, or leave it blank for everything.');
      return null;
    }
    return {
      source,
      username: name,
      speeds,
      ratedOnly,
      standardOnly,
      color,
      since: sinceYear.trim() ? new Date(Date.UTC(year, 0, 1)) : undefined,
    };
  };

  const run = useCallback(async (spec: FetchSpec, displayName: string, resumeFile?: string) => {
    const controller = new AbortController();
    abortRef.current = controller;
    setBuilding(true);
    setProgress({ phase: 'Starting…', periodsDone: 0, periodsTotal: 0, games: 0, plies: 0 });

    try {
      const result = await BookBuilder.build(
        spec, displayName, setProgress, controller.signal, resumeFile
      );
      setBuilding(false);
      setPending(null);
      Alert.alert(
        'Book Built',
        [
          result.record.name,
          '',
          `${result.games.toLocaleString()} games`,
          `${result.positions.toLocaleString()} positions indexed`,
          `${(result.record.sizeBytes / 1048576).toFixed(0)} MB`,
          `${Math.round(result.seconds)}s`,
        ].join('\n'),
        [{ text: 'OK', onPress: () => navigation.goBack() }]
      );
    } catch (error: any) {
      setBuilding(false);
      if (error instanceof FetchCancelled) {
        // The file and its finished months survive, so this is a pause, not a loss.
        setPending(await BookService.getPendingBuild());
        Alert.alert('Build Paused', 'The months already finished are kept — you can resume.');
        return;
      }
      const message = error instanceof FetchError
        ? error.message
        : `The build failed: ${error?.message ?? error}`;
      Alert.alert('Build Failed', message);
      setPending(await BookService.getPendingBuild());
    }
  }, [navigation]);

  const handleBuild = () => {
    const spec = buildSpec();
    if (!spec) return;
    run(spec, spec.username);
  };

  const handleResume = () => {
    if (!pending) return;
    run(reviveSpec(pending.spec), pending.displayName, pending.fileName);
  };

  const handleDiscard = () => {
    Alert.alert('Discard Build?', 'The partially built book is deleted.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Discard',
        style: 'destructive',
        onPress: async () => {
          await BookService.discardPendingBuild();
          setPending(null);
        },
      },
    ]);
  };

  if (building) {
    const pct = progress && progress.periodsTotal
      ? Math.round((progress.periodsDone / progress.periodsTotal) * 100)
      : 0;
    return (
      <View style={styles.progressContainer}>
        <ActivityIndicator size="large" color="#4a9eff" />
        <Text style={styles.progressPhase}>{progress?.phase ?? 'Working…'}</Text>
        {!!progress?.periodsTotal && (
          <Text style={styles.progressMeta}>
            {progress.periodsDone} / {progress.periodsTotal} months ({pct}%)
          </Text>
        )}
        <Text style={styles.progressMeta}>
          {(progress?.games ?? 0).toLocaleString()} games · {(progress?.plies ?? 0).toLocaleString()} moves read
        </Text>
        <TouchableOpacity
          style={styles.cancelButton}
          onPress={() => abortRef.current?.abort()}
        >
          <Text style={styles.buttonText}>Pause</Text>
        </TouchableOpacity>
        <Text style={styles.hint}>
          Finished months are saved as they complete, so pausing loses nothing.
        </Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Build Opening Book</Text>
      <Text style={styles.subtitle}>
        Fetches an account&apos;s games and indexes what gets played from each position.
        Nothing is downloaded to your computer first.
      </Text>

      {!!pending && (
        <View style={styles.resumeCard}>
          <Text style={styles.resumeTitle}>Unfinished build</Text>
          <Text style={styles.resumeMeta}>
            {pending.displayName} — the months already done are kept.
          </Text>
          <View style={styles.row}>
            <TouchableOpacity style={styles.resumeButton} onPress={handleResume}>
              <Text style={styles.buttonText}>Resume</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.discardButton} onPress={handleDiscard}>
              <Text style={styles.buttonText}>Discard</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      <Text style={styles.label}>Source</Text>
      <View style={styles.row}>
        {(Object.keys(SOURCE_LABEL) as GameSourceId[]).map(id => (
          <TouchableOpacity
            key={id}
            style={[styles.chip, source === id && styles.chipActive]}
            onPress={() => setSource(id)}
          >
            <Text style={[styles.chipText, source === id && styles.chipTextActive]}>
              {SOURCE_LABEL[id]}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.label}>Username</Text>
      <TextInput
        style={styles.input}
        value={username}
        onChangeText={setUsername}
        placeholder={source === 'chesscom' ? 'DanielNaroditsky' : 'lichess username'}
        placeholderTextColor="#666"
        autoCapitalize="none"
        autoCorrect={false}
      />

      <Text style={styles.label}>Time controls</Text>
      <View style={styles.wrapRow}>
        {SPEEDS.map(speed => (
          <TouchableOpacity
            key={speed}
            style={[styles.chip, speeds.includes(speed) && styles.chipActive]}
            onPress={() => toggleSpeed(speed)}
          >
            <Text style={[styles.chipText, speeds.includes(speed) && styles.chipTextActive]}>
              {SPEED_LABEL[speed]}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.label}>Colour</Text>
      <View style={styles.row}>
        {([undefined, 'white', 'black'] as const).map(option => (
          <TouchableOpacity
            key={option ?? 'both'}
            style={[styles.chip, color === option && styles.chipActive]}
            onPress={() => setColor(option)}
          >
            <Text style={[styles.chipText, color === option && styles.chipTextActive]}>
              {option ? option[0].toUpperCase() + option.slice(1) : 'Both'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.switchRow}>
        <View style={styles.switchLabel}>
          <Text style={styles.label}>Rated only</Text>
        </View>
        <Switch value={ratedOnly} onValueChange={setRatedOnly}
          trackColor={{ false: '#3a3a3c', true: '#4a9eff' }} thumbColor="#fff" />
      </View>

      <View style={styles.switchRow}>
        <View style={styles.switchLabel}>
          <Text style={styles.label}>Standard chess only</Text>
          <Text style={styles.hint}>Excludes Chess960 and other variants</Text>
        </View>
        <Switch value={standardOnly} onValueChange={setStandardOnly}
          trackColor={{ false: '#3a3a3c', true: '#4a9eff' }} thumbColor="#fff" />
      </View>

      <Text style={styles.label}>From year (blank = everything)</Text>
      <TextInput
        style={styles.input}
        value={sinceYear}
        onChangeText={setSinceYear}
        placeholder="2023"
        placeholderTextColor="#666"
        keyboardType="numeric"
      />

      <TouchableOpacity style={styles.buildButton} onPress={handleBuild}>
        <Text style={styles.buttonText}>Build Book</Text>
      </TouchableOpacity>

      <Text style={styles.hint}>
        A few years of games takes a minute or two. A very large account can take
        considerably longer — it is fetched a month at a time and can be paused and resumed.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#121212' },
  content: { padding: 20, paddingBottom: 48 },
  title: { color: '#fff', fontSize: 24, fontWeight: '700', marginBottom: 6 },
  subtitle: { color: '#888', fontSize: 13, lineHeight: 19, marginBottom: 20 },
  label: { color: '#e0e0e0', fontSize: 15, fontWeight: '600', marginBottom: 8, marginTop: 12 },
  hint: { color: '#888', fontSize: 12, lineHeight: 17, marginTop: 8 },
  input: {
    backgroundColor: '#1c1c1e', color: '#fff', borderRadius: 8,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 15,
  },
  row: { flexDirection: 'row', gap: 8 },
  wrapRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20,
    backgroundColor: '#1c1c1e', borderWidth: 1, borderColor: '#2c2c2e',
  },
  chipActive: { backgroundColor: '#0a3d62', borderColor: '#4a9eff' },
  chipText: { color: '#888', fontSize: 14, fontWeight: '600' },
  chipTextActive: { color: '#fff' },
  switchRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginTop: 12,
  },
  switchLabel: { flex: 1, paddingRight: 12 },
  buildButton: {
    backgroundColor: '#27ae60', borderRadius: 8, paddingVertical: 16,
    alignItems: 'center', marginTop: 28,
  },
  cancelButton: {
    backgroundColor: '#8a6d3b', borderRadius: 8, paddingVertical: 14,
    paddingHorizontal: 40, marginTop: 28,
  },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  progressContainer: {
    flex: 1, backgroundColor: '#121212', alignItems: 'center',
    justifyContent: 'center', padding: 32,
  },
  progressPhase: { color: '#fff', fontSize: 17, fontWeight: '600', marginTop: 20, textAlign: 'center' },
  progressMeta: { color: '#888', fontSize: 14, marginTop: 8, textAlign: 'center' },
  resumeCard: {
    backgroundColor: '#1c1c1e', borderRadius: 8, padding: 16,
    borderLeftWidth: 3, borderLeftColor: '#f0ad4e', marginBottom: 12,
  },
  resumeTitle: { color: '#f0ad4e', fontSize: 15, fontWeight: '700', marginBottom: 4 },
  resumeMeta: { color: '#aaa', fontSize: 13, marginBottom: 12 },
  resumeButton: {
    backgroundColor: '#4a9eff', borderRadius: 6, paddingVertical: 10,
    paddingHorizontal: 24,
  },
  discardButton: {
    backgroundColor: '#3a1f1f', borderRadius: 6, paddingVertical: 10,
    paddingHorizontal: 24,
  },
});
