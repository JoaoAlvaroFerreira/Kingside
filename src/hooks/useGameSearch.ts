/**
 * useGameSearch - Search user and master games by FEN position
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { normalizeFen, UserGame, MasterGame } from '@types';
import { DatabaseService } from '@services/database/DatabaseService';
import { BookService } from '@services/books/BookService';
import { useStore } from '@store';

export function useGameSearch(fen: string) {
  const [userGames, setUserGames] = useState<UserGame[]>([]);
  const [masterGames, setMasterGames] = useState<MasterGame[]>([]);
  // Every source here is capped — books by their per-move sample, local games by
  // POSITION_MATCH_LIMIT — so both counts are ceilings and the UI has to say so.
  const [userHasMore, setUserHasMore] = useState(false);
  const [masterHasMore, setMasterHasMore] = useState(false);
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
    const searchKey = `${normalized}|${playerMovesOnly}|${bookRevision}`;
    if (searchKey === lastSearchedRef.current) return;

    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const [uGames, mGames, bookGames] = await Promise.all([
          DatabaseService.searchUserGamesByFEN(normalized),
          DatabaseService.searchMasterGamesByFEN(normalized),
          // Book games are a bounded sample per move rather than an exhaustive lookup, so
          // they come last: the locally imported games are complete for this position and
          // should be what the user sees first.
          BookService.getGamesAtPosition(normalized, playerMovesOnly),
        ]);
        if (!cancelled) {
          setUserGames(uGames.games);
          setUserHasMore(uGames.hasMore);
          setMasterGames([...mGames.games, ...bookGames.games]);
          // Either source being truncated means the master count understates the position.
          setMasterHasMore(mGames.hasMore || bookGames.hasMore);
          lastSearchedRef.current = searchKey;
        }
      } catch {
        if (!cancelled) {
          setUserGames([]);
          setMasterGames([]);
          setUserHasMore(false);
          setMasterHasMore(false);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [fen, bookRevision, playerMovesOnly]);

  const reset = useCallback(() => {
    lastSearchedRef.current = null;
    setUserGames([]);
    setMasterGames([]);
    setUserHasMore(false);
    setMasterHasMore(false);
  }, []);

  return { userGames, userHasMore, masterGames, masterHasMore, loading, reset };
}
