import React, { useEffect, useState, useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Alert, TextInput, Platform } from 'react-native';
import { useStore } from '@store';
import { RepertoireColor, OpeningType, Repertoire } from '@types';
import { CardGenerator } from '@services/srs/CardGenerator';

interface RepertoireScreenProps {
  navigation: any;
}

export default function RepertoireScreen({ navigation }: RepertoireScreenProps) {
  const { repertoires, addCards, reviewCards, updateRepertoire, deleteRepertoire } = useStore();
  const [selectedColor, setSelectedColor] = useState<RepertoireColor>('white');
  const [selectedType, setSelectedType] = useState<OpeningType | null>(null);
  const [expandedRepertoire, setExpandedRepertoire] = useState<string | null>(null);
  const [editingRepertoire, setEditingRepertoire] = useState<string | null>(null);
  const [editedName, setEditedName] = useState('');
  const [editingChapter, setEditingChapter] = useState<string | null>(null);
  const [editedChapterName, setEditedChapterName] = useState('');

  useEffect(() => {
    console.log('RepertoireScreen: Repertoires count:', repertoires.length);
    if (repertoires.length > 0) {
      console.log('RepertoireScreen: First repertoire:', repertoires[0].name);
    }
  }, [repertoires]);

  const handleImportRepertoire = () => {
    navigation.navigate('ImportPGN', { target: 'repertoire' });
  };

  const handleOpenChapter = (repertoireId: string, chapterId: string) => {
    navigation.navigate('RepertoireStudy', {
      repertoireId,
      chapterId,
    });
  };

  const handleStartEdit = (repertoire: Repertoire) => {
    setEditingRepertoire(repertoire.id);
    setEditedName(repertoire.name);
  };

  const handleSaveEdit = async (repertoire: Repertoire) => {
    if (!editedName.trim()) {
      if (Platform.OS === 'web') {
        window.alert('Repertoire name cannot be empty');
      } else {
        Alert.alert('Error', 'Repertoire name cannot be empty');
      }
      return;
    }

    const updated = {
      ...repertoire,
      name: editedName.trim(),
      updatedAt: new Date(),
    };

    await updateRepertoire(updated);
    setEditingRepertoire(null);
    setEditedName('');
  };

  const handleCancelEdit = () => {
    setEditingRepertoire(null);
    setEditedName('');
  };

  const handleDeleteRepertoire = (repertoire: Repertoire) => {
    console.log('RepertoireScreen: Starting delete for:', repertoire.name, repertoire.id);

    // Use window.confirm for web, Alert.alert for native
    if (Platform.OS === 'web') {
      const confirmed = window.confirm(
        `Are you sure you want to delete "${repertoire.name}"? This will also delete all associated review cards.`
      );

      if (!confirmed) {
        console.log('RepertoireScreen: Delete cancelled');
        return;
      }

      console.log('RepertoireScreen: Delete confirmed');
      console.log('RepertoireScreen: Executing delete for:', repertoire.id);

      deleteRepertoire(repertoire.id)
        .then(() => {
          console.log('RepertoireScreen: Delete successful');
        })
        .catch((error) => {
          console.error('RepertoireScreen: Delete failed:', error);
          window.alert('Failed to delete repertoire');
        });
    } else {
      Alert.alert(
        'Delete Repertoire',
        `Are you sure you want to delete "${repertoire.name}"? This will also delete all associated review cards.`,
        [
          {
            text: 'Cancel',
            style: 'cancel',
            onPress: () => {
              console.log('RepertoireScreen: Delete cancelled');
            }
          },
          {
            text: 'Delete',
            style: 'destructive',
            onPress: () => {
              console.log('RepertoireScreen: Delete confirmed');
              console.log('RepertoireScreen: Executing delete for:', repertoire.id);

              deleteRepertoire(repertoire.id)
                .then(() => {
                  console.log('RepertoireScreen: Delete successful');
                })
                .catch((error) => {
                  console.error('RepertoireScreen: Delete failed:', error);
                  Alert.alert('Error', 'Failed to delete repertoire');
                });
            }
          },
        ]
      );
    }
  };

  const handleStartEditChapter = (repertoireId: string, chapterId: string, currentName: string) => {
    setEditingChapter(chapterId);
    setEditedChapterName(currentName);
  };

  const handleSaveEditChapter = async (repertoireId: string, chapterId: string) => {
    if (!editedChapterName.trim()) {
      if (Platform.OS === 'web') {
        window.alert('Chapter name cannot be empty');
      } else {
        Alert.alert('Error', 'Chapter name cannot be empty');
      }
      return;
    }

    const repertoire = repertoires.find(r => r.id === repertoireId);
    if (!repertoire) return;

    const updatedChapters = repertoire.chapters.map(ch =>
      ch.id === chapterId
        ? { ...ch, name: editedChapterName.trim() }
        : ch
    );

    const updatedRepertoire = {
      ...repertoire,
      chapters: updatedChapters,
      updatedAt: new Date(),
    };

    await updateRepertoire(updatedRepertoire);
    setEditingChapter(null);
    setEditedChapterName('');
  };

  const handleCancelEditChapter = () => {
    setEditingChapter(null);
    setEditedChapterName('');
  };

  const handleGenerateCards = async (repertoire: Repertoire) => {
    try {
      // Check if cards already exist for this repertoire
      const existingCards = reviewCards.filter(
        card => card.chapterId && repertoire.chapters.some(ch => ch.id === card.chapterId)
      );

      if (existingCards.length > 0) {
        if (Platform.OS === 'web') {
          const confirmed = window.confirm(
            `This repertoire already has ${existingCards.length} review cards. Do you want to regenerate them?`
          );
          if (confirmed) {
            generateCardsForRepertoire(repertoire);
          }
        } else {
          Alert.alert(
            'Cards Already Generated',
            `This repertoire already has ${existingCards.length} review cards. Do you want to regenerate them?`,
            [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Regenerate',
                style: 'destructive',
                onPress: () => generateCardsForRepertoire(repertoire),
              },
            ]
          );
        }
      } else {
        generateCardsForRepertoire(repertoire);
      }
    } catch (error) {
      console.error('Error generating cards:', error);
      if (Platform.OS === 'web') {
        window.alert('Failed to generate review cards');
      } else {
        Alert.alert('Error', 'Failed to generate review cards');
      }
    }
  };

  const generateCardsForRepertoire = async (repertoire: Repertoire) => {
    const allCards = [];

    for (const chapter of repertoire.chapters) {
      const cards = CardGenerator.generateFromChapter(
        chapter,
        repertoire.color,
        repertoire.id, // Using repertoire ID as opening ID
        repertoire.id, // Using repertoire ID as sub-variation ID
      );
      allCards.push(...cards);
    }

    await addCards(allCards);

    if (Platform.OS === 'web') {
      window.alert(`Generated ${allCards.length} review cards for ${repertoire.name}`);
    } else {
      Alert.alert(
        'Success',
        `Generated ${allCards.length} review cards for ${repertoire.name}`,
        [{ text: 'OK' }]
      );
    }
  };

  const filteredRepertoires = useMemo(() => {
    let filtered = repertoires.filter(r => r.color === selectedColor);
    if (selectedType) {
      filtered = filtered.filter(r => r.openingType === selectedType);
    }
    return filtered;
  }, [repertoires, selectedColor, selectedType]);

  const renderColorSelector = () => (
    <View style={styles.colorSelector}>
      <TouchableOpacity
        style={[styles.colorBtn, selectedColor === 'white' && styles.selected]}
        onPress={() => setSelectedColor('white')}
        activeOpacity={0.7}
      >
        <Text style={[styles.colorBtnText, selectedColor === 'white' && styles.selectedText]}>
          White Repertoire
        </Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.colorBtn, selectedColor === 'black' && styles.selected]}
        onPress={() => setSelectedColor('black')}
        activeOpacity={0.7}
      >
        <Text style={[styles.colorBtnText, selectedColor === 'black' && styles.selectedText]}>
          Black Repertoire
        </Text>
      </TouchableOpacity>
    </View>
  );

  const renderOpeningTypeSelector = () => (
    <View style={styles.typeSelector}>
      <TouchableOpacity
        style={[styles.typeBtn, selectedType === null && styles.typeSelected]}
        onPress={() => setSelectedType(null)}
        activeOpacity={0.7}
      >
        <Text style={[styles.typeBtnText, selectedType === null && styles.selectedText]}>
          All
        </Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.typeBtn, selectedType === 'e4' && styles.typeSelected]}
        onPress={() => setSelectedType('e4')}
        activeOpacity={0.7}
      >
        <Text style={[styles.typeBtnText, selectedType === 'e4' && styles.selectedText]}>
          1. e4
        </Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.typeBtn, selectedType === 'd4' && styles.typeSelected]}
        onPress={() => setSelectedType('d4')}
        activeOpacity={0.7}
      >
        <Text style={[styles.typeBtnText, selectedType === 'd4' && styles.selectedText]}>
          1. d4
        </Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.typeBtn, selectedType === 'irregular' && styles.typeSelected]}
        onPress={() => setSelectedType('irregular')}
        activeOpacity={0.7}
      >
        <Text style={[styles.typeBtnText, selectedType === 'irregular' && styles.selectedText]}>
          Other
        </Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>My Repertoires</Text>
        <TouchableOpacity style={styles.importButton} onPress={handleImportRepertoire}>
          <Text style={styles.importButtonText}>+ Import Repertoire</Text>
        </TouchableOpacity>
      </View>

      {repertoires.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>No Repertoires Yet</Text>
          <Text style={styles.emptySubtitle}>
            Import a PGN file to get started with your opening repertoire
          </Text>
          <TouchableOpacity style={styles.emptyButton} onPress={handleImportRepertoire}>
            <Text style={styles.emptyButtonText}>Import Your First Repertoire</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView>
          {renderColorSelector()}
          {renderOpeningTypeSelector()}

          <View style={styles.listContent}>
            {filteredRepertoires.length === 0 ? (
              <Text style={styles.noResults}>
                No repertoires found for this filter
              </Text>
            ) : (
              filteredRepertoires.map((repertoire) => (
                <View key={repertoire.id} style={styles.repertoireCard}>
                  <View style={styles.cardHeader}>
                    <TouchableOpacity
                      style={styles.cardHeaderMain}
                      onPress={() => setExpandedRepertoire(
                        expandedRepertoire === repertoire.id ? null : repertoire.id
                      )}
                      activeOpacity={0.7}
                    >
                      <View style={styles.cardTitleRow}>
                        {editingRepertoire === repertoire.id ? (
                          <TextInput
                            style={styles.editInput}
                            value={editedName}
                            onChangeText={setEditedName}
                            autoFocus
                            onSubmitEditing={() => handleSaveEdit(repertoire)}
                          />
                        ) : (
                          <Text style={styles.repertoireName}>{repertoire.name}</Text>
                        )}
                        <Text style={styles.expandIcon}>
                          {expandedRepertoire === repertoire.id ? '▼' : '▶'}
                        </Text>
                      </View>
                      <Text style={styles.repertoireInfo}>
                        {repertoire.eco} • {repertoire.chapters.length} chapter{repertoire.chapters.length !== 1 ? 's' : ''}
                      </Text>
                    </TouchableOpacity>

                    {editingRepertoire === repertoire.id ? (
                      <View style={styles.editActions}>
                        <TouchableOpacity
                          style={styles.saveButton}
                          onPress={() => handleSaveEdit(repertoire)}
                          activeOpacity={0.7}
                        >
                          <Text style={styles.saveButtonText}>Save</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.cancelButton}
                          onPress={handleCancelEdit}
                          activeOpacity={0.7}
                        >
                          <Text style={styles.cancelButtonText}>Cancel</Text>
                        </TouchableOpacity>
                      </View>
                    ) : (
                      <View style={styles.cardActions}>
                        <TouchableOpacity
                          style={styles.editButton}
                          onPress={() => handleStartEdit(repertoire)}
                          activeOpacity={0.7}
                        >
                          <Text style={styles.editButtonText}>Edit</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.deleteButton}
                          onPress={() => handleDeleteRepertoire(repertoire)}
                          activeOpacity={0.7}
                        >
                          <Text style={styles.deleteButtonText}>Delete</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>

                  {expandedRepertoire === repertoire.id && (
                    <View style={styles.chaptersContainer}>
                      {repertoire.chapters.map((chapter) => (
                        <View key={chapter.id} style={styles.chapterItem}>
                          {editingChapter === chapter.id ? (
                            <View style={styles.chapterEditContainer}>
                              <TextInput
                                style={styles.chapterEditInput}
                                value={editedChapterName}
                                onChangeText={setEditedChapterName}
                                autoFocus
                                onSubmitEditing={() => handleSaveEditChapter(repertoire.id, chapter.id)}
                              />
                              <View style={styles.chapterEditActions}>
                                <TouchableOpacity
                                  style={styles.chapterSaveButton}
                                  onPress={() => handleSaveEditChapter(repertoire.id, chapter.id)}
                                  activeOpacity={0.7}
                                >
                                  <Text style={styles.chapterSaveButtonText}>Save</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                  style={styles.chapterCancelButton}
                                  onPress={handleCancelEditChapter}
                                  activeOpacity={0.7}
                                >
                                  <Text style={styles.chapterCancelButtonText}>Cancel</Text>
                                </TouchableOpacity>
                              </View>
                            </View>
                          ) : (
                            <>
                              <TouchableOpacity
                                style={styles.chapterMainContent}
                                onPress={() => handleOpenChapter(repertoire.id, chapter.id)}
                                activeOpacity={0.7}
                              >
                                <Text style={styles.chapterName}>{chapter.name}</Text>
                                <Text style={styles.chapterDate}>
                                  {new Date(chapter.createdAt).toLocaleDateString()}
                                </Text>
                              </TouchableOpacity>
                              <TouchableOpacity
                                style={styles.chapterEditButton}
                                onPress={() => handleStartEditChapter(repertoire.id, chapter.id, chapter.name)}
                                activeOpacity={0.7}
                              >
                                <Text style={styles.chapterEditButtonText}>Edit</Text>
                              </TouchableOpacity>
                            </>
                          )}
                        </View>
                      ))}

                      <TouchableOpacity
                        style={styles.generateCardsButton}
                        onPress={() => handleGenerateCards(repertoire)}
                        activeOpacity={0.7}
                      >
                        <Text style={styles.generateCardsButtonText}>
                          Generate Review Cards
                        </Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              ))
            )}
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#2c2c2c',
  },
  header: {
    padding: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#3a3a3a',
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#e0e0e0',
  },
  importButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
  },
  importButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#e0e0e0',
    marginBottom: 6,
  },
  emptySubtitle: {
    fontSize: 12,
    color: '#888',
    textAlign: 'center',
    marginBottom: 16,
  },
  emptyButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
  },
  emptyButtonText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  colorSelector: {
    flexDirection: 'row',
    padding: 10,
    gap: 8,
  },
  colorBtn: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 6,
    backgroundColor: '#3a3a3a',
    alignItems: 'center',
  },
  selected: {
    backgroundColor: '#007AFF',
  },
  colorBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#aaa',
  },
  selectedText: {
    color: '#fff',
  },
  typeSelector: {
    flexDirection: 'row',
    paddingHorizontal: 10,
    paddingBottom: 10,
    gap: 6,
  },
  typeBtn: {
    flex: 1,
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 4,
    backgroundColor: '#3a3a3a',
    alignItems: 'center',
  },
  typeSelected: {
    backgroundColor: '#555',
  },
  typeBtnText: {
    fontSize: 11,
    fontWeight: '500',
    color: '#aaa',
  },
  listContent: {
    padding: 10,
  },
  noResults: {
    color: '#888',
    fontSize: 12,
    textAlign: 'center',
    fontStyle: 'italic',
    marginTop: 20,
  },
  repertoireCard: {
    backgroundColor: '#3a3a3a',
    borderRadius: 8,
    marginBottom: 8,
    overflow: 'hidden',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: 10,
  },
  cardHeaderMain: {
    flex: 1,
  },
  cardTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  editInput: {
    flex: 1,
    fontSize: 14,
    fontWeight: 'bold',
    color: '#e0e0e0',
    backgroundColor: '#2c2c2c',
    borderWidth: 1,
    borderColor: '#007AFF',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 3,
    marginRight: 6,
  },
  cardActions: {
    flexDirection: 'row',
    gap: 8,
    marginLeft: 12,
  },
  editActions: {
    flexDirection: 'row',
    gap: 8,
    marginLeft: 12,
  },
  editButton: {
    backgroundColor: '#555',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  editButtonText: {
    color: '#e0e0e0',
    fontSize: 10,
    fontWeight: '600',
  },
  deleteButton: {
    backgroundColor: '#FF3B30',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  deleteButtonText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '600',
  },
  saveButton: {
    backgroundColor: '#34C759',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '600',
  },
  cancelButton: {
    backgroundColor: '#555',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  cancelButtonText: {
    color: '#e0e0e0',
    fontSize: 10,
    fontWeight: '600',
  },
  repertoireName: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#e0e0e0',
    flex: 1,
  },
  expandIcon: {
    color: '#888',
    fontSize: 12,
    marginLeft: 6,
  },
  repertoireInfo: {
    fontSize: 11,
    color: '#aaa',
  },
  chaptersContainer: {
    backgroundColor: '#2c2c2c',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  chapterItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: 4,
    backgroundColor: '#3a3a3a',
    marginBottom: 6,
  },
  chapterMainContent: {
    flex: 1,
  },
  chapterName: {
    fontSize: 12,
    fontWeight: '500',
    color: '#e0e0e0',
    marginBottom: 2,
  },
  chapterDate: {
    fontSize: 9,
    color: '#888',
  },
  chapterEditButton: {
    backgroundColor: '#555',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 3,
    marginLeft: 6,
  },
  chapterEditButtonText: {
    color: '#e0e0e0',
    fontSize: 9,
    fontWeight: '600',
  },
  chapterEditContainer: {
    flex: 1,
  },
  chapterEditInput: {
    fontSize: 12,
    fontWeight: '500',
    color: '#e0e0e0',
    backgroundColor: '#2c2c2c',
    borderWidth: 1,
    borderColor: '#007AFF',
    borderRadius: 3,
    paddingHorizontal: 6,
    paddingVertical: 4,
    marginBottom: 6,
  },
  chapterEditActions: {
    flexDirection: 'row',
    gap: 8,
  },
  chapterSaveButton: {
    backgroundColor: '#34C759',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 3,
    flex: 1,
    alignItems: 'center',
  },
  chapterSaveButtonText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '600',
  },
  chapterCancelButton: {
    backgroundColor: '#555',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 3,
    flex: 1,
    alignItems: 'center',
  },
  chapterCancelButtonText: {
    color: '#e0e0e0',
    fontSize: 10,
    fontWeight: '600',
  },
  generateCardsButton: {
    backgroundColor: '#34C759',
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 6,
    alignItems: 'center',
    marginTop: 6,
    marginBottom: 6,
  },
  generateCardsButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
});
