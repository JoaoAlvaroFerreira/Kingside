/**
 * useGameSearch - Search user and master games by FEN position
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { normalizeFen, UserGame, MasterGame } from '@types';
import { DatabaseService } from '@services/database/DatabaseService';
import { BookService } from '@services/books/BookService';

export function useGameSearch(fen: string) {
  const [userGames, setUserGames] = useState<UserGame[]>([]);
  const [masterGames, setMasterGames] = useState<MasterGame[]>([]);
  const [loading, setLoading] = useState(false);
  const lastSearchedFenRef = useRef<string | null>(null);

  useEffect(() => {
    if (!fen) return;
    const normalized = normalizeFen(fen);
    if (normalized === lastSearchedFenRef.current) return;

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
          BookService.getGamesAtPosition(normalized),
        ]);
        if (!cancelled) {
          setUserGames(uGames);
          setMasterGames([...mGames, ...bookGames]);
          lastSearchedFenRef.current = normalized;
        }
      } catch {
        if (!cancelled) {
          setUserGames([]);
          setMasterGames([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [fen]);

  const reset = useCallback(() => {
    lastSearchedFenRef.current = null;
    setUserGames([]);
    setMasterGames([]);
  }, []);

  return { userGames, masterGames, loading, reset };
}
