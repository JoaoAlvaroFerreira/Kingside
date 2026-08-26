/**
 * useCandidateMoves - Which moves the selected source plays from the current position,
 * resolved into board arrows.
 *
 * The source follows the active tab so the board only ever shows one kind of arrow at a
 * time: repertoire chapters, your games, or master games. `'none'` leaves the engine's
 * best-move arrow as the only one on the board.
 */

import { useState, useEffect } from 'react';
import { Chess } from 'chess.js';
import { DatabaseService, MoveCandidate } from '@services/database/DatabaseService';

export type CandidateSource = 'none' | 'repertoire' | 'user' | 'master';

export interface CandidateArrow {
  from: string;
  to: string;
  color: string;
  /** 0..1, relative to the most frequent candidate — drives thickness and opacity. */
  weight: number;
  move: string;
  count: number;
}

/** One colour per source, so an arrow says where it came from without a legend. */
export const CANDIDATE_ARROW_COLORS: Record<Exclude<CandidateSource, 'none'>, string> = {
  repertoire: '#7eb8e8',
  user: '#27ae60',
  master: '#b07ee8',
};

const EMPTY: CandidateArrow[] = [];

/**
 * How much a sideline is dimmed relative to a main line.
 *
 * Without this, frequency alone drives the arrow's weight — so inside one chapter a main
 * line and a sideline both have a count of 1 and render identically, even though the query
 * deliberately ranked one above the other. The ranking has to be visible, not just ordered.
 */
function mainLineFactor(varDepth: number | undefined): number {
  if (varDepth === undefined) return 1; // game sources have no notion of a main line
  if (varDepth <= 0) return 1;
  if (varDepth === 1) return 0.75;
  return 0.55;
}

/**
 * Arrow weight in [0,1]: how often this move is played here, relative to the most frequent
 * candidate, dimmed by how deep inside a variation it sits.
 */
export function candidateWeight(candidate: MoveCandidate, maxCount: number): number {
  const frequency = maxCount > 0 ? candidate.count / maxCount : 1;
  return Math.max(0, Math.min(1, frequency * mainLineFactor(candidate.varDepth)));
}

/** SAN is what the index stores; the board needs squares. */
function toArrow(fen: string, candidate: MoveCandidate, color: string, weight: number): CandidateArrow | null {
  try {
    const chess = new Chess(fen);
    const played = chess.move(candidate.move);
    return {
      from: played.from,
      to: played.to,
      color,
      weight,
      move: candidate.move,
      count: candidate.count,
    };
  } catch {
    // Candidate doesn't apply to this position (stale index, or a FEN that normalizes
    // to the same key with different move rights) — drop it rather than break the board.
    return null;
  }
}

export function useCandidateMoves(fen: string, source: CandidateSource): CandidateArrow[] {
  const [arrows, setArrows] = useState<CandidateArrow[]>(EMPTY);

  useEffect(() => {
    if (!fen || source === 'none') {
      setArrows(EMPTY);
      return;
    }

    let cancelled = false;
    (async () => {
      const candidates = source === 'repertoire'
        ? await DatabaseService.getRepertoireMoveCandidates(fen)
        : await DatabaseService.getGameMoveCandidates(source, fen);

      if (cancelled) return;
      if (candidates.length === 0) {
        setArrows(EMPTY);
        return;
      }

      // Weight is relative to the most frequent candidate here, not an absolute count —
      // what matters visually is which of these moves dominates.
      const maxCount = Math.max(...candidates.map(c => c.count));
      const color = CANDIDATE_ARROW_COLORS[source];
      setArrows(
        candidates
          .map(c => toArrow(fen, c, color, candidateWeight(c, maxCount)))
          .filter((a): a is CandidateArrow => a !== null)
      );
    })();

    return () => { cancelled = true; };
  }, [fen, source]);

  return arrows;
}
