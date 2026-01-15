import { useEffect } from 'react';
import AppNavigator from '@navigation/AppNavigator';
import { useStore } from '@store';

export default function App() {
  const initialize = useStore(state => state.initialize);

  useEffect(() => {
    initialize();
  }, [initialize]);

  return <AppNavigator />;
}
