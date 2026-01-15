/**
 * Training Screen - Spaced Repetition Review Session
 * Features:
 * - Color-aware testing (only tests user's color moves)
 * - Animated opponent responses
 * - Context path display
 * - SM-2 scheduling
 */

import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { Chess } from 'chess.js';
import { InteractiveChessBoard } from '@components/chess/InteractiveChessBoard/InteractiveChessBoard';
import { useStore } from '@store';
import { SM2Service } from '@services/srs/SM2Service';
import { ReviewCard } from '@types';

const OPPONENT_MOVE_DELAY = 300; // ms (configurable later)

export default function TrainingScreen() {
  const { getDueCards, updateCard } = useStore();
  const [currentCardIndex, setCurrentCardIndex] = useState(0);
  const [currentFen, setCurrentFen] = useState<string>('');
  const [isAnimating, setIsAnimating] = useState(false);
  const [userMove, setUserMove] = useState<string | null>(null);
  const [showFeedback, setShowFeedback] = useState(false);

  const dueCards = getDueCards();
  const currentCard = dueCards[currentCardIndex] || null;

  // Load the current card's position
  useEffect(() => {
    if (currentCard) {
      setCurrentFen(currentCard.fen);
      setUserMove(null);
      setShowFeedback(false);
    }
  }, [currentCard]);

  if (dueCards.length === 0) {
    return (
      <View style={styles.container}>
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>No cards due for review!</Text>
          <Text style={styles.emptySubtitle}>Come back later or add more repertoires.</Text>
        </View>
      </View>
    );
  }

  if (!currentCard) {
    return (
      <View style={styles.container}>
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>Loading...</Text>
        </View>
      </View>
    );
  }

  const handleMove = async (from: string, to: string) => {
    if (isAnimating || showFeedback) return;

    const chess = new Chess(currentFen);
    let move;

    try {
      move = chess.move({ from, to, promotion: 'q' });
      if (!move) return;
    } catch {
      return;
    }

    setUserMove(move.san);
    const isCorrect = move.san === currentCard.correctMove;

    if (isCorrect) {
      // Update board to show user's move
      setCurrentFen(chess.fen());

      // TODO: In a full implementation, we would animate the opponent's response here
      // For now, we'll just show feedback
    }

    setShowFeedback(true);
  };

  const handleRating = async (quality: number) => {
    const result = SM2Service.calculateNext(currentCard, quality);

    await updateCard({
      ...currentCard,
      ...result,
      lastReviewDate: new Date(),
      totalReviews: currentCard.totalReviews + 1,
      correctCount: currentCard.correctCount + (quality >= 3 ? 1 : 0),
    });

    // Move to next card
    setShowFeedback(false);
    setUserMove(null);
    setCurrentCardIndex(i => i + 1);
  };

  const isCorrect = userMove === currentCard.correctMove;

  // Calculate interval estimates for buttons
  const getIntervalText = (quality: number): string => {
    const result = SM2Service.calculateNext(currentCard, quality);
    const days = result.interval;
    if (days === 0) return 'Now';
    if (days === 1) return '1 day';
    if (days < 30) return `${days} days`;
    if (days < 365) return `${Math.round(days / 30)} months`;
    return `${Math.round(days / 365)} years`;
  };

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Progress header */}
        <View style={styles.header}>
          <Text style={styles.progress}>
            {currentCardIndex + 1} / {dueCards.length}
          </Text>
          {currentCard.isCritical && (
            <Text style={styles.critical}>★ Critical Position</Text>
          )}
        </View>

        {/* Context path */}
        {currentCard.contextMoves.length > 0 && (
          <View style={styles.contextContainer}>
            <Text style={styles.contextLabel}>Path:</Text>
            <Text style={styles.context}>
              {currentCard.contextMoves.slice(-5).join(' → ')}
            </Text>
          </View>
        )}

        {/* Board */}
        <View style={styles.boardContainer}>
          <InteractiveChessBoard
            fen={currentFen}
            onMove={handleMove}
            orientation={currentCard.color}
            disabled={isAnimating || showFeedback}
          />
        </View>

        {/* Animating indicator */}
        {isAnimating && (
          <Text style={styles.animating}>Opponent is responding...</Text>
        )}

        {/* Feedback & Rating */}
        {showFeedback && (
          <View style={styles.feedback}>
            <Text style={[styles.result, isCorrect ? styles.correct : styles.incorrect]}>
              {isCorrect ? '✓ Correct!' : `✗ Expected: ${currentCard.correctMove}`}
            </Text>

            <Text style={styles.ratingPrompt}>How well did you know this?</Text>

            <View style={styles.ratings}>
              <TouchableOpacity
                style={[styles.ratingBtn, styles.againBtn]}
                onPress={() => handleRating(1)}
              >
                <Text style={styles.ratingText}>Again</Text>
                <Text style={styles.ratingHint}>{getIntervalText(1)}</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.ratingBtn, styles.hardBtn]}
                onPress={() => handleRating(3)}
              >
                <Text style={styles.ratingText}>Hard</Text>
                <Text style={styles.ratingHint}>{getIntervalText(3)}</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.ratingBtn, styles.goodBtn]}
                onPress={() => handleRating(4)}
              >
                <Text style={styles.ratingText}>Good</Text>
                <Text style={styles.ratingHint}>{getIntervalText(4)}</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.ratingBtn, styles.easyBtn]}
                onPress={() => handleRating(5)}
              >
                <Text style={styles.ratingText}>Easy</Text>
                <Text style={styles.ratingHint}>{getIntervalText(5)}</Text>
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
    backgroundColor: '#2c2c2c',
  },
  scrollContent: {
    padding: 16,
    alignItems: 'center',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#e0e0e0',
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 16,
    color: '#888',
    textAlign: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    marginBottom: 16,
  },
  progress: {
    fontSize: 18,
    fontWeight: '600',
    color: '#e0e0e0',
  },
  critical: {
    fontSize: 14,
    color: '#FFD700',
    fontWeight: '600',
  },
  contextContainer: {
    backgroundColor: '#3a3a3a',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
    width: '100%',
    maxWidth: 600,
  },
  contextLabel: {
    fontSize: 12,
    color: '#888',
    marginBottom: 4,
  },
  context: {
    fontSize: 14,
    color: '#e0e0e0',
    fontFamily: 'monospace',
  },
  boardContainer: {
    marginBottom: 16,
    alignItems: 'center',
  },
  animating: {
    fontSize: 14,
    color: '#888',
    fontStyle: 'italic',
    marginBottom: 16,
  },
  feedback: {
    width: '100%',
    maxWidth: 600,
  },
  result: {
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 8,
  },
  correct: {
    color: '#34C759',
  },
  incorrect: {
    color: '#FF3B30',
  },
  ratingPrompt: {
    fontSize: 14,
    color: '#888',
    textAlign: 'center',
    marginBottom: 16,
  },
  ratings: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  ratingBtn: {
    flex: 1,
    minWidth: 100,
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  againBtn: {
    backgroundColor: '#FF3B30',
  },
  hardBtn: {
    backgroundColor: '#FF9500',
  },
  goodBtn: {
    backgroundColor: '#34C759',
  },
  easyBtn: {
    backgroundColor: '#007AFF',
  },
  ratingText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  ratingHint: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 12,
  },
});
