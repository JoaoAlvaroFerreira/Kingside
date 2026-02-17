import { NativeModules, NativeEventEmitter } from 'react-native';

type LineHandler = (line: string) => void;

const StockfishModule = NativeModules.StockfishChessEngine;

class StockfishBridge {
  private emitter: NativeEventEmitter | null = null;
  private subscription: { remove: () => void } | null = null;
  private outputHandler: LineHandler | null = null;
  private ready = false;
  private readyPromise: Promise<void> | null = null;
  private readyResolve: (() => void) | null = null;
  private buffer = '';

  start(): Promise<void> {
    if (this.readyPromise) return this.readyPromise;

    console.log('[SF] Starting engine...');
    if (!StockfishModule) {
      console.error('[SF] Native module StockfishChessEngine not found');
      return Promise.reject(new Error('StockfishChessEngine native module not found'));
    }

    this.buffer = '';
    this.emitter = new NativeEventEmitter(StockfishModule);

    this.readyPromise = new Promise<void>((resolve) => {
      this.readyResolve = resolve;
    });

    this.subscription = this.emitter.addListener(
      'stockfish-output',
      this.onFragment,
    );

    console.log('[SF] Calling mainLoop...');
    StockfishModule.mainLoop();

    this.sendCommand('uci');
    this.sendCommand('setoption name Use NNUE value false');
    this.sendCommand('isready');

    return this.readyPromise;
  }

  sendCommand(cmd: string): void {
    StockfishModule?.sendCommand(cmd);
  }

  setOutputHandler(handler: LineHandler | null): void {
    this.outputHandler = handler;
  }

  get isReady(): boolean {
    return this.ready;
  }

  stop(): void {
    this.subscription?.remove();
    this.subscription = null;
    this.emitter = null;
    if (StockfishModule) {
      try {
        StockfishModule.shutdownStockfish();
      } catch (e) {
        console.warn('[SF] Shutdown error:', e);
      }
    }
    this.ready = false;
    this.readyPromise = null;
    this.readyResolve = null;
    this.outputHandler = null;
    this.buffer = '';
  }

  private onFragment = (raw: any): void => {
    const text = typeof raw === 'string' ? raw : String(raw);
    // Append \n so each native event flushes its content from the buffer.
    // Without this, lines like uciok/readyok that arrive without a trailing
    // newline get stuck and concatenate with the next event's data.
    this.buffer += text + '\n';
    const parts = this.buffer.split('\n');
    this.buffer = parts.pop() || '';
    for (const part of parts) {
      const line = part.trim();
      if (line) this.processLine(line);
    }
  };

  private processLine(line: string): void {
    if (!this.ready) {
      if (line === 'readyok') {
        console.log('[SF] Engine ready (classical eval, NNUE disabled)');
        this.ready = true;
        this.readyResolve?.();
        this.readyResolve = null;
      }
      return;
    }

    this.outputHandler?.(line);
  }
}

export const stockfishBridge = new StockfishBridge();
