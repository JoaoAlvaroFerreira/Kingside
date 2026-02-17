import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { View, StyleSheet, Text } from 'react-native';
import { Chess } from 'chess.js';
import { ChessWorkspace } from '@components/chess/ChessWorkspace/ChessWorkspace';
import { MoveTree } from '@utils/MoveTree';
import { UserGame, MasterGame } from '@types';
import { useEngine } from '@hooks/useEngine';
import { useStore } from '@store';

interface AnalysisBoardScreenProps {
  route?: {
    params?: {
      game?: UserGame | MasterGame;
    };
  };
}

export default function AnalysisBoardScreen({ route }: AnalysisBoardScreenProps) {
  const { screenSettings, isLoading } = useStore();
  const [moveTree, setMoveTree] = useState(() => new MoveTree());
  const [updateCounter, forceUpdate] = useState(0);

  const engineEnabled = screenSettings.analysis.engineEnabled;
  const currentFen = moveTree.getCurrentFen();
  const currentNodeId = moveTree.getCurrentNode()?.id || null;

  const { evaluation: currentEval, isAnalyzing } = useEngine(
    currentFen,
    !isLoading && engineEnabled,
  );

  // Load game if provided via navigation
  useEffect(() => {
    const game = route?.params?.game;
    if (game && game.moves) {
      const newTree = new MoveTree();
      for (const move of game.moves) {
        newTree.addMove(move);
      }
      setMoveTree(newTree);
      forceUpdate(n => n + 1);
    }
  }, [route?.params?.game]);

  const triggerUpdate = useCallback(() => {
    forceUpdate(n => n + 1);
  }, []);

  const handleMove = useCallback((from: string, to: string) => {
    const chess = new Chess(currentFen);

    try {
      const promotion = to.length === 3 ? to[2] : undefined;
      const targetSquare = to.length === 3 ? to.slice(0, 2) : to;
      const move = chess.move({ from, to: targetSquare, promotion });

      if (move) {
        moveTree.addMove(move.san);
        triggerUpdate();
      }
    } catch {
      // Invalid move
    }
  }, [moveTree, currentFen, triggerUpdate]);

  const handleNavigate = useCallback((nodeId: string | null) => {
    moveTree.navigateToNode(nodeId);
    triggerUpdate();
  }, [moveTree, triggerUpdate]);

  const handlePromoteToMainLine = useCallback((nodeId: string) => {
    moveTree.promoteToMainLine(nodeId);
    triggerUpdate();
  }, [moveTree, triggerUpdate]);

  const handleGoBack = useCallback(() => {
    moveTree.goBack();
    triggerUpdate();
  }, [moveTree, triggerUpdate]);

  const handleGoForward = useCallback(() => {
    moveTree.goForward();
    triggerUpdate();
  }, [moveTree, triggerUpdate]);

  const handleGoToStart = useCallback(() => {
    moveTree.goToStart();
    triggerUpdate();
  }, [moveTree, triggerUpdate]);

  const handleGoToEnd = useCallback(() => {
    moveTree.goToEnd();
    triggerUpdate();
  }, [moveTree, triggerUpdate]);

  const displayGame = useMemo(() => {
    try {
      return new Chess(currentFen);
    } catch {
      return new Chess();
    }
  }, [currentFen]);

  const gameStatus = useMemo(() => {
    if (displayGame.isCheckmate()) {
      const winner = displayGame.turn() === 'w' ? 'Black' : 'White';
      return `Checkmate! ${winner} wins`;
    }
    if (displayGame.isStalemate()) return 'Stalemate - Draw';
    if (displayGame.isDraw()) return 'Draw';
    if (displayGame.isCheck()) return 'Check!';
    return null;
  }, [displayGame]);

  return (
    <View style={styles.container}>
      <View style={styles.statusWrapper}>
        {(gameStatus || isAnalyzing) && (
          <View style={styles.statusContainer}>
            {gameStatus && <Text style={styles.gameStatus}>{gameStatus}</Text>}
            {isAnalyzing && <Text style={styles.analyzingText}>Analyzing...</Text>}
          </View>
        )}
      </View>

      <ChessWorkspace
        fen={currentFen}
        onMove={handleMove}
        moveTree={moveTree}
        currentNodeId={currentNodeId}
        onNavigate={handleNavigate}
        onGoBack={handleGoBack}
        onGoForward={handleGoForward}
        onGoToStart={handleGoToStart}
        onGoToEnd={handleGoToEnd}
        onPromoteToMainLine={handlePromoteToMainLine}
        currentEval={currentEval}
        screenKey="analysis"
        showMoveHistory={true}
        showSettingsGear={true}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#2c2c2c',
  },
  statusWrapper: {
    height: 40,
    justifyContent: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#3a3a3a',
  },
  statusContainer: {
    alignItems: 'center',
  },
  gameStatus: {
    color: '#ffc107',
    fontSize: 14,
    fontWeight: '700',
  },
  analyzingText: {
    color: '#4a9eff',
    fontSize: 12,
    marginTop: 4,
  },
});
