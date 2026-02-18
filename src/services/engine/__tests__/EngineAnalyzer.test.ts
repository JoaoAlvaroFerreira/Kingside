import { EngineAnalyzer, AnalysisOptions } from '../EngineAnalyzer';

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const BLACK_FEN = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';

const DEFAULT_OPTS: AnalysisOptions = { depth: 15, moveTime: 500, multiPV: 1 };

function sendLine(analyzer: EngineAnalyzer, line: string) {
  analyzer.handleLine(line);
}

function makeAnalyzer() {
  const commands: string[] = [];
  const send = jest.fn((cmd: string) => commands.push(cmd));
  const analyzer = new EngineAnalyzer(send);
  return { analyzer, send, commands };
}

describe('EngineAnalyzer', () => {
  describe('configure', () => {
    it('sends Threads setoption once', () => {
      const { analyzer, send } = makeAnalyzer();
      analyzer.configure(2);
      expect(send).toHaveBeenCalledWith('setoption name Threads value 2');
    });

    it('does not configure twice', () => {
      const { analyzer, send } = makeAnalyzer();
      analyzer.configure(2);
      analyzer.configure(4);
      expect(send).toHaveBeenCalledTimes(1);
    });
  });

  describe('readyok fence', () => {
    it('sends stop+isready on analyze, then position+go after readyok', async () => {
      const { analyzer, commands } = makeAnalyzer();
      const promise = analyzer.analyze(START_FEN, DEFAULT_OPTS);

      // Before readyok: should have sent stop + isready
      expect(commands).toContain('stop');
      expect(commands).toContain('isready');

      // Simulate readyok -> fence cleared
      sendLine(analyzer, 'readyok');
      expect(commands.some(c => c.startsWith('position fen'))).toBe(true);
      expect(commands.some(c => c.startsWith('go movetime'))).toBe(true);

      // Resolve cleanly
      sendLine(analyzer, 'info depth 1 seldepth 1 multipv 1 score cp 20 pv e2e4');
      sendLine(analyzer, 'bestmove e2e4');
      await expect(promise).resolves.toBeDefined();
    });

    it('discards output before readyok', async () => {
      const { analyzer } = makeAnalyzer();
      const promise = analyzer.analyze(START_FEN, DEFAULT_OPTS);

      // Lines before readyok must be ignored
      sendLine(analyzer, 'info depth 5 seldepth 5 score cp 99 pv e2e4');
      sendLine(analyzer, 'bestmove e2e4'); // stale bestmove must not resolve
      sendLine(analyzer, 'readyok');       // now fence clears
      sendLine(analyzer, 'info depth 1 seldepth 1 multipv 1 score cp 20 pv e2e4');
      sendLine(analyzer, 'bestmove e2e4');

      const result = await promise;
      expect(result.depth).toBe(1); // not 5 from the pre-fence line
    });

    it('sends MultiPV option after readyok', async () => {
      const { analyzer, commands } = makeAnalyzer();
      const opts = { ...DEFAULT_OPTS, multiPV: 3 };
      const promise = analyzer.analyze(START_FEN, opts);
      sendLine(analyzer, 'readyok');

      expect(commands.some(c => c === 'setoption name MultiPV value 3')).toBe(true);

      sendLine(analyzer, 'info depth 1 seldepth 1 multipv 1 score cp 20 pv e2e4');
      sendLine(analyzer, 'bestmove e2e4');
      await promise;
    });
  });

  describe('info line parsing', () => {
    async function getResult(lines: string[], opts = DEFAULT_OPTS) {
      const { analyzer } = makeAnalyzer();
      const promise = analyzer.analyze(START_FEN, opts);
      sendLine(analyzer, 'readyok');
      for (const l of lines) sendLine(analyzer, l);
      return promise;
    }

    it('parses depth', async () => {
      const result = await getResult([
        'info depth 12 seldepth 15 multipv 1 score cp 30 pv e2e4 e7e5',
        'bestmove e2e4',
      ]);
      expect(result.depth).toBe(12);
    });

    it('parses positive score cp', async () => {
      const result = await getResult([
        'info depth 8 multipv 1 score cp 45 pv e2e4',
        'bestmove e2e4',
      ]);
      expect(result.score).toBe(45);
    });

    it('parses negative score cp', async () => {
      const result = await getResult([
        'info depth 8 multipv 1 score cp -120 pv e7e5',
        'bestmove e7e5',
      ]);
      expect(result.score).toBe(-120);
    });

    it('parses mate score (positive = white mates)', async () => {
      const result = await getResult([
        'info depth 5 multipv 1 score mate 3 pv d1h5',
        'bestmove d1h5',
      ]);
      expect(result.mate).toBe(3);
      expect(result.score).toBe(10000);
    });

    it('parses mate score (negative = black mates)', async () => {
      const result = await getResult([
        'info depth 5 multipv 1 score mate -2 pv e7e5',
        'bestmove e7e5',
      ]);
      expect(result.mate).toBe(-2);
      expect(result.score).toBe(-10000);
    });

    it('only keeps lines at maximum depth', async () => {
      const result = await getResult([
        'info depth 5 multipv 1 score cp 10 pv e2e4',
        'info depth 8 multipv 1 score cp 30 pv d2d4',
        'info depth 6 multipv 1 score cp 99 pv c2c4', // lower than 8, discarded
        'bestmove d2d4',
      ]);
      expect(result.depth).toBe(8);
      expect(result.score).toBe(30);
    });

    it('ignores info lines without score', async () => {
      const result = await getResult([
        'info depth 5 nodes 12345 time 100',
        'info depth 5 multipv 1 score cp 20 pv e2e4',
        'bestmove e2e4',
      ]);
      expect(result.score).toBe(20);
    });
  });

  describe('score orientation', () => {
    it('flips cp score for black-to-move positions', async () => {
      const { analyzer } = makeAnalyzer();
      const promise = analyzer.analyze(BLACK_FEN, DEFAULT_OPTS);
      sendLine(analyzer, 'readyok');
      sendLine(analyzer, 'info depth 5 multipv 1 score cp 30 pv e7e5');
      sendLine(analyzer, 'bestmove e7e5');
      const result = await promise;
      expect(result.score).toBe(-30); // flipped for black-to-move
    });

    it('does not flip for white-to-move', async () => {
      const { analyzer } = makeAnalyzer();
      const promise = analyzer.analyze(START_FEN, DEFAULT_OPTS);
      sendLine(analyzer, 'readyok');
      sendLine(analyzer, 'info depth 5 multipv 1 score cp 30 pv e2e4');
      sendLine(analyzer, 'bestmove e2e4');
      const result = await promise;
      expect(result.score).toBe(30);
    });

    it('flips mate score for black-to-move', async () => {
      const { analyzer } = makeAnalyzer();
      const promise = analyzer.analyze(BLACK_FEN, DEFAULT_OPTS);
      sendLine(analyzer, 'readyok');
      sendLine(analyzer, 'info depth 3 multipv 1 score mate 2 pv e7e5');
      sendLine(analyzer, 'bestmove e7e5');
      const result = await promise;
      expect(result.mate).toBe(-2);
    });
  });

  describe('bestmove handling', () => {
    it('resolves promise on bestmove', async () => {
      const { analyzer } = makeAnalyzer();
      const promise = analyzer.analyze(START_FEN, DEFAULT_OPTS);
      sendLine(analyzer, 'readyok');
      sendLine(analyzer, 'info depth 5 multipv 1 score cp 20 pv e2e4');
      sendLine(analyzer, 'bestmove e2e4');
      await expect(promise).resolves.toBeDefined();
    });

    it('bestmove with no prior info uses fallback', async () => {
      const { analyzer } = makeAnalyzer();
      const promise = analyzer.analyze(START_FEN, DEFAULT_OPTS);
      sendLine(analyzer, 'readyok');
      sendLine(analyzer, 'bestmove e2e4'); // no info lines
      const result = await promise;
      expect(result.score).toBe(0);
      expect(result.bestMove).toBe('e2e4');
    });

    it('clears active search after bestmove', async () => {
      const { analyzer } = makeAnalyzer();
      const p = analyzer.analyze(START_FEN, DEFAULT_OPTS);
      sendLine(analyzer, 'readyok');
      sendLine(analyzer, 'info depth 1 multipv 1 score cp 10 pv e2e4');
      sendLine(analyzer, 'bestmove e2e4');
      await p;
      // handleLine after search is done should be no-op
      expect(() => sendLine(analyzer, 'bestmove d2d4')).not.toThrow();
    });
  });

  describe('UCI to SAN conversion', () => {
    it('includes bestMoveSan in result', async () => {
      const { analyzer } = makeAnalyzer();
      const promise = analyzer.analyze(START_FEN, DEFAULT_OPTS);
      sendLine(analyzer, 'readyok');
      sendLine(analyzer, 'info depth 5 multipv 1 score cp 20 pv e2e4');
      sendLine(analyzer, 'bestmove e2e4');
      const result = await promise;
      expect(result.bestMoveSan).toBe('e4');
    });
  });

  describe('caching', () => {
    it('returns cached result for same fen+options', async () => {
      const { analyzer, send } = makeAnalyzer();

      const p1 = analyzer.analyze(START_FEN, DEFAULT_OPTS);
      sendLine(analyzer, 'readyok');
      sendLine(analyzer, 'info depth 5 multipv 1 score cp 20 pv e2e4');
      sendLine(analyzer, 'bestmove e2e4');
      const r1 = await p1;

      const callsBefore = send.mock.calls.length;
      const r2 = await analyzer.analyze(START_FEN, DEFAULT_OPTS);
      expect(send.mock.calls.length).toBe(callsBefore); // no new commands sent
      expect(r2).toBe(r1); // same object reference from cache
    });
  });

  describe('cancellation', () => {
    it('cancel rejects active promise with Cancelled', async () => {
      const { analyzer } = makeAnalyzer();
      const promise = analyzer.analyze(START_FEN, DEFAULT_OPTS);
      sendLine(analyzer, 'readyok');
      analyzer.cancel();
      await expect(promise).rejects.toThrow('Cancelled');
    });

    it('new analyze cancels previous', async () => {
      const { analyzer } = makeAnalyzer();
      const p1 = analyzer.analyze(START_FEN, DEFAULT_OPTS);
      sendLine(analyzer, 'readyok');
      const p2 = analyzer.analyze(BLACK_FEN, DEFAULT_OPTS); // cancels p1
      await expect(p1).rejects.toThrow('Cancelled');
      // clean up p2
      sendLine(analyzer, 'readyok');
      sendLine(analyzer, 'info depth 1 multipv 1 score cp -10 pv e7e5');
      sendLine(analyzer, 'bestmove e7e5');
      await expect(p2).resolves.toBeDefined();
    });
  });
});
