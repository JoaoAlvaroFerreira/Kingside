/**
 * LichessService - Fetch games from Lichess.org API
 */

export interface LichessGame {
  id: string;
  rated: boolean;
  variant: string;
  speed: string;
  perf: string;
  createdAt: number;
  lastMoveAt: number;
  status: string;
  players: {
    white: { user: { name: string }; rating: number };
    black: { user: { name: string }; rating: number };
  };
  pgn: string;
}

class LichessServiceClass {
  private readonly BASE_URL = 'https://lichess.org/api';

  /**
   * Fetch games for a user from Lichess
   * @param username Lichess username
   * @param max Maximum number of games to fetch (default 50)
   * @returns Array of PGN strings
   */
  async fetchUserGames(username: string, max: number = 50): Promise<string[]> {
    const url = `${this.BASE_URL}/games/user/${username}?max=${max}&pgnInJson=true&opening=true`;

    console.log('[LichessService] Fetching games for:', username);

    const response = await fetch(url, {
      headers: {
        Accept: 'application/x-ndjson',
      },
    });

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error(`User "${username}" not found on Lichess`);
      }
      throw new Error(`Lichess API error: ${response.status} ${response.statusText}`);
    }

    const text = await response.text();

    if (!text.trim()) {
      console.warn('[LichessService] No games found for user:', username);
      return [];
    }

    // Parse NDJSON (newline-delimited JSON)
    const lines = text.trim().split('\n');
    const games: LichessGame[] = lines
      .filter(line => line.trim())
      .map(line => {
        try {
          return JSON.parse(line);
        } catch (error) {
          console.warn('[LichessService] Failed to parse line:', error);
          return null;
        }
      })
      .filter((game): game is LichessGame => game !== null);

    console.log('[LichessService] Fetched', games.length, 'games');

    // Extract PGN strings
    return games.map(game => game.pgn).filter(pgn => pgn && pgn.trim());
  }

  /**
   * Fetch master games (same as user games - any player can be imported as "master")
   */
  async fetchMasterGames(username: string, max: number = 50): Promise<string[]> {
    return this.fetchUserGames(username, max);
  }
}

export const LichessService = new LichessServiceClass();
