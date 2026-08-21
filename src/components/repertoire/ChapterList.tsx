/**
 * Chapter List Component
 * Flat list of chapters within a sub-variation
 */

import React from 'react';
import { Text, TouchableOpacity, StyleSheet, FlatList } from 'react-native';
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
      <FlatList
        style={styles.list}
        data={chapters}
        keyExtractor={(chapter) => chapter.id}
        nestedScrollEnabled
        initialNumToRender={15}
        maxToRenderPerBatch={15}
        windowSize={5}
        removeClippedSubviews
        renderItem={({ item: chapter }) => (
          <TouchableOpacity
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
        )}
      />
    </CollapsiblePanel>
  );
}

const styles = StyleSheet.create({
  list: {
    maxHeight: 200,
  },
  empty: {
    color: '#888',
    fontSize: 10,
    fontStyle: 'italic',
    textAlign: 'center',
    paddingVertical: 4,
  },
  chapterItem: {
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 4,
    marginBottom: 4,
    backgroundColor: '#2c2c2c',
  },
  selectedChapter: {
    backgroundColor: '#007AFF',
  },
  chapterName: {
    color: '#e0e0e0',
    fontSize: 11,
    fontWeight: '500',
    marginBottom: 2,
  },
  selectedChapterText: {
    color: '#fff',
    fontWeight: '600',
  },
  chapterDate: {
    color: '#888',
    fontSize: 9,
  },
});
