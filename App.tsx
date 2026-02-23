import { useEffect } from 'react';
import { View, ActivityIndicator, Text, StyleSheet } from 'react-native';
import AppNavigator from '@navigation/AppNavigator';
import { useStore } from '@store';
import { StockfishProvider } from '@services/engine/StockfishContext';
import { ErrorBoundary } from '@components/ErrorBoundary';

function AppContent() {
  const initialize = useStore(state => state.initialize);
  const isLoading = useStore(state => state.isLoading);

  useEffect(() => {
    initialize();
  }, [initialize]);

  if (isLoading) {
    return (
      <View style={loadingStyles.container}>
        <Text style={loadingStyles.title}>Kingside</Text>
        <ActivityIndicator size="large" color="#4a9eff" />
      </View>
    );
  }

  return <AppNavigator />;
}

const loadingStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1e1e1e',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  title: {
    color: '#e0e0e0',
    fontSize: 24,
    fontWeight: '600',
  },
});

export default function App() {
  return (
    <ErrorBoundary>
      <StockfishProvider>
        <AppContent />
      </StockfishProvider>
    </ErrorBoundary>
  );
}
