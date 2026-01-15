/**
 * SettingsScreen - Global settings for game review
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Switch,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import { useStore } from '@store';
import { EngineService } from '@services/engine/EngineService';

interface SettingsScreenProps {
  navigation: any;
}

export default function SettingsScreen({ navigation }: SettingsScreenProps) {
  const { reviewSettings, saveReviewSettings } = useStore();
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  // Engine settings
  const [apiEndpoint, setApiEndpoint] = useState(reviewSettings.engine.apiEndpoint);
  const [depth, setDepth] = useState(reviewSettings.engine.depth.toString());
  const [timeout, setTimeout] = useState(reviewSettings.engine.timeout.toString());

  // Thresholds
  const [blunder, setBlunder] = useState(reviewSettings.thresholds.blunder.toString());
  const [mistake, setMistake] = useState(reviewSettings.thresholds.mistake.toString());
  const [inaccuracy, setInaccuracy] = useState(reviewSettings.thresholds.inaccuracy.toString());

  // Display options
  const [showEvalBar, setShowEvalBar] = useState(reviewSettings.showEvalBar);
  const [showBestMove, setShowBestMove] = useState(reviewSettings.showBestMove);
  const [autoAdvanceDelay, setAutoAdvanceDelay] = useState(reviewSettings.autoAdvanceDelay.toString());

  // Update local state when store changes
  useEffect(() => {
    setApiEndpoint(reviewSettings.engine.apiEndpoint);
    setDepth(reviewSettings.engine.depth.toString());
    setTimeout(reviewSettings.engine.timeout.toString());
    setBlunder(reviewSettings.thresholds.blunder.toString());
    setMistake(reviewSettings.thresholds.mistake.toString());
    setInaccuracy(reviewSettings.thresholds.inaccuracy.toString());
    setShowEvalBar(reviewSettings.showEvalBar);
    setShowBestMove(reviewSettings.showBestMove);
    setAutoAdvanceDelay(reviewSettings.autoAdvanceDelay.toString());
  }, [reviewSettings]);

  const handleTestEngine = async () => {
    if (!apiEndpoint) {
      const msg = 'Please enter an API endpoint first';
      if (Platform.OS === 'web') {
        window.alert(msg);
      } else {
        Alert.alert('Error', msg);
      }
      return;
    }

    setTesting(true);
    try {
      EngineService.setEndpoint(apiEndpoint);
      const available = await EngineService.isAvailable();

      const msg = available
        ? 'Engine is available and responding!'
        : 'Could not connect to engine. Check the endpoint URL.';

      if (Platform.OS === 'web') {
        window.alert(msg);
      } else {
        Alert.alert(available ? 'Success' : 'Connection Failed', msg);
      }
    } catch (error) {
      const msg = `Error testing engine: ${error}`;
      if (Platform.OS === 'web') {
        window.alert(msg);
      } else {
        Alert.alert('Error', msg);
      }
    } finally {
      setTesting(false);
    }
  };

  const validateSettings = (): string | null => {
    const depthNum = parseInt(depth, 10);
    if (isNaN(depthNum) || depthNum < 1 || depthNum > 40) {
      return 'Depth must be between 1 and 40';
    }

    const timeoutNum = parseInt(timeout, 10);
    if (isNaN(timeoutNum) || timeoutNum < 1000 || timeoutNum > 60000) {
      return 'Timeout must be between 1000ms and 60000ms';
    }

    const blunderNum = parseInt(blunder, 10);
    const mistakeNum = parseInt(mistake, 10);
    const inaccuracyNum = parseInt(inaccuracy, 10);

    if (isNaN(blunderNum) || blunderNum < 0 || blunderNum > 1000) {
      return 'Blunder threshold must be between 0 and 1000 centipawns';
    }

    if (isNaN(mistakeNum) || mistakeNum < 0 || mistakeNum > 1000) {
      return 'Mistake threshold must be between 0 and 1000 centipawns';
    }

    if (isNaN(inaccuracyNum) || inaccuracyNum < 0 || inaccuracyNum > 1000) {
      return 'Inaccuracy threshold must be between 0 and 1000 centipawns';
    }

    if (blunderNum <= mistakeNum || mistakeNum <= inaccuracyNum) {
      return 'Thresholds must be: Blunder > Mistake > Inaccuracy';
    }

    const delayNum = parseInt(autoAdvanceDelay, 10);
    if (isNaN(delayNum) || delayNum < 0 || delayNum > 10000) {
      return 'Auto-advance delay must be between 0ms and 10000ms';
    }

    return null;
  };

  const handleSave = async () => {
    const error = validateSettings();
    if (error) {
      const msg = error;
      if (Platform.OS === 'web') {
        window.alert(msg);
      } else {
        Alert.alert('Validation Error', msg);
      }
      return;
    }

    setSaving(true);
    try {
      await saveReviewSettings({
        engine: {
          apiEndpoint,
          depth: parseInt(depth, 10),
          timeout: parseInt(timeout, 10),
        },
        thresholds: {
          blunder: parseInt(blunder, 10),
          mistake: parseInt(mistake, 10),
          inaccuracy: parseInt(inaccuracy, 10),
        },
        showEvalBar,
        showBestMove,
        autoAdvanceDelay: parseInt(autoAdvanceDelay, 10),
      });

      const msg = 'Settings saved successfully!';
      if (Platform.OS === 'web') {
        window.alert(msg);
      } else {
        Alert.alert('Success', msg);
      }
    } catch (error) {
      const msg = `Failed to save settings: ${error}`;
      if (Platform.OS === 'web') {
        window.alert(msg);
      } else {
        Alert.alert('Error', msg);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    const confirmReset = () => {
      const defaults = {
        apiEndpoint: '',
        depth: '20',
        timeout: '10000',
        blunder: '200',
        mistake: '100',
        inaccuracy: '50',
        showEvalBar: true,
        showBestMove: false,
        autoAdvanceDelay: '0',
      };

      setApiEndpoint(defaults.apiEndpoint);
      setDepth(defaults.depth);
      setTimeout(defaults.timeout);
      setBlunder(defaults.blunder);
      setMistake(defaults.mistake);
      setInaccuracy(defaults.inaccuracy);
      setShowEvalBar(defaults.showEvalBar);
      setShowBestMove(defaults.showBestMove);
      setAutoAdvanceDelay(defaults.autoAdvanceDelay);
    };

    if (Platform.OS === 'web') {
      if (window.confirm('Reset all settings to defaults?')) {
        confirmReset();
      }
    } else {
      Alert.alert('Reset Settings', 'Reset all settings to defaults?', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Reset', style: 'destructive', onPress: confirmReset },
      ]);
    }
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Text style={styles.backButtonText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Settings</Text>
        <TouchableOpacity onPress={handleReset} style={styles.resetButton}>
          <Text style={styles.resetButtonText}>Reset</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        {/* Engine Settings */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Engine Configuration</Text>
          <Text style={styles.sectionDescription}>
            Configure external chess engine API for position analysis
          </Text>

          <View style={styles.field}>
            <Text style={styles.label}>API Endpoint</Text>
            <TextInput
              style={styles.input}
              value={apiEndpoint}
              onChangeText={setApiEndpoint}
              placeholder="https://your-engine-api.com/analyze"
              placeholderTextColor="#666"
              autoCapitalize="none"
              autoCorrect={false}
            />
            <Text style={styles.hint}>
              Complete URL to your engine analysis endpoint.{'\n'}
              The app will POST to this URL with fen and depth in the body.
            </Text>
          </View>

          <TouchableOpacity
            style={[styles.testButton, testing && styles.testButtonDisabled]}
            onPress={handleTestEngine}
            disabled={testing}
          >
            {testing ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.testButtonText}>Test Connection</Text>
            )}
          </TouchableOpacity>

          <View style={styles.row}>
            <View style={[styles.field, styles.fieldHalf]}>
              <Text style={styles.label}>Depth</Text>
              <TextInput
                style={styles.input}
                value={depth}
                onChangeText={setDepth}
                placeholder="20"
                keyboardType="numeric"
                placeholderTextColor="#666"
              />
              <Text style={styles.hint}>1-40 (recommended: 20)</Text>
            </View>

            <View style={[styles.field, styles.fieldHalf]}>
              <Text style={styles.label}>Timeout (ms)</Text>
              <TextInput
                style={styles.input}
                value={timeout}
                onChangeText={setTimeout}
                placeholder="10000"
                keyboardType="numeric"
                placeholderTextColor="#666"
              />
              <Text style={styles.hint}>1000-60000</Text>
            </View>
          </View>
        </View>

        {/* Evaluation Thresholds */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Evaluation Thresholds</Text>
          <Text style={styles.sectionDescription}>
            Define centipawn loss thresholds for key move classification
          </Text>

          <View style={styles.field}>
            <Text style={styles.label}>Blunder (centipawns)</Text>
            <TextInput
              style={styles.input}
              value={blunder}
              onChangeText={setBlunder}
              placeholder="200"
              keyboardType="numeric"
              placeholderTextColor="#666"
            />
            <Text style={styles.hint}>Large evaluation loss (default: 200)</Text>
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Mistake (centipawns)</Text>
            <TextInput
              style={styles.input}
              value={mistake}
              onChangeText={setMistake}
              placeholder="100"
              keyboardType="numeric"
              placeholderTextColor="#666"
            />
            <Text style={styles.hint}>Medium evaluation loss (default: 100)</Text>
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Inaccuracy (centipawns)</Text>
            <TextInput
              style={styles.input}
              value={inaccuracy}
              onChangeText={setInaccuracy}
              placeholder="50"
              keyboardType="numeric"
              placeholderTextColor="#666"
            />
            <Text style={styles.hint}>Small evaluation loss (default: 50)</Text>
          </View>

          <View style={styles.thresholdNote}>
            <Text style={styles.noteText}>
              Note: Blunder threshold must be greater than Mistake, which must be greater than Inaccuracy.
            </Text>
          </View>
        </View>

        {/* Display Options */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Display Options</Text>

          <View style={styles.switchRow}>
            <View style={styles.switchLabel}>
              <Text style={styles.label}>Show Evaluation Bar</Text>
              <Text style={styles.hint}>Display vertical eval bar during review</Text>
            </View>
            <Switch
              value={showEvalBar}
              onValueChange={setShowEvalBar}
              trackColor={{ false: '#444', true: '#4a9eff' }}
              thumbColor={showEvalBar ? '#fff' : '#bbb'}
            />
          </View>

          <View style={styles.switchRow}>
            <View style={styles.switchLabel}>
              <Text style={styles.label}>Show Best Move</Text>
              <Text style={styles.hint}>Highlight engine's best move on board</Text>
            </View>
            <Switch
              value={showBestMove}
              onValueChange={setShowBestMove}
              trackColor={{ false: '#444', true: '#4a9eff' }}
              thumbColor={showBestMove ? '#fff' : '#bbb'}
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Auto-Advance Delay (ms)</Text>
            <TextInput
              style={styles.input}
              value={autoAdvanceDelay}
              onChangeText={setAutoAdvanceDelay}
              placeholder="0"
              keyboardType="numeric"
              placeholderTextColor="#666"
            />
            <Text style={styles.hint}>0 = manual navigation (default: 0)</Text>
          </View>
        </View>

        {/* Save Button */}
        <TouchableOpacity
          style={[styles.saveButton, saving && styles.saveButtonDisabled]}
          onPress={handleSave}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.saveButtonText}>Save Settings</Text>
          )}
        </TouchableOpacity>

        <View style={styles.footer}>
          <Text style={styles.footerText}>
            Settings are saved locally and persist across sessions.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1e1e1e',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#2a2a2a',
    borderBottomWidth: 1,
    borderBottomColor: '#444',
  },
  backButton: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    minWidth: 60,
  },
  backButtonText: {
    color: '#4a9eff',
    fontSize: 14,
    fontWeight: '600',
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
    flex: 1,
    textAlign: 'center',
  },
  resetButton: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    minWidth: 60,
    alignItems: 'flex-end',
  },
  resetButtonText: {
    color: '#f57c00',
    fontSize: 14,
    fontWeight: '600',
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 16,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 6,
  },
  sectionDescription: {
    fontSize: 13,
    color: '#bbb',
    marginBottom: 16,
  },
  field: {
    marginBottom: 16,
  },
  fieldHalf: {
    flex: 1,
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 6,
  },
  input: {
    backgroundColor: '#2a2a2a',
    color: '#fff',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#444',
    fontSize: 14,
  },
  hint: {
    fontSize: 11,
    color: '#999',
    marginTop: 4,
  },
  testButton: {
    backgroundColor: '#4a9eff',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 6,
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 16,
  },
  testButtonDisabled: {
    backgroundColor: '#666',
  },
  testButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  thresholdNote: {
    backgroundColor: '#2a2a2a',
    padding: 12,
    borderRadius: 6,
    borderLeftWidth: 3,
    borderLeftColor: '#fbc02d',
  },
  noteText: {
    fontSize: 12,
    color: '#bbb',
    lineHeight: 18,
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    marginBottom: 8,
  },
  switchLabel: {
    flex: 1,
    marginRight: 16,
  },
  saveButton: {
    backgroundColor: '#4caf50',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 8,
  },
  saveButtonDisabled: {
    backgroundColor: '#666',
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  footer: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#444',
  },
  footerText: {
    fontSize: 12,
    color: '#999',
    textAlign: 'center',
  },
});
