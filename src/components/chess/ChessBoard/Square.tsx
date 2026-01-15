/**
 * Chess Board Square Component
 */

import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Piece } from './Piece';

interface SquareProps {
  file: number; // 0-7 (a-h)
  rank: number; // 0-7 (8-1)
  piece: string | null;
  size: number;
}

export const Square: React.FC<SquareProps> = ({ file, rank, piece, size }) => {
  const isLight = (file + rank) % 2 === 0;

  return (
    <View
      style={[
        styles.square,
        { width: size, height: size },
        isLight ? styles.lightSquare : styles.darkSquare,
      ]}
    >
      <Piece piece={piece} size={size} />
    </View>
  );
};

const styles = StyleSheet.create({
  square: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  lightSquare: {
    backgroundColor: '#f0d9b5',
  },
  darkSquare: {
    backgroundColor: '#b58863',
  },
});
