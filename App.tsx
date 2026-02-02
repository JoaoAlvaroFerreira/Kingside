import { useEffect } from 'react';
import AppNavigator from '@navigation/AppNavigator';
import { useStore } from '@store';
import { StockfishProvider, useStockfishContext } from '@services/engine/StockfishContext';
import { LocalEngineService } from '@services/engine/LocalEngineService';

function AppContent() {
  const initialize = useStore(state => state.initialize);
  const stockfishContext = useStockfishContext();

  // Initialize store
  useEffect(() => {
    initialize();
  }, [initialize]);

  // Initialize LocalEngineService with Stockfish context
  // Must be called immediately, not after isReady
  useEffect(() => {
    console.log('[App] Initializing LocalEngineService with Stockfish context');
    LocalEngineService.initializeWithContext(stockfishContext);
  }, [stockfishContext]);

  return <AppNavigator />;
}

export default function App() {
  return (
    <StockfishProvider>
      <AppContent />
    </StockfishProvider>
  );
}
