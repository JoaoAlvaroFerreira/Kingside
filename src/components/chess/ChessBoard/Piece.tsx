/**
 * Chess Piece Component
 */

import React from 'react';
import { Text, StyleSheet } from 'react-native';

interface PieceProps {
  piece: string | null; // e.g., "wk", "bp", "wp", etc. (color + type)
  size: number;
}

const PIECE_SYMBOLS: Record<string, string> = {
  // White pieces
  wk: '♔',
  wq: '♕',
  wr: '♖',
  wb: '♗',
  wn: '♘',
  wp: '♙',
  // Black pieces
  bk: '♚',
  bq: '♛',
  br: '♜',
  bb: '♝',
  bn: '♞',
  bp: '♟',
};

export const Piece: React.FC<PieceProps> = ({ piece, size }) => {
  const symbol = piece ? PIECE_SYMBOLS[piece] : '';
  const fontSize = size * 0.75;

  return (
    <Text style={[styles.piece, { fontSize }]}>
      {symbol}
    </Text>
  );
};

const styles = StyleSheet.create({
  piece: {
    textAlign: 'center',
    textAlignVertical: 'center',
  },
});
