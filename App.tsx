import { useEffect } from 'react';
import { View, ActivityIndicator, Text, TouchableOpacity, StyleSheet, Alert, Platform } from 'react-native';
import AppNavigator from '@navigation/AppNavigator';
import { useStore } from '@store';
import { StockfishProvider } from '@services/engine/StockfishContext';
import { ErrorBoundary } from '@components/ErrorBoundary';

function AppContent() {
  const initialize = useStore(state => state.initialize);
  const isLoading = useStore(state => state.isLoading);
  const initStatus = useStore(state => state.initStatus);
  const dbError = useStore(state => state.dbError);
  const resetDatabase = useStore(state => state.resetDatabase);

  useEffect(() => {
    initialize();
  }, [initialize]);

  if (isLoading) {
    return (
      <View style={loadingStyles.container}>
        <Text style={loadingStyles.title}>Kingside</Text>
        <ActivityIndicator size="large" color="#4a9eff" />
        <Text style={loadingStyles.statusText}>{initStatus || 'Starting…'}</Text>
      </View>
    );
  }

  if (dbError) {
    const handleReset = () => {
      const msg = 'This will delete all your games, repertoires, and settings. This cannot be undone.';
      if (Platform.OS === 'web') {
        if (window.confirm(`Reset database?\n\n${msg}`)) resetDatabase();
      } else {
        Alert.alert('Reset Database?', msg, [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Reset', style: 'destructive', onPress: resetDatabase },
        ]);
      }
    };

    return (
      <View style={loadingStyles.container}>
        <Text style={loadingStyles.title}>Database Error</Text>
        <Text style={loadingStyles.errorText}>
          The database could not be opened. This can happen after an app update if a file was left in a bad state.
        </Text>
        <TouchableOpacity style={loadingStyles.resetButton} onPress={handleReset}>
          <Text style={loadingStyles.resetButtonText}>Reset Database</Text>
        </TouchableOpacity>
        <Text style={loadingStyles.warningText}>All data will be lost.</Text>
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
    paddingHorizontal: 32,
  },
  title: {
    color: '#e0e0e0',
    fontSize: 24,
    fontWeight: '600',
  },
  statusText: {
    color: '#888',
    fontSize: 13,
  },
  errorText: {
    color: '#aaa',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  resetButton: {
    backgroundColor: '#c62828',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 6,
    marginTop: 8,
  },
  resetButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  warningText: {
    color: '#666',
    fontSize: 12,
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
