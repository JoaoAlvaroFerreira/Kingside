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
  // The book's per-move game samples are capped, so the count is a sample size rather than
  // a total and the UI has to say so.
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
          setUserGames(uGames);
          setMasterGames([...mGames, ...bookGames.games]);
          setMasterHasMore(bookGames.hasMore);
          lastSearchedRef.current = searchKey;
        }
      } catch {
        if (!cancelled) {
          setUserGames([]);
          setMasterGames([]);
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
    setMasterHasMore(false);
  }, []);

  return { userGames, masterGames, masterHasMore, loading, reset };
}
