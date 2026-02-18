/**
 * Collapsible Panel Component
 * Wrapper for collapsible sections in repertoire UI
 */

import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, useWindowDimensions } from 'react-native';

interface CollapsiblePanelProps {
  title: string;
  defaultCollapsed?: boolean;
  children: React.ReactNode;
}

export function CollapsiblePanel({ title, defaultCollapsed, children }: CollapsiblePanelProps) {
  const { width } = useWindowDimensions();
  const isPhone = width < 700;

  const [collapsed, setCollapsed] = useState(defaultCollapsed ?? isPhone);

  return (
    <View style={styles.panel}>
      <TouchableOpacity
        style={styles.header}
        onPress={() => setCollapsed(!collapsed)}
        activeOpacity={0.7}
      >
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.chevron}>{collapsed ? '▶' : '▼'}</Text>
      </TouchableOpacity>
      {!collapsed && <View style={styles.content}>{children}</View>}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    backgroundColor: '#3a3a3a',
    borderRadius: 6,
    marginBottom: 8,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 8,
    backgroundColor: '#2c2c2c',
  },
  title: {
    color: '#e0e0e0',
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
    marginRight: 8,
  },
  chevron: {
    color: '#888',
    fontSize: 11,
  },
  content: {
    padding: 8,
  },
});
