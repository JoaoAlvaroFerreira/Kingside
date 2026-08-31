/**
 * Repertoire Study Screen
 * Uses ChessAnalysisLayout with chapter-loaded MoveTree.
 * Wide: left panel (hierarchy + chapters) + board + game lists
 * Narrow: chapter selector + board + tabbed (Moves | Your Games | Master)
 */

import React, { useState, useMemo, useEffect } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity, Text, Platform, useWindowDimensions } from 'react-native';
import { useStore } from '@store';
import { MoveTree } from '@utils/MoveTree';
import { ChessAnalysisLayout } from '@components/chess/ChessAnalysisLayout/ChessAnalysisLayout';
import { HierarchyBrowser } from '@components/repertoire/HierarchyBrowser';
import { ChapterList } from '@components/repertoire/ChapterList';
import { ChapterSelectModal } from '@components/ChapterSelectModal';
import { UserGame, MasterGame } from '@types';
import { useGameSearch } from '@hooks/useGameSearch';
import { ChapterFenMatch } from '@utils/extractRepertoirePositions';

interface RepertoireStudyScreenProps {
  navigation: any;
  route: {
    params: {
      repertoireId: string;
      chapterId: string;
    };
  };
}

export default function RepertoireStudyScreen({ navigation, route }: RepertoireStudyScreenProps) {
  const { repertoireId, chapterId } = route.params;
  const repertoires = useStore(s => s.repertoires);
  const { width, height } = useWindowDimensions();
  const isWide = width > 700 && width > height;

  const repertoire = useMemo(
    () => repertoires.find(r => r.id === repertoireId),
    [repertoires, repertoireId]
  );

  const [selectedChapterId, setSelectedChapterId] = useState<string>(chapterId);
  const [moveTree, setMoveTree] = useState<MoveTree | null>(null);
  const [, forceUpdate] = useState(0);
  const [leftPanelVisible, setLeftPanelVisible] = useState(false);
  const [chapterModalVisible, setChapterModalVisible] = useState(false);

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

  const currentFen = moveTree?.getCurrentFen() || '';
  const currentNodeId = moveTree?.getCurrentNode()?.id || null;

  const { userGames, masterGames, masterHasMore, loading: loadingGames } = useGameSearch(currentFen);

  const handleSelectGame = (game: UserGame | MasterGame) => {
    navigation.navigate('Analysis', { game });
  };

  const handleSelectRepertoireMatch = (match: ChapterFenMatch) => {
    navigation.navigate('RepertoireStudy', { repertoireId: match.repertoireId, chapterId: match.chapterId });
  };

  const handleMove = (from: string, to: string) => {
    if (!moveTree) return;
    const { Chess } = require('chess.js'); // eslint-disable-line @typescript-eslint/no-var-requires
    const chess = new Chess(moveTree.getCurrentFen());
    const move = chess.move({ from, to, promotion: 'q' });
    if (move) {
      moveTree.addMove(move.san);
      forceUpdate(n => n + 1);
    }
  };

  const handleNavigate = (nodeId: string | null) => { if (!moveTree) return; moveTree.navigateToNode(nodeId); forceUpdate(n => n + 1); };
  const handleGoBack = () => { if (!moveTree) return; moveTree.goBack(); forceUpdate(n => n + 1); };
  const handleGoForward = () => { if (!moveTree) return; moveTree.goForward(); forceUpdate(n => n + 1); };
  const handleGoToStart = () => { if (!moveTree) return; moveTree.goToStart(); forceUpdate(n => n + 1); };
  const handleGoToEnd = () => { if (!moveTree) return; moveTree.goToEnd(); forceUpdate(n => n + 1); };
  const handlePromoteToMainLine = (nodeId: string) => { if (!moveTree) return; moveTree.promoteToMainLine(nodeId); forceUpdate(n => n + 1); };
  const handleDeleteMove = (nodeId: string) => { if (!moveTree) return; moveTree.deleteFromNode(nodeId); forceUpdate(n => n + 1); };

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
  }, [moveTree, handleGoBack, handleGoForward, handleGoToStart, handleGoToEnd]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!repertoire || !currentChapter || !moveTree) {
    return null;
  }

  // Wide mode: left panel with hierarchy + chapters
  const wideLeftPanel = isWide ? (
    <View style={styles.wideLeftPanelContainer}>
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
            onSelect={setSelectedChapterId}
            defaultCollapsed={false}
          />
        </ScrollView>
      )}
      <TouchableOpacity
        style={styles.toggleButton}
        onPress={() => setLeftPanelVisible(!leftPanelVisible)}
      >
        <Text style={styles.toggleButtonText}>
          {leftPanelVisible ? '\u25C0' : '\u25B6'}
        </Text>
      </TouchableOpacity>
    </View>
  ) : undefined;

  // Narrow mode: chapter selector above the board
  const narrowHeader = !isWide ? (
    <>
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
    </>
  ) : undefined;

  return (
    <>
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
        onPromoteToMainLine={handlePromoteToMainLine}
        onDeleteMove={handleDeleteMove}
        screenKey="repertoire"
        orientationOverride={repertoire.color}
        userGames={userGames}
        masterGames={masterGames}
      masterHasMore={masterHasMore}
        loadingGames={loadingGames}
        onSelectGame={handleSelectGame}
        onSelectRepertoireMatch={handleSelectRepertoireMatch}
        wideLeftPanel={wideLeftPanel}
        narrowHeader={narrowHeader}
      />

      <ChapterSelectModal
        visible={chapterModalVisible}
        chapters={repertoire.chapters}
        selectedChapterId={selectedChapterId}
        onSelect={setSelectedChapterId}
        onClose={() => setChapterModalVisible(false)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  wideLeftPanelContainer: {
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
