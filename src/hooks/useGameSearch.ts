/**
 * useGameSearch - Search user and master games by FEN position
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { normalizeFen, UserGame, MasterGame, HeroColor } from '@types';
import { DatabaseService } from '@services/database/DatabaseService';
import { BookService } from '@services/books/BookService';
import { useStore } from '@store';

export function useGameSearch(fen: string, opponentBookId?: string, opponentColor?: HeroColor) {
  const [userGames, setUserGames] = useState<UserGame[]>([]);
  const [masterGames, setMasterGames] = useState<MasterGame[]>([]);
  // Every source here is capped — books by their per-move sample, local games by
  // POSITION_MATCH_LIMIT — so both counts are ceilings and the UI has to say so.
  const [userHasMore, setUserHasMore] = useState(false);
  const [masterHasMore, setMasterHasMore] = useState(false);
  const [opponentGames, setOpponentGames] = useState<MasterGame[]>([]);
  const [opponentHasMore, setOpponentHasMore] = useState(false);
  /** How many games really reach this position, as opposed to how many can be opened. */
  const [opponentTotal, setOpponentTotal] = useState(0);
  const [masterTotal, setMasterTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const playerMovesOnly = useStore(s => s.reviewSettings.books.playerMovesOnly);
  // Keyed on every input to the search, not just the FEN: the position is only one of the
  // things that decides the answer, and memoizing on it alone left the board showing the
  // previous result whenever a filter changed under a stationary position.
  const lastSearchedRef = useRef<string | null>(null);
  // Importing or deleting a book changes the answer for a position already searched.
  const [bookRevision, setBookRevision] = useState(BookService.revision);

  useEffect(() => BookService.subscribe(() => {
    lastSearchedRef.current = null;
    setBookRevision(BookService.revision);
  }), []);

  useEffect(() => {
    if (!fen) return;
    const normalized = normalizeFen(fen);
    const searchKey = `${normalized}|${playerMovesOnly}|${bookRevision}|${opponentBookId ?? ''}|${opponentColor ?? ''}`;
    if (searchKey === lastSearchedRef.current) return;

    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const [uGames, mGames, bookGames, oppGames] = await Promise.all([
          DatabaseService.searchUserGamesByFEN(normalized),
          DatabaseService.searchMasterGamesByFEN(normalized),
          // Book games are a bounded sample per move rather than an exhaustive lookup, so
          // they come last: the locally imported games are complete for this position and
          // should be what the user sees first.
          BookService.getGamesAtPosition(normalized, playerMovesOnly),
          // Scoped to the opponent's own book, to their moves only, and to the colour
          // being prepared against — their games with the other colour are a different
          // opponent as far as this preparation is concerned.
          opponentBookId
            ? BookService.getGamesAtPosition(normalized, true, undefined, opponentBookId, opponentColor)
            : Promise.resolve({ games: [] as MasterGame[], hasMore: false, totalGames: 0 }),
        ]);
        if (!cancelled) {
          setUserGames(uGames.games);
          setUserHasMore(uGames.hasMore);
          setMasterGames([...mGames.games, ...bookGames.games]);
          // Either source being truncated means the master count understates the position.
          setMasterHasMore(mGames.hasMore || bookGames.hasMore);
          setOpponentGames(oppGames.games);
          setOpponentHasMore(oppGames.hasMore);
          setOpponentTotal(oppGames.totalGames);
          setMasterTotal(mGames.games.length + bookGames.totalGames);
          lastSearchedRef.current = searchKey;
        }
      } catch {
        if (!cancelled) {
          setUserGames([]);
          setMasterGames([]);
          setUserHasMore(false);
          setMasterHasMore(false);
          setOpponentGames([]);
          setOpponentHasMore(false);
          setOpponentTotal(0);
          setMasterTotal(0);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [fen, bookRevision, playerMovesOnly, opponentBookId, opponentColor]);

  const reset = useCallback(() => {
    lastSearchedRef.current = null;
    setUserGames([]);
    setMasterGames([]);
    setUserHasMore(false);
    setMasterHasMore(false);
    setOpponentGames([]);
    setOpponentHasMore(false);
    setOpponentTotal(0);
    setMasterTotal(0);
  }, []);

  return {
    userGames, userHasMore, masterGames, masterHasMore,
    opponentGames, opponentHasMore, opponentTotal, masterTotal, loading, reset,
  };
}
