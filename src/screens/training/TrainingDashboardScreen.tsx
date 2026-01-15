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
  const { repertoires, lineStats } = useStore();

  const [selectedRepertoireId, setSelectedRepertoireId] = useState<string | null>(null);
  const [selectedChapterId, setSelectedChapterId] = useState<string | null>(null);
  const [mode, setMode] = useState<TrainingMode>('depth-first');
  const [maxDepth, setMaxDepth] = useState<string>('');
  const [includeOnlyDue, setIncludeOnlyDue] = useState(false);

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
    const chapters = selectedChapterId
      ? selectedRepertoire.chapters.filter(ch => ch.id === selectedChapterId)
      : selectedRepertoire.chapters;

    let allLines = 0;
    for (const chapter of chapters) {
      const lines = LineExtractor.extractLines(
        chapter.moveTree,
        selectedRepertoire.id,
        chapter.id,
        selectedRepertoire.color,
        maxDepth ? parseInt(maxDepth, 10) : undefined
      );
      allLines += LineExtractor.filterLinesWithUserMoves(lines).length;
    }

    // Count due and learned lines
    const relevantStats = lineStats.filter(stat => {
      const isRepertoireMatch = stat.repertoireId === selectedRepertoire.id;
      const isChapterMatch = !selectedChapterId || stat.chapterId === selectedChapterId;
      return isRepertoireMatch && isChapterMatch;
    });

    const now = new Date();
    const linesDue = relevantStats.filter(stat => new Date(stat.nextReviewDate) <= now).length;
    const linesLearned = relevantStats.filter(stat => stat.totalDrills > 0).length;
    const completionPercent = allLines > 0 ? Math.round((linesLearned / allLines) * 100) : 0;

    return { totalLines: allLines, linesDue, linesLearned, completionPercent };
  }, [selectedRepertoire, selectedChapterId, maxDepth, lineStats]);

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
      chapterId: selectedChapterId,
      mode,
      maxDepth: maxDepth ? parseInt(maxDepth, 10) : undefined,
      includeOnlyDueLines: includeOnlyDue,
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
                setSelectedChapterId(null); // Reset chapter when repertoire changes
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
          <Text style={styles.label}>Select Chapter (Optional)</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow}>
            <TouchableOpacity
              style={[styles.chip, selectedChapterId === null && styles.chipSelected]}
              onPress={() => setSelectedChapterId(null)}
            >
              <Text
                style={[
                  styles.chipText,
                  selectedChapterId === null && styles.chipTextSelected,
                ]}
              >
                All Chapters
              </Text>
            </TouchableOpacity>
            {selectedRepertoire.chapters.map(ch => (
              <TouchableOpacity
                key={ch.id}
                style={[
                  styles.chip,
                  selectedChapterId === ch.id && styles.chipSelected,
                ]}
                onPress={() => setSelectedChapterId(ch.id)}
              >
                <Text
                  style={[
                    styles.chipText,
                    selectedChapterId === ch.id && styles.chipTextSelected,
                  ]}
                >
                  {ch.name}
                </Text>
              </TouchableOpacity>
            ))}
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

      {/* Max Depth */}
      <View style={styles.section}>
        <Text style={styles.label}>Max Depth (Optional)</Text>
        <TextInput
          style={styles.input}
          value={maxDepth}
          onChangeText={setMaxDepth}
          placeholder="Leave empty for no limit"
          keyboardType="numeric"
          placeholderTextColor="#999"
        />
      </View>

      {/* Only Due Lines */}
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
