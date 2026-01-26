/**
 * EvalBar Component - Visual evaluation display for chess positions
 * Shows centipawn advantage, current position, and key move markers
 */

import React from 'react';
import { View, StyleSheet, Text } from 'react-native';
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

const MAX_EVAL = 500; // Cap display at +/- 5 pawns for better visualization

/**
 * Convert centipawn score to position on bar (0-1, where 0.5 is equal)
 */
const scoreToPosition = (score?: number, mate?: number): number => {
  if (mate !== undefined) {
    return mate > 0 ? 1 : 0;
  }
  if (score === undefined) return 0.5;

  // Clamp to max
  const clamped = Math.max(-MAX_EVAL, Math.min(MAX_EVAL, score));
  // Convert to 0-1 range (0 = black winning, 1 = white winning)
  return (clamped + MAX_EVAL) / (MAX_EVAL * 2);
};

/**
 * Get color for key move reason
 */
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
  moveHistory = [],
  currentMoveIndex = 0,
  keyMoves = [],
  height,
  visible = true,
}) => {
  if (!visible) return null;

  const position = scoreToPosition(currentEval?.score, currentEval?.mate);
  const displayOrientation = orientation === 'white' ? 'normal' : 'inverted';

  // Calculate marker positions
  const totalMoves = moveHistory.length || 1;
  const currentMarkerPosition = displayOrientation === 'normal'
    ? position
    : 1 - position;

  return (
    <View style={[styles.container, { height }]}>
      {/* Background gradient */}
      <View style={styles.barContainer}>
        {/* White advantage (top) */}
        <View
          style={[
            styles.whiteSection,
            {
              height: `${(displayOrientation === 'normal' ? (1 - position) : position) * 100}%`,
            },
          ]}
        />
        {/* Black advantage (bottom) */}
        <View
          style={[
            styles.blackSection,
            {
              height: `${(displayOrientation === 'normal' ? position : (1 - position)) * 100}%`,
            },
          ]}
        />

        {/* Current position marker */}
        <View
          style={[
            styles.currentMarker,
            {
              top: `${currentMarkerPosition * 100}%`,
            },
          ]}
        />

        {/* Key move markers */}
        {keyMoves.map((keyMove, idx) => {
          const movePosition = keyMove.evaluation !== undefined
            ? scoreToPosition(keyMove.evaluation, undefined)
            : currentMarkerPosition;

          const markerTop = displayOrientation === 'normal'
            ? movePosition
            : 1 - movePosition;

          return (
            <View
              key={idx}
              style={[
                styles.keyMoveMarker,
                {
                  backgroundColor: getKeyMoveColor(keyMove.reason),
                  top: `${markerTop * 100}%`,
                },
              ]}
            />
          );
        })}
      </View>

      {/* Evaluation text */}
      {currentEval && (
        <View style={styles.evalTextContainer}>
          <Text style={styles.evalText}>
            {currentEval.mate !== undefined
              ? `M${Math.abs(currentEval.mate)}`
              : (currentEval.score / 100).toFixed(1)}
          </Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: 40,
    position: 'relative',
    marginRight: 8,
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
    width: 8,
    height: 8,
    borderRadius: 4,
    transform: [{ translateX: -4 }, { translateY: -4 }],
    borderWidth: 1,
    borderColor: '#000',
    zIndex: 5,
  },
  evalTextContainer: {
    position: 'absolute',
    bottom: -24,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  evalText: {
    color: '#e0e0e0',
    fontSize: 11,
    fontWeight: '600',
    fontFamily: 'monospace',
  },
});
