import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Chess } from 'chess.js';
import { useFocusEffect } from '@react-navigation/native';
import { ChessAnalysisLayout } from '@components/chess/ChessAnalysisLayout/ChessAnalysisLayout';
import { MoveTree } from '@utils/MoveTree';
import { UserGame, MasterGame, computeFensFromMoves, normalizeFen } from '@types';
import { PGNService } from '@services/pgn/PGNService';
import { useGameSearch } from '@hooks/useGameSearch';
import { ChapterFenMatch } from '@utils/extractRepertoirePositions';

interface AnalysisBoardScreenProps {
  route?: {
    params?: {
      game?: UserGame | MasterGame;
      /** A bare move sequence to load, e.g. a line just drilled in training. */
      line?: { moves: string[]; startFen?: string };
    };
  };
  navigation?: any;
}

export default function AnalysisBoardScreen({ route, navigation }: AnalysisBoardScreenProps) {
  const [moveTree, setMoveTree] = useState(() => new MoveTree());
  const [, forceUpdate] = useState(0);

  const currentFen = moveTree.getCurrentFen();
  const currentNodeId = moveTree.getCurrentNode()?.id || null;
  const { userGames, masterGames, loading: loadingGames, reset: resetGames } = useGameSearch(currentFen);

  // Load game if provided via navigation
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
      navigation?.setParams?.({ game: undefined });
    }
  }, [route?.params?.game, navigation]);

  useEffect(() => {
    const line = route?.params?.line;
    if (!line?.moves?.length) return;
    const newTree = new MoveTree(line.startFen);
    for (const san of line.moves) newTree.addMove(san);
    newTree.goToStart();
    setMoveTree(newTree);
    forceUpdate(n => n + 1);
    justLoadedRef.current = true;
    navigation?.setParams?.({ line: undefined });
  }, [route?.params?.line, navigation]);

  // Reset board when returning to Analysis tab (unless we just loaded a game)
  useFocusEffect(
    useCallback(() => {
      if (justLoadedRef.current) {
        justLoadedRef.current = false;
        return;
      }
      setMoveTree(new MoveTree());
      forceUpdate(n => n + 1);
      resetGames();
    }, [resetGames])
  );

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

  const handleSelectRepertoireMatch = useCallback((match: ChapterFenMatch) => {
    navigation?.navigate?.('RepertoireStudy', { repertoireId: match.repertoireId, chapterId: match.chapterId });
  }, [navigation]);

  const triggerUpdate = useCallback(() => forceUpdate(n => n + 1), []);

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
    } catch { /* invalid move */ }
  }, [moveTree, currentFen, triggerUpdate]);

  const handleNavigate = useCallback((nodeId: string | null) => { moveTree.navigateToNode(nodeId); triggerUpdate(); }, [moveTree, triggerUpdate]);
  const handlePromote = useCallback((nodeId: string) => { moveTree.promoteToMainLine(nodeId); triggerUpdate(); }, [moveTree, triggerUpdate]);
  const handleDelete = useCallback((nodeId: string) => { moveTree.deleteFromNode(nodeId); triggerUpdate(); }, [moveTree, triggerUpdate]);
  const handleGoBack = useCallback(() => { moveTree.goBack(); triggerUpdate(); }, [moveTree, triggerUpdate]);
  const handleGoForward = useCallback(() => { moveTree.goForward(); triggerUpdate(); }, [moveTree, triggerUpdate]);
  const handleGoToStart = useCallback(() => { moveTree.goToStart(); triggerUpdate(); }, [moveTree, triggerUpdate]);
  const handleGoToEnd = useCallback(() => { moveTree.goToEnd(); triggerUpdate(); }, [moveTree, triggerUpdate]);

  // The dashboard still picks the repertoire — a position usually sits in several.
  const handleDrillFromPosition = useCallback(() => {
    navigation?.navigate('Training', { fromFen: currentFen });
  }, [navigation, currentFen]);

  return (
    <ChessAnalysisLayout
      moveTree={moveTree}
      currentFen={currentFen}
      currentNodeId={currentNodeId}
      onMove={handleMove}
      onNavigate={handleNavigate}
      onGoBack={handleGoBack}
      onGoForward={handleGoForward}
      onGoToStart={handleGoToStart}
      onGoToEnd={handleGoToEnd}
      onPromoteToMainLine={handlePromote}
      onDeleteMove={handleDelete}
      screenKey="analysis"
      userGames={userGames}
      masterGames={masterGames}
      loadingGames={loadingGames}
      onSelectGame={handleSelectGame}
      onSelectRepertoireMatch={handleSelectRepertoireMatch}
      onDrillFromPosition={handleDrillFromPosition}
    />
  );
}
