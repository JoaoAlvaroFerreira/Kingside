/**
 * Move History Component - Displays game moves with variations and navigation
 */

import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Modal,
  Pressable,
  Platform,
} from 'react-native';
import { FlatMove } from '../../../utils/MoveTree';

interface MoveHistoryProps {
  moves: FlatMove[];
  currentNodeId: string | null;
  onNavigate: (nodeId: string | null) => void;
  onGoBack: () => void;
  onGoForward: () => void;
  onGoToStart: () => void;
  onGoToEnd: () => void;
  onPromoteToMainLine?: (nodeId: string) => void;
  onMarkCritical?: (nodeId: string, isCritical: boolean) => void;
  onAddComment?: (nodeId: string) => void;
  onSettingsPress?: () => void;
  canGoBack: boolean;
  canGoForward: boolean;
}

export const MoveHistory: React.FC<MoveHistoryProps> = ({
  moves,
  currentNodeId,
  onNavigate,
  onGoBack,
  onGoForward,
  onGoToStart,
  onGoToEnd,
  onPromoteToMainLine,
  onMarkCritical,
  onAddComment,
  onSettingsPress,
  canGoBack,
  canGoForward,
}) => {
  const [contextMenu, setContextMenu] = useState<{ nodeId: string; isCritical: boolean; isVariation: boolean; x: number; y: number } | null>(null);
  const scrollViewRef = useRef<ScrollView>(null);

  const handleContextMenu = (nodeId: string, isVariation: boolean, isCritical: boolean, event: any) => {
    event.preventDefault?.();

    // Get position for context menu
    const x = event.nativeEvent?.pageX || event.pageX || 100;
    const y = event.nativeEvent?.pageY || event.pageY || 100;

    setContextMenu({ nodeId, isCritical, isVariation, x, y });
  };

  const handlePromote = () => {
    if (contextMenu && onPromoteToMainLine) {
      onPromoteToMainLine(contextMenu.nodeId);
    }
    setContextMenu(null);
  };

  const handleMarkCritical = () => {
    if (contextMenu && onMarkCritical) {
      onMarkCritical(contextMenu.nodeId, !contextMenu.isCritical);
    }
    setContextMenu(null);
  };

  const handleAddComment = () => {
    if (contextMenu && onAddComment) {
      onAddComment(contextMenu.nodeId);
    }
    setContextMenu(null);
  };

  const renderMoves = () => {
    if (moves.length === 0) {
      return <Text style={styles.emptyText}>No moves yet</Text>;
    }

    const elements: React.ReactNode[] = [];
    let i = 0;

    while (i < moves.length) {
      const move = moves[i];

      if (move.isVariationStart) {
        const variationMoves: FlatMove[] = [move];
        const variationDepth = move.depth;
        let j = i + 1;

        while (j < moves.length && moves[j].depth >= variationDepth && !moves[j].isVariationStart) {
          if (moves[j].depth === variationDepth) {
            variationMoves.push(moves[j]);
          }
          j++;
        }

        const variationElements: React.ReactNode[] = [];
        variationElements.push(
          <View key={`bracket-open-${move.id}`}>
            <Text style={styles.variationBracket}>(</Text>
          </View>
        );
        variationMoves.forEach((varMove) => {
          variationElements.push(
            <React.Fragment key={varMove.id}>
              {renderSingleMove(varMove, true)}
            </React.Fragment>
          );
        });
        variationElements.push(
          <View key={`bracket-close-${move.id}`}>
            <Text style={styles.variationBracket}>)</Text>
          </View>
        );

        elements.push(
          <View key={`var-${move.id}`} style={[styles.variation, { marginLeft: (move.depth - 1) * 8 }]}>
            {variationElements}
          </View>
        );

        i = j;
      } else if (move.isMainLine) {
        elements.push(
          <React.Fragment key={move.id}>
            {renderSingleMove(move, false)}
          </React.Fragment>
        );
        i++;
      } else {
        i++;
      }
    }

    return <>{elements}</>;
  };

  const renderSingleMove = (move: FlatMove, isInVariation: boolean) => {
    const isCurrent = currentNodeId === move.id;
    const hasComment = move.comment && move.comment.trim() !== '';

    let moveNumberText = '';
    if (move.isBlack) {
      if (move.needsMoveNumber) {
        moveNumberText = `${move.moveNumber}...`;
      }
    } else {
      moveNumberText = `${move.moveNumber}.`;
    }

    const moveElement = (
      <TouchableOpacity
        style={[styles.moveContainer, isCurrent && styles.currentMoveContainer]}
        onPress={() => onNavigate(move.id)}
        onLongPress={(e) => handleContextMenu(move.id, isInVariation, move.isCritical || false, e)}
        delayLongPress={500}
      >
        {move.isCritical && (
          <Text style={styles.criticalStar}>★</Text>
        )}
        {moveNumberText !== '' && (
          <Text style={[styles.moveNumber, !move.isMainLine && styles.variationText]}>
            {moveNumberText}
          </Text>
        )}
        <Text style={[
          styles.moveText,
          isCurrent && styles.currentMoveText,
          !move.isMainLine && styles.variationText,
        ]}>
          {move.san}
        </Text>
        {hasComment && (
          <Text style={styles.commentIndicator}>💬</Text>
        )}
      </TouchableOpacity>
    );

    // Wrap with context menu handler for web
    if (Platform.OS === 'web') {
      return (
        <View
          key={move.id}
          // @ts-ignore - onContextMenu exists on web
          onContextMenu={(e: any) => handleContextMenu(move.id, isInVariation, move.isCritical || false, e)}
        >
          {moveElement}
        </View>
      );
    }

    return moveElement;
  };

  return (
    <View style={styles.container}>
      <ScrollView
        ref={scrollViewRef}
        style={styles.moveList}
        contentContainerStyle={styles.moveListContent}
        showsVerticalScrollIndicator={true}
      >
        <View style={styles.movesWrapper}>
          {renderMoves()}
        </View>
      </ScrollView>

      <View style={styles.navigation}>
        <TouchableOpacity
          style={[styles.navButton, !canGoBack && styles.navButtonDisabled]}
          onPress={onGoToStart}
          disabled={!canGoBack}
        >
          <Text style={styles.navButtonText}>⏮</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.navButton, !canGoBack && styles.navButtonDisabled]}
          onPress={onGoBack}
          disabled={!canGoBack}
        >
          <Text style={styles.navButtonText}>◀</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.navButton, !canGoForward && styles.navButtonDisabled]}
          onPress={onGoForward}
          disabled={!canGoForward}
        >
          <Text style={styles.navButtonText}>▶</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.navButton, !canGoForward && styles.navButtonDisabled]}
          onPress={onGoToEnd}
          disabled={!canGoForward}
        >
          <Text style={styles.navButtonText}>⏭</Text>
        </TouchableOpacity>
        {onSettingsPress && (
          <TouchableOpacity
            style={styles.settingsButton}
            onPress={onSettingsPress}
          >
            <Text style={styles.navButtonText}>⚙️</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Context Menu Modal */}
      <Modal
        visible={contextMenu !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setContextMenu(null)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setContextMenu(null)}>
          <View
            style={[
              styles.contextMenu,
              contextMenu && { top: contextMenu.y, left: contextMenu.x },
            ]}
          >
            {contextMenu?.isVariation && onPromoteToMainLine && (
              <TouchableOpacity style={styles.contextMenuItem} onPress={handlePromote}>
                <Text style={styles.contextMenuText}>Promote to main line</Text>
              </TouchableOpacity>
            )}
            {onMarkCritical && (
              <TouchableOpacity style={styles.contextMenuItem} onPress={handleMarkCritical}>
                <Text style={styles.contextMenuText}>
                  {contextMenu?.isCritical ? 'Unmark as critical' : 'Mark as critical'}
                </Text>
              </TouchableOpacity>
            )}
            {onAddComment && (
              <TouchableOpacity style={styles.contextMenuItem} onPress={handleAddComment}>
                <Text style={styles.contextMenuText}>Add comment</Text>
              </TouchableOpacity>
            )}
          </View>
        </Pressable>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#3a3a3a',
    borderRadius: 6,
    padding: 8,
    minWidth: 260,
    minHeight: 200,
    flex: 1,
  },
  moveList: {
    flex: 1,
    marginBottom: 8,
  },
  moveListContent: {
    flexGrow: 1,
  },
  movesWrapper: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    paddingHorizontal: 6,
  },
  emptyText: {
    color: '#888',
    fontStyle: 'italic',
    textAlign: 'center',
    paddingVertical: 16,
    fontSize: 12,
  },
  moveContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 3,
    paddingVertical: 1,
    borderRadius: 3,
    marginRight: 2,
  },
  currentMoveContainer: {
    backgroundColor: '#5a5a5a',
  },
  moveNumber: {
    color: '#888',
    fontSize: 11,
    marginRight: 2,
  },
  moveText: {
    color: '#e0e0e0',
    fontSize: 12,
    fontFamily: 'monospace',
  },
  currentMoveText: {
    fontWeight: '700',
  },
  variationText: {
    color: '#aaa',
    fontSize: 11,
  },
  variation: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    marginVertical: 1,
  },
  variationBracket: {
    color: '#777',
    fontSize: 11,
    marginHorizontal: 2,
  },
  navigation: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
  },
  navButton: {
    backgroundColor: '#4a4a4a',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 4,
  },
  navButtonDisabled: {
    opacity: 0.4,
  },
  navButtonText: {
    color: '#e0e0e0',
    fontSize: 14,
  },
  settingsButton: {
    backgroundColor: '#4a4a4a',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 4,
    marginLeft: 6,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
  },
  contextMenu: {
    position: 'absolute',
    backgroundColor: '#4a4a4a',
    borderRadius: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
    minWidth: 180,
  },
  contextMenuItem: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  contextMenuText: {
    color: '#e0e0e0',
    fontSize: 14,
  },
  criticalStar: {
    color: '#FFD700',
    fontSize: 10,
    marginRight: 1,
  },
  commentIndicator: {
    color: '#87CEEB',
    fontSize: 9,
    marginLeft: 1,
  },
});
