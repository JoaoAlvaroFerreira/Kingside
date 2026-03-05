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
import { TrainingSession, TrainingConfig, TrainingTimingSettings } from '@types';
import { TrainingService } from '@services/training/TrainingService';
import { ChessWorkspace } from '@components/chess/ChessWorkspace/ChessWorkspace';
import { VariationSelector } from '@components/training/VariationSelector';
import { Chess } from 'chess.js';

interface TrainingSessionScreenProps {
  navigation: any;
  route: {
    params: TrainingConfig;
  };
}

export default function TrainingSessionScreen({ navigation, route }: TrainingSessionScreenProps) {
  const { repertoires, lineStats, setTrainingSession, updateLineStats, reviewSettings } = useStore();
  const timing: TrainingTimingSettings = reviewSettings.training;
  const { width } = useWindowDimensions();

  const [session, setSession] = useState<TrainingSession | null>(null);
  const [currentFen, setCurrentFen] = useState<string>(new Chess().fen());
  const [feedback, setFeedback] = useState<'correct' | 'incorrect' | null>(null);
  const [isAnimating, setIsAnimating] = useState(false);
  const [expectedMove, setExpectedMove] = useState<string>('');
  const [hintArrowUci, setHintArrowUci] = useState<string | undefined>(undefined);
  const [currentComment, setCurrentComment] = useState<string | undefined>(undefined);

  const isLearnMode = session?.learnMode ?? false;

  // Compute learn mode hint arrow for current user move
  const learnArrowUci = useMemo(() => {
    if (!session || !isLearnMode || isAnimating || session.awaitingRating) return undefined;
    const currentLine = session.lines[session.currentLineIndex];
    if (!currentLine) return undefined;
    const userMoves = currentLine.moves.filter(m => m.isUserMove);
    const currentUserMove = userMoves[session.currentMoveIndex];
    if (!currentUserMove) return undefined;
    try {
      const chess = new Chess(currentUserMove.preFen);
      const move = chess.move(currentUserMove.san);
      if (move) return `${move.from}${move.to}`;
    } catch { /* ignore */ }
    return undefined;
  }, [session, isLearnMode, isAnimating]);

  // Update comment when position changes
  const updateComment = (sess: TrainingSession) => {
    if (!sess.learnMode) {
      setCurrentComment(undefined);
      return;
    }
    const currentLine = sess.lines[sess.currentLineIndex];
    if (!currentLine) { setCurrentComment(undefined); return; }
    const userMoves = currentLine.moves.filter(m => m.isUserMove);
    const currentUserMove = userMoves[sess.currentMoveIndex];
    setCurrentComment(currentUserMove?.comment || undefined);
  };

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
    updateComment(newSession);
  }, []);

  // Progress info
  const progress = useMemo(() => {
    if (!session) return null;
    return TrainingService.getProgress(session);
  }, [session]);

  const handleMove = async (from: string, to: string) => {
    if (!session || isAnimating || session.awaitingRating) return;

    const result = TrainingService.processUserMove(session, from, to);

    if (!result.isCorrect) {
      // Wrong move - show feedback and hint arrow
      setFeedback('incorrect');
      try {
        const hint = new Chess(currentFen);
        const move = hint.move(result.expectedMove);
        if (move) setHintArrowUci(`${move.from}${move.to}`);
      } catch { /* ignore */ }
      setTimeout(() => {
        setFeedback(null);
        setHintArrowUci(undefined);
      }, timing.incorrectDelayMs);
      return;
    }

    // Correct move
    setFeedback('correct');
    setHintArrowUci(undefined);

    if (result.feedback === 'line-complete') {
      if (isLearnMode) {
        // Learn mode: brief feedback then auto-advance
        setFeedback('correct');
        setCurrentComment(undefined);
        setTimeout(() => {
          setFeedback(null);
          completeLineAndAdvance();
        }, timing.lineCompleteDelayMs);
      } else {
        setSession({ ...session, awaitingRating: true });
      }
      return;
    }

    // Check if there's an opponent move to play
    if (result.opponentMove && result.opponentFen) {
      setIsAnimating(true);

      // Show opponent's comment if in learn mode
      if (isLearnMode) {
        const currentLine = session.lines[session.currentLineIndex];
        const userMoves = currentLine.moves.filter(m => m.isUserMove);
        const currentUserMove = userMoves[session.currentMoveIndex];
        if (currentUserMove) {
          const currentIdx = currentLine.moves.findIndex(m => m.nodeId === currentUserMove.nodeId);
          const opponentMove = currentLine.moves[currentIdx + 1];
          if (opponentMove?.comment) {
            setCurrentComment(opponentMove.comment);
          }
        }
      }

      const advanceAfterOpponent = () => {
        setIsAnimating(false);
        setFeedback(null);

        if (result.nextPosition) {
          setCurrentFen(result.nextPosition.fen);
          TrainingService.advanceToNextPosition(session);
          setSession({ ...session });

          const position = TrainingService.getCurrentPosition(session);
          if (position) {
            setExpectedMove(position.expectedMove);
          }
          updateComment(session);
        } else {
          if (isLearnMode) {
            setCurrentComment(undefined);
            setTimeout(() => completeLineAndAdvance(), timing.lineCompleteDelayMs);
          } else {
            setSession({ ...session, awaitingRating: true });
          }
        }
      };

      // Brief pause to show correct feedback, then play opponent move
      setTimeout(() => {
        setCurrentFen(result.opponentFen!);

        if (timing.opponentAnimation) {
          // Animate: show opponent position, then advance after 200ms
          setTimeout(advanceAfterOpponent, 200);
        } else {
          advanceAfterOpponent();
        }
      }, timing.correctDelayMs);
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
        updateComment(session);
      }, timing.correctDelayMs);
    }
  };

  const completeLineAndAdvance = async () => {
    if (!session) return;

    const { updatedStats, hasMore } = TrainingService.completeLineAndAdvance(
      session,
      4, // quality=4 for learn mode (just tracks totalDrills)
      lineStats
    );

    await updateLineStats(updatedStats);

    if (hasMore) {
      setSession({ ...session });
      const position = TrainingService.getCurrentPosition(session);
      if (position) {
        setCurrentFen(position.fen);
        setExpectedMove(position.expectedMove);
      }
      updateComment(session);
    } else {
      const msg = `Training complete! You studied ${session.linesCompleted} of ${session.totalLineCount} lines.`;
      if (Platform.OS === 'web') {
        window.alert(msg);
      } else {
        Alert.alert('Session Complete', msg);
      }
      setTrainingSession(null);
      navigation.goBack();
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
      const msg = `Training complete! You drilled ${session.linesCompleted} of ${session.totalLineCount} lines.`;
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
    updateComment(session);
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
        <View style={styles.headerLeft}>
          <View style={[styles.modeBadge, isLearnMode && styles.modeBadgeLearn]}>
            <Text style={styles.modeBadgeText}>{isLearnMode ? 'Learn' : 'Drill'}</Text>
          </View>
          <View>
            <Text style={styles.progressText}>
              Line {progress.lineNumber}/{progress.totalLines}
            </Text>
            <Text style={styles.subProgressText}>
              Move {progress.moveNumber}/{progress.totalMovesInLine}
              {progress.holdbackCount > 0 && ` · ${progress.holdbackCount} on hold`}
            </Text>
          </View>
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
            <ChessWorkspace
              fen={currentFen}
              onMove={handleMove}
              disabled={isAnimating || session.awaitingRating}
              screenKey="training"
              showMoveHistory={false}
              showSettingsGear={false}
              orientationOverride={session.color}
              hintArrow={isLearnMode ? learnArrowUci : hintArrowUci}
              hintArrowColor={isLearnMode ? 'rgba(74, 158, 255, 0.7)' : undefined}
            />
          </View>

          {/* Variation Selector */}
          {isWideScreen && (
            <VariationSelector
              lines={session.lines}
              currentLineIndex={session.currentLineIndex}
              onSelectLine={handleSelectLine}
              lineProgress={session.lineProgress}
              holdbackCount={session.holdbackLines.length}
            />
          )}
        </View>

        {/* Comment Box (learn mode) */}
        {isLearnMode && currentComment && (
          <ScrollView style={styles.commentBox} nestedScrollEnabled>
            <Text style={styles.commentText}>{currentComment}</Text>
          </ScrollView>
        )}

        {/* Feedback — directly below board so it's always visible */}
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

        {/* Rating Buttons — directly below board so it's always visible */}
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

        {/* Variation Selector (narrow screens) */}
        {!isWideScreen && (
          <View style={styles.variationSelectorNarrow}>
            <VariationSelector
              lines={session.lines}
              currentLineIndex={session.currentLineIndex}
              onSelectLine={handleSelectLine}
              lineProgress={session.lineProgress}
              holdbackCount={session.holdbackLines.length}
            />
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
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  modeBadge: {
    backgroundColor: '#f57c00',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  modeBadgeLearn: {
    backgroundColor: '#1976d2',
  },
  modeBadgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
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
  commentBox: {
    marginHorizontal: 12,
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#3a3a3a',
    borderLeftWidth: 3,
    borderLeftColor: '#87CEEB',
    borderRadius: 4,
    maxHeight: 80,
  },
  commentText: {
    color: '#e0e0e0',
    fontSize: 13,
    lineHeight: 18,
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
