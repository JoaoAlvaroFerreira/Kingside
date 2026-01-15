/**
 * Repertoire Viewer Screen - View and navigate through a single repertoire
 */

import React from 'react';
import {
  SafeAreaView,
  StyleSheet,
  View,
  Text,
  Button,
  ScrollView,
} from 'react-native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '@navigation/AppNavigator';
import { ChessBoard } from '@components/chess/ChessBoard/ChessBoard';
import { useStore } from '@store/index';
import { useChessGame } from '@hooks/chess/useChessGame';

type RepertoireViewerScreenNavigationProp = StackNavigationProp<RootStackParamList, 'Viewer'>;

interface RepertoireViewerScreenProps {
  navigation: RepertoireViewerScreenNavigationProp;
}

export const RepertoireViewerScreen: React.FC<RepertoireViewerScreenProps> = ({
  navigation,
}) => {
  const [trainingMode, setTrainingMode] = React.useState(false);
  const {
    currentRepertoire,
    currentChapterId,
    currentVariationIndex,
    currentMoveIndex,
    currentFEN,
    boardOrientation,
    selectChapter,
    selectVariation,
    nextMove,
    previousMove,
    goToStart,
    goToEnd,
    flipBoard,
  } = useStore();

  const currentChapter = currentRepertoire?.chapters.find((c) => c.id === currentChapterId);
  const currentVariation = currentChapter?.variations[currentVariationIndex];
  const moves = currentVariation?.moves || [];

  const { fen } = useChessGame(moves, currentMoveIndex);
  const totalMoves = currentVariation?.moves.length || 0;

  if (!currentRepertoire) {
    return (
      <SafeAreaView style={styles.emptyContainer}>
        <View style={styles.emptyContent}>
          <Text style={styles.emptyTitle}>No repertoire loaded</Text>
          <Text style={styles.emptySubtitle}>Select a repertoire from the library</Text>
          <View style={styles.emptyActions}>
            <Button title="Go to Library" onPress={() => navigation.navigate('Library')} />
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <Button title="← Back" onPress={() => navigation.goBack()} />
          <Text style={styles.title}>{currentRepertoire.name}</Text>
        </View>

        {/* Chess Board */}
        <View style={styles.boardSection}>
          <ChessBoard fen={fen} orientation={boardOrientation} />
          <View style={styles.boardControls}>
            <Button title="🔄 Flip Board" onPress={flipBoard} />
            <Button
              title={trainingMode ? "📖 Study Mode" : "🎯 Training Mode"}
              onPress={() => setTrainingMode(!trainingMode)}
              color={trainingMode ? "#FF9500" : "#007AFF"}
            />
          </View>
        </View>

        {/* Current Position Info */}
        {currentChapter && (
          <View style={styles.infoSection}>
            <Text style={styles.infoTitle}>{currentChapter.name}</Text>
            {totalMoves > 0 && (
              <Text style={styles.moveInfo}>
                Position: {currentMoveIndex} / {totalMoves}
              </Text>
            )}
          </View>
        )}

        {/* Chapter Selector */}
        {currentRepertoire.chapters.length > 1 && (
          <View style={styles.chapterSection}>
            <Text style={styles.sectionTitle}>Chapters</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {currentRepertoire.chapters.map((chapter, index) => (
                <Button
                  key={chapter.id}
                  title={`${index + 1}. ${chapter.name.substring(0, 15)}`}
                  onPress={() => selectChapter(chapter.id)}
                  color={currentChapterId === chapter.id ? '#007AFF' : '#999'}
                />
              ))}
            </ScrollView>
          </View>
        )}

        {/* Navigation Controls */}
        {currentVariation && (
          <View style={styles.controls}>
            <Button title="⏮ Start" onPress={goToStart} />
            <Button title="◀ Prev" onPress={previousMove} />
            <Button title="Next ▶" onPress={nextMove} />
            <Button title="End ⏭" onPress={goToEnd} />
          </View>
        )}

        {/* Move List */}
        {currentVariation && currentVariation.moves.length > 0 && !trainingMode && (
          <View style={styles.moveListSection}>
            <Text style={styles.sectionTitle}>Moves</Text>
            <Text style={styles.moveList}>
              {currentVariation.moves.map((move, index) => {
                const moveNumber = Math.floor(index / 2) + 1;
                const isWhiteMove = index % 2 === 0;
                const isCurrentMove = index === currentMoveIndex - 1;

                return (
                  <Text
                    key={index}
                    style={[
                      styles.moveText,
                      isCurrentMove && styles.currentMove,
                    ]}
                  >
                    {index > 0 && isWhiteMove ? '\n' : ''}
                    {isWhiteMove ? `${moveNumber}.` : ''} {move}{' '}
                  </Text>
                );
              })}
            </Text>
          </View>
        )}

        {trainingMode && (
          <View style={styles.trainingHint}>
            <Text style={styles.trainingText}>
              🎯 Training mode: Try to recall the next move, then tap "Next" to check!
            </Text>
            {currentMoveIndex > 0 && currentMoveIndex <= totalMoves && (
              <Text style={styles.lastMoveText}>
                Last move: {currentVariation?.moves[currentMoveIndex - 1]}
              </Text>
            )}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  scrollContent: {
    padding: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginLeft: 12,
    flex: 1,
  },
  boardSection: {
    alignItems: 'center',
    marginVertical: 20,
  },
  boardControls: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  infoSection: {
    backgroundColor: '#f5f5f5',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  moveInfo: {
    fontSize: 12,
    color: '#666',
  },
  chapterSection: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
  },
  controls: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 16,
  },
  moveListSection: {
    backgroundColor: '#f9f9f9',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  moveList: {
    fontSize: 13,
    lineHeight: 20,
  },
  moveText: {
    marginRight: 4,
  },
  currentMove: {
    fontWeight: 'bold',
    color: '#007AFF',
    backgroundColor: '#e8f4ff',
    paddingHorizontal: 2,
  },
  emptyContainer: {
    flex: 1,
    backgroundColor: '#fff',
  },
  emptyContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 8,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginBottom: 24,
  },
  emptyActions: {
    gap: 12,
    width: '100%',
  },
  trainingHint: {
    backgroundColor: '#FFF3CD',
    padding: 12,
    borderRadius: 8,
    borderLeftWidth: 4,
    borderLeftColor: '#FF9500',
    marginBottom: 16,
  },
  trainingText: {
    fontSize: 14,
    color: '#856404',
    marginBottom: 8,
  },
  lastMoveText: {
    fontSize: 13,
    color: '#856404',
    fontWeight: '600',
  },
});
