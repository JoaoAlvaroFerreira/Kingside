import React, { useState, useCallback, useEffect, useRef } from 'react';
import { View, StyleSheet, useWindowDimensions } from 'react-native';
import { Chess } from 'chess.js';
import { useFocusEffect } from '@react-navigation/native';
import { ChessWorkspace } from '@components/chess/ChessWorkspace/ChessWorkspace';
import { GameList } from '@components/repertoire/GameList';
import { MoveTree } from '@utils/MoveTree';
import { UserGame, MasterGame, computeFensFromMoves, normalizeFen } from '@types';
import { DatabaseService } from '@services/database/DatabaseService';
import { PGNService } from '@services/pgn/PGNService';

const GAME_LIST_HEIGHT = 180;

interface AnalysisBoardScreenProps {
  route?: {
    params?: {
      game?: UserGame | MasterGame;
    };
  };
  navigation?: any;
}

export default function AnalysisBoardScreen({ route, navigation }: AnalysisBoardScreenProps) {
  const [moveTree, setMoveTree] = useState(() => new MoveTree());
  const [_updateCounter, forceUpdate] = useState(0);
  const [userGames, setUserGames] = useState<UserGame[]>([]);
  const [masterGames, setMasterGames] = useState<MasterGame[]>([]);
  const [loadingGames, setLoadingGames] = useState(false);
  const lastSearchedFenRef = useRef<string | null>(null);
  const { width } = useWindowDimensions();
  const isWide = width > 700;

  const currentFen = moveTree.getCurrentFen();
  const currentNodeId = moveTree.getCurrentNode()?.id || null;

  // Load game if provided via navigation — parse PGN to preserve annotations.
  // Track the game ID so we don't re-load the same game or interfere with focus reset.
  const justLoadedRef = useRef(false);

  useEffect(() => {
    const game = route?.params?.game;
    if (game) {
      let newTree: MoveTree;
      if (game.pgn) {
        try {
          const parsed = PGNService.parseMultipleGames(game.pgn);
          newTree = PGNService.toMoveTree(parsed[0]);
        } catch {
          newTree = new MoveTree(game.startFen);
          if (game.moves) {
            for (const move of game.moves) newTree.addMove(move);
          }
        }
      } else if (game.moves) {
        newTree = new MoveTree(game.startFen);
        for (const move of game.moves) newTree.addMove(move);
      } else {
        newTree = new MoveTree();
      }
      newTree.goToStart();
      setMoveTree(newTree);
      forceUpdate(n => n + 1);
      justLoadedRef.current = true;
      // Clear the nav param so it doesn't persist across tab switches
      navigation?.setParams?.({ game: undefined });
    }
  }, [route?.params?.game, navigation]);

  // Reset board when returning to Analysis tab (unless we just loaded a game)
  useFocusEffect(
    useCallback(() => {
      if (justLoadedRef.current) {
        justLoadedRef.current = false;
        return;
      }
      setMoveTree(new MoveTree());
      forceUpdate(n => n + 1);
      lastSearchedFenRef.current = null;
      setUserGames([]);
      setMasterGames([]);
    }, [])
  );

  // Search games by FEN when position changes
  useEffect(() => {
    if (!currentFen) return;
    const normalized = normalizeFen(currentFen);
    if (normalized === lastSearchedFenRef.current) return;

    let cancelled = false;
    setLoadingGames(true);
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
      } finally {
        if (!cancelled) setLoadingGames(false);
      }
    })();
    return () => { cancelled = true; };
  }, [currentFen]);

  const handleSelectGame = useCallback((game: UserGame | MasterGame) => {
    if (!currentFen) return;
    const gameFens = computeFensFromMoves(game.moves, game.startFen);
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

  return (
    <View style={styles.container}>
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
            loading={loadingGames}
          />
        </View>
        <View style={styles.gameListHalf}>
          <GameList
            title="Master Games"
            games={masterGames}
            onSelect={handleSelectGame}
            defaultCollapsed={!isWide}
            loading={loadingGames}
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
