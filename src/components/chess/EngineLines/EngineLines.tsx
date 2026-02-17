import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Chess } from 'chess.js';
import { EngineEvaluation } from '@types';

interface EngineLinesProps {
  evaluation: EngineEvaluation | null | undefined;
  visible?: boolean;
}

function uciPvToSan(fen: string, uciMoves: string[], maxMoves = 6): string[] {
  const chess = new Chess(fen);
  const sanMoves: string[] = [];
  for (let i = 0; i < Math.min(uciMoves.length, maxMoves); i++) {
    try {
      const uci = uciMoves[i];
      const move = chess.move({
        from: uci.substring(0, 2),
        to: uci.substring(2, 4),
        promotion: uci.length > 4 ? uci[4] : undefined,
      });
      if (move) sanMoves.push(move.san);
      else break;
    } catch {
      break;
    }
  }
  return sanMoves;
}

function formatScore(score: number, mate?: number): string {
  if (mate !== undefined) {
    return mate > 0 ? `M${mate}` : `M-${Math.abs(mate)}`;
  }
  const sign = score > 0 ? '+' : '';
  return `${sign}${(score / 100).toFixed(2)}`;
}

function formatMoveList(fen: string, sanMoves: string[]): string {
  const parts = fen.split(' ');
  const activeColor = parts[1];
  const fullmove = parseInt(parts[5]);

  let result = '';
  let moveNum = fullmove;
  let isWhite = activeColor === 'w';

  for (let i = 0; i < sanMoves.length; i++) {
    if (isWhite) {
      result += `${moveNum}. `;
    } else if (i === 0) {
      result += `${moveNum}... `;
    }
    result += sanMoves[i] + ' ';
    if (!isWhite) moveNum++;
    isWhite = !isWhite;
  }

  return result.trim();
}

export const EngineLines: React.FC<EngineLinesProps> = ({ evaluation, visible = true }) => {
  const formattedLines = useMemo(() => {
    if (!evaluation?.lines || evaluation.lines.length === 0) return [];
    return evaluation.lines.map((line, index) => {
      const sanMoves = uciPvToSan(evaluation.fen, line.pv, 6);
      const moveText = formatMoveList(evaluation.fen, sanMoves);
      const scoreText = formatScore(line.score, line.mate);
      return { index: index + 1, scoreText, moveText };
    });
  }, [evaluation]);

  if (!visible || formattedLines.length === 0) return null;

  return (
    <View style={styles.container}>
      {formattedLines.map((line) => (
        <Text key={line.index} style={styles.lineText} numberOfLines={1}>
          <Text style={styles.scoreSpan}>{line.scoreText}</Text>
          {'  '}
          <Text style={styles.moveSpan}>{line.moveText}</Text>
        </Text>
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#1e1e1e',
    borderRadius: 4,
    paddingVertical: 4,
    paddingHorizontal: 8,
    gap: 2,
  },
  lineText: {
    fontSize: 11,
    fontFamily: 'monospace',
  },
  scoreSpan: {
    color: '#4a9eff',
    fontWeight: '600',
  },
  moveSpan: {
    color: '#b0b0b0',
  },
});
