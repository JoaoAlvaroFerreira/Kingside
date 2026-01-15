/**
 * Home Screen - Main landing page
 */

import React from 'react';
import {
  SafeAreaView,
  View,
  StyleSheet,
  Text,
  TouchableOpacity,
} from 'react-native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '@navigation/AppNavigator';
import { useStore } from '@store/index';

type HomeScreenNavigationProp = StackNavigationProp<RootStackParamList, 'Home'>;

interface HomeScreenProps {
  navigation: HomeScreenNavigationProp;
}

export const HomeScreen: React.FC<HomeScreenProps> = ({ navigation }) => {
  const { getDueCount, repertoires } = useStore();
  const dueCount = getDueCount();

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <View style={styles.header}>
          <Text style={styles.title}>♔ Kingside</Text>
          <Text style={styles.subtitle}>Chess Opening Trainer</Text>
        </View>

        <View style={styles.menuContainer}>
          <TouchableOpacity
            style={styles.menuItem}
            onPress={() => navigation.navigate('Library')}
          >
            <Text style={styles.menuIcon}>📚</Text>
            <Text style={styles.menuTitle}>My Repertoires</Text>
            <Text style={styles.menuDescription}>
              View and manage your opening repertoires
            </Text>
            {repertoires.length > 0 && (
              <Text style={styles.menuBadge}>
                {repertoires.length} repertoire{repertoires.length !== 1 ? 's' : ''}
              </Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.menuItem, dueCount === 0 && styles.menuItemDisabled]}
            onPress={() => dueCount > 0 && navigation.navigate('Training')}
          >
            <Text style={styles.menuIcon}>🎯</Text>
            <Text style={styles.menuTitle}>Review Session</Text>
            <Text style={styles.menuDescription}>
              Practice with spaced repetition
            </Text>
            {dueCount > 0 ? (
              <Text style={styles.menuBadgeDue}>
                {dueCount} card{dueCount !== 1 ? 's' : ''} due
              </Text>
            ) : (
              <Text style={styles.menuBadgeNone}>No cards due</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.menuItem}
            onPress={() => navigation.navigate('Analysis')}
          >
            <Text style={styles.menuIcon}>♟️</Text>
            <Text style={styles.menuTitle}>Analysis Board</Text>
            <Text style={styles.menuDescription}>
              Explore positions and analyze moves
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.menuItem}
            onPress={() => navigation.navigate('ImportPGN')}
          >
            <Text style={styles.menuIcon}>➕</Text>
            <Text style={styles.menuTitle}>Import PGN</Text>
            <Text style={styles.menuDescription}>
              Add a new opening repertoire
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>
            Build your chess opening repertoire with spaced repetition
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  content: {
    flex: 1,
    padding: 20,
  },
  header: {
    alignItems: 'center',
    marginTop: 40,
    marginBottom: 40,
  },
  title: {
    fontSize: 48,
    fontWeight: 'bold',
    color: '#000',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 18,
    color: '#666',
  },
  menuContainer: {
    gap: 16,
  },
  menuItem: {
    backgroundColor: '#f9f9f9',
    borderRadius: 12,
    padding: 20,
    borderLeftWidth: 4,
    borderLeftColor: '#007AFF',
  },
  menuItemDisabled: {
    opacity: 0.5,
  },
  menuIcon: {
    fontSize: 32,
    marginBottom: 8,
  },
  menuTitle: {
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 4,
  },
  menuDescription: {
    fontSize: 14,
    color: '#666',
    marginBottom: 8,
  },
  menuBadge: {
    fontSize: 13,
    color: '#007AFF',
    fontWeight: '600',
  },
  menuBadgeDue: {
    fontSize: 13,
    color: '#FF9500',
    fontWeight: '600',
  },
  menuBadgeNone: {
    fontSize: 13,
    color: '#999',
  },
  footer: {
    marginTop: 'auto',
    alignItems: 'center',
    paddingVertical: 20,
  },
  footerText: {
    fontSize: 12,
    color: '#999',
    textAlign: 'center',
  },
});
