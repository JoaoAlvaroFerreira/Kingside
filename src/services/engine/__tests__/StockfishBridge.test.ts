// Mock react-native before importing StockfishBridge
const mockSendCommand = jest.fn();
const mockMainLoop = jest.fn();
const mockShutdownStockfish = jest.fn();
const mockAddListener = jest.fn();
const mockRemove = jest.fn();

jest.mock('react-native', () => ({
  NativeModules: {
    StockfishChessEngine: {
      mainLoop: mockMainLoop,
      sendCommand: mockSendCommand,
      shutdownStockfish: mockShutdownStockfish,
    },
  },
  NativeEventEmitter: jest.fn().mockImplementation(() => ({
    addListener: mockAddListener.mockReturnValue({ remove: mockRemove }),
  })),
}));

// Import after mock is set up
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { stockfishBridge } = require('../StockfishBridge');

// Get the listener callback registered by the bridge
function getOutputListener(): ((text: string) => void) {
  const [, callback] = mockAddListener.mock.calls[0];
  return callback;
}

beforeEach(() => {
  jest.clearAllMocks();
  // Reset bridge state by calling stop then clearing
  stockfishBridge.stop();
});

describe('StockfishBridge', () => {
  describe('initialization', () => {
    it('sends uci, setoption Use NNUE false, isready on start', async () => {
      const p = stockfishBridge.start();
      // Simulate readyok
      const listener = getOutputListener();
      listener('readyok\n');
      await p;

      const calls = mockSendCommand.mock.calls.map(([c]: [string]) => c);
      expect(calls).toContain('uci');
      expect(calls).toContain('setoption name Use NNUE value false');
      expect(calls).toContain('isready');
    });

    it('sets isReady to true after readyok', async () => {
      expect(stockfishBridge.isReady).toBe(false);
      const p = stockfishBridge.start();
      const listener = getOutputListener();
      listener('readyok\n');
      await p;
      expect(stockfishBridge.isReady).toBe(true);
    });

    it('returns same promise if called twice', () => {
      const p1 = stockfishBridge.start();
      const p2 = stockfishBridge.start();
      expect(p1).toBe(p2);
      // resolve to clean up
      const listener = getOutputListener();
      listener('readyok\n');
    });
  });

  describe('line buffering', () => {
    async function startBridge() {
      const p = stockfishBridge.start();
      const listener = getOutputListener();
      listener('readyok\n');
      await p;
      return listener;
    }

    it('processes complete lines ending with newline', async () => {
      const listener = await startBridge();
      const handler = jest.fn();
      stockfishBridge.setOutputHandler(handler);
      listener('info depth 5 score cp 20\n');
      expect(handler).toHaveBeenCalledWith('info depth 5 score cp 20');
    });

    it('handles events without trailing newline (appends newline)', async () => {
      const listener = await startBridge();
      const handler = jest.fn();
      stockfishBridge.setOutputHandler(handler);
      // No trailing newline — bridge should append one and flush
      listener('bestmove e2e4');
      expect(handler).toHaveBeenCalledWith('bestmove e2e4');
    });

    it('handles multiple lines in single event', async () => {
      const listener = await startBridge();
      const handler = jest.fn();
      stockfishBridge.setOutputHandler(handler);
      listener('info depth 1 score cp 10\ninfo depth 2 score cp 15\n');
      expect(handler).toHaveBeenCalledTimes(2);
    });

    it('skips empty lines', async () => {
      const listener = await startBridge();
      const handler = jest.fn();
      stockfishBridge.setOutputHandler(handler);
      listener('\n\n\n');
      expect(handler).not.toHaveBeenCalled();
    });

    it('trims whitespace from lines', async () => {
      const listener = await startBridge();
      const handler = jest.fn();
      stockfishBridge.setOutputHandler(handler);
      listener('  bestmove e2e4  \n');
      expect(handler).toHaveBeenCalledWith('bestmove e2e4');
    });
  });

  describe('output routing', () => {
    it('does not route lines before readyok', () => {
      const handler = jest.fn();
      stockfishBridge.start();
      const listener = getOutputListener();
      stockfishBridge.setOutputHandler(handler);
      listener('info depth 5\n'); // before readyok
      expect(handler).not.toHaveBeenCalled();
    });

    it('routes lines to outputHandler after ready', async () => {
      const p = stockfishBridge.start();
      const listener = getOutputListener();
      listener('readyok\n');
      await p;

      const handler = jest.fn();
      stockfishBridge.setOutputHandler(handler);
      listener('info depth 1 score cp 20\n');
      expect(handler).toHaveBeenCalledWith('info depth 1 score cp 20');
    });

    it('handles null outputHandler without throwing', async () => {
      const p = stockfishBridge.start();
      const listener = getOutputListener();
      listener('readyok\n');
      await p;
      stockfishBridge.setOutputHandler(null);
      expect(() => listener('bestmove e2e4\n')).not.toThrow();
    });
  });

  describe('cleanup', () => {
    it('stop removes event subscription', async () => {
      const p = stockfishBridge.start();
      const listener = getOutputListener();
      listener('readyok\n');
      await p;
      stockfishBridge.stop();
      expect(mockRemove).toHaveBeenCalled();
    });

    it('stop calls shutdownStockfish', async () => {
      const p = stockfishBridge.start();
      const listener = getOutputListener();
      listener('readyok\n');
      await p;
      stockfishBridge.stop();
      expect(mockShutdownStockfish).toHaveBeenCalled();
    });

    it('stop resets ready state', async () => {
      const p = stockfishBridge.start();
      const listener = getOutputListener();
      listener('readyok\n');
      await p;
      expect(stockfishBridge.isReady).toBe(true);
      stockfishBridge.stop();
      expect(stockfishBridge.isReady).toBe(false);
    });
  });
});
