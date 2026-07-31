/**
 * Repertoire Match List Component
 * Scrollable list of repertoire chapters containing the current position
 */

import React from 'react';
import { Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { CollapsiblePanel } from './CollapsiblePanel';
import { ChapterFenMatch } from '@utils/extractRepertoirePositions';

interface RepertoireMatchListProps {
  matches: ChapterFenMatch[];
  onSelect: (match: ChapterFenMatch) => void;
  defaultCollapsed?: boolean;
}

export function RepertoireMatchList({ matches, onSelect, defaultCollapsed }: RepertoireMatchListProps) {
  return (
    <CollapsiblePanel title={`Find Position (${matches.length})`} defaultCollapsed={defaultCollapsed}>
      {matches.length === 0 ? (
        <Text style={styles.empty}>No repertoire chapters at this position</Text>
      ) : (
        <ScrollView style={styles.list} nestedScrollEnabled>
          {matches.map((match) => (
            <TouchableOpacity
              key={`${match.repertoireId}-${match.chapterId}`}
              style={styles.matchItem}
              onPress={() => onSelect(match)}
              activeOpacity={0.7}
            >
              <Text style={styles.repertoireName} numberOfLines={1}>
                {match.repertoireName}
              </Text>
              <Text style={styles.chapterName} numberOfLines={1}>
                {match.chapterName}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}
    </CollapsiblePanel>
  );
}

const styles = StyleSheet.create({
  list: {
    maxHeight: 200,
  },
  empty: {
    color: '#888',
    fontSize: 11,
    fontStyle: 'italic',
    textAlign: 'center',
    paddingVertical: 6,
  },
  matchItem: {
    paddingVertical: 7,
    paddingHorizontal: 8,
    borderRadius: 4,
    marginBottom: 4,
    backgroundColor: '#2c2c2c',
  },
  repertoireName: {
    color: '#e0e0e0',
    fontSize: 12,
    fontWeight: '500',
  },
  chapterName: {
    color: '#888',
    fontSize: 11,
    marginTop: 1,
  },
});
