/**
 * PGN Service - Parse PGN files and convert to internal types
 */

import { parse } from '@mliebelt/pgn-parser';
import { UserGame } from '@types';
import { MoveTree, MoveNode } from '@utils/MoveTree';

interface ParsedGame {
  headers: Record<string, string>;
  moves: any[];
  gameComment?: string;
}

/**
 * Check if position i in str starts a PGN header line: [Key "Value"]
 */
function isHeaderLine(str: string, i: number): boolean {
  if (str[i] !== '[') return false;
  // Must match [Word "..."] pattern on the same line
  const lineEnd = str.indexOf('\n', i);
  const line = str.slice(i, lineEnd === -1 ? str.length : lineEnd).trim();
  return /^\[\s*\w+\s+"[^"]*"\s*\]$/.test(line);
}

export class PGNService {
  /**
   * Sanitize Chessable-specific PGN tokens before parsing.
   * - Strips @@...@@ markers
   * - Converts [text] in move sections to {text} comments
   * - Flattens nested {} so the parser sees one comment per block
   */
  static sanitizeChessablePgn(pgn: string): string {
    // 1. Strip @@...@@ markers globally
    const result = pgn.replace(/@@[^@]*@@/g, '');

    // 2. Split into header section and move section(s).
    // PGN files can contain multiple games, each with headers then moves.
    // Headers are lines matching [Key "Value"], separated from moves by blank lines.
    // We process character-by-character to correctly handle all cases.
    let output = '';
    let inHeader = true;  // Start assuming headers
    let inComment = false;
    let i = 0;

    while (i < result.length) {
      const ch = result[i];

      // Detect transition from headers to moves: a blank line after header lines
      if (inHeader) {
        // Check if current line is a header line
        if (ch === '[' && isHeaderLine(result, i)) {
          // Copy the entire header line as-is
          const lineEnd = result.indexOf('\n', i);
          const end = lineEnd === -1 ? result.length : lineEnd + 1;
          output += result.slice(i, end);
          i = end;
          continue;
        }
        // Blank line or non-header content means we've entered the move section
        if (ch === '\n' || ch === '\r') {
          output += ch;
          i++;
          continue;
        }
        // Non-header, non-blank: we're now in the move section
        inHeader = false;
      }

      // Move section processing
      if (ch === '{') {
        inComment = true;
        output += ch;
      } else if (ch === '}') {
        inComment = false;
        output += ch;
      } else if (!inComment && ch === '[') {
        // Check if this starts a new game's header block
        if (isHeaderLine(result, i)) {
          inHeader = true;
          inComment = false;
          continue; // Re-process in header mode
        }
        // Chessable bracket text — convert to comment
        output += '{';
      } else if (!inComment && ch === ']') {
        output += '}';
      } else {
        output += ch;
      }
      i++;
    }

    // 3. Flatten nested {} — merge inner braces into the outer comment
    let prev = '';
    while (prev !== output) {
      prev = output;
      output = output.replace(
        /\{([^{}]*)\{([^{}]*)\}([^{}]*)\}/g,
        '{$1$2$3}'
      );
    }

    return output;
  }

  /**
   * Parse PGN string into array of games.
   * Resilient: parses each game individually, skipping unparseable ones.
   */
  static parseMultipleGames(pgnString: string): ParsedGame[] {
    // Clean input: strip BOM and trim
    let cleanPgn = pgnString.replace(/^\uFEFF/, '').trim();

    // Sanitize Chessable-specific tokens
    cleanPgn = this.sanitizeChessablePgn(cleanPgn);

    // Check if input is just moves (no headers)
    const hasHeaders = /^\[/.test(cleanPgn);

    if (!hasHeaders) {
      cleanPgn = `[Event "?"]\n[Site "?"]\n[Date "????.??.??"]\n[Round "?"]\n[White "?"]\n[Black "?"]\n[Result "*"]\n\n${cleanPgn} *`;
    }

    // Split into individual game texts, then parse each one independently
    const gameTexts = this.splitPgnIntoGames(cleanPgn);
    const results: ParsedGame[] = [];

    for (const gameText of gameTexts) {
      const parsed = this.parseSingleGameText(gameText);
      if (parsed) results.push(parsed);
    }

    if (results.length === 0) {
      throw new Error('No valid games found in PGN');
    }

    return results;
  }

  /**
   * Split a multi-game PGN string into individual game strings.
   * Games are separated by a header block (line starting with [Key "Value"])
   * following move text.
   */
  private static splitPgnIntoGames(pgn: string): string[] {
    const games: string[] = [];
    const lines = pgn.split('\n');
    let current: string[] = [];
    let seenMoves = false;

    for (const line of lines) {
      const trimmed = line.trim();
      const isHeader = /^\[\s*\w+\s+"[^"]*"\s*\]$/.test(trimmed);

      // New game starts when we see a header after having seen moves
      if (isHeader && seenMoves) {
        const text = current.join('\n').trim();
        if (text) games.push(text);
        current = [];
        seenMoves = false;
      }

      current.push(line);

      // Non-empty, non-header line = move text
      if (trimmed && !isHeader) {
        seenMoves = true;
      }
    }

    const text = current.join('\n').trim();
    if (text) games.push(text);

    return games;
  }

  /**
   * Try to parse a single game's PGN text. Returns null on failure (skips bad games).
   */
  private static parseSingleGameText(gameText: string): ParsedGame | null {
    try {
      let parsed: any;
      try {
        parsed = parse(gameText, { startRule: 'games' });
      } catch {
        parsed = parse(gameText, { startRule: 'pgn' });
      }

      // Handle array result
      const game = Array.isArray(parsed) ? parsed[0] : parsed;
      if (!game) return null;

      return this.normalizeGameResult(game);
    } catch (error) {
      console.warn('[PGNService] Skipping unparseable game:', error);
      return null;
    }
  }

  /**
   * Normalize parser output into our ParsedGame format
   */
  private static normalizeGameResult(game: any): ParsedGame {
    const rawTags = game.tags || game.headers || {};

    const normalizedHeaders: Record<string, string> = {};
    for (const [key, value] of Object.entries(rawTags)) {
      if (key === 'Date' && typeof value === 'object' && value !== null && 'value' in value) {
        normalizedHeaders[key] = (value as any).value;
      } else if (typeof value === 'string') {
        normalizedHeaders[key] = value;
      } else if (value !== null && value !== undefined) {
        normalizedHeaders[key] = String(value);
      }
    }

    const gameComment = game.gameComment?.comment?.trim() || undefined;

    return {
      headers: normalizedHeaders,
      moves: game.moves || [],
      gameComment,
    };
  }

  /**
   * Convert parsed game to UserGame format
   */
  static toUserGame(parsed: ParsedGame): Omit<UserGame, 'id' | 'pgn' | 'importedAt'> {
    const moves = this.extractMoves(parsed.moves);

    return {
      white: parsed.headers.White || 'Unknown',
      black: parsed.headers.Black || 'Unknown',
      result: parsed.headers.Result || '*',
      date: parsed.headers.Date || new Date().toISOString().split('T')[0],
      event: parsed.headers.Event,
      eco: parsed.headers.ECO,
      moves,
      startFen: parsed.headers.FEN || undefined,
    };
  }

  /**
   * Convert parsed game to MoveTree (with variations)
   */
  static toMoveTree(parsed: ParsedGame): MoveTree {
    const startFen = parsed.headers.FEN || undefined;
    const moveTree = new MoveTree(startFen);

    if (parsed.gameComment) {
      moveTree.setRootComment(parsed.gameComment);
    }

    // Process the moves with variations
    this.buildMoveTree(parsed.moves, moveTree);

    // Reset to start position
    moveTree.goToStart();

    const flatMoves = moveTree.getFlatMoves();
    const variationCount = flatMoves.filter(m => m.isVariationStart).length;
    console.log('PGNService.toMoveTree: Built tree with', flatMoves.length, 'total moves,', variationCount, 'variations');

    return moveTree;
  }

  /**
   * Recursively build MoveTree from parsed moves (including variations)
   */
  private static buildMoveTree(movesArray: any[], moveTree: MoveTree, _startFromCurrent: boolean = false): void {
    if (!movesArray || movesArray.length === 0) return;

    // Track where we started for this sequence
    const _startingNode = moveTree.getCurrentNode();

    const processMoveSequence = (move: any) => {
      if (!move) return;

      // Extract and add the move
      if (move.notation) {
        const san = typeof move.notation === 'string'
          ? move.notation
          : move.notation.notation;

        if (san) {
          moveTree.addMove(san);

          const currentNode = moveTree.getCurrentNode();
          if (currentNode) {
            if (move.commentAfter) {
              const trimmed = move.commentAfter.trim();
              currentNode.comment = trimmed || undefined;
            }
            if (move.commentDiag) {
              this.parseCommentDiag(currentNode, move.commentDiag);
            }
            if (move.nag) {
              currentNode.nags = Array.isArray(move.nag)
                ? move.nag.map((n: string) => parseInt(String(n).replace('$', ''), 10))
                : [parseInt(String(move.nag).replace('$', ''), 10)];
            }
          }
        }
      }

      // Process variations (RAVs) at this point
      if (move.variations && Array.isArray(move.variations)) {
        for (const variation of move.variations) {
          // Save current position
          const currentNode = moveTree.getCurrentNode();

          // Go back to the position before this move to add variation
          if (currentNode?.parent) {
            moveTree.navigateToNode(currentNode.parent.id);
          }

          // Process the variation
          this.buildMoveTree(variation, moveTree, true);

          // Return to the main line position
          if (currentNode) {
            moveTree.navigateToNode(currentNode.id);
          }
        }
      }

      // Continue to next move in main line
      if (move.next) {
        processMoveSequence(move.next);
      }
    };

    // Process all moves in the array
    movesArray.forEach(move => processMoveSequence(move));
  }

  /**
   * Extract SAN moves from parsed game tree (main line only)
   */
  static extractMoves(movesArray: any[]): string[] {
    const moves: string[] = [];

    const traverse = (move: any) => {
      if (!move) return;

      // Extract SAN notation
      if (move.notation) {
        const san = typeof move.notation === 'string'
          ? move.notation
          : move.notation.notation;
        if (san) {
          moves.push(san);
        }
      }

      // Continue to next move (main line only, skip variations for now)
      if (move.next) {
        traverse(move.next);
      }
    };

    // Start traversal
    if (Array.isArray(movesArray)) {
      movesArray.forEach((move: any) => traverse(move));
    }

    return moves;
  }

  /**
   * Extract Lichess-style annotations from the parser's commentDiag object
   */
  private static parseCommentDiag(node: MoveNode, diag: any): void {
    if (diag.eval !== undefined) {
      if (typeof diag.eval === 'string' && diag.eval.startsWith('#')) {
        node.evalMate = parseInt(diag.eval.substring(1), 10);
      } else {
        node.eval = Math.round(Number(diag.eval) * 100);
      }
    }

    if (diag.clk) {
      const parts = String(diag.clk).split(':');
      if (parts.length === 3) {
        node.clock = parseInt(parts[0], 10) * 3600
          + parseInt(parts[1], 10) * 60
          + parseInt(parts[2], 10);
      }
    }
  }

  /**
   * Process a Chessable-exported PGN where each variation is a separate game.
   * Groups games by White header (Chessable's chapter/section name),
   * filters out quickstarter guides and model games.
   *
   * @returns chapters map (group name → games to merge) and model games array
   */
  static processChessableRepertoire(
    games: ParsedGame[]
  ): { chapters: Map<string, ParsedGame[]>; modelGames: ParsedGame[] } {
    const chapters = new Map<string, ParsedGame[]>();
    const modelGames: ParsedGame[] = [];

    for (const game of games) {
      const event = (game.headers.Event || '').toLowerCase();
      const white = (game.headers.White || '').toLowerCase();

      // Collect model games separately
      if (event.includes('model game') || white.includes('model game')) {
        modelGames.push(game);
        continue;
      }

      // Group by White header (Chessable's section name)
      const groupKey = game.headers.White || 'Unknown Chapter';
      const group = chapters.get(groupKey);
      if (group) {
        group.push(game);
      } else {
        chapters.set(groupKey, [game]);
      }
    }

    return { chapters, modelGames };
  }

  /**
   * Merge a parsed game's moves (with annotations) into an existing MoveTree.
   * Uses buildMoveTree internally so comments, eval, and clock are preserved.
   * Resets the tree to start position after merging.
   */
  static mergeGameIntoTree(parsed: ParsedGame, moveTree: MoveTree): void {
    this.buildMoveTree(parsed.moves, moveTree);
    moveTree.goToStart();
  }

  /**
   * Extract opening name from headers
   */
  static getOpeningName(parsed: ParsedGame): string | undefined {
    return parsed.headers.Opening || parsed.headers.Event;
  }

  /**
   * Extract ECO code from headers
   */
  static getECO(parsed: ParsedGame): string | undefined {
    return parsed.headers.ECO;
  }

  /**
   * Reconstruct PGN string from parsed game
   */
  static toPGNString(parsed: ParsedGame): string {
    const lines: string[] = [];

    // Add headers
    const headers = parsed.headers || {};
    const headerKeys = Object.keys(headers);

    if (headerKeys.length > 0) {
      for (const key of headerKeys) {
        lines.push(`[${key} "${headers[key]}"]`);
      }
      lines.push(''); // Empty line after headers
    }

    // Add moves (account for custom starting FEN move number and side)
    const moves = this.extractMoves(parsed.moves);
    if (moves.length > 0) {
      let startMoveNum = 1;
      let startIsBlack = false;
      if (headers.FEN) {
        const fenParts = headers.FEN.split(' ');
        startMoveNum = parseInt(fenParts[5] || '1', 10);
        startIsBlack = fenParts[1] === 'b';
      }

      const parts: string[] = [];
      for (let i = 0; i < moves.length; i++) {
        const plyOffset = i + (startIsBlack ? 1 : 0);
        const moveNumber = startMoveNum + Math.floor(plyOffset / 2);
        const isWhiteMove = plyOffset % 2 === 0;

        if (isWhiteMove) {
          parts.push(`${moveNumber}. ${moves[i]}`);
        } else if (i === 0 && startIsBlack) {
          parts.push(`${moveNumber}... ${moves[i]}`);
        } else {
          parts.push(moves[i]);
        }
      }
      lines.push(parts.join(' '));
    }

    // Add result
    const result = headers.Result || '*';
    lines.push(result);

    return lines.join('\n');
  }
}
