/**
 * Custom hook for chess game logic
 */

import { useMemo } from 'react';
import { ChessService } from '@services/chess/ChessService';

export const useChessGame = (moves: string[], moveIndex: number) => {
  const fen = useMemo(() => {
    const service = new ChessService();
    const movesToApply = moves.slice(0, moveIndex);

    if (movesToApply.length === 0) {
      return service.getFEN();
    }

    service.loadMoves(movesToApply);
    return service.getFEN();
  }, [moves, moveIndex]);

  return { fen };
};
