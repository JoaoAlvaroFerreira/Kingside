import { RepertoireColor } from '@types';

/**
 * Split games by the side the author studied them from. Lichess studies carry this as an
 * `[Orientation "black"]` header on each chapter; a game without one goes to `fallback`,
 * since an absent header says nothing about which side it was meant for.
 */
export function splitByOrientation<T extends { headers: Record<string, string> }>(
  games: T[],
  fallback: RepertoireColor
): Record<RepertoireColor, T[]> {
  const split: Record<RepertoireColor, T[]> = { white: [], black: [] };
  for (const game of games) {
    const tag = game.headers.Orientation?.toLowerCase();
    const side: RepertoireColor = tag === 'black' ? 'black' : tag === 'white' ? 'white' : fallback;
    split[side].push(game);
  }
  return split;
}
