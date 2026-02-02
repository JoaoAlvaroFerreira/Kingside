import React, { createContext, useContext, useEffect, useCallback, useRef, useState } from 'react';
import { Platform } from 'react-native';

export interface StockfishContextType {
  sendCommand: (command: string) => void;
  isReady: boolean;
  registerListener: (id: string, callback: (line: string) => void) => void;
  unregisterListener: (id: string) => void;
}

export const StockfishContext = createContext<StockfishContextType | null>(null);

/**
 * Web provider - stub implementation since native Stockfish not available
 */
const StockfishProviderWeb: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const outputListeners = useRef<Map<string, (line: string) => void>>(new Map());

  const registerListener = useCallback((id: string, callback: (line: string) => void) => {
    console.log('[Stockfish] Web: Registering listener (no-op):', id);
    outputListeners.current.set(id, callback);
  }, []);

  const unregisterListener = useCallback((id: string) => {
    console.log('[Stockfish] Web: Unregistering listener (no-op):', id);
    outputListeners.current.delete(id);
  }, []);

  const contextValue: StockfishContextType = {
    sendCommand: () => {
      console.log('[Stockfish] Web: sendCommand called (no-op)');
    },
    isReady: false, // Never ready on web
    registerListener,
    unregisterListener,
  };

  return (
    <StockfishContext.Provider value={contextValue}>
      {children}
    </StockfishContext.Provider>
  );
};

/**
 * Native provider - uses @loloof64/react-native-stockfish
 * Only instantiated on mobile platforms
 */
const StockfishProviderNative: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Dynamic require to avoid web bundler errors
  // This code only runs on native platforms due to Platform.OS check below
  let useStockfish;
  try {
    const stockfishModule = require('@loloof64/react-native-stockfish');
    console.log('[Stockfish] Module loaded:', Object.keys(stockfishModule));
    useStockfish = stockfishModule.useStockfish;
    if (!useStockfish) {
      throw new Error('useStockfish hook not found in module');
    }
  } catch (error) {
    console.error('[Stockfish] Failed to load module:', error);
    throw error;
  }

  const [isReady, setIsReady] = useState(false);
  const outputListeners = useRef<Map<string, (line: string) => void>>(new Map());

  const handleOutput = useCallback((line: string) => {
    console.log('[Stockfish] Output:', line);

    // Notify all registered listeners
    outputListeners.current.forEach(listener => {
      try {
        listener(line);
      } catch (error) {
        console.error('[Stockfish] Listener error:', error);
      }
    });

    if (line === 'readyok') {
      console.log('[Stockfish] ✓ Engine is READY');
      setIsReady(true);
    }
  }, []);

  const handleError = useCallback((error: Error) => {
    console.error('[Stockfish Error]', error);
  }, []);

  let stockfishHookResult;
  try {
    stockfishHookResult = useStockfish({
      onOutput: handleOutput,
      onError: handleError,
    });
    console.log('[Stockfish] Hook initialized:', Object.keys(stockfishHookResult));
  } catch (error) {
    console.error('[Stockfish] Hook failed:', error);
    throw error;
  }

  const { stockfishLoop, sendCommandToStockfish, stopStockfish } = stockfishHookResult;

  useEffect(() => {
    console.log('[Stockfish] Initializing engine...');
    console.log('[Stockfish] Starting stockfishLoop...');

    try {
      stockfishLoop();
      console.log('[Stockfish] stockfishLoop() called successfully');
    } catch (error) {
      console.error('[Stockfish] stockfishLoop() failed:', error);
      return;
    }

    console.log('[Stockfish] Sending uci command...');
    sendCommandToStockfish('uci');

    console.log('[Stockfish] Sending isready command...');
    sendCommandToStockfish('isready');

    return () => {
      console.log('[Stockfish] Stopping engine...');
      stopStockfish();
    };
  }, [stockfishLoop, sendCommandToStockfish, stopStockfish]);

  const registerListener = useCallback((id: string, callback: (line: string) => void) => {
    console.log('[Stockfish] Registering listener:', id);
    outputListeners.current.set(id, callback);
  }, []);

  const unregisterListener = useCallback((id: string) => {
    console.log('[Stockfish] Unregistering listener:', id);
    outputListeners.current.delete(id);
  }, []);

  const contextValue: StockfishContextType = {
    sendCommand: sendCommandToStockfish,
    isReady,
    registerListener,
    unregisterListener,
  };

  return (
    <StockfishContext.Provider value={contextValue}>
      {children}
    </StockfishContext.Provider>
  );
};

/**
 * Platform-aware provider - exports appropriate implementation
 */
export const StockfishProvider = Platform.OS === 'web'
  ? StockfishProviderWeb
  : StockfishProviderNative;

export const useStockfishContext = () => {
  const context = useContext(StockfishContext);
  if (!context) {
    throw new Error('useStockfishContext must be used within StockfishProvider');
  }
  return context;
};
