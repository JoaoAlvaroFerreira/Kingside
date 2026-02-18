/**
 * Chapter List Component
 * Flat list of chapters within a sub-variation
 */

import React from 'react';
import { Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { CollapsiblePanel } from './CollapsiblePanel';
import { Chapter } from '@types';

interface ChapterListProps {
  chapters: Chapter[];
  selectedId?: string | null;
  onSelect: (chapterId: string) => void;
  defaultCollapsed?: boolean;
}

export function ChapterList({ chapters, selectedId, onSelect, defaultCollapsed }: ChapterListProps) {
  if (chapters.length === 0) {
    return (
      <CollapsiblePanel title="Chapters (0)" defaultCollapsed={defaultCollapsed}>
        <Text style={styles.empty}>No chapters in this variation</Text>
      </CollapsiblePanel>
    );
  }

  return (
    <CollapsiblePanel title={`Chapters (${chapters.length})`} defaultCollapsed={defaultCollapsed}>
      <ScrollView style={styles.list} nestedScrollEnabled>
        {chapters.map((chapter) => (
          <TouchableOpacity
            key={chapter.id}
            style={[
              styles.chapterItem,
              selectedId === chapter.id && styles.selectedChapter,
            ]}
            onPress={() => onSelect(chapter.id)}
            activeOpacity={0.7}
          >
            <Text
              style={[
                styles.chapterName,
                selectedId === chapter.id && styles.selectedChapterText,
              ]}
              numberOfLines={2}
            >
              {chapter.name}
            </Text>
            <Text style={styles.chapterDate}>
              {new Date(chapter.createdAt).toLocaleDateString()}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </CollapsiblePanel>
  );
}

const styles = StyleSheet.create({
  list: {
    maxHeight: 300,
  },
  empty: {
    color: '#888',
    fontSize: 13,
    fontStyle: 'italic',
    textAlign: 'center',
    paddingVertical: 8,
  },
  chapterItem: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 6,
    marginBottom: 6,
    backgroundColor: '#2c2c2c',
  },
  selectedChapter: {
    backgroundColor: '#007AFF',
  },
  chapterName: {
    color: '#e0e0e0',
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 4,
  },
  selectedChapterText: {
    color: '#fff',
    fontWeight: '600',
  },
  chapterDate: {
    color: '#888',
    fontSize: 11,
  },
});
