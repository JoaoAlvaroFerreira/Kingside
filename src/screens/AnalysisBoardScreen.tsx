import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { View, StyleSheet, Text, TouchableOpacity } from 'react-native';
import { Chess } from 'chess.js';
import { ChessWorkspace } from '@components/chess/ChessWorkspace/ChessWorkspace';
import { MoveTree } from '@utils/MoveTree';
import { UserGame, MasterGame, EngineEvaluation } from '@types';
import { StockfishService } from '@services/engine/StockfishService';
import { useStore } from '@store';

interface AnalysisBoardScreenProps {
  route?: {
    params?: {
      game?: UserGame | MasterGame;
    };
  };
}

export default function AnalysisBoardScreen({ route }: AnalysisBoardScreenProps) {
  const { screenSettings } = useStore();
  const [moveTree, setMoveTree] = useState(() => new MoveTree());
  const [updateCounter, forceUpdate] = useState(0);
  const [currentEval, setCurrentEval] = useState<EngineEvaluation | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const engineEnabled = screenSettings.analysis.engineEnabled;

  const currentFen = moveTree.getCurrentFen();
  const currentNodeId = moveTree.getCurrentNode()?.id || null;

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

  // Analyze current position when FEN changes (only if engine enabled)
  useEffect(() => {
    if (!engineEnabled) {
      setCurrentEval(null);
      setIsAnalyzing(false);
      return;
    }

    const analyzeCurrent = async () => {
      setIsAnalyzing(true);
      try {
        // Use depth 12 for faster analysis (adjustable in Settings)
        const evaluation = await StockfishService.analyze(currentFen, 12, 8000);
        setCurrentEval(evaluation);
      } catch (error) {
        console.warn('[AnalysisBoard] Engine analysis failed:', error);
        setCurrentEval(null);
      } finally {
        setIsAnalyzing(false);
      }
    };

    analyzeCurrent();
  }, [currentFen, updateCounter, engineEnabled]);

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
      {/* Status Bar */}
      <View style={styles.statusContainer}>
        <Text style={styles.turnText}>{turnText}</Text>
        {gameStatus && <Text style={styles.gameStatus}>{gameStatus}</Text>}
        {isAnalyzing && <Text style={styles.analyzingText}>Analyzing...</Text>}
      </View>

      {/* Chess Workspace */}
      <ChessWorkspace
        fen={currentFen}
        onMove={handleMove}
        moveTree={moveTree}
        currentNodeId={currentNodeId}
        onNavigate={handleNavigate}
        onPromoteToMainLine={handlePromoteToMainLine}
        currentEval={currentEval}
        screenKey="analysis"
        showMoveHistory={true}
        showSettingsGear={true}
      />

      {/* Reset Button */}
      <View style={styles.resetContainer}>
        <TouchableOpacity style={styles.resetButton} onPress={resetGame}>
          <Text style={styles.resetButtonText}>New Game</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#2c2c2c',
  },
  statusContainer: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#3a3a3a',
  },
  turnText: {
    color: '#e0e0e0',
    fontSize: 16,
    fontWeight: '600',
  },
  gameStatus: {
    color: '#ffc107',
    fontSize: 14,
    fontWeight: '700',
    marginTop: 4,
  },
  analyzingText: {
    color: '#4a9eff',
    fontSize: 12,
    marginTop: 4,
  },
  resetContainer: {
    position: 'absolute',
    bottom: 16,
    right: 16,
  },
  resetButton: {
    backgroundColor: '#4a4a4a',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#555',
  },
  resetButtonText: {
    color: '#e0e0e0',
    fontSize: 14,
    fontWeight: '600',
  },
});
