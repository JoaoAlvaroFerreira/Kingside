/**
 * Repertoire Study Screen
 * 5-component layout: Hierarchy Browser, Chapter List, Board + Move History, Game Lists
 */

import React, { useState, useMemo, useEffect } from 'react';
import { View, StyleSheet, useWindowDimensions, ScrollView, TouchableOpacity, Text, Platform } from 'react-native';
import { useStore } from '@store';
import { MoveTree } from '@utils/MoveTree';
import { InteractiveChessBoard } from '@components/chess/InteractiveChessBoard/InteractiveChessBoard';
import { MoveHistory } from '@components/chess/MoveHistory/MoveHistory';
import { SettingsModal } from '@components/chess/ChessWorkspace/SettingsModal';
import { HierarchyBrowser } from '@components/repertoire/HierarchyBrowser';
import { ChapterList } from '@components/repertoire/ChapterList';
import { GameList } from '@components/repertoire/GameList';
import { computeFensFromMoves, normalizeFen, UserGame, MasterGame } from '@types';

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
  const { repertoires, screenSettings } = useStore();
  const { width, height } = useWindowDimensions();
  const isWide = width > 700;
  const settings = screenSettings.repertoire;

  const repertoire = useMemo(
    () => repertoires.find(r => r.id === repertoireId),
    [repertoires, repertoireId]
  );

  const [selectedChapterId, setSelectedChapterId] = useState<string>(chapterId);
  const [moveTree, setMoveTree] = useState<MoveTree | null>(null);
  const [, forceUpdate] = useState(0);
  const [leftPanelVisible, setLeftPanelVisible] = useState(false);
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [gamesAtPosition, setGamesAtPosition] = useState<{ userGames: UserGame[]; masterGames: MasterGame[] }>({
    userGames: [],
    masterGames: [],
  });

  const currentChapter = useMemo(
    () => repertoire?.chapters.find(c => c.id === selectedChapterId),
    [repertoire, selectedChapterId]
  );

  useEffect(() => {
    if (currentChapter) {
      const tree = MoveTree.fromJSON(currentChapter.moveTree);
      setMoveTree(tree);
    }
  }, [currentChapter]);

  // Keyboard navigation support (web only)
  useEffect(() => {
    if (Platform.OS !== 'web' || !moveTree) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      switch (event.key) {
        case 'ArrowLeft':
          event.preventDefault();
          handleGoBack();
          break;
        case 'ArrowRight':
          event.preventDefault();
          handleGoForward();
          break;
        case 'Home':
          event.preventDefault();
          handleGoToStart();
          break;
        case 'End':
          event.preventDefault();
          handleGoToEnd();
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [moveTree]);

  const currentFen = moveTree?.getCurrentFen() || '';
  const currentComment = moveTree?.getCurrentNode()?.comment || '';

  // Calculate board size from settings
  const maxBoardSize = Math.min(width, height - 100) - 40;
  const sizeMap = {
    tiny: 200,
    small: 240,
    medium: 300,
    large: 340,
    xlarge: 380,
  };
  const boardSizeSetting = settings.boardSize || 'small';
  const maxSize = sizeMap[boardSizeSetting];
  const boardSizePixels = Math.min(maxBoardSize, maxSize);

  console.log('[RepertoireStudyScreen] Board size:', {
    boardSizeSetting,
    maxSize,
    maxBoardSize,
    boardSizePixels,
  });

  // Load games that match current position from database (disabled for now - performance issue)
  // TODO: Add FEN indexing to database for efficient position search
  useEffect(() => {
    // Temporarily disabled - loading all games is too slow for large databases
    // Will need to implement FEN indexing in database to make this performant
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

  const handleGoBack = () => {
    if (!moveTree) return;
    moveTree.goBack();
    forceUpdate(n => n + 1);
  };

  const handleGoForward = () => {
    if (!moveTree) return;
    moveTree.goForward();
    forceUpdate(n => n + 1);
  };

  const handleGoToStart = () => {
    if (!moveTree) return;
    moveTree.goToStart();
    forceUpdate(n => n + 1);
  };

  const handleGoToEnd = () => {
    if (!moveTree) return;
    moveTree.goToEnd();
    forceUpdate(n => n + 1);
  };

  const handlePromoteToMainLine = (nodeId: string) => {
    if (!moveTree) return;
    moveTree.promoteToMainLine(nodeId);
    forceUpdate(n => n + 1);
  };

  if (!repertoire || !currentChapter || !moveTree) {
    return null;
  }

  return (
    <View style={styles.container}>
      {isWide ? (
        <View style={styles.wideLayout}>
          {/* Collapsible Left Panel - Hierarchy + Chapters */}
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

          {/* Toggle Button */}
          <TouchableOpacity
            style={styles.toggleButton}
            onPress={() => setLeftPanelVisible(!leftPanelVisible)}
          >
            <Text style={styles.toggleButtonText}>
              {leftPanelVisible ? '◀' : '▶'}
            </Text>
          </TouchableOpacity>

          {/* Main Content - Board, Move History, and Game Lists */}
          <View style={styles.mainContent}>
            {/* Top Section - Board + Move History */}
            <View style={styles.topSection}>
              <View style={styles.boardContainer}>
                <InteractiveChessBoard
                  fen={currentFen}
                  onMove={handleMoveClick}
                  orientation={repertoire.color}
                  showCoordinates={settings.coordinatesVisible}
                  boardSizePixels={boardSizePixels}
                />
                {currentComment && (
                  <View style={[styles.commentBox, { maxWidth: boardSizePixels }]}>
                    <Text style={styles.commentText}>{currentComment}</Text>
                  </View>
                )}
              </View>

              <View style={styles.moveHistoryPanel}>
                <MoveHistory
                  moves={moveTree.getFlatMoves()}
                  currentNodeId={moveTree.getCurrentNode()?.id || null}
                  onNavigate={handleNavigate}
                  onGoBack={handleGoBack}
                  onGoForward={handleGoForward}
                  onGoToStart={handleGoToStart}
                  onGoToEnd={handleGoToEnd}
                  onPromoteToMainLine={handlePromoteToMainLine}
                  onMarkCritical={handleMarkCritical}
                  onSettingsPress={() => setSettingsVisible(true)}
                  canGoBack={!moveTree.isAtStart()}
                  canGoForward={!moveTree.isAtEnd()}
                />
              </View>
            </View>

            {/* Bottom Section - Game Lists */}
            <View style={styles.bottomSection}>
              <View style={styles.gameListHalf}>
                <GameList
                  title="Your Games"
                  games={gamesAtPosition.userGames}
                  onSelect={handleSelectGame}
                  defaultCollapsed={false}
                />
              </View>
              <View style={styles.gameListHalf}>
                <GameList
                  title="Master Games"
                  games={gamesAtPosition.masterGames}
                  onSelect={handleSelectGame}
                  defaultCollapsed={false}
                />
              </View>
            </View>
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
          <ChapterList
            chapters={repertoire.chapters}
            selectedId={selectedChapterId}
            onSelect={handleSelectChapter}
            defaultCollapsed={true}
          />
          <GameList
            title="Your Games"
            games={gamesAtPosition.userGames}
            onSelect={handleSelectGame}
            defaultCollapsed={true}
          />
          <GameList
            title="Master Games"
            games={gamesAtPosition.masterGames}
            onSelect={handleSelectGame}
            defaultCollapsed={true}
          />

          <View style={styles.boardContainer}>
            <InteractiveChessBoard
              fen={currentFen}
              onMove={handleMoveClick}
              orientation={repertoire.color}
              showCoordinates={settings.coordinatesVisible}
              boardSizePixels={boardSizePixels}
            />
            {currentComment && (
              <View style={[styles.commentBox, { maxWidth: boardSizePixels }]}>
                <Text style={styles.commentText}>{currentComment}</Text>
              </View>
            )}
          </View>

          <View style={styles.moveHistoryContainer}>
            <MoveHistory
              moves={moveTree.getFlatMoves()}
              currentNodeId={moveTree.getCurrentNode()?.id || null}
              onNavigate={handleNavigate}
              onGoBack={handleGoBack}
              onGoForward={handleGoForward}
              onGoToStart={handleGoToStart}
              onGoToEnd={handleGoToEnd}
              onPromoteToMainLine={handlePromoteToMainLine}
              onMarkCritical={handleMarkCritical}
              onSettingsPress={() => setSettingsVisible(true)}
              canGoBack={!moveTree.isAtStart()}
              canGoForward={!moveTree.isAtEnd()}
            />
          </View>
        </ScrollView>
      )}

      {/* Settings Modal */}
      <SettingsModal
        visible={settingsVisible}
        onClose={() => setSettingsVisible(false)}
        screenKey="repertoire"
        currentSettings={settings}
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
  mainContent: {
    flex: 1,
    flexDirection: 'column',
  },
  topSection: {
    flex: 1,
    flexDirection: 'row',
    padding: 4,
    gap: 8,
    alignItems: 'flex-start',
    minHeight: 0,
  },
  boardContainer: {
    alignItems: 'center',
    flexShrink: 0,
  },
  commentBox: {
    marginTop: 4,
    padding: 4,
    backgroundColor: '#3a3a3a',
    borderRadius: 4,
    borderLeftWidth: 2,
    borderLeftColor: '#007AFF',
  },
  commentText: {
    color: '#e0e0e0',
    fontSize: 10,
    lineHeight: 14,
  },
  moveHistoryPanel: {
    flex: 1,
    minWidth: 160,
    maxWidth: 350,
    maxHeight: 380,
  },
  bottomSection: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: '#3a3a3a',
    minHeight: 120,
    gap: 8,
    padding: 4,
  },
  gameListHalf: {
    flex: 1,
    minWidth: 0, // Allow flex to shrink properly
  },
  moveHistoryContainer: {
    width: '100%',
    maxWidth: 400,
    maxHeight: 180,
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 8,
  },
});
