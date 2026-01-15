import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { useStore } from '@store';
import { TrainingSession, TrainingConfig } from '@types';
import { TrainingService } from '@services/training/TrainingService';
import { InteractiveChessBoard } from '@components/chess/InteractiveChessBoard/InteractiveChessBoard';
import { VariationSelector } from '@components/training/VariationSelector';
import { Chess } from 'chess.js';

interface TrainingSessionScreenProps {
  navigation: any;
  route: {
    params: TrainingConfig;
  };
}

export default function TrainingSessionScreen({ navigation, route }: TrainingSessionScreenProps) {
  const { repertoires, lineStats, setTrainingSession, updateLineStats } = useStore();
  const { width } = useWindowDimensions();

  const [session, setSession] = useState<TrainingSession | null>(null);
  const [currentFen, setCurrentFen] = useState<string>(new Chess().fen());
  const [feedback, setFeedback] = useState<'correct' | 'incorrect' | null>(null);
  const [isAnimating, setIsAnimating] = useState(false);
  const [expectedMove, setExpectedMove] = useState<string>('');

  // Initialize session
  useEffect(() => {
    const repertoire = repertoires.find(r => r.id === route.params.repertoireId);
    if (!repertoire) {
      const msg = 'Repertoire not found';
      if (Platform.OS === 'web') {
        window.alert(msg);
      } else {
        Alert.alert('Error', msg);
      }
      navigation.goBack();
      return;
    }

    const newSession = TrainingService.startSession(route.params, repertoire, lineStats);

    if (newSession.lines.length === 0) {
      const msg = 'No lines available for training';
      if (Platform.OS === 'web') {
        window.alert(msg);
      } else {
        Alert.alert('Error', msg);
      }
      navigation.goBack();
      return;
    }

    setSession(newSession);
    setTrainingSession(newSession);

    // Set initial position
    const position = TrainingService.getCurrentPosition(newSession);
    if (position) {
      setCurrentFen(position.fen);
      setExpectedMove(position.expectedMove);
    }
  }, []);

  // Progress info
  const progress = useMemo(() => {
    if (!session) return null;
    return TrainingService.getProgress(session);
  }, [session]);

  // Get move path for display
  const movePath = useMemo(() => {
    if (!session) return '';
    const currentLine = session.lines[session.currentLineIndex];
    if (!currentLine) return '';

    // Find current position in line
    const userMoves = currentLine.moves.filter(m => m.isUserMove);
    const currentMove = userMoves[session.currentMoveIndex];
    if (!currentMove) return '';

    const currentMoveIndexInLine = currentLine.moves.findIndex(
      m => m.nodeId === currentMove.nodeId
    );

    // Build move path up to current position
    const moves = currentLine.moves.slice(0, currentMoveIndexInLine);
    const chess = new Chess();
    moves.forEach(m => chess.move(m.san));

    return chess.history().join(' ');
  }, [session]);

  const handleMove = async (from: string, to: string) => {
    if (!session || isAnimating || session.awaitingRating) return;

    const result = TrainingService.processUserMove(session, from, to);

    if (!result.isCorrect) {
      // Wrong move - show feedback
      setFeedback('incorrect');
      setTimeout(() => setFeedback(null), 1500);
      return;
    }

    // Correct move
    setFeedback('correct');

    if (result.feedback === 'line-complete') {
      // Line is complete - show rating buttons
      setSession({ ...session, awaitingRating: true });
      setFeedback(null);
      return;
    }

    // Check if there's an opponent move to animate
    if (result.opponentMove && result.opponentFen) {
      setIsAnimating(true);

      // Brief pause to show correct feedback
      setTimeout(() => {
        setCurrentFen(result.opponentFen!);

        // Animate opponent move
        setTimeout(() => {
          setIsAnimating(false);
          setFeedback(null);

          // Move to next user position
          if (result.nextPosition) {
            setCurrentFen(result.nextPosition.fen);
            TrainingService.advanceToNextPosition(session);
            setSession({ ...session });

            // Update expected move
            const position = TrainingService.getCurrentPosition(session);
            if (position) {
              setExpectedMove(position.expectedMove);
            }
          } else {
            // Line complete
            setSession({ ...session, awaitingRating: true });
          }
        }, 200);
      }, 500);
    } else if (result.nextPosition) {
      // Next move is also user's turn
      setTimeout(() => {
        setCurrentFen(result.nextPosition!.fen);
        setFeedback(null);
        TrainingService.advanceToNextPosition(session);
        setSession({ ...session });

        const position = TrainingService.getCurrentPosition(session);
        if (position) {
          setExpectedMove(position.expectedMove);
        }
      }, 500);
    }
  };

  const handleRating = async (quality: number) => {
    if (!session) return;

    const { updatedStats, hasMore } = TrainingService.completeLineAndAdvance(
      session,
      quality,
      lineStats
    );

    // Update stats in store
    await updateLineStats(updatedStats);

    if (hasMore) {
      // Move to next line
      setSession({ ...session });
      const position = TrainingService.getCurrentPosition(session);
      if (position) {
        setCurrentFen(position.fen);
        setExpectedMove(position.expectedMove);
      }
    } else {
      // Session complete
      const msg = `Training complete! You drilled ${session.linesCompleted} lines.`;
      if (Platform.OS === 'web') {
        window.alert(msg);
      } else {
        Alert.alert('Session Complete', msg);
      }
      setTrainingSession(null);
      navigation.goBack();
    }
  };

  const handleEndSession = () => {
    const msg = 'Are you sure you want to end this training session?';
    if (Platform.OS === 'web') {
      const confirmed = window.confirm(msg);
      if (confirmed) {
        setTrainingSession(null);
        navigation.goBack();
      }
    } else {
      Alert.alert('End Session', msg, [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'End',
          style: 'destructive',
          onPress: () => {
            setTrainingSession(null);
            navigation.goBack();
          },
        },
      ]);
    }
  };

  const handleSelectLine = (lineIndex: number) => {
    if (!session || session.awaitingRating || isAnimating) return;

    // Switch to selected line
    session.currentLineIndex = lineIndex;
    session.currentMoveIndex = session.lineProgress[session.lines[lineIndex].id] || 0;

    setSession({ ...session });
    setFeedback(null);

    // Update position
    const position = TrainingService.getCurrentPosition(session);
    if (position) {
      setCurrentFen(position.fen);
      setExpectedMove(position.expectedMove);
    }
  };

  if (!session || !progress) {
    return (
      <View style={styles.container}>
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

  const isWideScreen = width > 900;

  return (
    <View style={styles.container}>
      {/* Progress Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.progressText}>
            Line {progress.lineNumber}/{progress.totalLines}
          </Text>
          <Text style={styles.subProgressText}>
            Move {progress.moveNumber}/{progress.totalMovesInLine}
          </Text>
        </View>
        <TouchableOpacity onPress={handleEndSession} style={styles.endButton}>
          <Text style={styles.endButtonText}>End Session</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scrollContainer}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={true}
      >
        {/* Main Content Area */}
        <View style={[styles.mainContent, isWideScreen && styles.mainContentWide]}>
          {/* Chess Board */}
          <View style={styles.boardContainer}>
            <InteractiveChessBoard
              fen={currentFen}
              onMove={handleMove}
              orientation={session.color}
              disabled={isAnimating || session.awaitingRating}
            />
          </View>

          {/* Variation Selector */}
          {isWideScreen && (
            <VariationSelector
              lines={session.lines}
              currentLineIndex={session.currentLineIndex}
              onSelectLine={handleSelectLine}
              lineProgress={session.lineProgress}
            />
          )}
        </View>

        {/* Move Path */}
        {movePath && (
          <ScrollView horizontal style={styles.movePathContainer} showsHorizontalScrollIndicator={false}>
            <Text style={styles.movePathText}>{movePath}</Text>
          </ScrollView>
        )}

        {/* Variation Selector (narrow screens) */}
        {!isWideScreen && (
          <View style={styles.variationSelectorNarrow}>
            <VariationSelector
              lines={session.lines}
              currentLineIndex={session.currentLineIndex}
              onSelectLine={handleSelectLine}
              lineProgress={session.lineProgress}
            />
          </View>
        )}

        {/* Feedback */}
        {feedback && (
          <View style={[styles.feedbackContainer, feedback === 'incorrect' && styles.feedbackIncorrect]}>
            <Text style={styles.feedbackText}>
              {feedback === 'correct' ? 'Correct!' : 'Try Again'}
            </Text>
            {feedback === 'incorrect' && expectedMove && (
              <Text style={styles.suggestionText}>
                Correct move: {expectedMove}
              </Text>
            )}
          </View>
        )}

        {/* Rating Buttons (shown when line is complete) */}
        {session.awaitingRating && (
          <View style={styles.ratingContainer}>
            <Text style={styles.ratingTitle}>How difficult was this line?</Text>
            <View style={styles.ratingButtons}>
              <TouchableOpacity
                style={[styles.ratingButton, styles.ratingAgain]}
                onPress={() => handleRating(0)}
              >
                <Text style={styles.ratingButtonText}>Again</Text>
                <Text style={styles.ratingSubtext}>Restart</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.ratingButton, styles.ratingHard]}
                onPress={() => handleRating(3)}
              >
                <Text style={styles.ratingButtonText}>Hard</Text>
                <Text style={styles.ratingSubtext}>Soon</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.ratingButton, styles.ratingGood]}
                onPress={() => handleRating(4)}
              >
                <Text style={styles.ratingButtonText}>Good</Text>
                <Text style={styles.ratingSubtext}>Normal</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.ratingButton, styles.ratingEasy]}
                onPress={() => handleRating(5)}
              >
                <Text style={styles.ratingButtonText}>Easy</Text>
                <Text style={styles.ratingSubtext}>Longer</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1e1e1e',
  },
  loadingText: {
    color: '#fff',
    fontSize: 18,
    textAlign: 'center',
    marginTop: 100,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#2a2a2a',
    borderBottomWidth: 1,
    borderBottomColor: '#444',
  },
  progressText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  subProgressText: {
    color: '#bbb',
    fontSize: 12,
    marginTop: 1,
  },
  endButton: {
    backgroundColor: '#d32f2f',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 4,
  },
  endButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  scrollContainer: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: 20,
  },
  mainContent: {
    paddingTop: 8,
  },
  mainContentWide: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'flex-start',
    gap: 12,
    paddingHorizontal: 12,
  },
  boardContainer: {
    alignItems: 'center',
  },
  variationSelectorNarrow: {
    marginHorizontal: 12,
    marginTop: 8,
  },
  movePathContainer: {
    marginHorizontal: 12,
    marginTop: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
    backgroundColor: '#2a2a2a',
    borderRadius: 4,
    maxHeight: 32,
  },
  movePathText: {
    color: '#fff',
    fontSize: 12,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  feedbackContainer: {
    marginHorizontal: 12,
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#2e7d32',
    borderRadius: 4,
    alignItems: 'center',
  },
  feedbackIncorrect: {
    backgroundColor: '#c62828',
  },
  feedbackText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  suggestionText: {
    color: '#fff',
    fontSize: 13,
    marginTop: 4,
    opacity: 0.9,
  },
  ratingContainer: {
    marginHorizontal: 12,
    marginTop: 8,
    padding: 12,
    backgroundColor: '#2a2a2a',
    borderRadius: 6,
  },
  ratingTitle: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
    textAlign: 'center',
  },
  ratingButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 6,
  },
  ratingButton: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderRadius: 4,
    alignItems: 'center',
  },
  ratingAgain: {
    backgroundColor: '#c62828',
  },
  ratingHard: {
    backgroundColor: '#f57c00',
  },
  ratingGood: {
    backgroundColor: '#388e3c',
  },
  ratingEasy: {
    backgroundColor: '#1976d2',
  },
  ratingButtonText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  ratingSubtext: {
    color: '#fff',
    fontSize: 10,
    marginTop: 1,
    opacity: 0.8,
  },
});
