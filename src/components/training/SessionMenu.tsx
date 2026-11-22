import React from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Guidance } from '@types';

interface SessionMenuProps {
  visible: boolean;
  onClose: () => void;
  guidance: Guidance;
  onChangeGuidance: (guidance: Guidance) => void;
  inAlternatives: boolean;
  alternativesDisabled: boolean;
  onAlternatives: () => void;
  onResume: () => void;
}

const GUIDANCE_OPTIONS: Array<{ value: Guidance; label: string; hint: string }> = [
  { value: 'none', label: 'Off', hint: 'No arrows, no comments' },
  { value: 'semi-learn', label: 'Semi', hint: 'Arrow until you have played the move correctly once' },
  { value: 'learn', label: 'Learn', hint: 'Arrow and comments always; no rating' },
];

export function SessionMenu({
  visible, onClose, guidance, onChangeGuidance,
  inAlternatives, alternativesDisabled, onAlternatives, onResume,
}: SessionMenuProps) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose}>
        <View style={styles.sheet} onStartShouldSetResponder={() => true}>
          <Text style={styles.sectionTitle}>Hints</Text>
          <View style={styles.segmented}>
            {GUIDANCE_OPTIONS.map(opt => (
              <TouchableOpacity
                key={opt.value}
                onPress={() => onChangeGuidance(opt.value)}
                style={[styles.segment, guidance === opt.value && styles.segmentActive]}
              >
                <Text style={styles.segmentText}>{opt.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={styles.hint}>{GUIDANCE_OPTIONS.find(o => o.value === guidance)?.hint}</Text>

          <TouchableOpacity
            style={[styles.action, alternativesDisabled && !inAlternatives && styles.actionDisabled]}
            disabled={alternativesDisabled && !inAlternatives}
            onPress={() => { onClose(); (inAlternatives ? onResume : onAlternatives)(); }}
          >
            <Text style={styles.actionText}>{inAlternatives ? 'Resume Line' : 'Alternatives'}</Text>
            <Text style={styles.hint}>
              {inAlternatives
                ? 'Go back to the line you were drilling'
                : 'Drill the other replies to the move before this one'}
            </Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center' },
  sheet: { width: 320, maxWidth: '90%', backgroundColor: '#1e1e1e', borderRadius: 8, padding: 16 },
  sectionTitle: { color: '#fff', fontSize: 14, fontWeight: '700', marginBottom: 8 },
  segmented: { flexDirection: 'row', gap: 6 },
  segment: { flex: 1, paddingVertical: 8, borderRadius: 4, backgroundColor: '#333', alignItems: 'center' },
  segmentActive: { backgroundColor: '#1976d2' },
  segmentText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  hint: { color: '#aaa', fontSize: 12, marginTop: 6 },
  action: { marginTop: 16, padding: 12, borderRadius: 4, backgroundColor: '#455a64' },
  actionDisabled: { opacity: 0.4 },
  actionText: { color: '#fff', fontSize: 14, fontWeight: '600' },
});
