import React, { useState, useMemo, useCallback } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { Chapter } from '@types';
import { countMoveTreeNodes, formatLastStudied } from '@utils/chapterUtils';

interface ChapterSelectModalProps {
  visible: boolean;
  chapters: Chapter[];
  selectedChapterId: string;
  onSelect: (chapterId: string) => void;
  onClose: () => void;
}

export function ChapterSelectModal({
  visible,
  chapters,
  selectedChapterId,
  onSelect,
  onClose,
}: ChapterSelectModalProps) {
  const [filter, setFilter] = useState('');

  const filteredChapters = useMemo(() => {
    if (!filter.trim()) return chapters;
    const lower = filter.toLowerCase();
    return chapters.filter(c => c.name.toLowerCase().includes(lower));
  }, [chapters, filter]);

  const handleSelect = useCallback((chapterId: string) => {
    onSelect(chapterId);
    onClose();
    setFilter('');
  }, [onSelect, onClose]);

  const handleClose = useCallback(() => {
    onClose();
    setFilter('');
  }, [onClose]);

  const renderItem = useCallback(({ item }: { item: Chapter }) => {
    const isSelected = item.id === selectedChapterId;
    const moveCount = countMoveTreeNodes(item.moveTree);
    return (
      <TouchableOpacity
        style={[styles.row, isSelected && styles.selectedRow]}
        onPress={() => handleSelect(item.id)}
        testID={`chapter-row-${item.id}`}
      >
        <View style={styles.rowContent}>
          <Text style={[styles.chapterName, isSelected && styles.selectedName]}>
            {item.name}
          </Text>
          <View style={styles.metaRow}>
            <Text style={styles.metaText}>{moveCount} moves</Text>
            <Text style={styles.metaText}>{formatLastStudied(item.lastStudiedAt)}</Text>
          </View>
        </View>
        {isSelected && <Text style={styles.checkmark}>&#10003;</Text>}
      </TouchableOpacity>
    );
  }, [selectedChapterId, handleSelect]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={false}
      onRequestClose={handleClose}
    >
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Select Chapter</Text>
          <TouchableOpacity onPress={handleClose} testID="close-button">
            <Text style={styles.closeButton}>{'\u00D7'}</Text>
          </TouchableOpacity>
        </View>
        <TextInput
          style={styles.searchInput}
          placeholder="Filter chapters..."
          placeholderTextColor="#888"
          value={filter}
          onChangeText={setFilter}
          testID="chapter-filter-input"
        />
        <FlatList
          data={filteredChapters}
          keyExtractor={item => item.id}
          renderItem={renderItem}
          ListEmptyComponent={
            <Text style={styles.emptyText}>No chapters found</Text>
          }
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a2e',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  title: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  closeButton: {
    color: '#fff',
    fontSize: 28,
    lineHeight: 28,
    paddingHorizontal: 8,
  },
  searchInput: {
    backgroundColor: '#2c2c3e',
    color: '#fff',
    fontSize: 14,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginHorizontal: 16,
    marginBottom: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#2c2c3e',
  },
  selectedRow: {
    backgroundColor: '#2c2c3e',
  },
  rowContent: {
    flex: 1,
  },
  chapterName: {
    color: '#e0e0e0',
    fontSize: 14,
    marginBottom: 4,
  },
  selectedName: {
    fontWeight: 'bold',
    color: '#fff',
  },
  metaRow: {
    flexDirection: 'row',
    gap: 16,
  },
  metaText: {
    color: '#888',
    fontSize: 12,
  },
  checkmark: {
    color: '#007AFF',
    fontSize: 18,
    marginLeft: 8,
  },
  emptyText: {
    color: '#888',
    fontSize: 14,
    textAlign: 'center',
    paddingVertical: 32,
  },
});
