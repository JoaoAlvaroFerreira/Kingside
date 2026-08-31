import { GameSource, GameSourceId } from '@types';
import { LichessSource } from './LichessSource';
import { ChessComSource } from './ChessComSource';

const SOURCES: Record<GameSourceId, GameSource> = {
  lichess: LichessSource,
  chesscom: ChessComSource,
};

export function getGameSource(id: GameSourceId): GameSource {
  return SOURCES[id];
}

export { LichessSource, ChessComSource };
export { scanGame, splitGames, tokenizeMoves } from './pgnScan';
export { httpGet } from './http';
