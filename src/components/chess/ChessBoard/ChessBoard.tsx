/**
 * Chess Board Component - Display only
 */

import React, { useMemo } from 'react';
import { View, StyleSheet, useWindowDimensions } from 'react-native';
import { Chess } from 'chess.js';
import { Square } from './Square';

interface ChessBoardProps {
  fen: string;
  orientation?: 'white' | 'black';
}

export const ChessBoard: React.FC<ChessBoardProps> = ({
  fen,
  orientation = 'white',
}) => {
  const { width } = useWindowDimensions();
  const boardSize = Math.min(width - 40, 320);
  const squareSize = boardSize / 8;

  const board = useMemo(() => {
    try {
      const game = new Chess(fen);
      return game.board();
    } catch (error) {
      console.error('Invalid FEN:', error);
      // Return empty board
      return Array(8)
        .fill(null)
        .map(() => Array(8).fill(null));
    }
  }, [fen]);

  // Render board from white's perspective or black's
  const files = orientation === 'white' ? [0, 1, 2, 3, 4, 5, 6, 7] : [7, 6, 5, 4, 3, 2, 1, 0];
  const ranks = orientation === 'white' ? [7, 6, 5, 4, 3, 2, 1, 0] : [0, 1, 2, 3, 4, 5, 6, 7];

  return (
    <View style={styles.boardContainer}>
      <View style={[styles.board, { width: boardSize, height: boardSize }]}>
        {ranks.map((rank) =>
          files.map((file) => {
            const piece = board[rank]?.[file];
            return (
              <Square
                key={`${file}-${rank}`}
                file={file}
                rank={rank}
                piece={piece ? piece.color + piece.type : null}
                size={squareSize}
              />
            );
          })
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  boardContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 4,
  },
  board: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    borderWidth: 2,
    borderColor: '#000',
  },
});
