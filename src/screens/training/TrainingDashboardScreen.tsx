import React, { useState, useMemo } from 'react';
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
import { TrainingMode } from '@types';
import { LineExtractor } from '@services/training/LineExtractor';

interface TrainingDashboardScreenProps {
  navigation: any;
}

export default function TrainingDashboardScreen({ navigation }: TrainingDashboardScreenProps) {
  const repertoires = useStore(s => s.repertoires);
  const lineStats = useStore(s => s.lineStats);

  const [selectedRepertoireId, setSelectedRepertoireId] = useState<string | null>(null);
  const [selectedChapterIds, setSelectedChapterIds] = useState<string[]>([]);
  const [mode, setMode] = useState<TrainingMode>('depth-first');
  const [maxDepth, setMaxDepth] = useState<string>('');
  const [includeOnlyDue, setIncludeOnlyDue] = useState(false);
  const [learnMode, setLearnMode] = useState(false);
  const [opponentBranchingOnly, setOpponentBranchingOnly] = useState(false);

  // Get selected repertoire
  const selectedRepertoire = useMemo(
    () => repertoires.find(r => r.id === selectedRepertoireId) ?? null,
    [repertoires, selectedRepertoireId]
  );

  // Calculate stats for selected repertoire
  const stats = useMemo(() => {
    if (!selectedRepertoire) {
      return { totalLines: 0, linesDue: 0, linesLearned: 0, completionPercent: 0 };
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

    return { totalLines: allLines, linesDue, linesLearned, completionPercent };
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
      mode,
      maxDepth: maxDepth ? parseInt(maxDepth, 10) * 2 : undefined,
      includeOnlyDueLines: includeOnlyDue,
      learnMode,
      opponentBranchingOnly,
    });
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      <Text style={styles.title}>Training Dashboard</Text>

      {/* Repertoire Selector */}
      <View style={styles.section}>
        <Text style={styles.label}>Select Repertoire</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow}>
          {repertoires.map(rep => (
            <TouchableOpacity
              key={rep.id}
              style={[
                styles.chip,
                selectedRepertoireId === rep.id && styles.chipSelected,
              ]}
              onPress={() => {
                setSelectedRepertoireId(rep.id);
                setSelectedChapterIds([]);
              }}
            >
              <Text
                style={[
                  styles.chipText,
                  selectedRepertoireId === rep.id && styles.chipTextSelected,
                ]}
              >
                {rep.name}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
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
        <Text style={styles.label}>Training Mode</Text>
        <View style={styles.radioGroup}>
          <TouchableOpacity
            style={styles.radioOption}
            onPress={() => setMode('depth-first')}
          >
            <View style={[styles.radio, mode === 'depth-first' && styles.radioSelected]} />
            <Text style={styles.radioText}>Depth-First</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.radioOption}
            onPress={() => setMode('width-first')}
          >
            <View style={[styles.radio, mode === 'width-first' && styles.radioSelected]} />
            <Text style={styles.radioText}>Width-First</Text>
          </TouchableOpacity>
        </View>
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

      {/* Options */}
      <View style={styles.section}>
        <TouchableOpacity
          style={styles.checkboxRow}
          onPress={() => setIncludeOnlyDue(!includeOnlyDue)}
        >
          <View style={[styles.checkbox, includeOnlyDue && styles.checkboxSelected]}>
            {includeOnlyDue && <Text style={styles.checkmark}>✓</Text>}
          </View>
          <Text style={styles.checkboxLabel}>Only drill lines due for review</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.checkboxRow, { marginTop: 12 }]}
          onPress={() => setLearnMode(!learnMode)}
        >
          <View style={[styles.checkbox, learnMode && styles.checkboxSelected]}>
            {learnMode && <Text style={styles.checkmark}>✓</Text>}
          </View>
          <Text style={styles.checkboxLabel}>Learn mode (show arrows + comments)</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.checkboxRow, { marginTop: 12 }]}
          onPress={() => setOpponentBranchingOnly(!opponentBranchingOnly)}
        >
          <View style={[styles.checkbox, opponentBranchingOnly && styles.checkboxSelected]}>
            {opponentBranchingOnly && <Text style={styles.checkmark}>✓</Text>}
          </View>
          <Text style={styles.checkboxLabel}>Main line only for my moves</Text>
        </TouchableOpacity>
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
    gap: 20,
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
