/**
 * Hierarchy Browser Component
 * Shows breadcrumb: Color > Opening > Sub-variation
 * Allows navigating up the hierarchy
 */

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { CollapsiblePanel } from './CollapsiblePanel';
import { RepertoireColor, OpeningType } from '@types';

interface HierarchyBrowserProps {
  color: RepertoireColor;
  openingType?: OpeningType;
  openingName?: string;
  subVariationName?: string;
  onNavigateToColor?: () => void;
  onNavigateToOpening?: () => void;
  onNavigateToSubVariation?: () => void;
  defaultCollapsed?: boolean;
}

export function HierarchyBrowser({
  color,
  openingType,
  openingName,
  subVariationName,
  onNavigateToColor,
  onNavigateToOpening,
  onNavigateToSubVariation,
  defaultCollapsed,
}: HierarchyBrowserProps) {
  const formatOpeningType = (type?: OpeningType) => {
    if (!type) return '';
    if (type === 'irregular') return 'Other';
    return `1. ${type}`;
  };

  const colorDisplay = color === 'white' ? 'White Repertoire' : 'Black Repertoire';
  const openingTypeDisplay = formatOpeningType(openingType);

  return (
    <CollapsiblePanel title="Location" defaultCollapsed={defaultCollapsed}>
      <View style={styles.breadcrumb}>
        <TouchableOpacity
          onPress={onNavigateToColor}
          disabled={!onNavigateToColor}
          style={styles.breadcrumbItem}
        >
          <Text style={[styles.breadcrumbText, !onNavigateToColor && styles.currentLevel]}>
            {colorDisplay}
          </Text>
        </TouchableOpacity>

        {openingType && (
          <>
            <Text style={styles.separator}>›</Text>
            <TouchableOpacity
              onPress={onNavigateToOpening}
              disabled={!onNavigateToOpening}
              style={styles.breadcrumbItem}
            >
              <Text style={[styles.breadcrumbText, !onNavigateToOpening && styles.currentLevel]}>
                {openingTypeDisplay}
              </Text>
            </TouchableOpacity>
          </>
        )}

        {openingName && (
          <>
            <Text style={styles.separator}>›</Text>
            <TouchableOpacity
              onPress={onNavigateToOpening}
              disabled={!onNavigateToOpening}
              style={styles.breadcrumbItem}
            >
              <Text style={[styles.breadcrumbText, !onNavigateToOpening && styles.currentLevel]}>
                {openingName}
              </Text>
            </TouchableOpacity>
          </>
        )}

        {subVariationName && (
          <>
            <Text style={styles.separator}>›</Text>
            <TouchableOpacity
              onPress={onNavigateToSubVariation}
              disabled={!onNavigateToSubVariation}
              style={styles.breadcrumbItem}
            >
              <Text style={[styles.breadcrumbText, !onNavigateToSubVariation && styles.currentLevel]}>
                {subVariationName}
              </Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    </CollapsiblePanel>
  );
}

const styles = StyleSheet.create({
  breadcrumb: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
  },
  breadcrumbItem: {
    paddingVertical: 2,
  },
  breadcrumbText: {
    color: '#007AFF',
    fontSize: 10,
  },
  currentLevel: {
    color: '#e0e0e0',
    fontWeight: '600',
  },
  separator: {
    color: '#666',
    fontSize: 10,
    marginHorizontal: 4,
  },
});
