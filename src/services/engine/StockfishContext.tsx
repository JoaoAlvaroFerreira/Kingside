import React, { createContext, useContext, useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { stockfishBridge } from './StockfishBridge';

interface StockfishContextType {
  isReady: boolean;
}

const StockfishContext = createContext<StockfishContextType>({ isReady: false });

const StockfishProviderWeb: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <StockfishContext.Provider value={{ isReady: false }}>
    {children}
  </StockfishContext.Provider>
);

const StockfishProviderNative: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    let mounted = true;

    stockfishBridge.start()
      .then(() => {
        if (mounted) setIsReady(true);
      })
      .catch((err) => {
        console.error('[SF] Failed to start engine:', err?.message || err);
        // Engine is optional - app continues working without it
      });

    return () => {
      mounted = false;
      stockfishBridge.stop();
    };
  }, []);

  return (
    <StockfishContext.Provider value={{ isReady }}>
      {children}
    </StockfishContext.Provider>
  );
};

export const StockfishProvider = Platform.OS === 'web'
  ? StockfishProviderWeb
  : StockfishProviderNative;

export const useStockfishReady = () => useContext(StockfishContext).isReady;
