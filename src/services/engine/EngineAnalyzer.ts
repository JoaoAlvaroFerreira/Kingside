import { Chess } from 'chess.js';
import { EngineEvaluation } from '@types';

export interface AnalysisOptions {
  depth: number;
  moveTime: number;
  multiPV: number;
}

interface PVData {
  score: number;
  mate?: number;
  moves: string[];
}

interface ActiveSearch {
  fen: string;
  options: AnalysisOptions;
  id: number;
  resolve: (result: EngineEvaluation) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
  topDepth: number;
  pvs: Map<number, PVData>;
  onProgress?: (partial: EngineEvaluation) => void;
  fenced: boolean;
}

export class EngineAnalyzer {
  private send: (cmd: string) => void;
  private seq = 0;
  private search: ActiveSearch | null = null;
  private cache = new Map<string, EngineEvaluation>();
  private cacheMax = 500;
  private threadsConfigured = false;
  private lastProgressAt = 0;
  private static PROGRESS_THROTTLE_MS = 250;

  constructor(sendCommand: (cmd: string) => void) {
    this.send = sendCommand;
  }

  configure(threads: number): void {
    if (this.threadsConfigured) return;
    this.send(`setoption name Threads value ${threads}`);
    this.threadsConfigured = true;
  }

  handleLine(line: string): void {
    const s = this.search;
    if (!s) return;

    // Readyok fence: discard all output until the engine confirms
    // it has processed our stop + isready. This guarantees no stale
    // data from a previous search contaminates the new one.
    if (!s.fenced) {
      if (line === 'readyok') {
        if (__DEV__) console.log('[SF] Fence cleared, starting search for', s.fen.split(' ').slice(0, 2).join(' '));
        s.fenced = true;
        this.send(`setoption name MultiPV value ${s.options.multiPV}`);
        this.send(`position fen ${s.fen}`);
        this.send(`go movetime ${s.options.moveTime}`);
      }
      return;
    }

    if (line.startsWith('info') && line.includes(' score ')) {
      this.parseInfo(line, s);

      if (s.onProgress && s.pvs.size > 0) {
        const now = Date.now();
        if (now - this.lastProgressAt >= EngineAnalyzer.PROGRESS_THROTTLE_MS) {
          this.lastProgressAt = now;
          s.onProgress(this.buildEval(s));
        }
      }
      return;
    }

    if (line.startsWith('bestmove')) {
      clearTimeout(s.timer);
      this.search = null;

      if (s.pvs.size > 0) {
        s.resolve(this.buildEval(s));
      } else {
        const uci = line.split(' ')[1] || '';
        s.resolve({
          fen: s.fen,
          depth: 0,
          score: 0,
          bestMove: uci,
          bestMoveSan: uciToSan(s.fen, uci),
          pv: uci ? [uci] : [],
          lines: [],
          timestamp: new Date(),
        });
      }
    }
  }

  analyze(
    fen: string,
    opts: AnalysisOptions,
    onProgress?: (partial: EngineEvaluation) => void,
  ): Promise<EngineEvaluation> {
    const key = `${fen}|${opts.depth}|${opts.moveTime}|${opts.multiPV}`;
    const cached = this.cache.get(key);
    if (cached) return Promise.resolve(cached);

    this.cancelActive();
    const id = ++this.seq;
    const t0 = Date.now();

    return new Promise<EngineEvaluation>((resolve, reject) => {
      const timer = setTimeout(() => {
        if (this.search?.id !== id) return;
        const s = this.search;
        this.search = null;
        this.send('stop');
        if (__DEV__) console.log(`[SF] Analysis timeout after ${Date.now() - t0}ms`);
        if (s.pvs.size > 0) {
          resolve(this.buildEval(s));
        } else {
          reject(new Error('Engine analysis timeout'));
        }
      }, opts.moveTime + 10000);

      this.search = {
        fen,
        options: opts,
        id,
        resolve,
        reject,
        timer,
        topDepth: 0,
        pvs: new Map(),
        onProgress,
        fenced: false,
      };

      // Readyok fence: stop any running search, then isready.
      // All output before readyok (stale info/bestmove) is discarded.
      // After readyok, we send setoption + position + go.
      this.send('stop');
      this.send('isready');
    }).then(result => {
      if (__DEV__) console.log(`[SF] Analysis done in ${Date.now() - t0}ms depth=${result.depth}`);

      if (this.cache.size >= this.cacheMax) {
        const first = this.cache.keys().next().value;
        if (first) this.cache.delete(first);
      }
      this.cache.set(key, result);
      return result;
    });
  }

  cancel(): void {
    this.cancelActive();
    this.send('stop');
  }

  destroy(): void {
    this.cancelActive();
  }

  private cancelActive(): void {
    if (!this.search) return;
    clearTimeout(this.search.timer);
    this.search.reject(new Error('Cancelled'));
    this.search = null;
  }

  private parseInfo(line: string, s: ActiveSearch): void {
    const dMatch = line.match(/\bdepth (\d+)/);
    const depth = dMatch ? parseInt(dMatch[1]) : 0;
    if (depth <= 0) return;

    const pvIdx = (() => {
      const m = line.match(/\bmultipv (\d+)/);
      return m ? parseInt(m[1]) : 1;
    })();

    if (depth > s.topDepth) {
      s.topDepth = depth;
    }
    if (depth < s.topDepth) return;

    const cpMatch = line.match(/\bscore cp (-?\d+)/);
    const mateMatch = line.match(/\bscore mate (-?\d+)/);
    const pvMatch = line.match(/ pv (.+)$/);

    let score = 0;
    let mate: number | undefined;
    if (cpMatch) {
      score = parseInt(cpMatch[1]);
    } else if (mateMatch) {
      mate = parseInt(mateMatch[1]);
      score = mate > 0 ? 10000 : -10000;
    }

    s.pvs.set(pvIdx, {
      score,
      mate,
      moves: pvMatch ? pvMatch[1].trim().split(/\s+/) : [],
    });
  }

  private buildEval(s: ActiveSearch): EngineEvaluation {
    const black = s.fen.split(' ')[1] === 'b';
    const flip = (v: number) => (black ? -v : v);
    const top = s.pvs.get(1);
    const bestUci = top?.moves[0] || '';

    const lines = Array.from(s.pvs.entries())
      .sort(([a], [b]) => a - b)
      .map(([, pv]) => ({
        score: flip(pv.score),
        mate: pv.mate !== undefined ? flip(pv.mate) : undefined,
        pv: pv.moves,
      }));

    return {
      fen: s.fen,
      depth: s.topDepth,
      score: top ? flip(top.score) : 0,
      mate: top?.mate !== undefined ? flip(top.mate) : undefined,
      bestMove: bestUci,
      bestMoveSan: uciToSan(s.fen, bestUci),
      pv: top?.moves || [],
      lines,
      timestamp: new Date(),
    };
  }
}

function uciToSan(fen: string, uci: string): string {
  if (!uci || uci.length < 4) return '';
  try {
    const m = new Chess(fen).move({
      from: uci.substring(0, 2),
      to: uci.substring(2, 4),
      promotion: uci.length > 4 ? uci[4] : undefined,
    });
    return m?.san || uci;
  } catch {
    return uci;
  }
}
