/**
 * Repertoire Study Screen
 * Wide: [left panel toggle] + [ChessWorkspace] + [Game Lists at bottom]
 * Narrow: ScrollView with hierarchy, chapter selector, game lists, ChessWorkspace
 */

import React, { useState, useMemo, useEffect } from 'react';
import { View, StyleSheet, useWindowDimensions, ScrollView, TouchableOpacity, Text, Platform } from 'react-native';
import { useStore } from '@store';
import { MoveTree } from '@utils/MoveTree';
import { ChessWorkspace } from '@components/chess/ChessWorkspace/ChessWorkspace';
import { HierarchyBrowser } from '@components/repertoire/HierarchyBrowser';
import { ChapterList } from '@components/repertoire/ChapterList';
import { ChapterSelectModal } from '@components/ChapterSelectModal';
import { GameList } from '@components/repertoire/GameList';
import { computeFensFromMoves, normalizeFen, UserGame, MasterGame, Line } from '@types';
import { createLineGenerator, LineGeneratorState } from '@services/training/LineGenerator';

// Height reserved for the game lists section in wide mode.
// Passed as verticalOffset to ChessWorkspace so board sizing accounts for it.
const GAME_LIST_HEIGHT = 180;

interface RepertoireStudyScreenProps {
  navigation: any;
  route: {
    params: {
      repertoireId: string;
      chapterId: string;
    };
  };
}

export default function RepertoireStudyScreen({ navigation: _navigation, route }: RepertoireStudyScreenProps) {
  const { repertoireId, chapterId } = route.params;
  const { repertoires } = useStore();
  const { width } = useWindowDimensions();
  const isWide = width > 700;

  const repertoire = useMemo(
    () => repertoires.find(r => r.id === repertoireId),
    [repertoires, repertoireId]
  );

  const [selectedChapterId, setSelectedChapterId] = useState<string>(chapterId);
  const [moveTree, setMoveTree] = useState<MoveTree | null>(null);
  const [, forceUpdate] = useState(0);
  const [leftPanelVisible, setLeftPanelVisible] = useState(false);
  const [chapterModalVisible, setChapterModalVisible] = useState(false);
  const [gamesAtPosition, setGamesAtPosition] = useState<{ userGames: UserGame[]; masterGames: MasterGame[] }>({
    userGames: [],
    masterGames: [],
  });

  const currentChapter = useMemo(
    () => repertoire?.chapters.find(c => c.id === selectedChapterId),
    [repertoire, selectedChapterId]
  );

  const [_lineGenerator, setLineGenerator] = useState<LineGeneratorState | null>(null);
  const [_currentLines, setCurrentLines] = useState<Line[]>([]);

  useEffect(() => {
    if (currentChapter && repertoire) {
      const tree = MoveTree.fromJSON(currentChapter.moveTree);
      setMoveTree(tree);

      const generator = createLineGenerator(
        currentChapter.moveTree,
        repertoire.id,
        currentChapter.id,
        repertoire.color
      );
      setLineGenerator(generator);
      const initialBatch = generator.loadNextBatch();
      setCurrentLines(initialBatch);
    }
  }, [currentChapter, repertoire]);

  // Keyboard navigation (web only)
  useEffect(() => {
    if (Platform.OS !== 'web' || !moveTree) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      switch (event.key) {
        case 'ArrowLeft': event.preventDefault(); handleGoBack(); break;
        case 'ArrowRight': event.preventDefault(); handleGoForward(); break;
        case 'Home': event.preventDefault(); handleGoToStart(); break;
        case 'End': event.preventDefault(); handleGoToEnd(); break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [moveTree]);

  const currentFen = moveTree?.getCurrentFen() || '';
  const currentNodeId = moveTree?.getCurrentNode()?.id || null;

  // Disabled: loading all games is too slow without FEN indexing
  useEffect(() => {
    setGamesAtPosition({ userGames: [], masterGames: [] });
  }, [currentFen]);

  const handleSelectChapter = (newChapterId: string) => {
    setSelectedChapterId(newChapterId);
  };

  const handleSelectGame = (game: UserGame | MasterGame) => {
    if (!moveTree || !currentFen) return;

    const gameFens = computeFensFromMoves(game.moves);
    const normalizedFen = normalizeFen(currentFen);
    const posIndex = gameFens.indexOf(normalizedFen);

    if (posIndex === -1) return;

    const continuation = game.moves.slice(posIndex + 1);
    for (const san of continuation) {
      moveTree.addMove(san);
    }
    forceUpdate(n => n + 1);
  };

  const handleMoveClick = (from: string, to: string) => {
    if (!moveTree) return;

    const { Chess } = require('chess.js'); // eslint-disable-line @typescript-eslint/no-var-requires
    const chess = new Chess(moveTree.getCurrentFen());
    const move = chess.move({ from, to, promotion: 'q' });

    if (move) {
      moveTree.addMove(move.san);
      forceUpdate(n => n + 1);
    }
  };

  const handleNavigate = (nodeId: string | null) => {
    if (!moveTree) return;
    moveTree.navigateToNode(nodeId);
    forceUpdate(n => n + 1);
  };

  const handleMarkCritical = (nodeId: string, isCritical: boolean) => {
    if (!moveTree) return;
    moveTree.markAsCritical(nodeId, isCritical);
    forceUpdate(n => n + 1);
  };

  const handleGoBack = () => { if (!moveTree) return; moveTree.goBack(); forceUpdate(n => n + 1); };
  const handleGoForward = () => { if (!moveTree) return; moveTree.goForward(); forceUpdate(n => n + 1); };
  const handleGoToStart = () => { if (!moveTree) return; moveTree.goToStart(); forceUpdate(n => n + 1); };
  const handleGoToEnd = () => { if (!moveTree) return; moveTree.goToEnd(); forceUpdate(n => n + 1); };

  const handlePromoteToMainLine = (nodeId: string) => {
    if (!moveTree) return;
    moveTree.promoteToMainLine(nodeId);
    forceUpdate(n => n + 1);
  };

  if (!repertoire || !currentChapter || !moveTree) {
    return null;
  }

  const chessWorkspaceProps = {
    fen: currentFen,
    onMove: handleMoveClick,
    moveTree,
    currentNodeId,
    onNavigate: handleNavigate,
    onGoBack: handleGoBack,
    onGoForward: handleGoForward,
    onGoToStart: handleGoToStart,
    onGoToEnd: handleGoToEnd,
    onMarkCritical: handleMarkCritical,
    onPromoteToMainLine: handlePromoteToMainLine,
    screenKey: 'repertoire' as const,
    orientationOverride: repertoire.color,
    showMoveHistory: true,
    showSettingsGear: true,
  };

  const gameLists = (collapsed: boolean) => (
    <View style={styles.bottomSection}>
      <View style={styles.gameListHalf}>
        <GameList
          title="Your Games"
          games={gamesAtPosition.userGames}
          onSelect={handleSelectGame}
          defaultCollapsed={collapsed}
        />
      </View>
      <View style={styles.gameListHalf}>
        <GameList
          title="Master Games"
          games={gamesAtPosition.masterGames}
          onSelect={handleSelectGame}
          defaultCollapsed={collapsed}
        />
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      {isWide ? (
        <View style={styles.wideLayout}>
          {/* Collapsible Left Panel */}
          {leftPanelVisible && (
            <ScrollView style={styles.leftPanel}>
              <HierarchyBrowser
                color={repertoire.color}
                openingType={repertoire.openingType}
                openingName={repertoire.name}
                defaultCollapsed={false}
              />
              <ChapterList
                chapters={repertoire.chapters}
                selectedId={selectedChapterId}
                onSelect={handleSelectChapter}
                defaultCollapsed={false}
              />
            </ScrollView>
          )}

          <TouchableOpacity
            style={styles.toggleButton}
            onPress={() => setLeftPanelVisible(!leftPanelVisible)}
          >
            <Text style={styles.toggleButtonText}>
              {leftPanelVisible ? '◀' : '▶'}
            </Text>
          </TouchableOpacity>

          {/* Main area: ChessWorkspace (flex:1) + game lists (fixed height) */}
          <View style={styles.wideMain}>
            <ChessWorkspace {...chessWorkspaceProps} verticalOffset={GAME_LIST_HEIGHT} />
            {gameLists(false)}
          </View>
        </View>
      ) : (
        <ScrollView style={styles.container}>
          <HierarchyBrowser
            color={repertoire.color}
            openingType={repertoire.openingType}
            openingName={repertoire.name}
            defaultCollapsed={true}
          />
          <TouchableOpacity
            style={styles.chapterButton}
            onPress={() => setChapterModalVisible(true)}
          >
            <Text style={styles.chapterButtonText} numberOfLines={1}>
              {currentChapter.name}
            </Text>
            <Text style={styles.chapterButtonArrow}>&#9662;</Text>
          </TouchableOpacity>
          {gameLists(true)}
          {/* ChessWorkspace in narrow mode has no flex:1 — sizes to content for ScrollView */}
          <ChessWorkspace {...chessWorkspaceProps} />
        </ScrollView>
      )}

      <ChapterSelectModal
        visible={chapterModalVisible}
        chapters={repertoire.chapters}
        selectedChapterId={selectedChapterId}
        onSelect={handleSelectChapter}
        onClose={() => setChapterModalVisible(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#2c2c2c',
  },
  wideLayout: {
    flex: 1,
    flexDirection: 'row',
  },
  leftPanel: {
    width: 220,
    borderRightWidth: 1,
    borderRightColor: '#3a3a3a',
    padding: 8,
  },
  toggleButton: {
    width: 32,
    backgroundColor: '#3a3a3a',
    alignItems: 'center',
    justifyContent: 'center',
    borderRightWidth: 1,
    borderRightColor: '#4a4a4a',
  },
  toggleButtonText: {
    color: '#888',
    fontSize: 16,
  },
  wideMain: {
    flex: 1,
    flexDirection: 'column',
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
  chapterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#3a3a3a',
    marginHorizontal: 8,
    marginVertical: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
  },
  chapterButtonText: {
    flex: 1,
    color: '#fff',
    fontSize: 13,
    fontWeight: '500',
  },
  chapterButtonArrow: {
    color: '#888',
    fontSize: 14,
    marginLeft: 8,
  },
});
