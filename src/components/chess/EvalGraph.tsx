/**
 * EvalGraph - Evaluation graph for game review
 * Displays engine evaluation over the course of a game using react-native-svg.
 */

import React from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, { Path, Line, Circle, Rect } from 'react-native-svg';
import { EngineEvaluation } from '@types';

interface EvalGraphProps {
  evaluations: (EngineEvaluation | null)[];
  currentMoveIndex: number;
  onMoveSelect: (moveIndex: number) => void;
  width: number;
  height?: number;
}

const CLAMP = 1000; // Max centipawns for display

function clampEval(eval_: EngineEvaluation | null): number | null {
  if (!eval_) return null;
  if (eval_.mate !== undefined) {
    return eval_.mate > 0 ? CLAMP : -CLAMP;
  }
  return Math.max(-CLAMP, Math.min(CLAMP, eval_.score));
}

function cpToY(cp: number, height: number): number {
  return (height / 2) - (cp / CLAMP) * (height / 2);
}

export function EvalGraph({
  evaluations,
  currentMoveIndex,
  onMoveSelect,
  width,
  height = 100,
}: EvalGraphProps) {
  const count = evaluations.length;
  if (count === 0) return null;

  const stepX = count > 1 ? width / (count - 1) : width;
  const midY = height / 2;

  // Build path segments, skipping null evaluations
  const points: { x: number; y: number; cp: number }[] = [];
  for (let i = 0; i < count; i++) {
    const cp = clampEval(evaluations[i]);
    if (cp !== null) {
      points.push({ x: i * stepX, y: cpToY(cp, height), cp });
    }
  }

  // Build white advantage fill path (eval > 0 area between line and midline)
  let whiteFillPath = '';
  let blackFillPath = '';
  let linePath = '';

  if (points.length > 0) {
    // Main eval line
    linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');

    // White advantage fill: from eval line to midline when above midline
    whiteFillPath = `M${points[0].x.toFixed(1)},${midY}`;
    for (const p of points) {
      const y = Math.min(p.y, midY); // Clamp at midline
      whiteFillPath += ` L${p.x.toFixed(1)},${y.toFixed(1)}`;
    }
    whiteFillPath += ` L${points[points.length - 1].x.toFixed(1)},${midY} Z`;

    // Black advantage fill: from midline to eval line when below midline
    blackFillPath = `M${points[0].x.toFixed(1)},${midY}`;
    for (const p of points) {
      const y = Math.max(p.y, midY); // Clamp at midline
      blackFillPath += ` L${p.x.toFixed(1)},${y.toFixed(1)}`;
    }
    blackFillPath += ` L${points[points.length - 1].x.toFixed(1)},${midY} Z`;
  }

  // Current position marker
  const currentX = currentMoveIndex * stepX;
  const currentEval = clampEval(evaluations[currentMoveIndex]);
  const currentY = currentEval !== null ? cpToY(currentEval, height) : midY;

  const handleTouch = (evt: any) => {
    const locationX = evt.nativeEvent.locationX;
    if (count <= 1) {
      onMoveSelect(0);
      return;
    }
    const index = Math.round(locationX / stepX);
    const clampedIndex = Math.max(0, Math.min(count - 1, index));
    onMoveSelect(clampedIndex);
  };

  return (
    <View
      style={[styles.container, { width, height }]}
      onStartShouldSetResponder={() => true}
      onResponderRelease={handleTouch}
    >
      <Svg width={width} height={height}>
        {/* Background */}
        <Rect x={0} y={0} width={width} height={height} fill="#1e1e1e" />

        {/* White advantage fill */}
        {whiteFillPath && (
          <Path d={whiteFillPath} fill="#e0e0e0" opacity={0.3} />
        )}

        {/* Black advantage fill */}
        {blackFillPath && (
          <Path d={blackFillPath} fill="#555555" opacity={0.3} />
        )}

        {/* Eval line */}
        {linePath && (
          <Path d={linePath} stroke="#aaa" strokeWidth={1.5} fill="none" />
        )}

        {/* Midline */}
        <Line x1={0} y1={midY} x2={width} y2={midY} stroke="#666" strokeWidth={1} />

        {/* Current position vertical line */}
        <Line
          x1={currentX}
          y1={0}
          x2={currentX}
          y2={height}
          stroke="#007AFF"
          strokeWidth={1}
        />

        {/* Current position dot */}
        <Circle
          cx={currentX}
          cy={currentY}
          r={3}
          fill="#007AFF"
        />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#1e1e1e',
    borderRadius: 4,
    overflow: 'hidden',
  },
});
