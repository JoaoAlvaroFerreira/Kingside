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
  holdbackCount?: number;
}

export const VariationSelector: React.FC<VariationSelectorProps> = ({
  lines,
  currentLineIndex,
  onSelectLine,
  lineProgress = {},
  holdbackCount = 0,
}) => {
  const getLinePreview = (line: Line, maxMoves: number = 12): string => {
    // Show moves from the branch point (where this line diverges from main)
    const startPly = line.branchPoint ?? 0;
    const branchMoves = line.moves.slice(startPly);
    const displayMoves = branchMoves.slice(0, maxMoves);

    if (displayMoves.length === 0) return line.moves.map(m => m.san).join(' ');

    // Build formatted string with move numbers
    let result = '';
    for (const move of displayMoves) {
      if (!move.isBlack) {
        result += `${move.moveNumber}.`;
      } else if (result === '') {
        result += `${move.moveNumber}...`;
      }
      result += `${move.san} `;
    }

    if (startPly > 0) result = `...${result}`;
    return result.trim();
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
      {holdbackCount > 0 && (
        <Text style={styles.holdbackText}>+{holdbackCount} on hold</Text>
      )}
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
                numberOfLines={3}
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
    width: '100%',
  },
  holdbackText: {
    color: '#999',
    fontSize: 11,
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
