/**
 * Review Session Screen - Spaced repetition training
 */

import React, { useState, useEffect } from 'react';
import {
  SafeAreaView,
  View,
  StyleSheet,
  Text,
  Button,
  ScrollView,
  TextInput,
  Alert,
} from 'react-native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '@navigation/AppNavigator';
import { ChessBoard } from '@components/chess/ChessBoard/ChessBoard';
import { useStore } from '@store/index';
import { ChessService } from '@services/chess/ChessService';

type ReviewSessionScreenNavigationProp = StackNavigationProp<RootStackParamList, 'Training'>;

interface ReviewSessionScreenProps {
  navigation: ReviewSessionScreenNavigationProp;
}

export const ReviewSessionScreen: React.FC<ReviewSessionScreenProps> = ({
  navigation,
}) => {
  const {
    currentReviewCard,
    reviewSessionActive,
    startReviewSession,
    submitReview,
    skipCard,
    endReviewSession,
    getDueCount,
  } = useStore();

  const [userMove, setUserMove] = useState('');
  const [showAnswer, setShowAnswer] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);

  useEffect(() => {
    if (!reviewSessionActive) {
      startReviewSession();
    }
  }, []);

  const handleCheckMove = () => {
    if (!currentReviewCard || !userMove.trim()) {
      Alert.alert('Error', 'Please enter a move');
      return;
    }

    const chessService = new ChessService(currentReviewCard.fen);
    const moveValid = chessService.makeMove(userMove.trim());

    if (!moveValid) {
      Alert.alert('Invalid Move', 'The move you entered is not legal');
      return;
    }

    const correct = userMove.trim().toLowerCase() === currentReviewCard.correctMove.toLowerCase();
    setIsCorrect(correct);
    setShowAnswer(true);
  };

  const handleRating = (quality: number) => {
    submitReview(quality);
    setUserMove('');
    setShowAnswer(false);
    setIsCorrect(false);

    if (!currentReviewCard && reviewSessionActive === false) {
      Alert.alert(
        'Session Complete',
        'Great work! You have completed all due reviews.',
        [{ text: 'OK', onPress: () => navigation.goBack() }]
      );
    }
  };

  const handleSkip = () => {
    skipCard();
    setUserMove('');
    setShowAnswer(false);
    setIsCorrect(false);
  };

  const handleEndSession = () => {
    endReviewSession();
    navigation.goBack();
  };

  if (!reviewSessionActive || !currentReviewCard) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.emptyContent}>
          <Text style={styles.emptyTitle}>No cards due for review</Text>
          <Text style={styles.emptySubtitle}>
            Check back later or import more repertoires
          </Text>
          <Button title="Back to Library" onPress={() => navigation.goBack()} />
        </View>
      </SafeAreaView>
    );
  }

  const dueCount = getDueCount();

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <Text style={styles.title}>Review Session</Text>
          <Text style={styles.dueCount}>{dueCount} cards remaining</Text>
          <Button title="End Session" onPress={handleEndSession} color="#FF3B30" />
        </View>

        <View style={styles.boardSection}>
          <ChessBoard fen={currentReviewCard.fen} />
        </View>

        <View style={styles.questionSection}>
          <Text style={styles.questionText}>What is the next move?</Text>

          {!showAnswer ? (
            <View style={styles.inputSection}>
              <TextInput
                style={styles.input}
                placeholder="Enter move (e.g., e4, Nf3)"
                value={userMove}
                onChangeText={setUserMove}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <View style={styles.buttonRow}>
                <Button title="Check" onPress={handleCheckMove} />
                <Button title="Skip" onPress={handleSkip} color="#999" />
              </View>
            </View>
          ) : (
            <View style={styles.answerSection}>
              <Text style={[styles.resultText, isCorrect ? styles.correct : styles.incorrect]}>
                {isCorrect ? '✓ Correct!' : '✗ Incorrect'}
              </Text>
              <Text style={styles.correctMoveText}>
                Correct move: {currentReviewCard.correctMove}
              </Text>

              <Text style={styles.ratingLabel}>How difficult was this?</Text>
              <View style={styles.ratingButtons}>
                <Button title="Easy (5)" onPress={() => handleRating(5)} color="#34C759" />
                <Button title="Good (4)" onPress={() => handleRating(4)} color="#5AC8FA" />
                <Button title="Hard (3)" onPress={() => handleRating(3)} color="#FF9500" />
                <Button title="Again (1)" onPress={() => handleRating(1)} color="#FF3B30" />
              </View>
            </View>
          )}
        </View>

        <View style={styles.statsSection}>
          <Text style={styles.statsText}>
            Repetitions: {currentReviewCard.repetitions}
          </Text>
          <Text style={styles.statsText}>
            Ease Factor: {currentReviewCard.easeFactor.toFixed(2)}
          </Text>
          <Text style={styles.statsText}>
            Interval: {currentReviewCard.interval} days
          </Text>
        </View>
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
    marginBottom: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  dueCount: {
    fontSize: 14,
    color: '#666',
    marginBottom: 8,
  },
  boardSection: {
    alignItems: 'center',
    marginVertical: 20,
  },
  questionSection: {
    backgroundColor: '#f5f5f5',
    padding: 16,
    borderRadius: 8,
    marginBottom: 16,
  },
  questionText: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 12,
  },
  inputSection: {
    gap: 12,
  },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  answerSection: {
    gap: 12,
  },
  resultText: {
    fontSize: 20,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  correct: {
    color: '#34C759',
  },
  incorrect: {
    color: '#FF3B30',
  },
  correctMoveText: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 8,
  },
  ratingLabel: {
    fontSize: 14,
    fontWeight: '600',
    marginTop: 8,
  },
  ratingButtons: {
    gap: 8,
  },
  statsSection: {
    backgroundColor: '#f9f9f9',
    padding: 12,
    borderRadius: 8,
    gap: 4,
  },
  statsText: {
    fontSize: 12,
    color: '#666',
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
});
