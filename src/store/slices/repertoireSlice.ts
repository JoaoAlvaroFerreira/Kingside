/**
 * Repertoire Store Slice - Zustand
 */

import { StateCreator } from 'zustand';
import type { Repertoire, ChessChapter, ChessVariation, BoardPosition } from '@types';
import { LocalStorageService } from '@services/storage/LocalStorage';

export interface RepertoireSlice {
  // State
  repertoires: Repertoire[];
  currentRepertoire: Repertoire | null;
  currentChapterId: string | null;
  currentVariationIndex: number;
  currentMoveIndex: number;
  currentFEN: string;
  boardOrientation: 'white' | 'black';

  // Actions
  initializeRepertoires: () => Promise<void>;
  addRepertoire: (repertoire: Repertoire) => Promise<void>;
  deleteRepertoire: (id: string) => Promise<void>;
  loadRepertoire: (repertoire: Repertoire) => void;
  selectChapter: (chapterId: string) => void;
  selectVariation: (variationIndex: number) => void;
  nextMove: () => void;
  previousMove: () => void;
  goToMove: (moveIndex: number) => void;
  goToStart: () => void;
  goToEnd: () => void;
  updateFEN: (fen: string) => void;
  clearRepertoire: () => void;
  flipBoard: () => void;
}

export const createRepertoireSlice: StateCreator<RepertoireSlice> = (set, get) => ({
  // Initial state
  repertoires: [],
  currentRepertoire: null,
  currentChapterId: null,
  currentVariationIndex: 0,
  currentMoveIndex: 0,
  currentFEN: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
  boardOrientation: 'white',

  // Actions
  initializeRepertoires: async () => {
    try {
      const loaded = await LocalStorageService.loadAllRepertoires();
      set(() => ({
        repertoires: loaded,
      }));
    } catch (error) {
      console.error('Failed to initialize repertoires:', error);
    }
  },

  addRepertoire: async (repertoire) => {
    try {
      await LocalStorageService.saveRepertoire(repertoire);
      set((state) => ({
        repertoires: [...state.repertoires, repertoire],
      }));
    } catch (error) {
      console.error('Failed to add repertoire:', error);
      throw error;
    }
  },

  deleteRepertoire: async (id) => {
    try {
      await LocalStorageService.deleteRepertoire(id);
      set((state) => {
        const filtered = state.repertoires.filter((r) => r.id !== id);
        return {
          repertoires: filtered,
          currentRepertoire: state.currentRepertoire?.id === id ? null : state.currentRepertoire,
        };
      });
    } catch (error) {
      console.error('Failed to delete repertoire:', error);
      throw error;
    }
  },

  loadRepertoire: (repertoire) =>
    set(() => {
      const firstChapter = repertoire.chapters[0];
      return {
        currentRepertoire: repertoire,
        currentChapterId: firstChapter?.id || null,
        currentVariationIndex: 0,
        currentMoveIndex: 0,
        currentFEN: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      };
    }),

  selectChapter: (chapterId) =>
    set(() => ({
      currentChapterId: chapterId,
      currentVariationIndex: 0,
      currentMoveIndex: 0,
      currentFEN: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    })),

  selectVariation: (variationIndex) =>
    set(() => ({
      currentVariationIndex: variationIndex,
      currentMoveIndex: 0,
    })),

  nextMove: () =>
    set((state) => {
      const chapter = state.currentRepertoire?.chapters.find(
        (c) => c.id === state.currentChapterId
      );
      if (!chapter) return state;

      const variation = chapter.variations[state.currentVariationIndex];
      if (!variation) return state;

      const nextIndex = Math.min(state.currentMoveIndex + 1, variation.moves.length);
      return { currentMoveIndex: nextIndex };
    }),

  previousMove: () =>
    set((state) => ({
      currentMoveIndex: Math.max(state.currentMoveIndex - 1, 0),
    })),

  goToMove: (moveIndex) =>
    set((state) => {
      const chapter = state.currentRepertoire?.chapters.find(
        (c) => c.id === state.currentChapterId
      );
      if (!chapter) return state;

      const variation = chapter.variations[state.currentVariationIndex];
      if (!variation) return state;

      return {
        currentMoveIndex: Math.max(0, Math.min(moveIndex, variation.moves.length)),
      };
    }),

  goToStart: () =>
    set(() => ({
      currentMoveIndex: 0,
    })),

  goToEnd: () =>
    set((state) => {
      const chapter = state.currentRepertoire?.chapters.find(
        (c) => c.id === state.currentChapterId
      );
      if (!chapter) return state;

      const variation = chapter.variations[state.currentVariationIndex];
      if (!variation) return state;

      return {
        currentMoveIndex: variation.moves.length,
      };
    }),

  updateFEN: (fen) =>
    set(() => ({
      currentFEN: fen,
    })),

  clearRepertoire: () =>
    set(() => ({
      currentRepertoire: null,
      currentChapterId: null,
      currentVariationIndex: 0,
      currentMoveIndex: 0,
      currentFEN: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      boardOrientation: 'white',
    })),

  flipBoard: () =>
    set((state) => ({
      boardOrientation: state.boardOrientation === 'white' ? 'black' : 'white',
    })),
});
