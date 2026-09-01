import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Chess } from 'chess.js';
import { useFocusEffect } from '@react-navigation/native';
import { ChessAnalysisLayout } from '@components/chess/ChessAnalysisLayout/ChessAnalysisLayout';
import { MoveTree } from '@utils/MoveTree';
import { UserGame, MasterGame, HeroColor, computeFensFromMoves, normalizeFen } from '@types';
import { PGNService } from '@services/pgn/PGNService';
import { useGameSearch } from '@hooks/useGameSearch';
import { ChapterFenMatch } from '@utils/extractRepertoirePositions';

interface AnalysisBoardScreenProps {
  route?: {
    params?: {
      game?: UserGame | MasterGame;
      /** Position the game was opened from, so it loads there instead of at move one. */
      atFen?: string;
      /** A bare move sequence to load, e.g. a line just drilled in training. */
      line?: { moves: string[]; startFen?: string };
      /** Set when opened from Prepare Against: adds a tab for that opponent's play. */
      opponentBookId?: string;
      opponentName?: string;
      /** The colour they are being prepared against with — the colour they had. */
      opponentColor?: HeroColor;
    };
  };
  navigation?: any;
}

export default function AnalysisBoardScreen({ route, navigation }: AnalysisBoardScreenProps) {
  const [moveTree, setMoveTree] = useState(() => new MoveTree());
  const [, forceUpdate] = useState(0);

  const currentFen = moveTree.getCurrentFen();
  const currentNodeId = moveTree.getCurrentNode()?.id || null;
  // Held in state, not read from params: a drawer route keeps its params, so reading them
  // directly would leave an opponent's tab on the board long after you navigated away from
  // Prepare Against and came back for ordinary analysis.
  const [opponent, setOpponent] = useState<
    { id: string; name: string; color?: HeroColor } | null
  >(null);
  const [showMoves, setShowMoves] = useState(0);
  const opponentBookId = opponent?.id;
  const opponentName = opponent?.name;
  const opponentColor = opponent?.color;
  // You are the other side, so the board turns to face you.
  const orientation = opponentColor ? (opponentColor === 'w' ? 'black' : 'white') : undefined;
  const {
    userGames, userHasMore, masterGames, masterHasMore,
    opponentGames, opponentHasMore, opponentTotal, masterTotal,
    loading: loadingGames, reset: resetGames,
  } = useGameSearch(currentFen, opponentBookId, opponentColor);

  // Load game if provided via navigation
  const justLoadedRef = useRef(false);

  useEffect(() => {
    const id = route?.params?.opponentBookId;
    if (!id) return;
    setOpponent({
      id,
      name: route?.params?.opponentName ?? 'Opponent',
      color: route?.params?.opponentColor,
    });
    // A new preparation starts from the initial position: the focus reset that would
    // normally do that is suppressed here, because it also clears the opponent.
    setMoveTree(new MoveTree());
    resetGames();
    forceUpdate(n => n + 1);
    justLoadedRef.current = true;
    navigation?.setParams?.({
      opponentBookId: undefined, opponentName: undefined, opponentColor: undefined,
    });
  }, [
    route?.params?.opponentBookId, route?.params?.opponentName,
    route?.params?.opponentColor, navigation, resetGames,
  ]);

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
      // Start of the game, unless the caller said which position it was opened from —
      // a game reached from a position is being read from that position.
      newTree.goToStart();
      const atFen = route?.params?.atFen;
      if (atFen) {
        const nodeId = newTree.findNodeIdByFen(atFen);
        if (nodeId) newTree.navigateToNode(nodeId);
      }
      setMoveTree(newTree);
      setShowMoves(n => n + 1);
      forceUpdate(n => n + 1);
      justLoadedRef.current = true;
      navigation?.setParams?.({ game: undefined, atFen: undefined });
    }
  }, [route?.params?.game, navigation]);

  useEffect(() => {
    const line = route?.params?.line;
    if (!line?.moves?.length) return;
    const newTree = new MoveTree(line.startFen);
    for (const san of line.moves) newTree.addMove(san);
    newTree.goToStart();
    setMoveTree(newTree);
    setShowMoves(n => n + 1);
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
      // Arriving any other way is ordinary analysis, so the opponent goes with the board.
      setOpponent(null);
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

    // Remember where we are before appending: addMove advances the cursor, so adding a
    // whole continuation would leave the board on the game's final move — the one position
    // the reader did not ask for. They tapped this game *from here*, so this is where they
    // stay; the continuation is now theirs to step through.
    const cameFrom = moveTree.getCurrentNode()?.id ?? null;

    const continuation = game.moves.slice(posIndex);
    for (const san of continuation) {
      moveTree.addMove(san);
    }
    moveTree.navigateToNode(cameFrom);

    // The moves are the point of the tap; leaving the games list up hides them.
    setShowMoves(n => n + 1);
    forceUpdate(n => n + 1);
  }, [moveTree, currentFen]);

  const handleSelectRepertoireMatch = useCallback((match: ChapterFenMatch) => {
    // Carry the position across. Without it the chapter opens at its root and the reader
    // has to re-find, by hand, the line this tab just located for them.
    navigation?.navigate?.('RepertoireStudy', {
      repertoireId: match.repertoireId,
      chapterId: match.chapterId,
      atFen: currentFen,
    });
  }, [navigation, currentFen]);

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
      userHasMore={userHasMore}
      masterGames={masterGames}
      masterHasMore={masterHasMore}
      opponentGames={opponentGames}
      opponentHasMore={opponentHasMore}
      opponentTotal={opponentTotal}
      masterTotal={masterTotal}
      opponentColor={opponentColor}
      orientationOverride={orientation}
      showMovesSignal={showMoves}
      opponentName={opponentName}
      opponentBookId={opponentBookId}
      loadingGames={loadingGames}
      onSelectGame={handleSelectGame}
      onSelectRepertoireMatch={handleSelectRepertoireMatch}
      onDrillFromPosition={handleDrillFromPosition}
    />
  );
}
