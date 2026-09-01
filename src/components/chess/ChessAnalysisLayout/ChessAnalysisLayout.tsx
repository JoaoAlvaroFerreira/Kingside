/**
 * ChessAnalysisLayout - Shared layout for analysis-style screens
 *
 * Wide (landscape):  ChessWorkspace (board + inline MoveHistory) + game lists below
 * Narrow (portrait): ChessWorkspace (board only) + tabbed section (Moves | Your Games | Master)
 *
 * Used by: AnalysisBoardScreen, RepertoireStudyScreen
 */

import React, { useState, useMemo, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, useWindowDimensions, ActivityIndicator } from 'react-native';
import { ChessWorkspace } from '@components/chess/ChessWorkspace/ChessWorkspace';
import { MoveHistory } from '@components/chess/MoveHistory/MoveHistory';
import { SettingsModal } from '@components/chess/ChessWorkspace/SettingsModal';
import { GameList, formatCount } from '@components/repertoire/GameList';

/**
 * The number on a tab is how many games reached the position, not how many the book kept
 * a handle on. The two differ by orders of magnitude at shallow positions, and the count
 * a player wants there is "how often have they been here", not "how many can I open".
 */
function tabCount(shown: number, hasMore?: boolean, total?: number): string {
  if (total && total > shown) return total.toLocaleString();
  return formatCount(shown, hasMore);
}
import { RepertoireMatchList } from '@components/repertoire/RepertoireMatchList';
import { MoveTree } from '@utils/MoveTree';
import { ChapterFenMatch } from '@utils/extractRepertoirePositions';
import { DatabaseService } from '@services/database/DatabaseService';
import { UserGame, MasterGame, ScreenKey, normalizeFen } from '@types';
import { useStore } from '@store';
import { CandidateSource } from '@hooks/useCandidateMoves';

const WIDE_GAME_LIST_HEIGHT = 180;
const EMPTY_MATCHES: ChapterFenMatch[] = [];

type AnalysisTab = 'moves' | 'yourGames' | 'masterGames' | 'opponent' | 'findPosition';

interface ChessAnalysisLayoutProps {
  // MoveTree state (owned by parent screen)
  moveTree: MoveTree;
  currentFen: string;
  currentNodeId: string | null;
  onMove: (from: string, to: string) => void;
  onNavigate: (nodeId: string | null) => void;
  onGoBack: () => void;
  onGoForward: () => void;
  onGoToStart: () => void;
  onGoToEnd: () => void;
  onPromoteToMainLine?: (nodeId: string) => void;
  onDeleteMove?: (nodeId: string) => void;

  // Screen config
  screenKey: ScreenKey;
  orientationOverride?: 'white' | 'black';

  // Game search results (from useGameSearch hook)
  userGames: UserGame[];
  userHasMore?: boolean;
  masterGames: MasterGame[];
  /** Book samples are capped, so the master count may understate what exists. */
  masterHasMore?: boolean;
  /** Set only when preparing against someone: their games, and the name for the tab. */
  opponentGames?: MasterGame[];
  opponentHasMore?: boolean;
  opponentTotal?: number;
  masterTotal?: number;
  opponentName?: string;
  opponentBookId?: string;
  loadingGames: boolean;
  onSelectGame: (game: UserGame | MasterGame) => void;
  onSelectRepertoireMatch: (match: ChapterFenMatch) => void;
  /**
   * Bumped by the screen to ask for the Moves tab. A counter rather than a boolean so
   * repeated requests each register — loading a second game from the same list has to
   * switch back again.
   */
  showMovesSignal?: number;
  /** Hand the current position to the training dashboard. Omit to hide the action. */
  onDrillFromPosition?: () => void;

  // Optional content injected into the wide layout (e.g. left panel for repertoire)
  wideLeftPanel?: React.ReactNode;
  // Optional content above the board in narrow mode (e.g. chapter selector)
  narrowHeader?: React.ReactNode;
}

export function ChessAnalysisLayout({
  moveTree,
  currentFen,
  currentNodeId,
  onMove,
  onNavigate,
  onGoBack,
  onGoForward,
  onGoToStart,
  onGoToEnd,
  onPromoteToMainLine,
  onDeleteMove,
  screenKey,
  orientationOverride,
  userGames,
  userHasMore,
  masterGames,
  masterHasMore,
  opponentGames,
  opponentHasMore,
  opponentTotal,
  masterTotal,
  opponentName,
  opponentBookId,
  loadingGames,
  onSelectGame,
  onSelectRepertoireMatch,
  showMovesSignal,
  onDrillFromPosition,
  wideLeftPanel,
  narrowHeader,
}: ChessAnalysisLayoutProps) {
  const { width, height } = useWindowDimensions();
  const screenSettings = useStore(s => s.screenSettings);
  const repertoires = useStore(s => s.repertoires);
  const isWide = width > 700 && width > height;

  const [activeTab, setActiveTab] = useState<AnalysisTab>('moves');
  const [settingsVisible, setSettingsVisible] = useState(false);

  useEffect(() => {
    if (showMovesSignal) setActiveTab('moves');
  }, [showMovesSignal]);

  const visibleTabs = screenSettings[screenKey].visibleTabs;

  // Find Position resolves through the SQLite FEN index — one indexed lookup for the
  // current position. Building an in-memory index of every position in every chapter
  // here (the previous approach) cost O(all repertoire nodes) on every mount, which is
  // unusable once the repertoire set gets large.
  const [repertoireMatches, setRepertoireMatches] = useState<ChapterFenMatch[]>(EMPTY_MATCHES);
  useEffect(() => {
    if (!visibleTabs.findPosition) {
      setRepertoireMatches(EMPTY_MATCHES);
      return;
    }
    let cancelled = false;
    DatabaseService.findChaptersByFen(normalizeFen(currentFen)).then(hits => {
      if (cancelled) return;
      const matches: ChapterFenMatch[] = [];
      for (const hit of hits) {
        const repertoire = repertoires.find(r => r.id === hit.repertoireId);
        const chapter = repertoire?.chapters.find(c => c.id === hit.chapterId);
        if (!repertoire || !chapter) continue;
        matches.push({
          repertoireId: repertoire.id,
          repertoireName: repertoire.name,
          chapterId: chapter.id,
          chapterName: chapter.name,
        });
      }
      setRepertoireMatches(matches);
    });
    return () => { cancelled = true; };
  }, [currentFen, repertoires, visibleTabs.findPosition]);

  // Flat moves for standalone MoveHistory (narrow/tabbed mode)
  const structureVersion = moveTree.structureVersion;
  const flatMoves = useMemo(
    () => moveTree.getFlatMoves(),
    [moveTree, structureVersion] // eslint-disable-line react-hooks/exhaustive-deps
  );
  const canGoBack = !moveTree.isAtStart();
  const canGoForward = !moveTree.isAtEnd();

  const workspaceProps = {
    fen: currentFen,
    onMove,
    moveTree,
    currentNodeId,
    onNavigate,
    onGoBack,
    onGoForward,
    onGoToStart,
    onGoToEnd,
    onPromoteToMainLine,
    onDeleteMove,
    screenKey,
    orientationOverride,
  };

  const TABS: { key: AnalysisTab; label: string }[] = [
    { key: 'moves', label: 'Moves' },
    ...(visibleTabs.yourGames ? [{ key: 'yourGames' as const, label: `Your Games (${formatCount(userGames.length, userHasMore)})` }] : []),
    ...(visibleTabs.masterGames ? [{ key: 'masterGames' as const, label: `Master (${tabCount(masterGames.length, masterHasMore, masterTotal)})` }] : []),
    // Only present while preparing against someone, so it never competes for space
    // in ordinary analysis.
    ...(opponentName ? [{ key: 'opponent' as const, label: `${opponentName} (${tabCount((opponentGames ?? []).length, opponentHasMore, opponentTotal)})` }] : []),
    ...(visibleTabs.findPosition ? [{ key: 'findPosition' as const, label: `Find Position (${repertoireMatches.length})` }] : []),
  ];
  const effectiveActiveTab: AnalysisTab = TABS.some(t => t.key === activeTab) ? activeTab : 'moves';

  // Arrows follow the tab, so the board shows one kind at a time instead of stacking
  // engine + repertoire + both game sources into a mess. The Moves tab keeps the engine
  // arrow it has always had.
  const candidateSource: CandidateSource =
    effectiveActiveTab === 'findPosition' ? 'repertoire'
    : effectiveActiveTab === 'yourGames' ? 'user'
    : effectiveActiveTab === 'opponent' ? 'opponent'
    : effectiveActiveTab === 'masterGames' ? 'master'
    : 'none';

  // ── Wide layout: board + inline MoveHistory, game lists below ──
  if (isWide) {
    return (
      <View style={styles.container}>
        <View style={styles.wideRow}>
          {wideLeftPanel}
          <View style={styles.wideMain}>
            <ChessWorkspace
              {...workspaceProps}
              showMoveHistory={true}
              showSettingsGear={true}
              verticalOffset={WIDE_GAME_LIST_HEIGHT}
            />
            <View style={styles.wideBottomSection}>
              {visibleTabs.yourGames && (
                <View style={styles.gameListHalf}>
                  <GameList
                    title="Your Games"
                    games={userGames}
                    hasMore={userHasMore}
                    onSelect={onSelectGame}
                    defaultCollapsed={false}
                    loading={loadingGames}
                  />
                </View>
              )}
              {visibleTabs.masterGames && (
                <View style={styles.gameListHalf}>
                  <GameList
                    title="Master Games"
                    games={masterGames}
                    hasMore={masterHasMore}
                    total={masterTotal}
                    onSelect={onSelectGame}
                    defaultCollapsed={false}
                    loading={loadingGames}
                  />
                </View>
              )}
              {visibleTabs.findPosition && (
                <View style={styles.gameListHalf}>
                  <RepertoireMatchList
                    matches={repertoireMatches}
                    onSelect={onSelectRepertoireMatch}
                    defaultCollapsed={false}
                  />
                </View>
              )}
            </View>
          </View>
        </View>
      </View>
    );
  }

  // ── Narrow / portrait layout: tabbed ──
  return (
    <View style={styles.container}>
      {narrowHeader}

      <ChessWorkspace
        {...workspaceProps}
        showMoveHistory={false}
        showSettingsGear={false}
        candidateSource={candidateSource}
          opponentBookId={opponentBookId}
      />

      {/* Tab Bar */}
      <View style={styles.tabBar}>
        {TABS.map(tab => (
          <TouchableOpacity
            key={tab.key}
            style={[styles.tabButton, effectiveActiveTab === tab.key && styles.tabButtonActive]}
            onPress={() => setActiveTab(tab.key)}
          >
            <Text style={[styles.tabButtonText, effectiveActiveTab === tab.key && styles.tabButtonTextActive]}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Tab Content */}
      <View style={styles.tabContent}>
        {effectiveActiveTab === 'moves' && (
          <MoveHistory
            moves={flatMoves}
            currentNodeId={currentNodeId}
            onNavigate={onNavigate}
            onGoBack={onGoBack}
            onGoForward={onGoForward}
            onGoToStart={onGoToStart}
            onGoToEnd={onGoToEnd}
            onPromoteToMainLine={onPromoteToMainLine}
            onDeleteMove={onDeleteMove}
            onSettingsPress={() => setSettingsVisible(true)}
            canGoBack={canGoBack}
            canGoForward={canGoForward}
          />
        )}

        {effectiveActiveTab === 'yourGames' && (
          <View style={styles.tabGameList}>
            {loadingGames ? (
              <View style={styles.tabLoading}>
                <ActivityIndicator size="small" color="#4a9eff" />
                <Text style={styles.tabLoadingText}>Searching games...</Text>
              </View>
            ) : (
              <GameList
                title="Your Games"
                games={userGames}
                hasMore={userHasMore}
                onSelect={onSelectGame}
                defaultCollapsed={false}
                loading={false}
              />
            )}
          </View>
        )}

        {effectiveActiveTab === 'opponent' && (
          <View style={styles.tabGameList}>
            {loadingGames ? (
              <View style={styles.tabLoading}>
                <ActivityIndicator size="small" color="#4a9eff" />
                <Text style={styles.tabLoadingText}>Searching games...</Text>
              </View>
            ) : (
              <GameList
                title={`${opponentName} here`}
                games={opponentGames ?? []}
                hasMore={opponentHasMore}
                total={opponentTotal}
                onSelect={onSelectGame}
                defaultCollapsed={false}
                loading={false}
              />
            )}
          </View>
        )}

        {effectiveActiveTab === 'masterGames' && (
          <View style={styles.tabGameList}>
            {loadingGames ? (
              <View style={styles.tabLoading}>
                <ActivityIndicator size="small" color="#4a9eff" />
                <Text style={styles.tabLoadingText}>Searching games...</Text>
              </View>
            ) : (
              <GameList
                title="Master Games"
                games={masterGames}
                hasMore={masterHasMore}
                total={masterTotal}
                onSelect={onSelectGame}
                defaultCollapsed={false}
                loading={false}
              />
            )}
          </View>
        )}

        {effectiveActiveTab === 'findPosition' && (
          <View style={styles.tabGameList}>
            {onDrillFromPosition && repertoireMatches.length > 0 && (
              <TouchableOpacity style={styles.drillButton} onPress={onDrillFromPosition}>
                <Text style={styles.drillButtonText}>Drill from this position</Text>
              </TouchableOpacity>
            )}
            <RepertoireMatchList
              matches={repertoireMatches}
              onSelect={onSelectRepertoireMatch}
              defaultCollapsed={false}
            />
          </View>
        )}
      </View>

      <SettingsModal
        visible={settingsVisible}
        onClose={() => setSettingsVisible(false)}
        screenKey={screenKey}
        currentSettings={screenSettings[screenKey]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#2c2c2c',
  },
  // ── Wide layout ──
  wideRow: {
    flex: 1,
    flexDirection: 'row',
  },
  wideMain: {
    flex: 1,
    flexDirection: 'column',
  },
  wideBottomSection: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: '#3a3a3a',
    height: WIDE_GAME_LIST_HEIGHT,
    gap: 8,
    padding: 4,
  },
  gameListHalf: {
    flex: 1,
    minWidth: 0,
  },
  // ── Tabbed layout (narrow / portrait) ──
  tabBar: {
    flexDirection: 'row',
    marginHorizontal: 8,
    marginTop: 4,
    backgroundColor: '#2a2a2a',
    borderRadius: 4,
    overflow: 'hidden',
  },
  tabButton: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabButtonActive: {
    borderBottomColor: '#4a9eff',
    backgroundColor: '#333',
  },
  tabButtonText: {
    color: '#999',
    fontSize: 11,
    fontWeight: '600',
  },
  tabButtonTextActive: {
    color: '#4a9eff',
  },
  tabContent: {
    flex: 1,
    marginHorizontal: 8,
    marginTop: 4,
    marginBottom: 4,
  },
  tabGameList: {
    flex: 1,
  },
  drillButton: {
    backgroundColor: '#4a9eff',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 10,
  },
  drillButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  tabLoading: {
    alignItems: 'center',
    padding: 12,
  },
  tabLoadingText: {
    color: '#bbb',
    fontSize: 11,
    marginTop: 8,
  },
});
