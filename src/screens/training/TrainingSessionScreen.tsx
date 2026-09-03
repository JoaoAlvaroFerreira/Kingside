import React, { useState, useEffect, useLayoutEffect, useMemo, useCallback } from 'react';
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
import { TrainingSession, TrainingConfig, TrainingTimingSettings, normalizeFen } from '@types';
import { TrainingService } from '@services/training/TrainingService';
import { DatabaseService } from '@services/database/DatabaseService';
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
  const repertoires = useStore(s => s.repertoires);
  const lineStats = useStore(s => s.lineStats);
  const setTrainingSession = useStore(s => s.setTrainingSession);
  const updateLineStats = useStore(s => s.updateLineStats);
  const removeLineStats = useStore(s => s.removeLineStats);
  const reviewSettings = useStore(s => s.reviewSettings);
  const timing: TrainingTimingSettings = reviewSettings.training;
  const { width, height } = useWindowDimensions();

  const [session, setSession] = useState<TrainingSession | null>(null);
  /**
   * The line you stepped off to try its alternatives. Holding it here is what makes the
   * detour a detour: no flag on the session, and the drill it interrupted is untouched
   * because TrainingService mutates whichever session object it is handed.
   */
  const [pausedSession, setPausedSession] = useState<TrainingSession | null>(null);
  const inAlternatives = pausedSession !== null;
  const [currentFen, setCurrentFen] = useState<string>(new Chess().fen());
  const [feedback, setFeedback] = useState<'correct' | 'incorrect' | 'alternative' | null>(null);
  const [isAnimating, setIsAnimating] = useState(false);
  const [expectedMove, setExpectedMove] = useState<string>('');
  const [hintArrowUci, setHintArrowUci] = useState<string | undefined>(undefined);
  const [currentComment, setCurrentComment] = useState<string | undefined>(undefined);
  const [opponentComment, setOpponentComment] = useState<string | undefined>(undefined);

  // Semi-learn: the teaching arrow shows until you have played the move correctly once,
  // and comes back if you later get it wrong. Keyed on position + move, per repertoire.
  const [seenMoves, setSeenMoves] = useState<Set<string>>(() => new Set());
  const guidance = session?.guidance ?? 'none';
  const showsComments = guidance !== 'none';

  const seenKey = (fen: string, san: string) => `${normalizeFen(fen)}|${san}`;

  const isMoveTaught = useCallback(
    (fen: string, san: string) => {
      if (guidance === 'learn') return true;
      if (guidance === 'semi-learn') return !seenMoves.has(seenKey(fen, san));
      return false;
    },
    [guidance, seenMoves]
  );

  // Compute learn mode hint arrow for current user move
  const learnArrowUci = useMemo(() => {
    if (!session || guidance === 'none' || isAnimating || session.awaitingRating) return undefined;
    const currentLine = session.lines[session.currentLineIndex];
    if (!currentLine) return undefined;
    const userMoves = currentLine.moves.filter(m => m.isUserMove);
    const currentUserMove = userMoves[session.currentMoveIndex];
    if (!currentUserMove) return undefined;
    if (!isMoveTaught(currentUserMove.preFen, currentUserMove.san)) return undefined;
    try {
      const chess = new Chess(currentUserMove.preFen);
      const move = chess.move(currentUserMove.san);
      if (move) return `${move.from}${move.to}`;
    } catch { /* ignore */ }
    return undefined;
  }, [session, guidance, isAnimating, isMoveTaught]);

  // Update comment when position changes
  const updateComment = (sess: TrainingSession) => {
    if (sess.guidance === 'none') {  // semi-learn keeps comments; only the arrow is conditional
      setCurrentComment(undefined);
      setOpponentComment(undefined);
      return;
    }
    const currentLine = sess.lines[sess.currentLineIndex];
    if (!currentLine) { setCurrentComment(undefined); setOpponentComment(undefined); return; }
    const userMoves = currentLine.moves.filter(m => m.isUserMove);
    const currentUserMove = userMoves[sess.currentMoveIndex];
    setCurrentComment(currentUserMove?.comment || undefined);

    // Find the opponent move immediately before this user move
    if (currentUserMove) {
      const idx = currentLine.moves.findIndex(m => m.nodeId === currentUserMove.nodeId);
      const prevMove = idx > 0 ? currentLine.moves[idx - 1] : null;
      setOpponentComment(prevMove && !prevMove.isUserMove ? (prevMove.comment || undefined) : undefined);
    } else {
      setOpponentComment(undefined);
    }
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

    if (newSession.guidance === 'semi-learn') {
      DatabaseService.getSeenMoves(repertoire.id).then(setSeenMoves);
    }

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
      // Wrong move (or alternative) — show feedback and hint arrow for expected move
      // Getting it wrong un-teaches the move, so semi-learn puts the arrow back next time.
      if (session.guidance === 'semi-learn' && result.feedback !== 'alternative') {
        const key = seenKey(currentFen, result.expectedMove);
        if (seenMoves.has(key)) {
          setSeenMoves(prev => { const next = new Set(prev); next.delete(key); return next; });
          void DatabaseService.unmarkMoveSeen(session.repertoireId, currentFen, result.expectedMove);
        }
      }
      setFeedback(result.feedback === 'alternative' ? 'alternative' : 'incorrect');
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
    if (session.guidance === 'semi-learn') {
      const key = seenKey(currentFen, result.expectedMove);
      if (!seenMoves.has(key)) {
        setSeenMoves(prev => new Set(prev).add(key));
        void DatabaseService.markMoveSeen(session.repertoireId, currentFen, result.expectedMove);
      }
    }

    setFeedback('correct');
    setHintArrowUci(undefined);

    if (result.feedback === 'line-complete') {
      if (result.resultFen) setCurrentFen(result.resultFen);
      setSession({ ...session, awaitingRating: true });
      return;
    }

    // Check if there's an opponent move to play
    if (result.opponentMove && result.opponentFen) {
      setIsAnimating(true);

      // Show opponent's comment if guidance is on
      if (showsComments) {
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

        // Advance FIRST (may switch to a different line in WFS mode),
        // then read the new position so board FEN and expected move are in sync.
        const hasMore = TrainingService.advanceToNextPosition(session);
        setSession({ ...session });

        if (hasMore) {
          const position = TrainingService.getCurrentPosition(session);
          if (position) {
            setCurrentFen(position.fen);
            setExpectedMove(position.expectedMove);
          }
          updateComment(session);
        } else {
          setCurrentComment(undefined);
          setOpponentComment(undefined);
          setSession({ ...session, awaitingRating: true });
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
        setFeedback(null);
        const hasMore = TrainingService.advanceToNextPosition(session);
        setSession({ ...session });

        if (hasMore) {
          const position = TrainingService.getCurrentPosition(session);
          if (position) {
            setCurrentFen(position.fen);
            setExpectedMove(position.expectedMove);
          }
          updateComment(session);
        } else {
          setCurrentComment(undefined);
          setOpponentComment(undefined);
          setSession({ ...session, awaitingRating: true });
        }
      }, timing.correctDelayMs);
    }
  };

  const _completeLineAndAdvance = async () => {
    if (!session) return;

    const { updatedStats, alsoCompleted, hasMore } = TrainingService.completeLineAndAdvance(
      session,
      4, // quality=4 for learn mode (just tracks totalDrills)
      lineStats
    );

    await updateLineStats(updatedStats);
    // Width-first can finish shorter lines as a side effect of drilling a longer one.
    for (const covered of alsoCompleted) await updateLineStats(covered);

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

    const { updatedStats, alsoCompleted, hasMore } = TrainingService.completeLineAndAdvance(
      session,
      quality,
      lineStats
    );

    // Update stats in store
    await updateLineStats(updatedStats);
    // Width-first can finish shorter lines as a side effect of drilling a longer one.
    for (const covered of alsoCompleted) await updateLineStats(covered);

    if (hasMore) {
      // Move to next line
      setFeedback(null);
      setHintArrowUci(undefined);
      setSession({ ...session });
      const position = TrainingService.getCurrentPosition(session);
      if (position) {
        setCurrentFen(position.fen);
        setExpectedMove(position.expectedMove);
      }
      updateComment(session);
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

  const handleAnalyseLine = () => {
    const currentLine = session?.lines[session.currentLineIndex];
    if (!currentLine?.moves.length) return;
    // Pushed on top of the session rather than navigating to the drawer's
    // Analysis screen: that would pop this screen and the session is rebuilt
    // from route params on mount, so the drill progress would be lost.
    navigation.push('LineAnalysis', {
      line: {
        moves: currentLine.moves.map(m => m.san),
        startFen: currentLine.moves[0].preFen,
      },
    });
  };

  const handleRepeatVariation = () => {
    if (!session) return;
    session.currentMoveIndex = 0;
    session.awaitingRating = false;
    setFeedback(null);
    setHintArrowUci(undefined);
    setSession({ ...session });
    const position = TrainingService.getCurrentPosition(session);
    if (position) {
      setCurrentFen(position.fen);
      setExpectedMove(position.expectedMove);
    }
    updateComment(session);
  };

  const handleTestAlternatives = () => {
    if (!session || isAnimating || session.awaitingRating) return;
    const repertoire = repertoires.find(r => r.id === session.repertoireId);
    if (!repertoire) return;

    const detour = TrainingService.startAlternativesSession(session, repertoire);
    if (!detour) {
      const msg = 'Nothing else is prepared against the move that led here.';
      if (Platform.OS === 'web') window.alert(msg);
      else Alert.alert('No Alternatives', msg);
      return;
    }

    setPausedSession(session);
    setSession(detour);
    setFeedback(null);
    setHintArrowUci(undefined);
    const position = TrainingService.getCurrentPosition(detour);
    if (position) {
      setCurrentFen(position.fen);
      setExpectedMove(position.expectedMove);
    }
    updateComment(detour);
  };

  const resumeMainSession = useCallback(() => {
    const main = pausedSession;
    if (!main) return;
    setPausedSession(null);
    setSession(main);
    setFeedback(null);
    setHintArrowUci(undefined);
    const position = TrainingService.getCurrentPosition(main);
    if (position) {
      setCurrentFen(position.fen);
      setExpectedMove(position.expectedMove);
    }
    updateComment(main);
  }, [pausedSession]);

  // A detour line finishes by advancing, never by asking for a rating: these are two-move
  // fragments, and SM-2 evidence about the whole line is not what answering one of them
  // is. Runs before paint so the rating panel never flashes.
  useLayoutEffect(() => {
    if (!session || !inAlternatives || !session.awaitingRating) return;
    const { hasMore } = TrainingService.completeLineAndAdvance(session, 4, []);
    if (!hasMore) {
      resumeMainSession();
      return;
    }
    setSession({ ...session });
    const position = TrainingService.getCurrentPosition(session);
    if (position) {
      setCurrentFen(position.fen);
      setExpectedMove(position.expectedMove);
    }
    updateComment(session);
  }, [session, inAlternatives, resumeMainSession]);

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

  const handleLongPressLine = (lineIndex: number) => {
    if (!session) return;
    const lineToDelete = session.lines[lineIndex];
    const confirmMsg = 'Delete this line\'s training stats? It will be treated as new next session.';
    if (Platform.OS === 'web') {
      if (window.confirm(confirmMsg)) {
        deleteLine(lineIndex, lineToDelete.id);
      }
    } else {
      Alert.alert('Delete Training Line', confirmMsg, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => deleteLine(lineIndex, lineToDelete.id) },
      ]);
    }
  };

  const deleteLine = async (lineIndex: number, lineId: string) => {
    if (!session) return;
    await removeLineStats(lineId);

    const newLines = session.lines.filter((_, i) => i !== lineIndex);
    if (newLines.length === 0) {
      setTrainingSession(null);
      navigation.goBack();
      return;
    }

    let newIndex = session.currentLineIndex;
    if (lineIndex < session.currentLineIndex) {
      newIndex--;
    } else if (lineIndex === session.currentLineIndex) {
      newIndex = Math.min(session.currentLineIndex, newLines.length - 1);
    }

    session.lines = newLines;
    session.currentLineIndex = newIndex;
    session.currentMoveIndex = 0;
    session.totalLineCount = Math.max(0, session.totalLineCount - 1);
    session.awaitingRating = false;

    setSession({ ...session });
    setFeedback(null);
    const position = TrainingService.getCurrentPosition(session);
    if (position) {
      setCurrentFen(position.fen);
      setExpectedMove(position.expectedMove);
    }
    updateComment(session);
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

  // In wide landscape mode, the board shares a row with the variation selector.
  // Cap the board so it fits in the available height (minus header + padding)
  // and doesn't exceed ~45% of the screen width.
  const HEADER_HEIGHT = 54;
  const maxBoardSize = isWideScreen
    ? Math.min(width * 0.45, height - HEADER_HEIGHT - 16)
    : undefined;

  return (
    <View style={styles.container}>
      {/* Progress Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={[
            styles.modeBadge,
            showsComments && styles.modeBadgeLearn,
            inAlternatives && styles.modeBadgeAlt,
          ]}>
            <Text style={styles.modeBadgeText}>
              {inAlternatives ? 'Alts'
                : guidance === 'learn' ? 'Learn'
                : guidance === 'semi-learn' ? 'Semi' : 'Drill'}
            </Text>
          </View>
          <View style={styles.headerProgress}>
            <Text style={styles.progressText} numberOfLines={1}>
              Line {progress.lineNumber}/{progress.totalLines}
            </Text>
            <Text style={styles.subProgressText} numberOfLines={1}>
              Move {progress.moveNumber}/{progress.totalMovesInLine}
              {progress.holdbackCount > 0 && ` · ${progress.holdbackCount} on hold`}
            </Text>
          </View>
        </View>
        <View style={styles.headerRight}>
          {inAlternatives ? (
            <TouchableOpacity onPress={resumeMainSession} style={styles.altButton}>
              <Text style={styles.altButtonText}>Resume Line</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              onPress={handleTestAlternatives}
              disabled={isAnimating || session.awaitingRating}
              style={[
                styles.altButton,
                (isAnimating || session.awaitingRating) && styles.altButtonDisabled,
              ]}
            >
              <Text style={styles.altButtonText}>Alternatives</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={handleEndSession} style={styles.endButton}>
            <Text style={styles.endButtonText}>End Session</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        style={styles.scrollContainer}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={true}
      >
        {/* Main Content Area */}
        <View style={[styles.mainContent, isWideScreen && styles.mainContentWide]}>
          {/* Chess Board */}
          <View style={[styles.boardContainer, isWideScreen && { maxWidth: (maxBoardSize || width * 0.45) + 20 }]}>
            <ChessWorkspace
              fen={currentFen}
              onMove={handleMove}
              disabled={isAnimating || session.awaitingRating}
              screenKey="training"
              showMoveHistory={false}
              showSettingsGear={false}
              orientationOverride={session.color}
              hintArrow={learnArrowUci ?? hintArrowUci}
              hintArrowColor={learnArrowUci ? 'rgba(156, 39, 176, 0.7)' : undefined}
              verticalOffset={HEADER_HEIGHT}
              maxBoardSize={maxBoardSize}
            />
          </View>

          {/* Variation Selector */}
          {isWideScreen && (
            <View style={{ flex: 1, maxHeight: maxBoardSize || undefined }}>
              <VariationSelector
                lines={session.lines}
                currentLineIndex={session.currentLineIndex}
                onSelectLine={handleSelectLine}
                onLongPressLine={handleLongPressLine}
                lineProgress={session.lineProgress}
                holdbackCount={session.holdbackLines.length}
              />
            </View>
          )}
        </View>

        {/* Comment Boxes (learn and semi-learn) */}
        {showsComments && (opponentComment || currentComment) && (
          <View>
            {opponentComment && (
              <ScrollView
                style={[styles.commentBox, styles.commentBoxOpponent]}
                contentContainerStyle={{ paddingBottom: 10 }}
                nestedScrollEnabled
              >
                {(opponentComment && currentComment) && (
                  <Text style={styles.commentLabel}>{"Opponent's move:"}</Text>
                )}
                <Text style={styles.commentText}>{opponentComment}</Text>
              </ScrollView>
            )}
            {currentComment && (
              <ScrollView
                style={styles.commentBox}
                contentContainerStyle={{ paddingBottom: 10 }}
                nestedScrollEnabled
              >
                {(opponentComment && currentComment) && (
                  <Text style={styles.commentLabel}>Your move:</Text>
                )}
                <Text style={styles.commentText}>{currentComment}</Text>
              </ScrollView>
            )}
          </View>
        )}

        {/* Feedback — directly below board so it's always visible */}
        {feedback && (
          <View style={[
            styles.feedbackContainer,
            feedback === 'incorrect' && styles.feedbackIncorrect,
            feedback === 'alternative' && styles.feedbackAlternative,
          ]}>
            <Text style={styles.feedbackText}>
              {feedback === 'correct' ? 'Correct!' : feedback === 'alternative' ? 'Alternative!' : 'Try Again'}
            </Text>
            {(feedback === 'incorrect' || feedback === 'alternative') && expectedMove && (
              <Text style={styles.suggestionText}>
                {feedback === 'alternative' ? 'This line expects:' : 'Correct move:'} {expectedMove}
              </Text>
            )}
          </View>
        )}

        {/* Rating Buttons — directly below board so it's always visible */}
        {session.awaitingRating && !inAlternatives && (
          <View style={styles.ratingContainer}>
            {guidance === 'learn' ? (
              <>
                <View style={styles.ratingButtons}>
                  <TouchableOpacity
                    style={[styles.ratingButton, styles.ratingAgain]}
                    onPress={handleRepeatVariation}
                  >
                    <Text style={styles.ratingButtonText}>Repeat</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.ratingButton, styles.ratingGood, { flex: 2 }]}
                    onPress={() => handleRating(4)}
                  >
                    <Text style={styles.ratingButtonText}>Next</Text>
                  </TouchableOpacity>
                </View>
              </>
            ) : (
              <>
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
              </>
            )}
            <View style={styles.lineActionsRow}>
              <TouchableOpacity
                style={styles.analyseLineButton}
                onPress={handleAnalyseLine}
              >
                <Text style={styles.analyseLineText}>Analyse on Board</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.deleteLineButton}
                onPress={() => handleLongPressLine(session.currentLineIndex)}
              >
                <Text style={styles.deleteLineText}>Delete Line</Text>
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
              onLongPressLine={handleLongPressLine}
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
  // The counts grow with the repertoire — three digits a side, plus "120 on hold" — while
  // the buttons are a fixed width. Without a shrinking left half the row simply overflowed
  // and pushed End Session off the screen.
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 1,
    minWidth: 0,
  },
  headerProgress: {
    flexShrink: 1,
    minWidth: 0,
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
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 0,
  },
  altButton: {
    backgroundColor: '#455a64',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 4,
  },
  altButtonDisabled: {
    opacity: 0.4,
  },
  altButtonText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  modeBadgeAlt: {
    backgroundColor: '#455a64',
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
    height: 300,
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
    maxHeight: 120,
  },
  commentText: {
    color: '#e0e0e0',
    fontSize: 13,
    lineHeight: 18,
  },
  commentBoxOpponent: {
    borderLeftColor: '#FFA726',
    marginBottom: 4,
  },
  commentLabel: {
    color: '#aaa',
    fontSize: 11,
    marginBottom: 4,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
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
  feedbackAlternative: {
    backgroundColor: '#e65100',
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
  lineActionsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 20,
  },
  analyseLineButton: {
    marginTop: 8,
    alignItems: 'center',
    paddingVertical: 6,
  },
  analyseLineText: {
    color: '#4a9eff',
    fontSize: 12,
  },
  deleteLineButton: {
    marginTop: 8,
    alignItems: 'center',
    paddingVertical: 6,
  },
  deleteLineText: {
    color: '#888',
    fontSize: 12,
  },
});
