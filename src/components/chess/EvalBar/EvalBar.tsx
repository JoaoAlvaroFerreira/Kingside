/**
 * EvalBar Component - Visual evaluation display for chess positions
 * Shows centipawn advantage, current position, and key move markers
 *
 * Convention: the bar's bottom matches the board's bottom.
 * White perspective → white at bottom of bar, black at top.
 * Black perspective → black at bottom, white at top.
 */

import React from 'react';
import { View, StyleSheet } from 'react-native';
import { EngineEvaluation } from '@types';

export interface KeyMoveMarker {
  index: number;           // Move index (0-based)
  reason: string;          // 'blunder' | 'mistake' | 'inaccuracy' | 'repertoire-deviation' | etc.
  evaluation?: number;     // Centipawns at that move
}

interface EvalBarProps {
  currentEval?: EngineEvaluation | null;
  orientation: 'white' | 'black';
  moveHistory?: Array<{ evaluation?: EngineEvaluation | null }>;
  currentMoveIndex?: number;
  keyMoves?: KeyMoveMarker[];
  height: number;
  visible?: boolean;
}

const MAX_EVAL = 500; // Cap display at +/- 5 pawns

/**
 * Convert centipawn score to white's proportion (0-1).
 * 0 = black winning fully, 0.5 = equal, 1 = white winning fully.
 */
const scoreToPosition = (score?: number, mate?: number): number => {
  if (mate !== undefined) {
    return mate > 0 ? 1 : 0;
  }
  if (score === undefined) return 0.5;
  const clamped = Math.max(-MAX_EVAL, Math.min(MAX_EVAL, score));
  return (clamped + MAX_EVAL) / (MAX_EVAL * 2);
};

const getKeyMoveColor = (reason: string): string => {
  switch (reason) {
    case 'blunder':
      return '#c62828';
    case 'mistake':
      return '#f57c00';
    case 'inaccuracy':
      return '#fbc02d';
    case 'repertoire-deviation':
    case 'opponent-novelty':
      return '#8e24aa';
    case 'transposition':
      return '#1976d2';
    case 'brilliant':
      return '#00897b';
    default:
      return '#fff';
  }
};

export const EvalBar: React.FC<EvalBarProps> = ({
  currentEval,
  orientation,
  moveHistory: _moveHistory = [],
  currentMoveIndex: _currentMoveIndex = 0,
  keyMoves = [],
  height,
  visible = true,
}) => {
  if (!visible) return null;

  // position: 0-1 where 1 = white winning (always from white's perspective)
  const position = scoreToPosition(currentEval?.score, currentEval?.mate);
  const whiteOnBottom = orientation === 'white';

  // Top and bottom sections swap based on board orientation
  const topRatio = whiteOnBottom ? (1 - position) : position;
  const bottomRatio = whiteOnBottom ? position : (1 - position);

  // Marker sits at the boundary (topRatio from the top)
  const markerTop = topRatio;

  return (
    <View style={[styles.container, { height }]}>
      <View style={styles.barContainer}>
        {/* Top section */}
        <View
          style={[
            whiteOnBottom ? styles.blackSection : styles.whiteSection,
            { height: `${topRatio * 100}%` },
          ]}
        />
        {/* Bottom section */}
        <View
          style={[
            whiteOnBottom ? styles.whiteSection : styles.blackSection,
            { height: `${bottomRatio * 100}%` },
          ]}
        />

        {/* Current position marker */}
        <View
          style={[
            styles.currentMarker,
            { top: `${markerTop * 100}%` },
          ]}
        />

        {/* Key move markers */}
        {keyMoves.map((keyMove, idx) => {
          const movePos = keyMove.evaluation !== undefined
            ? scoreToPosition(keyMove.evaluation, undefined)
            : position;

          const kmTop = whiteOnBottom ? (1 - movePos) : movePos;

          return (
            <View
              key={idx}
              style={[
                styles.keyMoveMarker,
                {
                  backgroundColor: getKeyMoveColor(keyMove.reason),
                  top: `${kmTop * 100}%`,
                },
              ]}
            />
          );
        })}
      </View>

    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: 14,
    position: 'relative',
    marginRight: 4,
  },
  barContainer: {
    flex: 1,
    width: '100%',
    borderRadius: 4,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#444',
    position: 'relative',
  },
  whiteSection: {
    backgroundColor: '#f0f0f0',
    width: '100%',
  },
  blackSection: {
    backgroundColor: '#2a2a2a',
    width: '100%',
  },
  currentMarker: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: '#4a9eff',
    transform: [{ translateY: -1.5 }],
    zIndex: 10,
  },
  keyMoveMarker: {
    position: 'absolute',
    left: '50%',
    width: 6,
    height: 6,
    borderRadius: 3,
    transform: [{ translateX: -3 }, { translateY: -3 }],
    borderWidth: 1,
    borderColor: '#000',
    zIndex: 5,
  },
});
