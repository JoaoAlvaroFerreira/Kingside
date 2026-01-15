/**
 * VariationSelector - Display and switch between training lines
 */

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { Line } from '@types';

interface VariationSelectorProps {
  lines: Line[];
  currentLineIndex: number;
  onSelectLine: (index: number) => void;
  lineProgress?: Record<string, number>;
}

export const VariationSelector: React.FC<VariationSelectorProps> = ({
  lines,
  currentLineIndex,
  onSelectLine,
  lineProgress = {},
}) => {
  const getLinePreview = (line: Line, maxMoves: number = 6): string => {
    const moves = line.moves.slice(0, maxMoves).map(m => m.san);
    const preview = moves.join(' ');
    return moves.length < line.moves.length ? `${preview}...` : preview;
  };

  const getLineStatus = (line: Line): 'complete' | 'in-progress' | 'pending' => {
    const progress = lineProgress[line.id] || 0;
    const userMoves = line.moves.filter(m => m.isUserMove);

    if (progress >= userMoves.length) return 'complete';
    if (progress > 0) return 'in-progress';
    return 'pending';
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Variations</Text>
      <ScrollView style={styles.list} showsVerticalScrollIndicator={true}>
        {lines.map((line, index) => {
          const isCurrent = index === currentLineIndex;
          const status = getLineStatus(line);
          const userMoves = line.moves.filter(m => m.isUserMove);
          const progress = lineProgress[line.id] || 0;

          return (
            <TouchableOpacity
              key={line.id}
              style={[
                styles.lineItem,
                isCurrent && styles.lineItemCurrent,
                status === 'complete' && styles.lineItemComplete,
              ]}
              onPress={() => onSelectLine(index)}
            >
              <View style={styles.lineHeader}>
                <View style={styles.lineInfo}>
                  <Text style={[styles.lineNumber, isCurrent && styles.lineNumberCurrent]}>
                    {index + 1}.
                  </Text>
                  {line.isMainLine && (
                    <View style={styles.mainLineBadge}>
                      <Text style={styles.mainLineBadgeText}>Main</Text>
                    </View>
                  )}
                  {status === 'complete' && <Text style={styles.statusIcon}>✓</Text>}
                </View>
                <Text style={[styles.progressText, isCurrent && styles.progressTextCurrent]}>
                  {progress}/{userMoves.length}
                </Text>
              </View>
              <Text
                style={[styles.linePreview, isCurrent && styles.linePreviewCurrent]}
                numberOfLines={2}
              >
                {getLinePreview(line)}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#2a2a2a',
    borderRadius: 6,
    padding: 8,
    minWidth: 200,
    maxWidth: 280,
  },
  title: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 8,
  },
  list: {
    maxHeight: 400,
  },
  lineItem: {
    backgroundColor: '#1e1e1e',
    padding: 6,
    borderRadius: 4,
    marginBottom: 6,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  lineItemCurrent: {
    borderColor: '#4a9eff',
    backgroundColor: '#2a3a4a',
  },
  lineItemComplete: {
    opacity: 0.6,
  },
  lineHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  lineInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  lineNumber: {
    color: '#bbb',
    fontSize: 11,
    fontWeight: '600',
  },
  lineNumberCurrent: {
    color: '#4a9eff',
  },
  mainLineBadge: {
    backgroundColor: '#4a9eff',
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 3,
  },
  mainLineBadgeText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '600',
  },
  statusIcon: {
    color: '#4caf50',
    fontSize: 13,
  },
  progressText: {
    color: '#bbb',
    fontSize: 10,
  },
  progressTextCurrent: {
    color: '#4a9eff',
    fontWeight: '600',
  },
  linePreview: {
    color: '#999',
    fontSize: 10,
    fontFamily: 'monospace',
  },
  linePreviewCurrent: {
    color: '#ccc',
  },
});
