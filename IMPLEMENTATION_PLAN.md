# Kingside Implementation Plan

**Target:** Claude Sonnet
**Last Updated:** 2026-01-12
**Reference:** CLAUDE.md for vision and requirements

---

## Implementation Status

### ✅ All Phases Complete
- **Phase 1:** Navigation & App Structure
- **Phase 2:** Data Layer & Persistence
- **Phase 3:** PGN Import/Export
- **Phase 4:** Repertoire Management
- **Phase 5:** Spaced Repetition (Basic)
- **Phase 6:** Game List

---

## Current State (Actual)

**✅ All Features Implemented:**
- ✅ Navigation with Drawer (4 main screens)
- ✅ Interactive chess board with drag/tap
- ✅ MoveTree with unlimited variations and serialization
- ✅ MoveHistory with variations display and context menu
- ✅ PGN Import for all three types (repertoire, user games, master games)
- ✅ Batch processing for large PGN imports (10MB+ files)
- ✅ Repertoire browser with hierarchy and filters
- ✅ RepertoireStudyScreen with 5-component layout
- ✅ Collapsible panels and responsive design
- ✅ Critical position marking in move tree
- ✅ SM-2 spaced repetition algorithm
- ✅ Color-aware card generation from repertoires
- ✅ Training screen with difficulty ratings
- ✅ Game list with tabs (My Games / Master Games)
- ✅ Tap game to open in Analysis Board
- ✅ Swipe-to-delete games with confirmation
- ✅ Game-Repertoire comparison service
- ✅ AsyncStorage persistence for all data

**Entry Point:** App opens to Analysis Board via drawer navigation

**🎉 MVP Complete - All 6 Phases Implemented!**

---

## Phase 1: Navigation & App Structure
**Priority: CRITICAL | Do First**

### 1.1 Install Dependencies

```bash
npm install @react-navigation/drawer
```

Note: `react-native-gesture-handler` and `react-native-reanimated` already installed.

### 1.2 Create Navigation Structure

**New file:** `src/navigation/AppNavigator.tsx`

```typescript
import { createDrawerNavigator } from '@react-navigation/drawer';
import { NavigationContainer } from '@react-navigation/native';

import AnalysisBoardScreen from '@screens/AnalysisBoardScreen';
import RepertoireScreen from '@screens/RepertoireScreen';
import TrainingScreen from '@screens/TrainingScreen';
import GameListScreen from '@screens/GameListScreen';
import DrawerContent from '@components/navigation/DrawerContent';

const Drawer = createDrawerNavigator();

export default function AppNavigator() {
  return (
    <NavigationContainer>
      <Drawer.Navigator
        initialRouteName="Analysis"
        drawerContent={(props) => <DrawerContent {...props} />}
        screenOptions={{
          headerShown: true,
          drawerType: 'front',
          drawerStyle: { backgroundColor: '#1e1e1e', width: 280 },
          headerStyle: { backgroundColor: '#2c2c2c' },
          headerTintColor: '#e0e0e0',
        }}
      >
        <Drawer.Screen
          name="Analysis"
          component={AnalysisBoardScreen}
          options={{ title: 'Analysis Board' }}
        />
        <Drawer.Screen
          name="Repertoire"
          component={RepertoireScreen}
          options={{ title: 'Repertoire' }}
        />
        <Drawer.Screen
          name="Training"
          component={TrainingScreen}
          options={{ title: 'Training' }}
        />
        <Drawer.Screen
          name="Games"
          component={GameListScreen}
          options={{ title: 'Game List' }}
        />
      </Drawer.Navigator>
    </NavigationContainer>
  );
}
```

### 1.3 Create Drawer Content

**New file:** `src/components/navigation/DrawerContent.tsx`

```typescript
import { DrawerContentScrollView, DrawerItemList } from '@react-navigation/drawer';
import { View, Text, StyleSheet } from 'react-native';

export default function DrawerContent(props) {
  return (
    <DrawerContentScrollView {...props} style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Kingside</Text>
        <Text style={styles.subtitle}>Chess Training</Text>
      </View>
      <DrawerItemList {...props} />
      <View style={styles.footer}>
        <Text style={styles.version}>v1.0.0</Text>
      </View>
    </DrawerContentScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1e1e1e' },
  header: { padding: 20, borderBottomWidth: 1, borderBottomColor: '#333' },
  title: { color: '#fff', fontSize: 24, fontWeight: 'bold' },
  subtitle: { color: '#888', fontSize: 14 },
  footer: { padding: 20, marginTop: 'auto' },
  version: { color: '#666', fontSize: 12 },
});
```

### 1.4 Create Screen Stubs

**New file:** `src/screens/AnalysisBoardScreen.tsx`
- Move current App.tsx board logic here
- This becomes the home screen

**New file:** `src/screens/RepertoireScreen.tsx`
- Placeholder: "Repertoire - Coming Soon"
- Will list repertoires, allow CRUD

**New file:** `src/screens/TrainingScreen.tsx`
- Placeholder: "Training - Coming Soon"
- Will show due cards count, start review session

**New file:** `src/screens/GameListScreen.tsx`
- Placeholder: "Game List - Coming Soon"
- Will list imported games

### 1.5 Update App.tsx

```typescript
import AppNavigator from '@navigation/AppNavigator';

export default function App() {
  return <AppNavigator />;
}
```

### 1.6 Verification
- App opens to Analysis Board
- Hamburger icon visible in header
- Drawer opens with 4 menu items
- Can navigate between all screens
- Board still works on Analysis screen

---

## Phase 2: Data Layer & Persistence
**Priority: HIGH | Foundation for all features**

### 2.1 Define Core Types

**New file:** `src/types/index.ts`

```typescript
// ============================================
// REPERTOIRE HIERARCHY
// Color → Opening Type → Variation → Sub-variation → Chapters
// ============================================

export type RepertoireColor = 'white' | 'black';
export type OpeningType = 'e4' | 'd4' | 'irregular';

export interface RepertoireHierarchy {
  white: OpeningCategory[];
  black: OpeningCategory[];
}

export interface OpeningCategory {
  type: OpeningType;              // 'e4', 'd4', or 'irregular'
  variations: Opening[];
}

export interface Opening {
  id: string;
  name: string;                   // e.g., "King's Indian Defense"
  eco: string;                    // ECO code (e.g., "E60-E99")
  subVariations: SubVariation[];
}

export interface SubVariation {
  id: string;
  name: string;                   // e.g., "Saemisch Variation"
  eco: string;                    // More specific ECO
  chapters: Chapter[];
}

export interface Chapter {
  id: string;
  name: string;                   // e.g., "Main Line", "6...c5 Sideline"
  pgn: string;                    // Original PGN
  moveTree: SerializedMoveTree;
  order: number;                  // Sort order
}

// ============================================
// MOVE TREE SERIALIZATION
// ============================================

export interface SerializedMoveTree {
  rootMoves: SerializedMoveNode[];
  startFen: string;
}

export interface SerializedMoveNode {
  id: string;
  san: string;
  fen: string;
  moveNumber: number;
  isBlack: boolean;
  children: SerializedMoveNode[];
  isCritical?: boolean;           // User-marked important position
  comment?: string;
}

// ============================================
// USER GAMES & MASTER GAMES
// ============================================

export interface UserGame {
  id: string;
  pgn: string;
  white: string;
  black: string;
  result: string;                 // '1-0', '0-1', '1/2-1/2', '*'
  date: string;
  event?: string;
  eco?: string;
  moves: string[];                // SAN moves array
  // NOTE: FENs computed on-demand, not stored (optimize later with hashing)
  importedAt: Date;
}

// Master games stored separately from user games (same structure, different storage)
export type MasterGame = UserGame;

// Helper to compute FENs from moves (used for position matching)
export function computeFensFromMoves(moves: string[]): string[] {
  const chess = new Chess();
  const fens: string[] = [normalizeFen(chess.fen())];
  for (const move of moves) {
    chess.move(move);
    fens.push(normalizeFen(chess.fen()));
  }
  return fens;
}

// Normalize FEN (ignore halfmove and fullmove counters)
export function normalizeFen(fen: string): string {
  return fen.split(' ').slice(0, 4).join(' ');
}

// ============================================
// SPACED REPETITION
// ============================================

export interface ReviewCard {
  id: string;

  // Location in hierarchy
  color: RepertoireColor;
  openingId: string;
  subVariationId: string;
  chapterId: string;

  // Position data
  fen: string;
  correctMove: string;
  contextMoves: string[];         // Path leading to position (last 5 moves)

  // Training metadata
  isUserMove: boolean;            // Is this testing the user's color?
  isCritical: boolean;            // User-marked important

  // SM-2 fields
  easeFactor: number;             // 2.5 default
  interval: number;               // Days
  repetitions: number;
  nextReviewDate: Date;
  lastReviewDate?: Date;

  // Stats
  totalReviews: number;
  correctCount: number;
}
```

### 2.2 Create Storage Service

**New file:** `src/services/storage/StorageService.ts`

```typescript
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEYS = {
  REPERTOIRES: '@kingside/repertoires',
  USER_GAMES: '@kingside/user-games',
  MASTER_GAMES: '@kingside/master-games',
  REVIEW_CARDS: '@kingside/cards',
  SETTINGS: '@kingside/settings',
};

export const StorageService = {
  // Repertoires
  async saveRepertoires(repertoires: Repertoire[]): Promise<void> {
    await AsyncStorage.setItem(KEYS.REPERTOIRES, JSON.stringify(repertoires));
  },

  async loadRepertoires(): Promise<Repertoire[]> {
    const data = await AsyncStorage.getItem(KEYS.REPERTOIRES);
    if (!data) return [];
    return JSON.parse(data, dateReviver);
  },

  // User Games (player's own games)
  async saveUserGames(games: UserGame[]): Promise<void> {
    await AsyncStorage.setItem(KEYS.USER_GAMES, JSON.stringify(games));
  },

  async loadUserGames(): Promise<UserGame[]> {
    const data = await AsyncStorage.getItem(KEYS.USER_GAMES);
    if (!data) return [];
    return JSON.parse(data, dateReviver);
  },

  // Master Games (separate library)
  async saveMasterGames(games: MasterGame[]): Promise<void> {
    await AsyncStorage.setItem(KEYS.MASTER_GAMES, JSON.stringify(games));
  },

  async loadMasterGames(): Promise<MasterGame[]> {
    const data = await AsyncStorage.getItem(KEYS.MASTER_GAMES);
    if (!data) return [];
    return JSON.parse(data, dateReviver);
  },

  // Review Cards
  async saveCards(cards: ReviewCard[]): Promise<void> {
    await AsyncStorage.setItem(KEYS.REVIEW_CARDS, JSON.stringify(cards));
  },

  async loadCards(): Promise<ReviewCard[]> {
    const data = await AsyncStorage.getItem(KEYS.REVIEW_CARDS);
    if (!data) return [];
    return JSON.parse(data, dateReviver);
  },

  // Clear all (for testing)
  async clearAll(): Promise<void> {
    await AsyncStorage.multiRemove(Object.values(KEYS));
  },
};

// Helper to revive Date objects from JSON
function dateReviver(key: string, value: any) {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value)) {
    return new Date(value);
  }
  return value;
}
```

### 2.3 Create Zustand Store

**New file:** `src/store/index.ts`

```typescript
import { create } from 'zustand';
import { Repertoire, UserGame, MasterGame, ReviewCard } from '@types';
import { StorageService } from '@services/storage/StorageService';

interface AppState {
  // Data
  repertoires: Repertoire[];
  userGames: UserGame[];       // Player's own games
  masterGames: MasterGame[];   // Separate library for master games
  reviewCards: ReviewCard[];
  isLoading: boolean;

  // Actions
  initialize: () => Promise<void>;

  // Repertoire actions
  addRepertoire: (r: Repertoire) => Promise<void>;
  deleteRepertoire: (id: string) => Promise<void>;

  // Game actions (separate for each library)
  addUserGames: (games: UserGame[]) => Promise<void>;
  deleteUserGame: (id: string) => Promise<void>;
  addMasterGames: (games: MasterGame[]) => Promise<void>;
  deleteMasterGame: (id: string) => Promise<void>;

  // Review card actions
  addCards: (cards: ReviewCard[]) => Promise<void>;
  updateCard: (card: ReviewCard) => Promise<void>;
  getDueCards: () => ReviewCard[];
}

export const useStore = create<AppState>((set, get) => ({
  repertoires: [],
  userGames: [],
  masterGames: [],
  reviewCards: [],
  isLoading: true,

  initialize: async () => {
    const [repertoires, userGames, masterGames, reviewCards] = await Promise.all([
      StorageService.loadRepertoires(),
      StorageService.loadUserGames(),
      StorageService.loadMasterGames(),
      StorageService.loadCards(),
    ]);
    set({ repertoires, userGames, masterGames, reviewCards, isLoading: false });
  },

  addRepertoire: async (repertoire) => {
    const repertoires = [...get().repertoires, repertoire];
    await StorageService.saveRepertoires(repertoires);
    set({ repertoires });
  },

  deleteRepertoire: async (id) => {
    const repertoires = get().repertoires.filter(r => r.id !== id);
    const reviewCards = get().reviewCards.filter(c => c.repertoireId !== id);
    await Promise.all([
      StorageService.saveRepertoires(repertoires),
      StorageService.saveCards(reviewCards),
    ]);
    set({ repertoires, reviewCards });
  },

  addUserGames: async (newGames) => {
    const userGames = [...get().userGames, ...newGames];
    await StorageService.saveUserGames(userGames);
    set({ userGames });
  },

  deleteUserGame: async (id) => {
    const userGames = get().userGames.filter(g => g.id !== id);
    await StorageService.saveUserGames(userGames);
    set({ userGames });
  },

  addMasterGames: async (newGames) => {
    const masterGames = [...get().masterGames, ...newGames];
    await StorageService.saveMasterGames(masterGames);
    set({ masterGames });
  },

  deleteMasterGame: async (id) => {
    const masterGames = get().masterGames.filter(g => g.id !== id);
    await StorageService.saveMasterGames(masterGames);
    set({ masterGames });
  },

  addCards: async (newCards) => {
    const reviewCards = [...get().reviewCards, ...newCards];
    await StorageService.saveCards(reviewCards);
    set({ reviewCards });
  },

  updateCard: async (updatedCard) => {
    const reviewCards = get().reviewCards.map(c =>
      c.id === updatedCard.id ? updatedCard : c
    );
    await StorageService.saveCards(reviewCards);
    set({ reviewCards });
  },

  getDueCards: () => {
    const now = new Date();
    return get().reviewCards.filter(c => new Date(c.nextReviewDate) <= now);
  },
}));
```

### 2.4 Add MoveTree Serialization

**Update:** `src/utils/MoveTree.ts`

Add methods to serialize/deserialize for storage:

```typescript
// Add to MoveTree class:

toJSON(): SerializedMoveTree {
  return {
    startFen: this.startFen,
    rootMoves: this.rootMoves.map(node => this.serializeNode(node)),
  };
}

private serializeNode(node: MoveNode): SerializedMoveNode {
  return {
    id: node.id,
    san: node.san,
    fen: node.fen,
    moveNumber: node.moveNumber,
    isBlack: node.isBlack,
    children: node.children.map(child => this.serializeNode(child)),
  };
}

static fromJSON(data: SerializedMoveTree): MoveTree {
  const tree = new MoveTree(data.startFen);
  tree.rootMoves = data.rootMoves.map(node => tree.deserializeNode(node, null));
  return tree;
}

private deserializeNode(data: SerializedMoveNode, parent: MoveNode | null): MoveNode {
  const node: MoveNode = {
    id: data.id,
    san: data.san,
    fen: data.fen,
    moveNumber: data.moveNumber,
    isBlack: data.isBlack,
    parent,
    children: [],
  };
  node.children = data.children.map(child => this.deserializeNode(child, node));
  return node;
}
```

### 2.5 Verification
- Store initializes on app start
- Data persists after app restart
- CRUD operations work for repertoires
- CRUD operations work for games

---

## Phase 3: PGN Import/Export
**Priority: HIGH | Required for repertoire building**

### 3.1 Create PGN Service

**New file:** `src/services/pgn/PGNService.ts`

```typescript
import { parse } from '@mliebelt/pgn-parser';
import { MoveTree } from '@utils/MoveTree';
import { Chess } from 'chess.js';

export interface ParsedGame {
  headers: Record<string, string>;
  moves: string[];
  variations: ParsedVariation[];
}

export interface ParsedVariation {
  parentMoveIndex: number;
  moves: string[];
}

export const PGNService = {
  // Parse single PGN game
  parseGame(pgn: string): ParsedGame {
    const result = parse(pgn, { startRule: 'game' });
    const moves: string[] = [];
    const variations: ParsedVariation[] = [];

    // Extract moves from parsed result
    function extractMoves(moveList: any[], targetArray: string[]) {
      for (const item of moveList) {
        if (item.notation) {
          targetArray.push(item.notation.notation);
        }
        // Handle variations (RAV)
        if (item.variations && item.variations.length > 0) {
          for (const variation of item.variations) {
            const varMoves: string[] = [];
            extractMoves(variation, varMoves);
            variations.push({
              parentMoveIndex: targetArray.length - 1,
              moves: varMoves,
            });
          }
        }
      }
    }

    extractMoves(result.moves, moves);

    return {
      headers: result.tags || {},
      moves,
      variations,
    };
  },

  // Parse multiple games from PGN file
  parseMultipleGames(pgn: string): ParsedGame[] {
    const result = parse(pgn, { startRule: 'games' });
    return result.map((game: any) => this.parseGame(game));
  },

  // Convert parsed game to MoveTree
  toMoveTree(parsed: ParsedGame, startFen?: string): MoveTree {
    const tree = new MoveTree(startFen);

    // Add main line
    for (const san of parsed.moves) {
      tree.addMove(san);
    }

    // Add variations
    for (const variation of parsed.variations) {
      // Navigate to parent position
      tree.goToStart();
      for (let i = 0; i <= variation.parentMoveIndex; i++) {
        tree.goForward();
      }
      tree.goBack(); // Go to position before the parent move

      // Add variation moves
      for (const san of variation.moves) {
        tree.addMove(san);
      }
    }

    tree.goToStart();
    return tree;
  },

  // Export MoveTree to PGN
  toPGN(tree: MoveTree, headers?: Record<string, string>): string {
    const headerLines = Object.entries(headers || {})
      .map(([key, value]) => `[${key} "${value}"]`)
      .join('\n');

    const moves = tree.toPgn(); // Assuming MoveTree has toPgn method

    return headerLines + '\n\n' + moves;
  },

  // Convert parsed game to UserGame
  toUserGame(parsed: ParsedGame): UserGame {
    return {
      id: generateId(),
      pgn: '', // Will be set by caller
      white: parsed.headers.White || 'Unknown',
      black: parsed.headers.Black || 'Unknown',
      result: parsed.headers.Result || '*',
      date: parsed.headers.Date || '',
      event: parsed.headers.Event,
      moves: parsed.moves,
      importedAt: new Date(),
    };
  },
};

function generateId(): string {
  return Math.random().toString(36).substr(2, 9);
}
```

### 3.2 Create Import Screen Component

**New file:** `src/screens/ImportPGNScreen.tsx`

```typescript
import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, Switch, StyleSheet, Alert } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import { PGNService } from '@services/pgn/PGNService';
import { OpeningClassifier } from '@services/openings/OpeningClassifier';
import { useStore } from '@store';
import { RepertoireColor } from '@types';

// Validate PGN starts with "1. " (no partial games)
function validatePGN(pgn: string): { valid: boolean; error?: string } {
  const movesSection = pgn.replace(/\[.*?\]/gs, '').trim(); // Remove headers
  if (!movesSection.match(/^1\.\s/)) {
    return { valid: false, error: 'PGN must start with move 1. Partial games are not supported.' };
  }
  return { valid: true };
}

// Three import types: repertoire, user games, master games
type ImportType = 'repertoire' | 'my-games' | 'master-games';

export default function ImportPGNScreen({ navigation, route }) {
  const { target } = route.params as { target: ImportType };
  const [pgnText, setPgnText] = useState('');
  const [name, setName] = useState('');
  const [color, setColor] = useState<RepertoireColor>('white');
  const { addRepertoire, addUserGames, addMasterGames } = useStore();

  const handleFilePick = async () => {
    const result = await DocumentPicker.getDocumentAsync({ type: 'text/*' });
    if (result.type === 'success') {
      const content = await FileSystem.readAsStringAsync(result.uri);
      setPgnText(content);
    }
  };

  const handleImport = async () => {
    if (!pgnText.trim()) {
      Alert.alert('Error', 'Please enter or select a PGN');
      return;
    }

    // Validate PGN
    const validation = validatePGN(pgnText);
    if (!validation.valid) {
      Alert.alert('Invalid PGN', validation.error);
      return;
    }

    try {
      const games = PGNService.parseMultipleGames(pgnText);

      if (target === 'repertoire') {
        if (!name.trim()) {
          Alert.alert('Error', 'Please enter a repertoire name');
          return;
        }

        // Create chapters from each game
        const chapters = games.map((parsed, index) => {
          const moveTree = PGNService.toMoveTree(parsed);
          const classification = OpeningClassifier.classify(parsed.moves);

          return {
            id: generateId(),
            name: parsed.headers.Event || classification.name || `Chapter ${index + 1}`,
            pgn: pgnText,
            moveTree: moveTree.toJSON(),
            order: index,
          };
        });

        // Auto-classify the repertoire
        const firstGame = games[0];
        const classification = OpeningClassifier.classify(firstGame.moves);

        await addRepertoire({
          id: generateId(),
          name,
          color, // User-selected color
          openingType: classification.openingType,
          eco: classification.eco,
          chapters,
          createdAt: new Date(),
          updatedAt: new Date(),
        });

        Alert.alert('Success', `Imported ${chapters.length} chapter(s)!`);
        navigation.goBack();

      } else if (target === 'my-games') {
        // Import as user's own games
        const userGames = games.map(g => ({
          ...PGNService.toUserGame(g),
          pgn: pgnText,
        }));

        await addUserGames(userGames);
        Alert.alert('Success', `Imported ${userGames.length} game(s) to My Games`);
        navigation.goBack();

      } else if (target === 'master-games') {
        // Import as master games (separate library)
        const masterGames = games.map(g => ({
          ...PGNService.toUserGame(g),
          pgn: pgnText,
        }));

        await addMasterGames(masterGames);
        Alert.alert('Success', `Imported ${masterGames.length} master game(s)`);
        navigation.goBack();
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to parse PGN: ' + error.message);
    }
  };

  const getTitle = () => {
    switch (target) {
      case 'repertoire': return 'Import Repertoire';
      case 'my-games': return 'Import My Games';
      case 'master-games': return 'Import Master Games';
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{getTitle()}</Text>

      {/* Repertoire-specific fields */}
      {target === 'repertoire' && (
        <>
          <TextInput
            style={styles.input}
            placeholder="Repertoire name"
            placeholderTextColor="#888"
            value={name}
            onChangeText={setName}
          />

          {/* Color toggle */}
          <View style={styles.colorToggle}>
            <Text style={styles.label}>Playing as:</Text>
            <View style={styles.colorButtons}>
              <TouchableOpacity
                style={[styles.colorBtn, color === 'white' && styles.colorBtnActive]}
                onPress={() => setColor('white')}
              >
                <Text>White</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.colorBtn, color === 'black' && styles.colorBtnActive]}
                onPress={() => setColor('black')}
              >
                <Text>Black</Text>
              </TouchableOpacity>
            </View>
          </View>
        </>
      )}

      {/* Game imports (my-games and master-games) have no extra fields */}

      <TouchableOpacity style={styles.button} onPress={handleFilePick}>
        <Text style={styles.buttonText}>Select PGN File</Text>
      </TouchableOpacity>

      <Text style={styles.label}>Or paste PGN:</Text>

      <TextInput
        style={styles.textArea}
        placeholder="1. e4 e5 2. Nf3 Nc6..."
        placeholderTextColor="#888"
        value={pgnText}
        onChangeText={setPgnText}
        multiline
        numberOfLines={10}
      />

      <TouchableOpacity style={styles.importButton} onPress={handleImport}>
        <Text style={styles.buttonText}>Import</Text>
      </TouchableOpacity>
    </View>
  );
}
```

### 3.3 Verification
- Can pick PGN file from device
- Can paste PGN text
- **PGN validation**: Rejects PGN that doesn't start with "1. "
- **Three import paths**: Repertoire, My Games, Master Games (separate submissions)
- **Repertoire import**: Has name field and color toggle (White/Black)
- **Game imports**: No extra fields, just PGN input
- Creates chapters from each game in PGN (one chapter per game for repertoires)
- Auto-classifies opening via ECO
- Data persists in separate storage (user games vs master games)

---

## Phase 4: Repertoire Management
**Priority: HIGH**

### 4.1 Repertoire Browser Screen

**File:** `src/screens/RepertoireScreen.tsx`

Shows the 4-level hierarchy: Color → Opening Type → Variation → Sub-variation

```typescript
import React, { useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet } from 'react-native';
import { useStore } from '@store';
import { RepertoireColor, OpeningType } from '@types';

export default function RepertoireScreen({ navigation }) {
  const { hierarchy } = useStore();
  const [selectedColor, setSelectedColor] = useState<RepertoireColor>('white');
  const [selectedType, setSelectedType] = useState<OpeningType | null>(null);
  const [selectedOpening, setSelectedOpening] = useState<string | null>(null);

  // Level 1: Color selector
  const renderColorSelector = () => (
    <View style={styles.colorSelector}>
      <TouchableOpacity
        style={[styles.colorBtn, selectedColor === 'white' && styles.selected]}
        onPress={() => setSelectedColor('white')}
      >
        <Text>White Repertoire</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.colorBtn, selectedColor === 'black' && styles.selected]}
        onPress={() => setSelectedColor('black')}
      >
        <Text>Black Repertoire</Text>
      </TouchableOpacity>
    </View>
  );

  // Level 2: Opening type (1.e4, 1.d4, Irregular)
  const renderOpeningTypes = () => (
    <View style={styles.typeSelector}>
      {['e4', 'd4', 'irregular'].map(type => (
        <TouchableOpacity
          key={type}
          style={[styles.typeBtn, selectedType === type && styles.selected]}
          onPress={() => setSelectedType(type as OpeningType)}
        >
          <Text>{type === 'irregular' ? 'Other' : `1. ${type}`}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );

  // Level 3 & 4: Variations and sub-variations
  const openings = hierarchy[selectedColor]
    ?.find(cat => cat.type === selectedType)?.variations || [];

  return (
    <View style={styles.container}>
      {renderColorSelector()}
      {renderOpeningTypes()}

      <FlatList
        data={openings}
        keyExtractor={item => item.id}
        renderItem={({ item: opening }) => (
          <View>
            <TouchableOpacity
              style={styles.openingHeader}
              onPress={() => setSelectedOpening(
                selectedOpening === opening.id ? null : opening.id
              )}
            >
              <Text style={styles.openingName}>{opening.name}</Text>
              <Text style={styles.eco}>{opening.eco}</Text>
            </TouchableOpacity>

            {selectedOpening === opening.id && (
              <View style={styles.subVariations}>
                {opening.subVariations.map(sub => (
                  <TouchableOpacity
                    key={sub.id}
                    style={styles.subVariation}
                    onPress={() => navigation.navigate('RepertoireStudy', {
                      color: selectedColor,
                      openingId: opening.id,
                      subVariationId: sub.id,
                    })}
                  >
                    <Text>{sub.name}</Text>
                    <Text style={styles.chapterCount}>
                      {sub.chapters.length} chapters
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
        )}
      />

      <TouchableOpacity
        style={styles.importBtn}
        onPress={() => navigation.navigate('ImportPGN', { target: 'repertoire' })}
      >
        <Text>+ Import PGN</Text>
      </TouchableOpacity>
    </View>
  );
}
```

### 4.2 Repertoire Study Screen (5 Components)

**File:** `src/screens/RepertoireStudyScreen.tsx`

**Layout:**
```
┌─────────────────┬────────────────────────────────────┐
│ HIERARCHY       │           BOARD                    │
│ & CHAPTERS      │      + MOVE HISTORY                │
│                 ├──────────────┬─────────────────────┤
│                 │ YOUR GAMES   │ MASTER GAMES        │
└─────────────────┴──────────────┴─────────────────────┘
```

```typescript
import React, { useState, useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import { InteractiveChessBoard } from '@components/chess/InteractiveChessBoard';
import { MoveHistory } from '@components/chess/MoveHistory';
import { HierarchyBrowser } from '@components/repertoire/HierarchyBrowser';
import { ChapterList } from '@components/repertoire/ChapterList';
import { GameList } from '@components/repertoire/GameList';
import { useStore } from '@store';
import { MoveTree } from '@utils/MoveTree';
import { computeFensFromMoves, normalizeFen } from '@types';

export default function RepertoireStudyScreen({ route }) {
  const { color, openingId, subVariationId } = route.params;
  const { hierarchy, userGames, masterGames } = useStore();

  // Current state
  const [selectedChapterId, setSelectedChapterId] = useState<string | null>(null);
  const [moveTree, setMoveTree] = useState<MoveTree | null>(null);
  const [currentFen, setCurrentFen] = useState(START_FEN);

  // Get current sub-variation and chapters
  const subVariation = useMemo(() => {
    const opening = hierarchy[color]
      ?.flatMap(cat => cat.variations)
      ?.find(v => v.id === openingId);
    return opening?.subVariations.find(s => s.id === subVariationId);
  }, [hierarchy, color, openingId, subVariationId]);

  // Filter games by current position (userGames and masterGames from separate stores)
  const gamesAtPosition = useMemo(() => {
    const normalizedFen = normalizeFen(currentFen); // Ignore move counters
    const userFens = userGames.map(g => computeFensFromMoves(g.moves));
    const masterFens = masterGames.map(g => computeFensFromMoves(g.moves));
    return {
      userGames: userGames.filter((g, i) => userFens[i].includes(normalizedFen)),
      masterGames: masterGames.filter((g, i) => masterFens[i].includes(normalizedFen)),
    };
  }, [userGames, masterGames, currentFen]);

  // Load chapter into MoveTree
  const handleSelectChapter = (chapterId: string) => {
    const chapter = subVariation?.chapters.find(c => c.id === chapterId);
    if (chapter) {
      setSelectedChapterId(chapterId);
      setMoveTree(MoveTree.fromJSON(chapter.moveTree));
    }
  };

  // Add game to current MoveTree
  const handleSelectGame = (game: UserGame | MasterGame) => {
    if (!moveTree) return;

    // Compute FENs on-demand and find where current position occurs
    const gameFens = computeFensFromMoves(game.moves);
    const posIndex = gameFens.indexOf(normalizeFen(currentFen));
    if (posIndex === -1) return;

    // Add continuation from game as a variation
    const continuation = game.moves.slice(posIndex);
    for (const san of continuation) {
      moveTree.addMove(san);
    }
    setMoveTree(moveTree); // Trigger re-render
  };

  return (
    <View style={styles.container}>
      {/* Left panel: Hierarchy + Chapters */}
      <View style={styles.leftPanel}>
        <HierarchyBrowser
          color={color}
          openingId={openingId}
          subVariationId={subVariationId}
        />
        <ChapterList
          chapters={subVariation?.chapters || []}
          selectedId={selectedChapterId}
          onSelect={handleSelectChapter}
        />
      </View>

      {/* Center: Board + Move History */}
      <View style={styles.centerPanel}>
        <InteractiveChessBoard
          fen={currentFen}
          onMove={(from, to) => {
            if (moveTree) {
              // Handle move...
            }
          }}
          orientation={color}
        />
        {moveTree && (
          <MoveHistory
            moves={moveTree.getFlatMoves()}
            currentNodeId={moveTree.getCurrentNode()?.id}
            onNavigate={(nodeId) => {
              moveTree.navigateToNode(nodeId);
              setCurrentFen(moveTree.getCurrentFen());
            }}
          />
        )}
      </View>

      {/* Bottom: Game lists */}
      <View style={styles.bottomPanel}>
        <GameList
          title="Your Games"
          games={gamesAtPosition.userGames}
          onSelect={handleSelectGame}
        />
        <GameList
          title="Master Games"
          games={gamesAtPosition.masterGames}
          onSelect={handleSelectGame}
        />
      </View>
    </View>
  );
}

// Normalize FEN (ignore halfmove and fullmove counters for position matching)
function normalizeFen(fen: string): string {
  return fen.split(' ').slice(0, 4).join(' ');
}
```

### 4.3 Supporting Components

**File:** `src/components/repertoire/CollapsiblePanel.tsx`
- Wrapper for collapsible sections
- Header with title and expand/collapse chevron
- Animated expand/collapse

```typescript
interface CollapsiblePanelProps {
  title: string;
  defaultCollapsed?: boolean;  // true on phone, false on tablet
  children: React.ReactNode;
}

export function CollapsiblePanel({ title, defaultCollapsed, children }: CollapsiblePanelProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed ?? false);

  return (
    <View style={styles.panel}>
      <TouchableOpacity style={styles.header} onPress={() => setCollapsed(!collapsed)}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.chevron}>{collapsed ? '▶' : '▼'}</Text>
      </TouchableOpacity>
      {!collapsed && <View style={styles.content}>{children}</View>}
    </View>
  );
}
```

**File:** `src/components/repertoire/HierarchyBrowser.tsx`
- Shows breadcrumb: Color > Opening > Sub-variation
- Allows navigating up the hierarchy
- Wrapped in CollapsiblePanel

**File:** `src/components/repertoire/ChapterList.tsx`
- Flat list of chapters in current sub-variation
- Shows chapter name, move count
- Selected chapter highlighted
- Wrapped in CollapsiblePanel

**File:** `src/components/repertoire/GameList.tsx`
- Scrollable list of games containing current position
- Shows: opponent, date, result, move number where position occurs
- Tap to add game continuation to MoveTree
- Wrapped in CollapsiblePanel

```typescript
interface GameListProps {
  title: string;
  games: UserGame[];
  onSelect: (game: UserGame) => void;
  defaultCollapsed?: boolean;
}

export function GameList({ title, games, onSelect, defaultCollapsed }: GameListProps) {
  return (
    <CollapsiblePanel title={title} defaultCollapsed={defaultCollapsed}>
      {games.length === 0 ? (
        <Text style={styles.empty}>No games at this position</Text>
      ) : (
        <ScrollView style={styles.list}>
          {games.map(game => (
            <TouchableOpacity
              key={game.id}
              style={styles.gameItem}
              onPress={() => onSelect(game)}
            >
              <Text style={styles.players}>
                {game.white} vs {game.black}
              </Text>
              <Text style={styles.meta}>
                {game.result} • {game.date}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}
    </CollapsiblePanel>
  );
}
```

### 4.4 MoveHistory Context Menu (Critical Position Marking)

**Update:** `src/components/chess/MoveHistory.tsx`

Add long-press handler for context menu:

```typescript
import { Menu, MenuItem } from 'react-native-popup-menu'; // or similar

interface MoveHistoryProps {
  moves: FlatMove[];
  currentNodeId: string | null;
  onNavigate: (nodeId: string) => void;
  onMarkCritical: (nodeId: string) => void;  // NEW
}

function MoveItem({ move, isCurrent, onPress, onLongPress }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      onLongPress={onLongPress}
      style={[styles.move, isCurrent && styles.currentMove]}
    >
      <Text style={styles.moveText}>
        {move.isCritical && '★ '}
        {move.san}
      </Text>
    </TouchableOpacity>
  );
}

// In MoveHistory component:
const [menuVisible, setMenuVisible] = useState(false);
const [selectedMoveId, setSelectedMoveId] = useState<string | null>(null);

const handleLongPress = (nodeId: string) => {
  setSelectedMoveId(nodeId);
  setMenuVisible(true);
};

// Render context menu
{menuVisible && (
  <ContextMenu
    visible={menuVisible}
    onClose={() => setMenuVisible(false)}
    options={[
      {
        label: 'Mark as Critical',
        onPress: () => {
          onMarkCritical(selectedMoveId);
          setMenuVisible(false);
        },
      },
      {
        label: 'Add Comment',
        onPress: () => { /* Future */ },
      },
    ]}
  />
)}
```

### 4.4 ECO Auto-Categorization Service

**File:** `src/services/openings/OpeningClassifier.ts`

```typescript
import ECO_DATABASE from '@data/eco.json'; // Need to include ECO database

export interface OpeningClassification {
  eco: string;
  name: string;
  variation?: string;
  openingType: OpeningType;
}

export const OpeningClassifier = {
  // Classify a sequence of moves
  classify(moves: string[]): OpeningClassification {
    // Match against ECO database
    const movesStr = moves.join(' ');

    for (const entry of ECO_DATABASE) {
      if (movesStr.startsWith(entry.moves)) {
        return {
          eco: entry.eco,
          name: entry.name,
          variation: entry.variation,
          openingType: this.getOpeningType(moves[0]),
        };
      }
    }

    // Fallback
    return {
      eco: 'A00',
      name: 'Unknown Opening',
      openingType: this.getOpeningType(moves[0]),
    };
  },

  getOpeningType(firstMove: string): OpeningType {
    if (firstMove === 'e4') return 'e4';
    if (firstMove === 'd4') return 'd4';
    return 'irregular';
  },
};
```

### 4.5 Verification
- Hierarchy browser shows Color → Type → Opening → Sub-variation
- Chapter list shows chapters within selected sub-variation
- Board displays position, move history shows variations
- Your Games list filters by current position
- Master Games list filters by current position
- Selecting a game adds its continuation to MoveTree
- ECO classification works on import

---

## Phase 5: Spaced Repetition (Basic) ✅ COMPLETE
**Priority: HIGH**
**Status: IMPLEMENTED**

### 5.1 SM-2 Algorithm ✅

**File:** `src/services/srs/SM2Service.ts` - IMPLEMENTED

```typescript
export interface SM2Result {
  easeFactor: number;
  interval: number;
  repetitions: number;
  nextReviewDate: Date;
}

export const SM2Service = {
  // Calculate next review based on quality (0-5)
  calculateNext(card: ReviewCard, quality: number): SM2Result {
    let { easeFactor, interval, repetitions } = card;

    if (quality < 3) {
      // Failed - reset
      repetitions = 0;
      interval = 1;
    } else {
      // Passed
      if (repetitions === 0) {
        interval = 1;
      } else if (repetitions === 1) {
        interval = 6;
      } else {
        interval = Math.round(interval * easeFactor);
      }
      repetitions += 1;
    }

    // Update ease factor
    easeFactor = Math.max(
      1.3,
      easeFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02))
    );

    const nextReviewDate = new Date();
    nextReviewDate.setDate(nextReviewDate.getDate() + interval);

    return { easeFactor, interval, repetitions, nextReviewDate };
  },

  // Create new card with defaults
  createCard(
    repertoireId: string,
    chapterId: string,
    fen: string,
    correctMove: string,
    contextMoves: string[]
  ): ReviewCard {
    return {
      id: generateId(),
      repertoireId,
      chapterId,
      fen,
      correctMove,
      contextMoves,
      easeFactor: 2.5,
      interval: 0,
      repetitions: 0,
      nextReviewDate: new Date(),
      totalReviews: 0,
      correctCount: 0,
    };
  },

  // Generate cards from repertoire
  generateCards(repertoire: Repertoire): ReviewCard[] {
    const cards: ReviewCard[] = [];

    for (const chapter of repertoire.chapters) {
      const tree = MoveTree.fromJSON(chapter.moveTree);
      const positions = tree.getAllPositions(); // Need to implement

      for (const pos of positions) {
        if (pos.correctMove) {
          cards.push(this.createCard(
            repertoire.id,
            chapter.id,
            pos.fen,
            pos.correctMove,
            pos.contextMoves
          ));
        }
      }
    }

    return cards;
  },
};
```

### 5.2 Training Screen (Color-Based with Animated Opponent Moves) ✅

**File:** `src/screens/TrainingScreen.tsx` - IMPLEMENTED

**Key Features:**
- Only tests user on their color's moves
- Opponent moves auto-play with animation
- Context path shown above board
- Critical positions marked

```typescript
import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated } from 'react-native';
import { Chess } from 'chess.js';
import { InteractiveChessBoard } from '@components/chess/InteractiveChessBoard';
import { useStore } from '@store';
import { SM2Service } from '@services/srs/SM2Service';
import { ReviewCard, RepertoireColor } from '@types';

const OPPONENT_MOVE_DELAY = 200; // ms animation (configurable later)

interface TrainingLine {
  cards: ReviewCard[];        // Cards for user moves only
  opponentMoves: string[];    // Opponent responses between cards
  color: RepertoireColor;
}

export default function TrainingScreen() {
  const { getDueCards, updateCard, hierarchy } = useStore();

  // Group cards into lines for continuous drilling
  const [currentLine, setCurrentLine] = useState<TrainingLine | null>(null);
  const [lineIndex, setLineIndex] = useState(0);
  const [currentFen, setCurrentFen] = useState<string>('');
  const [isAnimating, setIsAnimating] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);
  const [userMove, setUserMove] = useState<string | null>(null);

  const dueCards = getDueCards();

  // Initialize first line
  useEffect(() => {
    if (dueCards.length > 0 && !currentLine) {
      loadNextLine();
    }
  }, [dueCards]);

  const loadNextLine = () => {
    // For now, just use individual cards
    // Future: group cards from same chapter into lines
    const card = dueCards[lineIndex];
    if (card) {
      setCurrentLine({
        cards: [card],
        opponentMoves: [],
        color: card.color,
      });
      setCurrentFen(card.fen);
    }
  };

  const currentCard = currentLine?.cards[0];

  if (!currentCard) {
    return (
      <View style={styles.container}>
        <Text style={styles.done}>No cards due for review!</Text>
        <Text style={styles.sub}>Come back later.</Text>
      </View>
    );
  }

  const handleMove = async (from: string, to: string) => {
    if (isAnimating) return;

    const chess = new Chess(currentFen);
    const move = chess.move({ from, to, promotion: 'q' });

    if (!move) return;

    setUserMove(move.san);
    const isCorrect = move.san === currentCard.correctMove;

    if (isCorrect) {
      // Update board to show user's move
      setCurrentFen(chess.fen());

      // Animate opponent's response (if there is one)
      const opponentMove = getOpponentResponse(currentCard);
      if (opponentMove) {
        setIsAnimating(true);
        await delay(OPPONENT_MOVE_DELAY);

        const afterOpponent = new Chess(chess.fen());
        afterOpponent.move(opponentMove);
        setCurrentFen(afterOpponent.fen());

        setIsAnimating(false);
      }
    }

    setShowFeedback(true);
  };

  const handleRating = async (quality: number) => {
    const result = SM2Service.calculateNext(currentCard, quality);

    await updateCard({
      ...currentCard,
      ...result,
      lastReviewDate: new Date(),
      totalReviews: currentCard.totalReviews + 1,
      correctCount: currentCard.correctCount + (quality >= 3 ? 1 : 0),
    });

    // Move to next card
    setShowFeedback(false);
    setUserMove(null);
    setLineIndex(i => i + 1);
    loadNextLine();
  };

  const isCorrect = userMove === currentCard.correctMove;

  return (
    <View style={styles.container}>
      {/* Progress */}
      <View style={styles.header}>
        <Text style={styles.progress}>
          {lineIndex + 1} / {dueCards.length}
        </Text>
        {currentCard.isCritical && (
          <Text style={styles.critical}>★ Critical Position</Text>
        )}
      </View>

      {/* Context path */}
      <View style={styles.contextContainer}>
        <Text style={styles.contextLabel}>Path:</Text>
        <Text style={styles.context}>
          {currentCard.contextMoves.slice(-5).join(' → ')}
        </Text>
      </View>

      {/* Board */}
      <InteractiveChessBoard
        fen={currentFen}
        onMove={handleMove}
        orientation={currentLine?.color || 'white'}
        disabled={isAnimating || showFeedback}
      />

      {/* Animating indicator */}
      {isAnimating && (
        <Text style={styles.animating}>Opponent is responding...</Text>
      )}

      {/* Feedback & Rating */}
      {showFeedback && (
        <View style={styles.feedback}>
          <Text style={[styles.result, isCorrect ? styles.correct : styles.incorrect]}>
            {isCorrect ? '✓ Correct!' : `✗ Expected: ${currentCard.correctMove}`}
          </Text>

          <View style={styles.ratings}>
            <TouchableOpacity
              style={[styles.ratingBtn, styles.againBtn]}
              onPress={() => handleRating(1)}
            >
              <Text style={styles.ratingText}>Again</Text>
              <Text style={styles.ratingHint}>1 day</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.ratingBtn, styles.hardBtn]}
              onPress={() => handleRating(3)}
            >
              <Text style={styles.ratingText}>Hard</Text>
              <Text style={styles.ratingHint}>{Math.max(1, Math.round(currentCard.interval * 0.8))}d</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.ratingBtn, styles.goodBtn]}
              onPress={() => handleRating(4)}
            >
              <Text style={styles.ratingText}>Good</Text>
              <Text style={styles.ratingHint}>{currentCard.interval || 1}d</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.ratingBtn, styles.easyBtn]}
              onPress={() => handleRating(5)}
            >
              <Text style={styles.ratingText}>Easy</Text>
              <Text style={styles.ratingHint}>{Math.round((currentCard.interval || 1) * 1.5)}d</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}

// Helper: Get opponent's response from repertoire
function getOpponentResponse(card: ReviewCard): string | null {
  // Look up the next move in the chapter's MoveTree
  // This would be stored in the card or fetched from hierarchy
  return card.nextOpponentMove || null;
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
```

### 5.3 Card Generation (Color-Aware) ✅

**File:** `src/services/srs/CardGenerator.ts` - IMPLEMENTED

```typescript
import { MoveTree, MoveNode } from '@utils/MoveTree';
import { ReviewCard, RepertoireColor, Chapter } from '@types';

export const CardGenerator = {
  generateFromChapter(
    chapter: Chapter,
    color: RepertoireColor,
    openingId: string,
    subVariationId: string
  ): ReviewCard[] {
    const tree = MoveTree.fromJSON(chapter.moveTree);
    const cards: ReviewCard[] = [];

    // Traverse tree and create cards for user's moves only
    this.traverseTree(tree.getRootMoves(), [], color, (node, context) => {
      const isUserMove = this.isUserTurn(node, color);

      if (isUserMove || node.isCritical) {
        cards.push({
          id: generateId(),
          color,
          openingId,
          subVariationId,
          chapterId: chapter.id,
          fen: this.getFenBeforeMove(node),
          correctMove: node.san,
          contextMoves: context.slice(-5),
          isUserMove,
          isCritical: node.isCritical || false,
          easeFactor: 2.5,
          interval: 0,
          repetitions: 0,
          nextReviewDate: new Date(),
          totalReviews: 0,
          correctCount: 0,
        });
      }
    });

    return cards;
  },

  isUserTurn(node: MoveNode, color: RepertoireColor): boolean {
    // White moves on odd move numbers (1, 3, 5...)
    // Black moves on even ply
    const isWhiteMove = !node.isBlack;
    return (color === 'white') === isWhiteMove;
  },

  traverseTree(
    nodes: MoveNode[],
    context: string[],
    color: RepertoireColor,
    callback: (node: MoveNode, context: string[]) => void
  ) {
    for (const node of nodes) {
      callback(node, context);
      const newContext = [...context, node.san];
      this.traverseTree(node.children, newContext, color, callback);
    }
  },

  getFenBeforeMove(node: MoveNode): string {
    // Get FEN of position BEFORE this move was played
    if (node.parent) {
      return node.parent.fen;
    }
    return START_FEN;
  },
};
```

### 5.4 Verification ✅
- ✅ Due cards count shows correctly
- ✅ Can review cards one by one
- ✅ Context (path) displays above board
- ✅ Move validation works
- ✅ SM-2 updates intervals correctly
- ✅ Card state persists
- ✅ RepertoireScreen has "Generate Review Cards" button
- ✅ Checks for existing cards before regenerating

---

## Phase 6: Game List ✅ COMPLETE
**Priority: MEDIUM**
**Status: IMPLEMENTED**

### 6.1 Game List Screen ✅

**File:** `src/screens/GameListScreen.tsx` - IMPLEMENTED

Features implemented:
- ✅ Two tabs: "My Games" and "Master Games" (separate libraries)
- ✅ List imported games for selected tab
- ✅ Show: White vs Black, Result, Date, ECO, Event
- ✅ Import buttons for each tab
- ✅ Tap game → Open in Analysis Board (with game loaded)
- ✅ Swipe to delete functionality
- ✅ Delete confirmation dialog

### 6.2 Game-Repertoire Comparison ✅

**File:** `src/services/analysis/GameAnalyzer.ts` - IMPLEMENTED

```typescript
export const GameAnalyzer = {
  // Compare game against repertoire
  findDeviations(game: UserGame, repertoire: Repertoire): Deviation[] {
    const deviations: Deviation[] = [];
    const chess = new Chess();

    for (let i = 0; i < game.moves.length; i++) {
      const fen = chess.fen();
      const played = game.moves[i];

      // Check if this position is in repertoire
      const repertoireMove = findRepertoireMove(repertoire, fen);

      if (repertoireMove && repertoireMove !== played) {
        deviations.push({
          moveNumber: Math.floor(i / 2) + 1,
          fen,
          played,
          expected: repertoireMove,
          isUserMove: (i % 2 === 0), // Assuming user is white
        });
      }

      chess.move(played);
    }

    return deviations;
  },
};

interface Deviation {
  moveNumber: number;
  fen: string;
  played: string;
  expected: string;
  isUserMove: boolean;
}
```

### 6.3 Verification ✅
- ✅ Can import multiple games (both user and master)
- ✅ Game list displays correctly with tabs
- ✅ Can tap game to open in Analysis Board
- ✅ Game loads into Analysis Board with moves populated
- ✅ Can swipe to delete games
- ✅ Delete confirmation dialog works
- ✅ GameAnalyzer service can compare games to repertoire
- ✅ Deviations detected correctly

---

## File Creation Summary

**New Files:**
```
src/
├── components/
│   ├── navigation/
│   │   └── DrawerContent.tsx
│   └── repertoire/
│       ├── HierarchyBrowser.tsx      # Color → Opening → Sub-variation breadcrumb
│       ├── ChapterList.tsx           # Flat list of chapters
│       └── GameList.tsx              # Position-filtered game list
├── navigation/
│   └── AppNavigator.tsx
├── screens/
│   ├── AnalysisBoardScreen.tsx       # (move from App.tsx)
│   ├── RepertoireScreen.tsx          # Hierarchy browser
│   ├── RepertoireStudyScreen.tsx     # 5-component study screen
│   ├── TrainingScreen.tsx            # Color-aware SRS with animated opponent
│   ├── GameListScreen.tsx
│   └── ImportPGNScreen.tsx
├── services/
│   ├── storage/
│   │   └── StorageService.ts
│   ├── pgn/
│   │   └── PGNService.ts
│   ├── srs/
│   │   ├── SM2Service.ts
│   │   └── CardGenerator.ts          # Color-aware card generation
│   ├── openings/
│   │   └── OpeningClassifier.ts      # ECO auto-categorization
│   └── analysis/
│       └── GameAnalyzer.ts
├── store/
│   └── index.ts
├── types/
│   └── index.ts
└── data/
    └── eco.json                      # ECO opening database
```

**Files to Modify:**
```
App.tsx                           # Replace with AppNavigator
src/utils/MoveTree.ts             # Add serialization, isCritical flag
```

---

## Implementation Order

1. **Phase 1** - Navigation (drawer with 4 sections)
2. **Phase 2** - Data layer (hierarchical types, storage, store)
3. **Phase 3** - PGN import (parsing, ECO classification)
4. **Phase 4** - Repertoire (browser, study screen with 5 components)
5. **Phase 5** - Spaced repetition (color-aware, animated opponent)
6. **Phase 6** - Game list (import, position filtering, comparison)

---

## Success Criteria

**MVP Complete When:**
- [ ] Drawer navigation with 4 sections (Analysis, Repertoire, Training, Games)
- [ ] Import PGN → auto-categorizes into Color/Opening/Variation hierarchy
- [ ] Repertoire study screen with all 5 components:
  - [ ] Hierarchy browser
  - [ ] Chapter list
  - [ ] Board + move history
  - [ ] Your Games (position-filtered)
  - [ ] Master Games (position-filtered)
- [ ] Selecting a game adds continuation to MoveTree
- [ ] Generate review cards (only user's color, plus critical positions)
- [ ] Training session with animated opponent responses
- [ ] SM-2 intervals update correctly
- [ ] All data persists across app restarts
- [ ] Can mark positions as critical
