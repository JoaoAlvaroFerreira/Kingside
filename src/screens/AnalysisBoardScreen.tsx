import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { View, StyleSheet, Text, TouchableOpacity, useWindowDimensions } from 'react-native';
import { Chess } from 'chess.js';
import { InteractiveChessBoard } from '@components/chess/InteractiveChessBoard/InteractiveChessBoard';
import { MoveHistory } from '@components/chess/MoveHistory/MoveHistory';
import { MoveTree } from '@utils/MoveTree';
import { UserGame, MasterGame } from '@types';

interface AnalysisBoardScreenProps {
  route?: {
    params?: {
      game?: UserGame | MasterGame;
    };
  };
}

export default function AnalysisBoardScreen({ route }: AnalysisBoardScreenProps) {
  const [moveTree, setMoveTree] = useState(() => new MoveTree());
  const [updateCounter, forceUpdate] = useState(0);
  const { width } = useWindowDimensions();
  const isWideScreen = width > 700;

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

  const currentFen = moveTree.getCurrentFen();
  const currentNodeId = moveTree.getCurrentNode()?.id || null;
  const flatMoves = useMemo(() => moveTree.getFlatMoves(), [moveTree, currentNodeId, updateCounter]);
  const canGoBack = !moveTree.isAtStart();
  const canGoForward = !moveTree.isAtEnd();

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
      // Invalid move - ignore
    }
  }, [moveTree, currentFen, triggerUpdate]);

  const handleNavigate = useCallback((nodeId: string | null) => {
    moveTree.navigateToNode(nodeId);
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

  const handlePromoteToMainLine = useCallback((nodeId: string) => {
    moveTree.promoteToMainLine(nodeId);
    triggerUpdate();
  }, [moveTree, triggerUpdate]);

  const resetGame = useCallback(() => {
    setMoveTree(new MoveTree());
  }, []);

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

  const turnText = displayGame.turn() === 'w' ? 'White to move' : 'Black to move';

  return (
    <View style={styles.container}>
      <View style={styles.statusContainer}>
        <Text style={styles.turnText}>{turnText}</Text>
        {gameStatus && <Text style={styles.gameStatus}>{gameStatus}</Text>}
      </View>

      <View style={[styles.gameArea, isWideScreen && styles.gameAreaWide]}>
        <InteractiveChessBoard
          fen={currentFen}
          onMove={handleMove}
          orientation="white"
        />

        <View style={[styles.sidePanel, isWideScreen && styles.sidePanelWide]}>
          <MoveHistory
            moves={flatMoves}
            currentNodeId={currentNodeId}
            onNavigate={handleNavigate}
            onGoBack={handleGoBack}
            onGoForward={handleGoForward}
            onGoToStart={handleGoToStart}
            onGoToEnd={handleGoToEnd}
            onPromoteToMainLine={handlePromoteToMainLine}
            canGoBack={canGoBack}
            canGoForward={canGoForward}
          />

          <TouchableOpacity style={styles.resetButton} onPress={resetGame}>
            <Text style={styles.resetButtonText}>New Game</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#2c2c2c',
    padding: 16,
  },
  statusContainer: {
    marginBottom: 16,
    alignItems: 'center',
  },
  turnText: {
    color: '#e0e0e0',
    fontSize: 18,
    fontWeight: '600',
  },
  gameStatus: {
    color: '#ffc107',
    fontSize: 16,
    fontWeight: '700',
    marginTop: 4,
  },
  gameArea: {
    flexDirection: 'column',
    alignItems: 'center',
    gap: 16,
  },
  gameAreaWide: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  sidePanel: {
    alignItems: 'center',
  },
  sidePanelWide: {
    marginLeft: 20,
  },
  resetButton: {
    marginTop: 16,
    backgroundColor: '#4a4a4a',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  resetButtonText: {
    color: '#e0e0e0',
    fontSize: 16,
    fontWeight: '600',
  },
});
