/**
 * Game List Component
 * Scrollable list of games containing current position
 */

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { CollapsiblePanel } from './CollapsiblePanel';
import { UserGame, MasterGame } from '@types';

interface GameListProps {
  title: string;
  games: (UserGame | MasterGame)[];
  onSelect: (game: UserGame | MasterGame) => void;
  defaultCollapsed?: boolean;
}

export function GameList({ title, games, onSelect, defaultCollapsed }: GameListProps) {
  return (
    <CollapsiblePanel title={`${title} (${games.length})`} defaultCollapsed={defaultCollapsed}>
      {games.length === 0 ? (
        <Text style={styles.empty}>No games at this position</Text>
      ) : (
        <ScrollView style={styles.list} nestedScrollEnabled>
          {games.map((game) => (
            <TouchableOpacity
              key={game.id}
              style={styles.gameItem}
              onPress={() => onSelect(game)}
              activeOpacity={0.7}
            >
              <View style={styles.gameHeader}>
                <Text style={styles.players} numberOfLines={1}>
                  {game.white} vs {game.black}
                </Text>
                <Text style={[
                  styles.result,
                  game.result === '1-0' && styles.whiteWin,
                  game.result === '0-1' && styles.blackWin,
                  game.result === '1/2-1/2' && styles.draw,
                ]}>
                  {game.result}
                </Text>
              </View>
              <Text style={styles.meta}>
                {game.event ? `${game.event} • ` : ''}{game.date || 'Unknown date'}
              </Text>
              {game.eco && (
                <Text style={styles.eco}>{game.eco}</Text>
              )}
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}
    </CollapsiblePanel>
  );
}

const styles = StyleSheet.create({
  list: {
    maxHeight: 200,
  },
  empty: {
    color: '#888',
    fontSize: 11,
    fontStyle: 'italic',
    textAlign: 'center',
    paddingVertical: 6,
  },
  gameItem: {
    paddingVertical: 7,
    paddingHorizontal: 8,
    borderRadius: 4,
    marginBottom: 4,
    backgroundColor: '#2c2c2c',
  },
  gameHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 2,
  },
  players: {
    color: '#e0e0e0',
    fontSize: 12,
    fontWeight: '500',
    flex: 1,
  },
  result: {
    color: '#aaa',
    fontSize: 12,
    fontWeight: '600',
    marginLeft: 6,
  },
  whiteWin: {
    color: '#4CAF50',
  },
  blackWin: {
    color: '#F44336',
  },
  draw: {
    color: '#FFC107',
  },
  meta: {
    color: '#888',
    fontSize: 11,
    marginBottom: 1,
  },
  eco: {
    color: '#666',
    fontSize: 10,
  },
});
