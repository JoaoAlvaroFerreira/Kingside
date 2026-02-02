/**
 * SettingsModal - Per-screen settings configuration
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
  Switch,
  ScrollView,
} from 'react-native';
import { ScreenKey, ScreenSettings } from '@types';
import { useStore } from '@store';

interface SettingsModalProps {
  visible: boolean;
  onClose: () => void;
  screenKey: ScreenKey;
  currentSettings: ScreenSettings;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  visible,
  onClose,
  screenKey,
  currentSettings,
}) => {
  const { updateScreenSettings } = useStore();

  const [orientation, setOrientation] = useState(currentSettings.orientation);
  const [engineEnabled, setEngineEnabled] = useState(currentSettings.engineEnabled);
  const [coordinatesVisible, setCoordinatesVisible] = useState(currentSettings.coordinatesVisible);
  const [moveHistoryVisible, setMoveHistoryVisible] = useState(currentSettings.moveHistoryVisible);
  const [boardSize, setBoardSize] = useState(currentSettings.boardSize || 'small');

  const handleSave = async () => {
    await updateScreenSettings(screenKey, {
      orientation,
      engineEnabled,
      coordinatesVisible,
      moveHistoryVisible,
      boardSize,
    });
    onClose();
  };

  const handleCancel = () => {
    // Reset to current settings
    setOrientation(currentSettings.orientation);
    setEngineEnabled(currentSettings.engineEnabled);
    setCoordinatesVisible(currentSettings.coordinatesVisible);
    setMoveHistoryVisible(currentSettings.moveHistoryVisible);
    setBoardSize(currentSettings.boardSize || 'small');
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleCancel}
    >
      <View style={styles.overlay}>
        <View style={styles.modal}>
          <View style={styles.header}>
            <Text style={styles.title}>Board Settings</Text>
            <TouchableOpacity onPress={handleCancel}>
              <Text style={styles.closeButton}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.content}>
            {/* Orientation */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Orientation</Text>
              <View style={styles.segmentedControl}>
                <TouchableOpacity
                  style={[
                    styles.segmentButton,
                    styles.segmentButtonLeft,
                    orientation === 'white' && styles.segmentButtonActive,
                  ]}
                  onPress={() => setOrientation('white')}
                >
                  <Text
                    style={[
                      styles.segmentButtonText,
                      orientation === 'white' && styles.segmentButtonTextActive,
                    ]}
                  >
                    White
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.segmentButton,
                    styles.segmentButtonRight,
                    orientation === 'black' && styles.segmentButtonActive,
                  ]}
                  onPress={() => setOrientation('black')}
                >
                  <Text
                    style={[
                      styles.segmentButtonText,
                      orientation === 'black' && styles.segmentButtonTextActive,
                    ]}
                  >
                    Black
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Board Size */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Board Size</Text>
              <View style={styles.segmentedControl}>
                <TouchableOpacity
                  style={[
                    styles.segmentButton,
                    styles.segmentButtonLeft,
                    boardSize === 'tiny' && styles.segmentButtonActive,
                  ]}
                  onPress={() => setBoardSize('tiny')}
                >
                  <Text
                    style={[
                      styles.segmentButtonText,
                      boardSize === 'tiny' && styles.segmentButtonTextActive,
                    ]}
                  >
                    XS
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.segmentButton,
                    boardSize === 'small' && styles.segmentButtonActive,
                  ]}
                  onPress={() => setBoardSize('small')}
                >
                  <Text
                    style={[
                      styles.segmentButtonText,
                      boardSize === 'small' && styles.segmentButtonTextActive,
                    ]}
                  >
                    S
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.segmentButton,
                    boardSize === 'medium' && styles.segmentButtonActive,
                  ]}
                  onPress={() => setBoardSize('medium')}
                >
                  <Text
                    style={[
                      styles.segmentButtonText,
                      boardSize === 'medium' && styles.segmentButtonTextActive,
                    ]}
                  >
                    M
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.segmentButton,
                    boardSize === 'large' && styles.segmentButtonActive,
                  ]}
                  onPress={() => setBoardSize('large')}
                >
                  <Text
                    style={[
                      styles.segmentButtonText,
                      boardSize === 'large' && styles.segmentButtonTextActive,
                    ]}
                  >
                    L
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.segmentButton,
                    styles.segmentButtonRight,
                    boardSize === 'xlarge' && styles.segmentButtonActive,
                  ]}
                  onPress={() => setBoardSize('xlarge')}
                >
                  <Text
                    style={[
                      styles.segmentButtonText,
                      boardSize === 'xlarge' && styles.segmentButtonTextActive,
                    ]}
                  >
                    XL
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Engine Analysis (includes eval bar) */}
            <View style={styles.section}>
              <View style={styles.switchRow}>
                <View style={styles.switchLabel}>
                  <Text style={styles.label}>Engine Analysis</Text>
                  <Text style={styles.hint}>Enable position evaluation and eval bar</Text>
                </View>
                <Switch
                  value={engineEnabled}
                  onValueChange={setEngineEnabled}
                  trackColor={{ false: '#444', true: '#4a9eff' }}
                  thumbColor={engineEnabled ? '#fff' : '#bbb'}
                />
              </View>
            </View>

            {/* Coordinates */}
            <View style={styles.section}>
              <View style={styles.switchRow}>
                <View style={styles.switchLabel}>
                  <Text style={styles.label}>Board Coordinates</Text>
                  <Text style={styles.hint}>Show file and rank labels</Text>
                </View>
                <Switch
                  value={coordinatesVisible}
                  onValueChange={setCoordinatesVisible}
                  trackColor={{ false: '#444', true: '#4a9eff' }}
                  thumbColor={coordinatesVisible ? '#fff' : '#bbb'}
                />
              </View>
            </View>

            {/* Move History */}
            <View style={styles.section}>
              <View style={styles.switchRow}>
                <View style={styles.switchLabel}>
                  <Text style={styles.label}>Move History</Text>
                  <Text style={styles.hint}>Show move list and navigation</Text>
                </View>
                <Switch
                  value={moveHistoryVisible}
                  onValueChange={setMoveHistoryVisible}
                  trackColor={{ false: '#444', true: '#4a9eff' }}
                  thumbColor={moveHistoryVisible ? '#fff' : '#bbb'}
                />
              </View>
            </View>
          </ScrollView>

          {/* Footer */}
          <View style={styles.footer}>
            <TouchableOpacity style={styles.cancelButton} onPress={handleCancel}>
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.saveButton} onPress={handleSave}>
              <Text style={styles.saveButtonText}>Save</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modal: {
    backgroundColor: '#2a2a2a',
    borderRadius: 12,
    width: '90%',
    maxWidth: 400,
    maxHeight: '80%',
    borderWidth: 1,
    borderColor: '#444',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#444',
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
  },
  closeButton: {
    fontSize: 24,
    color: '#888',
    paddingHorizontal: 8,
  },
  content: {
    padding: 20,
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 12,
  },
  segmentedControl: {
    flexDirection: 'row',
    borderRadius: 6,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#444',
  },
  segmentButton: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 16,
    backgroundColor: '#1e1e1e',
    alignItems: 'center',
    justifyContent: 'center',
    borderRightWidth: 0.5,
    borderRightColor: '#444',
  },
  segmentButtonLeft: {
    // Already has border from base
  },
  segmentButtonRight: {
    borderRightWidth: 0,
  },
  segmentButtonActive: {
    backgroundColor: '#4a9eff',
  },
  segmentButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#bbb',
  },
  segmentButtonTextActive: {
    color: '#fff',
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  switchLabel: {
    flex: 1,
    marginRight: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 4,
  },
  hint: {
    fontSize: 12,
    color: '#999',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: '#444',
  },
  cancelButton: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 6,
    backgroundColor: '#3a3a3a',
  },
  cancelButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#e0e0e0',
  },
  saveButton: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 6,
    backgroundColor: '#4a9eff',
  },
  saveButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
});
