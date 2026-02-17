import { useEffect } from 'react';
import AppNavigator from '@navigation/AppNavigator';
import { useStore } from '@store';
import { StockfishProvider } from '@services/engine/StockfishContext';

function AppContent() {
  const initialize = useStore(state => state.initialize);

  useEffect(() => {
    initialize();
  }, [initialize]);

  return <AppNavigator />;
}

export default function App() {
  return (
    <StockfishProvider>
      <AppContent />
    </StockfishProvider>
  );
}
