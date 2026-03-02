import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { View, StyleSheet, Text, useWindowDimensions } from 'react-native';
import { Chess } from 'chess.js';
import { ChessWorkspace } from '@components/chess/ChessWorkspace/ChessWorkspace';
import { GameList } from '@components/repertoire/GameList';
import { MoveTree } from '@utils/MoveTree';
import { UserGame, MasterGame, computeFensFromMoves, normalizeFen } from '@types';
import { DatabaseService } from '@services/database/DatabaseService';

const GAME_LIST_HEIGHT = 180;

interface AnalysisBoardScreenProps {
  route?: {
    params?: {
      game?: UserGame | MasterGame;
    };
  };
}

export default function AnalysisBoardScreen({ route }: AnalysisBoardScreenProps) {
  const [moveTree, setMoveTree] = useState(() => new MoveTree());
  const [_updateCounter, forceUpdate] = useState(0);
  const [userGames, setUserGames] = useState<UserGame[]>([]);
  const [masterGames, setMasterGames] = useState<MasterGame[]>([]);
  const lastSearchedFenRef = useRef<string | null>(null);
  const { width } = useWindowDimensions();
  const isWide = width > 700;

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

  // Search games by FEN when position changes
  useEffect(() => {
    if (!currentFen) return;
    const normalized = normalizeFen(currentFen);
    if (normalized === lastSearchedFenRef.current) return;

    let cancelled = false;
    (async () => {
      try {
        const [uGames, mGames] = await Promise.all([
          DatabaseService.searchUserGamesByFEN(normalized),
          DatabaseService.searchMasterGamesByFEN(normalized),
        ]);
        if (!cancelled) {
          setUserGames(uGames);
          setMasterGames(mGames);
          lastSearchedFenRef.current = normalized;
        }
      } catch {
        if (!cancelled) {
          setUserGames([]);
          setMasterGames([]);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [currentFen]);

  const handleSelectGame = useCallback((game: UserGame | MasterGame) => {
    if (!currentFen) return;
    const gameFens = computeFensFromMoves(game.moves);
    const normalized = normalizeFen(currentFen);
    const posIndex = gameFens.indexOf(normalized);
    if (posIndex === -1) return;

    const continuation = game.moves.slice(posIndex);
    for (const san of continuation) {
      moveTree.addMove(san);
    }
    forceUpdate(n => n + 1);
  }, [moveTree, currentFen]);

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

  const handleDeleteMove = useCallback((nodeId: string) => {
    moveTree.deleteFromNode(nodeId);
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
      {gameStatus && (
        <View style={styles.statusWrapper}>
          <View style={styles.statusContainer}>
            <Text style={styles.gameStatus}>{gameStatus}</Text>
          </View>
        </View>
      )}

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
        onDeleteMove={handleDeleteMove}
        screenKey="analysis"
        showMoveHistory={true}
        showSettingsGear={true}
        verticalOffset={GAME_LIST_HEIGHT}
      />
      <View style={styles.bottomSection}>
        <View style={styles.gameListHalf}>
          <GameList
            title="Your Games"
            games={userGames}
            onSelect={handleSelectGame}
            defaultCollapsed={!isWide}
          />
        </View>
        <View style={styles.gameListHalf}>
          <GameList
            title="Master Games"
            games={masterGames}
            onSelect={handleSelectGame}
            defaultCollapsed={!isWide}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#2c2c2c',
  },
  statusWrapper: {
    paddingVertical: 4,
    justifyContent: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#3a3a3a',
  },
  statusContainer: {
    alignItems: 'center',
  },
  gameStatus: {
    color: '#ffc107',
    fontSize: 11,
    fontWeight: '700',
  },
  analyzingText: {
    color: '#4a9eff',
    fontSize: 9,
    marginTop: 2,
  },
  bottomSection: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: '#3a3a3a',
    height: GAME_LIST_HEIGHT,
    gap: 8,
    padding: 4,
  },
  gameListHalf: {
    flex: 1,
    minWidth: 0,
  },
});
