/**
 * Review Store Slice - Zustand
 */

import { StateCreator } from 'zustand';
import type { ReviewCard, Repertoire } from '@types';
import { SM2Service } from '@services/spaced-repetition/SM2Service';
import { ChessService } from '@services/chess/ChessService';
import AsyncStorage from '@react-native-async-storage/async-storage';

const REVIEW_CARDS_KEY = 'kingside_review_cards';

export interface ReviewSlice {
  reviewCards: ReviewCard[];
  currentReviewCard: ReviewCard | null;
  reviewSessionActive: boolean;
  sessionStartTime: number | null;

  initializeReviewCards: () => Promise<void>;
  generateCardsFromRepertoire: (repertoire: Repertoire) => Promise<void>;
  startReviewSession: () => void;
  submitReview: (quality: number) => Promise<void>;
  skipCard: () => void;
  endReviewSession: () => void;
  getDueCount: () => number;
  getRepertoireDueCount: (repertoireId: string) => number;
}

export const createReviewSlice: StateCreator<ReviewSlice> = (set, get) => ({
  reviewCards: [],
  currentReviewCard: null,
  reviewSessionActive: false,
  sessionStartTime: null,

  initializeReviewCards: async () => {
    try {
      const data = await AsyncStorage.getItem(REVIEW_CARDS_KEY);
      if (!data) {
        set({ reviewCards: [] });
        return;
      }

      const parsed = JSON.parse(data) as any[];
      const cards: ReviewCard[] = parsed.map((card) => ({
        ...card,
        nextReviewDate: new Date(card.nextReviewDate),
        lastReviewDate: card.lastReviewDate ? new Date(card.lastReviewDate) : null,
        reviewHistory: card.reviewHistory.map((attempt: any) => ({
          ...attempt,
          date: new Date(attempt.date),
        })),
      }));

      set({ reviewCards: cards });
    } catch (error) {
      console.error('Failed to load review cards:', error);
      set({ reviewCards: [] });
    }
  },

  generateCardsFromRepertoire: async (repertoire) => {
    try {
      const newCards: ReviewCard[] = [];
      const existingCards = get().reviewCards;

      for (const chapter of repertoire.chapters) {
        for (let varIdx = 0; varIdx < chapter.variations.length; varIdx++) {
          const variation = chapter.variations[varIdx];
          const chessService = new ChessService();

          for (let moveIdx = 0; moveIdx < variation.moves.length; moveIdx++) {
            const cardId = `${repertoire.id}-${chapter.id}-${varIdx}-${moveIdx}`;
            const existing = existingCards.find((c) => c.id === cardId);

            if (!existing) {
              const movesToThisPoint = variation.moves.slice(0, moveIdx);
              chessService.reset();
              chessService.loadMoves(movesToThisPoint);
              const fen = chessService.getFEN();
              const correctMove = variation.moves[moveIdx];

              const card = SM2Service.createReviewCard(
                repertoire.id,
                chapter.id,
                varIdx,
                moveIdx,
                fen,
                correctMove
              );

              newCards.push(card);
            }
          }
        }
      }

      const allCards = [...existingCards, ...newCards];
      set({ reviewCards: allCards });

      await AsyncStorage.setItem(REVIEW_CARDS_KEY, JSON.stringify(allCards.map((card) => ({
        ...card,
        nextReviewDate: card.nextReviewDate.toISOString(),
        lastReviewDate: card.lastReviewDate?.toISOString() || null,
        reviewHistory: card.reviewHistory.map((attempt) => ({
          ...attempt,
          date: attempt.date.toISOString(),
        })),
      }))));
    } catch (error) {
      console.error('Failed to generate review cards:', error);
    }
  },

  startReviewSession: () => {
    const { reviewCards } = get();
    const dueCards = SM2Service.getDueCards(reviewCards);

    if (dueCards.length > 0) {
      set({
        reviewSessionActive: true,
        currentReviewCard: dueCards[0],
        sessionStartTime: Date.now(),
      });
    }
  },

  submitReview: async (quality) => {
    const { currentReviewCard, sessionStartTime, reviewCards } = get();

    if (!currentReviewCard || sessionStartTime === null) return;

    const timeTaken = Date.now() - sessionStartTime;
    const updatedCard = SM2Service.updateCard(currentReviewCard, quality, timeTaken);

    const updatedCards = reviewCards.map((card) =>
      card.id === updatedCard.id ? updatedCard : card
    );

    const dueCards = SM2Service.getDueCards(updatedCards);
    const nextCard = dueCards.find((c) => c.id !== updatedCard.id);

    set({
      reviewCards: updatedCards,
      currentReviewCard: nextCard || null,
      sessionStartTime: nextCard ? Date.now() : null,
      reviewSessionActive: nextCard !== undefined,
    });

    try {
      await AsyncStorage.setItem(REVIEW_CARDS_KEY, JSON.stringify(updatedCards.map((card) => ({
        ...card,
        nextReviewDate: card.nextReviewDate.toISOString(),
        lastReviewDate: card.lastReviewDate?.toISOString() || null,
        reviewHistory: card.reviewHistory.map((attempt) => ({
          ...attempt,
          date: attempt.date.toISOString(),
        })),
      }))));
    } catch (error) {
      console.error('Failed to save review cards:', error);
    }
  },

  skipCard: () => {
    const { reviewCards, currentReviewCard } = get();
    const dueCards = SM2Service.getDueCards(reviewCards);
    const nextCard = dueCards.find((c) => c.id !== currentReviewCard?.id);

    set({
      currentReviewCard: nextCard || null,
      sessionStartTime: nextCard ? Date.now() : null,
      reviewSessionActive: nextCard !== undefined,
    });
  },

  endReviewSession: () => {
    set({
      reviewSessionActive: false,
      currentReviewCard: null,
      sessionStartTime: null,
    });
  },

  getDueCount: () => {
    const { reviewCards } = get();
    return SM2Service.getDueCards(reviewCards).length;
  },

  getRepertoireDueCount: (repertoireId) => {
    const { reviewCards } = get();
    const repertoireCards = reviewCards.filter((card) => card.repertoireId === repertoireId);
    return SM2Service.getDueCards(repertoireCards).length;
  },
});
