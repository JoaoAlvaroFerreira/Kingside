import React, { useState, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  TextInput,
  Platform,
  Alert,
} from 'react-native';
import { useStore } from '@store';
import { LineSelection, LineOrder, Guidance, RepertoireColor } from '@types';
import { LineExtractor } from '@services/training/LineExtractor';

/** Mistake rate at or above which a line is reported as one you are struggling with. */
const WEAK_LINE_THRESHOLD = 0.3;

const SELECTION_OPTIONS: Array<{ value: LineSelection['kind']; label: string; hint: string }> = [
  {
    value: 'all',
    label: 'Everything',
    hint: 'Every line in the selected chapters, due or not.',
  },
  {
    value: 'due',
    label: 'Due for review',
    hint: 'Only what the scheduler is asking for today.',
  },
  {
    value: 'recommended',
    label: 'Recommended',
    hint: 'Lines you get wrong most often first, then material you have never drilled.',
  },
];

/** Only offered once the Analysis Board has handed over a position. */
const FROM_POSITION_OPTION = {
  value: 'from-position' as const,
  label: 'From position',
  hint: 'Only lines that reach the position you came from, each starting there.',
};

const ORDER_OPTIONS: Array<{ value: LineOrder; label: string; hint: string }> = [
  {
    value: 'depth-first',
    label: 'Depth-first',
    hint: 'Finish one line to its end before starting the next.',
  },
  {
    value: 'width-first',
    label: 'Width-first',
    hint: 'Drill every line a few moves deep, then go deeper on all of them.',
  },
  {
    value: 'random',
    label: 'Random',
    hint: 'Shuffle the whole pool, then drill each line to its end.',
  },
];

const GUIDANCE_OPTIONS: Array<{ value: Guidance; label: string; hint: string }> = [
  {
    value: 'none',
    label: 'None',
    hint: 'No help. This is the one that actually tests recall.',
  },
  {
    value: 'learn',
    label: 'Learn',
    hint: 'Shows the move arrow and any chapter comment before you play.',
  },
  {
    value: 'semi-learn',
    label: 'Semi-learn',
    hint: 'Teaches each move once. The arrow stops after you play it correctly, and comes back if you later get it wrong.',
  },
];

interface TrainingDashboardScreenProps {
  navigation: any;
  route?: { params?: { fromFen?: string } };
}

export default function TrainingDashboardScreen({ navigation, route }: TrainingDashboardScreenProps) {
  // Handed over by "Drill from here" on the Analysis Board. The repertoire is still picked
  // here, because a position usually appears in several of them.
  const fromFen = route?.params?.fromFen;
  const repertoires = useStore(s => s.repertoires);
  const lineStats = useStore(s => s.lineStats);

  const [selectedColor, setSelectedColor] = useState<RepertoireColor | null>(null);
  const [selectedRepertoireId, setSelectedRepertoireId] = useState<string | null>(null);
  const [selectedChapterIds, setSelectedChapterIds] = useState<string[]>([]);
  const [selectionKind, setSelectionKind] = useState<LineSelection['kind']>(fromFen ? 'from-position' : 'all');
  const [order, setOrder] = useState<LineOrder>('depth-first');
  const [guidance, setGuidance] = useState<Guidance>('none');
  const [maxDepth, setMaxDepth] = useState<string>('');
  const [opponentBranchingOnly, setOpponentBranchingOnly] = useState(false);

  useEffect(() => {
    if (fromFen) setSelectionKind('from-position');
  }, [fromFen]);

  // Colour first, then the repertoires of that colour. A flat horizontal strip of every
  // repertoire meant sideways-scrolling past ten of them to reach the one you wanted.
  const repertoiresOfColor = useMemo(
    () => (selectedColor ? repertoires.filter(r => r.color === selectedColor) : []),
    [repertoires, selectedColor]
  );
  const selectionOptions = useMemo(
    () => (fromFen ? [...SELECTION_OPTIONS, FROM_POSITION_OPTION] : SELECTION_OPTIONS),
    [fromFen]
  );
  const colorCounts = useMemo(() => ({
    white: repertoires.filter(r => r.color === 'white').length,
    black: repertoires.filter(r => r.color === 'black').length,
  }), [repertoires]);

  // Get selected repertoire
  const selectedRepertoire = useMemo(
    () => repertoires.find(r => r.id === selectedRepertoireId) ?? null,
    [repertoires, selectedRepertoireId]
  );

  // Calculate stats for selected repertoire
  const stats = useMemo(() => {
    if (!selectedRepertoire) {
      return { totalLines: 0, linesDue: 0, linesLearned: 0, completionPercent: 0, weakLines: 0, unseenLines: 0 };
    }

    // Extract all lines from selected chapters
    const chapters = selectedChapterIds.length > 0
      ? selectedRepertoire.chapters.filter(ch => selectedChapterIds.includes(ch.id))
      : selectedRepertoire.chapters;

    let allLines = 0;
    for (const chapter of chapters) {
      const lines = LineExtractor.extractLines(
        chapter.moveTree,
        selectedRepertoire.id,
        chapter.id,
        selectedRepertoire.color,
        maxDepth ? parseInt(maxDepth, 10) * 2 : undefined,
        opponentBranchingOnly
      );
      allLines += LineExtractor.filterLinesWithUserMoves(lines).length;
    }

    // Count due and learned lines
    const relevantStats = lineStats.filter(stat => {
      const isRepertoireMatch = stat.repertoireId === selectedRepertoire.id;
      const isChapterMatch = selectedChapterIds.length === 0 || selectedChapterIds.includes(stat.chapterId);
      return isRepertoireMatch && isChapterMatch;
    });

    const now = new Date();
    const linesDue = relevantStats.filter(stat => new Date(stat.nextReviewDate) <= now).length;
    const linesLearned = relevantStats.filter(stat => stat.totalDrills > 0).length;
    const completionPercent = allLines > 0 ? Math.round((linesLearned / allLines) * 100) : 0;

    // What "Recommended" would put in front of you: lines you keep getting wrong, and
    // lines you have never drilled at all.
    const weakLines = relevantStats.filter(
      stat => stat.totalDrills > 0 && stat.mistakeCount / stat.totalDrills >= WEAK_LINE_THRESHOLD
    ).length;
    const unseenLines = Math.max(0, allLines - linesLearned);

    return { totalLines: allLines, linesDue, linesLearned, completionPercent, weakLines, unseenLines };
  }, [selectedRepertoire, selectedChapterIds, maxDepth, lineStats, opponentBranchingOnly]);

  const handleStartSession = () => {
    if (!selectedRepertoire) {
      const msg = 'Please select a repertoire';
      if (Platform.OS === 'web') {
        window.alert(msg);
      } else {
        Alert.alert('Error', msg);
      }
      return;
    }

    if (stats.totalLines === 0) {
      const msg = 'No lines available for training';
      if (Platform.OS === 'web') {
        window.alert(msg);
      } else {
        Alert.alert('Error', msg);
      }
      return;
    }

    navigation.navigate('TrainingSession', {
      repertoireId: selectedRepertoire.id,
      chapterIds: selectedChapterIds.length > 0 ? selectedChapterIds : undefined,
      selection: (selectionKind === 'from-position' && fromFen
        ? { kind: 'from-position', fen: fromFen }
        : { kind: selectionKind }) as LineSelection,
      order,
      guidance,
      maxDepth: maxDepth ? parseInt(maxDepth, 10) * 2 : undefined,
      opponentBranchingOnly,
    });
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      <Text style={styles.title}>Training Dashboard</Text>

      {/* Repertoire Selector — colour first, then that colour's repertoires */}
      <View style={styles.section}>
        <Text style={styles.label}>Select Repertoire</Text>
        <View style={styles.colorRow}>
          {(['white', 'black'] as const).map(color => (
            <TouchableOpacity
              key={color}
              style={[styles.colorButton, selectedColor === color && styles.colorButtonSelected]}
              onPress={() => {
                setSelectedColor(color);
                setSelectedRepertoireId(null);
                setSelectedChapterIds([]);
              }}
            >
              <Text
                style={[styles.colorButtonText, selectedColor === color && styles.colorButtonTextSelected]}
              >
                {color === 'white' ? 'White' : 'Black'} ({colorCounts[color]})
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {selectedColor && (
          <View style={styles.repertoireList}>
            {repertoiresOfColor.length === 0 && (
              <Text style={styles.emptyHint}>No {selectedColor} repertoires yet</Text>
            )}
            {repertoiresOfColor.map(rep => {
              const isSelected = selectedRepertoireId === rep.id;
              return (
                <TouchableOpacity
                  key={rep.id}
                  style={[styles.repertoireItem, isSelected && styles.repertoireItemSelected]}
                  onPress={() => {
                    setSelectedRepertoireId(rep.id);
                    setSelectedChapterIds([]);
                  }}
                >
                  <View style={[styles.radio, isSelected && styles.radioSelected]} />
                  <Text style={styles.repertoireItemText} numberOfLines={1}>{rep.name}</Text>
                  <Text style={styles.repertoireItemMeta}>{rep.chapters.length}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </View>

      {/* Chapter Selector */}
      {selectedRepertoire && (
        <View style={styles.section}>
          <View style={styles.chapterHeader}>
            <Text style={styles.label}>Chapters</Text>
            <Text style={styles.chapterSelection}>
              {selectedChapterIds.length === 0
                ? 'All'
                : `${selectedChapterIds.length} selected`}
            </Text>
          </View>
          <ScrollView style={styles.chapterList} nestedScrollEnabled>
            {selectedRepertoire.chapters.map(ch => {
              const isSelected = selectedChapterIds.includes(ch.id);
              return (
                <TouchableOpacity
                  key={ch.id}
                  style={styles.chapterItem}
                  onPress={() => {
                    setSelectedChapterIds(prev =>
                      isSelected ? prev.filter(id => id !== ch.id) : [...prev, ch.id]
                    );
                  }}
                >
                  <View style={[styles.checkbox, isSelected && styles.checkboxSelected]}>
                    {isSelected && <Text style={styles.checkmark}>✓</Text>}
                  </View>
                  <Text style={styles.chapterItemText} numberOfLines={2}>{ch.name}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      )}

      {/* Mode Selection */}
      <View style={styles.section}>
        <Text style={styles.label}>What to drill</Text>
        <View style={styles.radioGroup}>
          {selectionOptions.map(opt => (
            <TouchableOpacity
              key={opt.value}
              style={styles.radioOption}
              onPress={() => setSelectionKind(opt.value)}
            >
              <View style={[styles.radio, selectionKind === opt.value && styles.radioSelected]} />
              <Text style={styles.radioText}>{opt.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <Text style={styles.checkboxHint}>
          {selectionOptions.find(o => o.value === selectionKind)?.hint}
        </Text>
      </View>

      {/* Order */}
      <View style={styles.section}>
        <Text style={styles.label}>Order</Text>
        <View style={styles.radioGroup}>
          {ORDER_OPTIONS.map(opt => (
            <TouchableOpacity
              key={opt.value}
              style={styles.radioOption}
              onPress={() => setOrder(opt.value)}
            >
              <View style={[styles.radio, order === opt.value && styles.radioSelected]} />
              <Text style={styles.radioText}>{opt.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <Text style={styles.checkboxHint}>
          {ORDER_OPTIONS.find(o => o.value === order)?.hint}
        </Text>
      </View>

      {/* Guidance */}
      <View style={styles.section}>
        <Text style={styles.label}>Guidance</Text>
        <View style={styles.radioGroup}>
          {GUIDANCE_OPTIONS.map(opt => (
            <TouchableOpacity
              key={opt.value}
              style={styles.radioOption}
              onPress={() => setGuidance(opt.value)}
            >
              <View style={[styles.radio, guidance === opt.value && styles.radioSelected]} />
              <Text style={styles.radioText}>{opt.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <Text style={styles.checkboxHint}>
          {GUIDANCE_OPTIONS.find(o => o.value === guidance)?.hint}
        </Text>
      </View>

      {/* Max Moves */}
      <View style={styles.section}>
        <Text style={styles.label}>Max Full Moves (Optional)</Text>
        <TextInput
          style={styles.input}
          value={maxDepth}
          onChangeText={setMaxDepth}
          placeholder="Leave empty for no limit"
          keyboardType="numeric"
          placeholderTextColor="#999"
        />
      </View>

      {/* Pool filters */}
      <View style={styles.section}>
        <TouchableOpacity
          style={styles.checkboxRow}
          onPress={() => setOpponentBranchingOnly(!opponentBranchingOnly)}
        >
          <View style={[styles.checkbox, opponentBranchingOnly && styles.checkboxSelected]}>
            {opponentBranchingOnly && <Text style={styles.checkmark}>✓</Text>}
          </View>
          <Text style={styles.checkboxLabel}>Main line only for my moves</Text>
        </TouchableOpacity>
        <Text style={styles.checkboxHint}>
          When it is your turn, drill only the main line — you are not quizzed on every alternative you
          could have chosen. Opponent moves still branch into all their tries. Fewer, more focused lines.
        </Text>
      </View>

      {/* Stats */}
      {selectedRepertoire && (
        <View style={styles.statsContainer}>
          <Text style={styles.statsTitle}>Statistics</Text>
          <View style={styles.statRow}>
            <Text style={styles.statLabel}>Total Lines:</Text>
            <Text style={styles.statValue}>{stats.totalLines}</Text>
          </View>
          <View style={styles.statRow}>
            <Text style={styles.statLabel}>Lines Due:</Text>
            <Text style={styles.statValue}>{stats.linesDue}</Text>
          </View>
          <View style={styles.statRow}>
            <Text style={styles.statLabel}>Lines Learned:</Text>
            <Text style={styles.statValue}>{stats.linesLearned}</Text>
          </View>
          <View style={styles.statRow}>
            <Text style={styles.statLabel}>Struggling With:</Text>
            <Text style={[styles.statValue, stats.weakLines > 0 && styles.statValueWarn]}>
              {stats.weakLines}
            </Text>
          </View>
          <View style={styles.statRow}>
            <Text style={styles.statLabel}>Never Drilled:</Text>
            <Text style={styles.statValue}>{stats.unseenLines}</Text>
          </View>
          <View style={styles.statRow}>
            <Text style={styles.statLabel}>Completion:</Text>
            <Text style={styles.statValue}>{stats.completionPercent}%</Text>
          </View>
        </View>
      )}

      {/* Start Button */}
      <TouchableOpacity
        style={[styles.startButton, !selectedRepertoire && styles.startButtonDisabled]}
        onPress={handleStartSession}
        disabled={!selectedRepertoire}
      >
        <Text style={styles.startButtonText}>Start Training Session</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1e1e1e',
  },
  contentContainer: {
    padding: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 20,
  },
  section: {
    marginBottom: 20,
  },
  label: {
    fontSize: 16,
    color: '#fff',
    marginBottom: 10,
    fontWeight: '600',
  },
  colorRow: {
    flexDirection: 'row',
    gap: 10,
  },
  colorButton: {
    flex: 1,
    backgroundColor: '#2a2a2a',
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#444',
    alignItems: 'center',
  },
  colorButtonSelected: {
    backgroundColor: '#4a9eff',
    borderColor: '#4a9eff',
  },
  colorButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  colorButtonTextSelected: {
    color: '#fff',
  },
  repertoireList: {
    marginTop: 12,
    backgroundColor: '#1e1e1e',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#333',
  },
  repertoireItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  repertoireItemSelected: {
    backgroundColor: '#26364a',
  },
  repertoireItemText: {
    color: '#fff',
    fontSize: 15,
    flex: 1,
    marginLeft: 10,
  },
  repertoireItemMeta: {
    color: '#888',
    fontSize: 13,
    marginLeft: 8,
  },
  emptyHint: {
    color: '#888',
    fontSize: 14,
    padding: 14,
    fontStyle: 'italic',
  },
  chipRow: {
    flexDirection: 'row',
  },
  chip: {
    backgroundColor: '#2a2a2a',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    marginRight: 10,
    borderWidth: 1,
    borderColor: '#444',
  },
  chipSelected: {
    backgroundColor: '#4a9eff',
    borderColor: '#4a9eff',
  },
  chipText: {
    color: '#fff',
    fontSize: 14,
  },
  chipTextSelected: {
    color: '#fff',
    fontWeight: '600',
  },
  chapterHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  chapterSelection: {
    color: '#4a9eff',
    fontSize: 13,
  },
  chapterList: {
    backgroundColor: '#2a2a2a',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#444',
    maxHeight: 250,
  },
  chapterItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  chapterItemText: {
    color: '#fff',
    fontSize: 14,
    flex: 1,
    marginLeft: 10,
  },
  radioGroup: {
    flexDirection: 'row',
    // Wraps because these groups grow: four selections already overflow one row on a phone.
    flexWrap: 'wrap',
    rowGap: 10,
    columnGap: 20,
  },
  radioOption: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#666',
    marginRight: 8,
  },
  radioSelected: {
    borderColor: '#4a9eff',
    backgroundColor: '#4a9eff',
  },
  radioText: {
    color: '#fff',
    fontSize: 16,
  },
  input: {
    backgroundColor: '#2a2a2a',
    color: '#fff',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#444',
    fontSize: 16,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: '#666',
    marginRight: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxSelected: {
    backgroundColor: '#4a9eff',
    borderColor: '#4a9eff',
  },
  checkmark: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  checkboxLabel: {
    color: '#fff',
    fontSize: 16,
    flexShrink: 1,
  },
  checkboxHint: {
    color: '#9aa4b2',
    fontSize: 13,
    lineHeight: 18,
    marginLeft: 34,
    marginTop: 4,
  },
  statsContainer: {
    backgroundColor: '#2a2a2a',
    padding: 16,
    borderRadius: 8,
    marginBottom: 20,
  },
  statsTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 12,
  },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  statLabel: {
    color: '#bbb',
    fontSize: 16,
  },
  statValue: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  statValueWarn: {
    color: '#e8a87e',
  },
  startButton: {
    backgroundColor: '#4a9eff',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 10,
  },
  startButtonDisabled: {
    backgroundColor: '#444',
  },
  startButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
});
