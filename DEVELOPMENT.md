# Kingside Development Plan

This document is the implementation roadmap for making Kingside production-ready. Each phase is designed to be worked through sequentially. Tasks within a phase can often be parallelized.

**Current state**: Debug-only builds relying on Expo dev server. 1 test file (18 tests, ~4% coverage). No CI/CD. No release signing. Pre-existing TypeScript errors in several files.

**Target state**: Standalone release APK, >90% test coverage on critical paths, GitHub Actions CI, automated APK artifact builds.

---

## Phase 0: Fix Pre-existing TypeScript Errors

**Goal**: Clean compile with `npx tsc --noEmit` — zero errors.

The following files have type errors that must be resolved before any other work. These are pre-existing issues unrelated to the engine rewrite.

### 0.1 Fix store slice type errors

**Files**: `src/store/slices/repertoireSlice.ts`, `src/store/slices/reviewSlice.ts`

These slices reference properties that don't exist on current types (`variations` on `Chapter`, `reviewHistory` on `ReviewCard`, `repertoireId` on `ReviewCard`). The slices also import from `@services/spaced-repetition/SM2Service` which may not exist at the expected path.

**Action**: Either update the slices to match current types, or delete them if they're unused legacy code (the main store in `src/store/index.ts` doesn't import them). Check if any file imports from these slices — if not, delete them.

### 0.2 Fix DatabaseService type errors

**File**: `src/services/database/DatabaseService.ts`

- `site` property doesn't exist on `UserGame` type — either add `site?: string` to the `UserGame` interface in `src/types/repertoire.types.ts`, or remove `site` references from DatabaseService
- Untyped function calls and implicit `any` parameters on row mapping functions — add explicit types
- `getAllAsync<T>()` type argument issues — check expo-sqlite API and fix generics

### 0.3 Fix PGNService type errors

**File**: `src/services/chess/PGNService.ts`

- `ChessChapter` not assignable to `Chapter` — the PGN parser creates chapters missing required fields (`pgn`, `moveTree`, `order`, `createdAt`, `updatedAt`). Add these fields during chapter construction.
- `metadata` and `variations` don't exist on current types — update to match current type definitions

### 0.4 Fix screen type errors

**Files**: `src/screens/HomeScreen.tsx`, `src/screens/repertoire/RepertoireLibraryScreen.tsx`, `src/screens/repertoire/RepertoireViewerScreen.tsx`, `src/screens/repertoire/ReviewSessionScreen.tsx`

These screens reference store properties and actions that don't exist in the current Zustand store (`getDueCount`, `initializeRepertoires`, `loadRepertoire`, `currentRepertoire`, `currentMoveIndex`, `flipBoard`, `startReviewSession`, `submitReview`, etc.).

**Action**: These are likely screens built against a planned store API that was never implemented. Options:
1. **Stub the missing store actions** with no-ops and TODO comments if the screens are needed soon
2. **Delete the screens** if they're not reachable from the current navigator (check `AppNavigator.tsx`)
3. **Comment out the broken imports** and mark as TODO

The safest approach: check `AppNavigator.tsx` for which screens are actually routed. Remove unreachable screens from the build. Keep them in git history.

### 0.5 Fix navigation type errors

Several screens pass plain strings to `navigation.navigate()` instead of typed route objects. Fix by using the proper typed navigation patterns from `@react-navigation`.

### Verification

```bash
npx tsc --noEmit    # Must exit 0
npm test            # Must pass (18 tests)
```

---

## Phase 1: Production Build Pipeline

**Goal**: Generate a signed, standalone release APK that runs without Expo dev server.

### 1.1 Generate release keystore

Create a release keystore for signing production APKs. This keystore must be kept safe — losing it means you can never update the app on the same package name.

```bash
# Run from project root (adjust alias and passwords)
keytool -genkeypair -v -storetype PKCS12 \
  -keystore android/app/kingside-release.keystore \
  -alias kingside \
  -keyalg RSA -keysize 2048 -validity 10000
```

**IMPORTANT**: Add to `.gitignore`:
```
# Release signing
android/app/kingside-release.keystore
keystore.properties
```

Create `android/keystore.properties` (git-ignored):
```properties
storeFile=kingside-release.keystore
storePassword=<your-password>
keyAlias=kingside
keyPassword=<your-password>
```

### 1.2 Configure gradle signing

**File**: `android/app/build.gradle`

Replace the release signing config block. Load credentials from `keystore.properties` so secrets stay out of version control:

```gradle
def keystorePropertiesFile = rootProject.file("keystore.properties")
def keystoreProperties = new Properties()
if (keystorePropertiesFile.exists()) {
    keystoreProperties.load(new FileInputStream(keystorePropertiesFile))
}

android {
    signingConfigs {
        release {
            if (keystorePropertiesFile.exists()) {
                storeFile file(keystoreProperties['storeFile'])
                storePassword keystoreProperties['storePassword']
                keyAlias keystoreProperties['keyAlias']
                keyPassword keystoreProperties['keyPassword']
            }
        }
    }
    buildTypes {
        release {
            signingConfig signingConfigs.release
            minifyEnabled true          // Enable R8/ProGuard
            shrinkResources true        // Remove unused resources
            proguardFiles getDefaultProguardFile('proguard-android-optimize.txt'), 'proguard-rules.pro'
        }
    }
}
```

### 1.3 Update ProGuard rules

**File**: `android/app/proguard-rules.pro`

Add rules for libraries used by Kingside:

```proguard
# React Native
-keep class com.facebook.react.** { *; }
-keep class com.facebook.hermes.** { *; }

# Expo SQLite
-keep class expo.modules.sqlite.** { *; }

# Stockfish native module
-keep class com.reactnativestockfishchessengine.** { *; }

# React Native SVG
-keep class com.horcrux.svg.** { *; }

# Keep JS interface methods
-keepclassmembers class * {
    @com.facebook.react.bridge.ReactMethod *;
}
```

### 1.4 Create build-release-apk.bat

**File**: `build-release-apk.bat`

```batch
@echo off
echo ========================================
echo Kingside Release Build
echo ========================================
echo.

echo [1/3] Type checking...
call npx tsc --noEmit
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: TypeScript errors found!
    pause
    exit /b 1
)

echo [2/3] Running tests...
call npx jest --forceExit
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Tests failed!
    pause
    exit /b 1
)

echo [3/3] Building release APK...
cd android
call gradlew assembleRelease
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Build failed!
    cd ..
    pause
    exit /b 1
)
cd ..

echo.
echo ========================================
echo Build complete!
echo APK: android\app\build\outputs\apk\release\app-release.apk
echo ========================================

echo.
set /p INSTALL="Install to connected device? (y/n): "
if /i "%INSTALL%"=="y" (
    adb install -r android\app\build\outputs\apk\release\app-release.apk
)
```

### 1.5 Version management

**File**: `package.json` — source of truth for version.

Add a version bump script that syncs version across package.json, app.json, and build.gradle:

**File**: `scripts/bump-version.js`

```javascript
const fs = require('fs');
const path = require('path');

const newVersion = process.argv[2];
if (!newVersion || !/^\d+\.\d+\.\d+$/.test(newVersion)) {
  console.error('Usage: node scripts/bump-version.js <semver>');
  process.exit(1);
}

const [major, minor, patch] = newVersion.split('.').map(Number);
const versionCode = major * 10000 + minor * 100 + patch;

// package.json
const pkgPath = path.join(__dirname, '..', 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
pkg.version = newVersion;
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');

// app.json
const appPath = path.join(__dirname, '..', 'app.json');
const app = JSON.parse(fs.readFileSync(appPath, 'utf8'));
app.expo.version = newVersion;
fs.writeFileSync(appPath, JSON.stringify(app, null, 2) + '\n');

// build.gradle — update versionName and versionCode
const gradlePath = path.join(__dirname, '..', 'android', 'app', 'build.gradle');
let gradle = fs.readFileSync(gradlePath, 'utf8');
gradle = gradle.replace(/versionCode \d+/, `versionCode ${versionCode}`);
gradle = gradle.replace(/versionName "[^"]*"/, `versionName "${newVersion}"`);
fs.writeFileSync(gradlePath, gradle);

console.log(`Version bumped to ${newVersion} (code: ${versionCode})`);
```

Add to `package.json` scripts:
```json
"version:bump": "node scripts/bump-version.js"
```

### Verification

```bash
# Build release APK
build-release-apk.bat

# Install on device (USB debugging enabled)
adb install -r android/app/build/outputs/apk/release/app-release.apk

# Verify: app launches without Expo dev server
# Verify: engine analysis works (enable in settings gear)
# Verify: can import a PGN file
# Verify: can navigate all screens
```

---

## Phase 2: Test Coverage (>90% on critical paths)

**Goal**: Comprehensive test suites for all business logic, data persistence, and engine integration. Component tests for critical UI.

### Testing infrastructure setup

Before writing tests, set up the testing environment properly.

#### 2.0.1 Install test dependencies

```bash
npm install --save-dev @testing-library/react-native @testing-library/jest-native jest-environment-jsdom
```

#### 2.0.2 Update jest.config.js

Add separate projects for unit tests (node) and component tests (jsdom):

```javascript
module.exports = {
  projects: [
    {
      displayName: 'unit',
      preset: 'ts-jest',
      testEnvironment: 'node',
      testMatch: ['<rootDir>/src/**/__tests__/**/*.test.ts'],
      moduleNameMapper: { /* existing path aliases */ },
      collectCoverageFrom: ['src/**/*.{ts,tsx}', '!src/**/*.d.ts', '!src/**/__tests__/**'],
    },
    {
      displayName: 'components',
      preset: 'ts-jest',
      testEnvironment: 'jsdom',
      testMatch: ['<rootDir>/src/**/__tests__/**/*.test.tsx'],
      moduleNameMapper: { /* existing path aliases */ },
      setupFilesAfterSetup: ['@testing-library/jest-native/extend-expect'],
      collectCoverageFrom: ['src/components/**/*.tsx', 'src/screens/**/*.tsx'],
    },
  ],
};
```

#### 2.0.3 Create shared test mocks

**File**: `src/__mocks__/chess.js.ts` — mock for chess.js when full engine isn't needed

**File**: `src/__mocks__/expo-sqlite.ts` — mock for SQLite in unit tests:
```typescript
export const openDatabaseAsync = jest.fn().mockResolvedValue({
  runAsync: jest.fn().mockResolvedValue({ changes: 0 }),
  getAllAsync: jest.fn().mockResolvedValue([]),
  getFirstAsync: jest.fn().mockResolvedValue(null),
  execAsync: jest.fn().mockResolvedValue(undefined),
  withTransactionAsync: jest.fn().mockImplementation(async (fn) => fn()),
});
```

**File**: `src/__mocks__/@react-native-async-storage/async-storage.ts`:
```typescript
const store: Record<string, string> = {};
export default {
  getItem: jest.fn((key: string) => Promise.resolve(store[key] || null)),
  setItem: jest.fn((key: string, value: string) => { store[key] = value; return Promise.resolve(); }),
  removeItem: jest.fn((key: string) => { delete store[key]; return Promise.resolve(); }),
  clear: jest.fn(() => { Object.keys(store).forEach(k => delete store[k]); return Promise.resolve(); }),
};
```

---

### 2.1 MoveTree tests (CRITICAL — core data structure)

**File**: `src/utils/__tests__/MoveTree.test.ts`

MoveTree is the foundation of the entire app. Every screen that displays moves depends on it. Test thoroughly.

**Test cases** (~30 tests):

```
describe('MoveTree')
  describe('construction')
    - creates empty tree with root node
    - root node has starting FEN

  describe('addMove')
    - adds move to empty tree, updates currentNode
    - adds second move after first
    - rejects illegal moves (returns null or throws)
    - handles pawn promotion (e.g., e8=Q)
    - handles castling (O-O, O-O-O)
    - handles en passant

  describe('navigation')
    - goBack returns to parent node
    - goBack from root is no-op
    - goForward follows main line
    - goForward at end is no-op
    - goToStart returns to root
    - goToEnd follows main line to leaf
    - navigateTo(nodeId) jumps to specific node
    - isAtStart/isAtEnd report correctly

  describe('variations')
    - adding move from non-leaf creates variation
    - getVariations returns all child moves from a node
    - goForward follows main line (first child)
    - variation nodes have correct parent reference
    - deep variations (3+ levels) work correctly

  describe('getCurrentNode')
    - returns root initially
    - returns correct node after moves
    - returns correct node after navigation

  describe('getFlatMoves')
    - returns empty array for empty tree
    - returns main line moves in order
    - includes variation indicators
    - handles nested variations

  describe('serialization')
    - toJSON produces valid JSON
    - fromJSON restores identical tree
    - round-trip preserves all moves
    - round-trip preserves variations
    - round-trip preserves comments
    - round-trip preserves node IDs
    - handles empty tree

  describe('comments')
    - can set comment on current node
    - comment survives serialization round-trip
    - comment on variation node works

  describe('deletion')
    - deleteCurrentMove removes node
    - deleteCurrentMove updates parent's children
```

### 2.2 EngineAnalyzer tests (CRITICAL — UCI protocol)

**File**: `src/services/engine/__tests__/EngineAnalyzer.test.ts`

Test the UCI line parsing, readyok fence, caching, and edge cases. No actual Stockfish needed — mock the `sendCommand` function and feed lines manually.

**Test cases** (~25 tests):

```
describe('EngineAnalyzer')
  describe('readyok fence')
    - discards output before readyok
    - sends position + go after readyok
    - sends MultiPV option after readyok
    - handles readyok fence for consecutive analyses

  describe('info line parsing')
    - parses depth from info line
    - parses score cp (positive)
    - parses score cp (negative)
    - parses score mate (positive — white mates)
    - parses score mate (negative — black mates)
    - parses multipv index
    - parses pv moves
    - ignores info lines without score
    - ignores info lines at lower depth than current best
    - updates topDepth when deeper line arrives

  describe('bestmove handling')
    - resolves promise on bestmove
    - includes correct eval in result
    - handles bestmove with no prior info lines (fallback)
    - clears active search after bestmove

  describe('score orientation')
    - flips score for black-to-move positions
    - does not flip for white-to-move positions
    - flips mate score correctly

  describe('UCI to SAN conversion')
    - converts e2e4 to e4
    - converts e7e8q to e8=Q (promotion)
    - returns UCI string on invalid FEN
    - handles castling

  describe('caching')
    - returns cached result for same fen+options
    - does not cache across different options
    - evicts oldest entry when cache full (500)

  describe('cancellation')
    - cancel rejects active promise with 'Cancelled'
    - new analyze cancels previous
    - timeout rejects after moveTime + 10s

  describe('progress throttling')
    - calls onProgress at most every 250ms
    - does not throttle final bestmove result
```

### 2.3 StockfishBridge tests

**File**: `src/services/engine/__tests__/StockfishBridge.test.ts`

Test the line buffering and event handling logic. Mock `NativeModules` and `NativeEventEmitter`.

**Test cases** (~12 tests):

```
describe('StockfishBridge')
  describe('line buffering')
    - processes complete lines (text ending with \n)
    - processes multiple lines in single event
    - handles event without trailing newline (flushes via appended \n)
    - handles empty lines (skips them)
    - trims whitespace and \r from lines

  describe('initialization')
    - sends uci, setoption Use NNUE false, isready on start
    - resolves start promise on readyok
    - sets isReady to true after readyok
    - rejects if native module not found

  describe('output routing')
    - routes lines to outputHandler after ready
    - does not route lines before readyok
    - handles null outputHandler without error

  describe('cleanup')
    - stop removes event subscription
    - stop calls shutdownStockfish
    - stop resets ready state
```

### 2.4 DatabaseService tests

**File**: `src/services/database/__tests__/DatabaseService.test.ts`

Mock `expo-sqlite`. Test all CRUD operations, pagination, search, and bulk operations.

**Test cases** (~20 tests):

```
describe('DatabaseService')
  describe('initialization')
    - creates user_games and master_games tables
    - creates indices on date, eco, imported_at
    - is idempotent (safe to call twice)

  describe('user games CRUD')
    - addUserGames inserts games with all fields
    - addUserGames stores moves as JSON string
    - addUserGames sets imported_at timestamp
    - getUserGameById returns correct game
    - getUserGameById returns null for missing ID
    - deleteUserGame removes the record
    - getUserGamesCount returns correct count

  describe('pagination')
    - getUserGames returns first page (50 items)
    - getUserGames page 2 returns next batch
    - getUserGames returns hasMore=false on last page
    - getUserGames returns correct totalCount

  describe('search')
    - searchUserGames matches on white player name
    - searchUserGames matches on black player name
    - searchUserGames matches on ECO code
    - searchUserGames matches on event name
    - searchUserGames is case-insensitive
    - searchUserGames returns empty for no match

  describe('master games')
    - addMasterGames inserts correctly
    - getMasterGames paginates correctly
    - searchMasterGames works

  describe('bulk operations')
    - addUserGames handles 100+ games in transaction
    - transaction rolls back on error (no partial inserts)
```

### 2.5 PGNService tests

**File**: `src/services/pgn/__tests__/PGNService.test.ts`

Test PGN parsing edge cases — this is a common source of bugs due to the variety of PGN formats in the wild.

**Test cases** (~20 tests):

```
describe('PGNService')
  describe('parsePGN')
    - parses standard PGN with headers and moves
    - parses PGN without headers (moves only)
    - parses multiple games in single PGN string
    - handles BOM character at start of file
    - handles Windows line endings (\r\n)
    - handles empty input (returns empty array)
    - handles PGN with comments {like this}
    - handles PGN with NAG annotations ($1, $2, etc.)
    - handles PGN with variations (parenthesized)

  describe('header extraction')
    - extracts White, Black, Result, Date, Event, ECO
    - handles Date as object (parser quirk: {value, year, month, day})
    - handles missing headers gracefully
    - handles non-string header values

  describe('move tree building')
    - builds correct MoveTree from parsed moves
    - preserves move order
    - handles variations in PGN
    - attaches comments from commentAfter
    - handles promotion moves

  describe('exportPGN')
    - exports valid PGN from repertoire/chapter
    - includes headers
    - includes variations
    - round-trip: parse then export produces equivalent PGN
```

### 2.6 GameReviewService tests (expand existing)

**File**: `src/services/gameReview/__tests__/GameReviewService.test.ts` (new file alongside existing transpositions test)

The transposition tests exist. Now test the rest of the service: key move classification, engine eval integration, full review pipeline.

**Test cases** (~15 tests):

```
describe('GameReviewService')
  describe('classifyKeyMove')
    - classifies blunder (evalDelta > blunder threshold)
    - classifies mistake (evalDelta > mistake threshold)
    - classifies inaccuracy (evalDelta > inaccuracy threshold)
    - does not classify small eval changes
    - handles mate score transitions

  describe('analyzeGame')
    - produces MoveAnalysis for each move
    - marks first repertoire deviation as key move
    - does not mark subsequent deviations after first
    - includes repertoire match info when available
    - works without engine (repertoire-only mode)

  describe('reviewSession')
    - creates session with correct game and color
    - computes keyMoveIndices correctly
    - sets followedRepertoire when no deviations
```

### 2.7 SM2Service tests

**File**: `src/services/spaced-repetition/__tests__/SM2Service.test.ts`

The SM-2 algorithm has well-defined expected behavior. Test all quality ratings and edge cases.

**Test cases** (~10 tests):

```
describe('SM2Service')
  describe('calculateNextReview')
    - quality 5 (perfect): increases interval, maintains ease
    - quality 4 (correct with hesitation): increases interval
    - quality 3 (correct with difficulty): interval stays or grows slowly
    - quality 2 (incorrect but remembered): resets interval to 1
    - quality 1 (incorrect): resets interval to 1, decreases ease
    - quality 0 (blackout): resets interval to 1, minimum ease

  describe('ease factor bounds')
    - ease factor never drops below 1.3
    - ease factor can increase above 2.5

  describe('interval progression')
    - first review: interval = 1 day
    - second review: interval = 6 days
    - subsequent: interval * easeFactor
```

### 2.8 StorageService tests

**File**: `src/services/storage/__tests__/StorageService.test.ts`

**Test cases** (~8 tests):

```
describe('StorageService')
  describe('save/load round-trip')
    - saves and loads repertoire array
    - saves and loads review cards
    - handles empty arrays
    - returns null/default for missing key

  describe('date serialization')
    - Date objects survive round-trip (custom reviver)
    - ISO date strings in nested objects are restored as Dates
    - non-date strings are not converted

  describe('error handling')
    - load returns null on parse error
    - save handles large data (stress test with 100 repertoires)
```

### 2.9 Zustand store tests

**File**: `src/store/__tests__/store.test.ts`

Test the store actions that persist data. Mock all services.

**Test cases** (~15 tests):

```
describe('useStore')
  describe('repertoire actions')
    - addRepertoire adds to array and persists
    - updateRepertoire modifies in place and persists
    - deleteRepertoire removes and persists
    - deleteRepertoire cleans up related review cards

  describe('game actions')
    - addUserGames calls DatabaseService and refreshes count
    - deleteUserGame calls DatabaseService and refreshes count
    - getUserGameById fetches from database

  describe('settings actions')
    - updateReviewSettings persists changes
    - updateScreenSettings persists per-screen changes
    - settings merge with defaults on load (backward compat)

  describe('initialization')
    - initialize loads all data in parallel
    - initialize sets isLoading=false when done
    - initialize handles database init failure gracefully
```

### 2.10 Component tests (critical UI only)

**File**: `src/components/chess/__tests__/EvalBar.test.tsx`

```
describe('EvalBar')
  - renders white section larger when white is winning
  - renders 50/50 split at score 0
  - shows full white on mate for white
  - shows full black on mate for black
  - respects orientation (flips for black)
  - does not render when visible=false
```

**File**: `src/components/chess/__tests__/EngineLines.test.tsx`

```
describe('EngineLines')
  - renders correct number of PV lines
  - displays score in pawns (cp/100)
  - displays "M3" for mate in 3
  - shows SAN moves in PV
```

### Coverage targets

| Module | Target | Rationale |
|--------|--------|-----------|
| MoveTree | 95% | Core data structure, used everywhere |
| EngineAnalyzer | 95% | Complex protocol parsing, easy to break |
| StockfishBridge | 90% | Native boundary, line buffering bugs |
| DatabaseService | 90% | Data integrity critical |
| PGNService | 90% | Varied input formats from wild |
| GameReviewService | 90% | Complex algorithm, existing tests to expand |
| SM2Service | 100% | Pure algorithm, fully deterministic |
| StorageService | 85% | Serialization edge cases |
| Store actions | 80% | Integration of services |
| Components | 70% | Regression safety for UI |

### Verification

```bash
npm test -- --coverage
# Check coverage report meets targets above
```

---

## Phase 3: Code Quality & Developer Experience

**Goal**: Automated quality gates that prevent regressions.

### 3.1 ESLint configuration

```bash
npm install --save-dev eslint @typescript-eslint/parser @typescript-eslint/eslint-plugin eslint-plugin-react eslint-plugin-react-hooks
```

**File**: `.eslintrc.js`

```javascript
module.exports = {
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint', 'react', 'react-hooks'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:react/recommended',
    'plugin:react-hooks/recommended',
  ],
  rules: {
    'react/react-in-jsx-scope': 'off',        // Not needed with new JSX transform
    '@typescript-eslint/no-explicit-any': 'warn',
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    'react-hooks/exhaustive-deps': 'warn',
    'no-console': ['warn', { allow: ['warn', 'error'] }],  // Flag leftover console.log
  },
  settings: { react: { version: 'detect' } },
};
```

Add to `package.json` scripts:
```json
"lint": "eslint src/ --ext .ts,.tsx",
"lint:fix": "eslint src/ --ext .ts,.tsx --fix"
```

### 3.2 Pre-commit hooks with husky

```bash
npm install --save-dev husky lint-staged
npx husky init
```

**File**: `.husky/pre-commit`

```bash
#!/bin/sh
npx lint-staged
```

**File**: `.lintstagedrc.json`

```json
{
  "src/**/*.{ts,tsx}": [
    "eslint --fix",
    "npx tsc --noEmit"
  ]
}
```

### 3.3 Error boundaries

**File**: `src/components/ErrorBoundary.tsx`

Create a React error boundary that catches render crashes and shows a recovery screen instead of a white screen. Wrap the root navigator with it.

```typescript
// Catches errors in the React component tree
// Shows: "Something went wrong" + error message + "Restart" button
// Logs error details for debugging
```

Wrap in `App.tsx`:
```tsx
<ErrorBoundary>
  <StockfishProvider>
    <AppNavigator />
  </StockfishProvider>
</ErrorBoundary>
```

### 3.4 Remove development-only code for release

Add a check in `StockfishBridge.ts` and `EngineAnalyzer.ts` that gates diagnostic console.log calls behind `__DEV__`:

```typescript
if (__DEV__) console.log('[SF] Engine ready');
```

This is already mostly done (we removed the hot-path logs), but audit remaining `console.log` calls across the codebase and gate them.

---

## Phase 4: GitHub Actions CI

**Goal**: Automated type checking, linting, and testing on every push/PR. Automated APK builds on version tags.

### 4.1 CI workflow (runs on every push and PR)

**File**: `.github/workflows/ci.yml`

```yaml
name: CI

on:
  push:
    branches: [master, sqlite]
  pull_request:
    branches: [master]

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm

      - run: npm ci

      - name: TypeScript check
        run: npx tsc --noEmit

      - name: Lint
        run: npm run lint

      - name: Tests
        run: npm test -- --coverage --forceExit

      - name: Upload coverage
        uses: actions/upload-artifact@v4
        with:
          name: coverage-report
          path: coverage/
```

This stays within GitHub free tier (~2 min per run, node-only, no Android build on every push).

### 4.2 Release workflow (builds APK on version tag)

**File**: `.github/workflows/release.yml`

```yaml
name: Release APK

on:
  push:
    tags: ['v*']

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm

      - uses: actions/setup-java@v4
        with:
          distribution: temurin
          java-version: 17

      - run: npm ci

      - name: TypeScript check
        run: npx tsc --noEmit

      - name: Tests
        run: npm test -- --forceExit

      - name: Decode keystore
        run: echo "${{ secrets.KEYSTORE_BASE64 }}" | base64 -d > android/app/kingside-release.keystore

      - name: Create keystore.properties
        run: |
          cat > android/keystore.properties << EOF
          storeFile=kingside-release.keystore
          storePassword=${{ secrets.KEYSTORE_PASSWORD }}
          keyAlias=${{ secrets.KEY_ALIAS }}
          keyPassword=${{ secrets.KEY_PASSWORD }}
          EOF

      - name: Build release APK
        run: cd android && chmod +x gradlew && ./gradlew assembleRelease

      - name: Upload APK
        uses: actions/upload-artifact@v4
        with:
          name: kingside-${{ github.ref_name }}.apk
          path: android/app/build/outputs/apk/release/app-release.apk

      - name: Create GitHub Release
        uses: softprops/action-gh-release@v2
        with:
          files: android/app/build/outputs/apk/release/app-release.apk
          generate_release_notes: true
```

### 4.3 GitHub secrets setup

Add these secrets in the GitHub repo settings (Settings → Secrets → Actions):

| Secret | Value |
|--------|-------|
| `KEYSTORE_BASE64` | `base64 -w 0 android/app/kingside-release.keystore` output |
| `KEYSTORE_PASSWORD` | Your keystore password |
| `KEY_ALIAS` | `kingside` |
| `KEY_PASSWORD` | Your key password |

### 4.4 Release process

```bash
# 1. Bump version
node scripts/bump-version.js 1.1.0

# 2. Commit and tag
git add -A
git commit -m "Release v1.1.0"
git tag v1.1.0

# 3. Push (triggers CI + release build)
git push origin master --tags

# 4. Download APK from GitHub Releases page
# 5. Install: adb install -r kingside-v1.1.0.apk
```

---

## Phase 5: Future Features

### 5.1 Spaced Repetition Training (HIGH PRIORITY)

**Goal**: Implement the full training loop — drill repertoire lines with SM-2 scheduling.

The SM-2 algorithm and card/line data structures already exist. The missing pieces are the UI flow and the integration between `TrainingService`, `SM2Service`, `CardGenerator`, and the training screen.

**Implementation steps**:

1. **Card generation from repertoire**
   - When a repertoire is created/updated, auto-generate `ReviewCard` entries for each user-move position
   - Use `CardGenerator.ts` (already exists) — verify it works, add tests
   - Store cards in AsyncStorage via existing store actions

2. **Training screen UI**
   - Show the board at the card's FEN position
   - Hide the correct move — user must play it on the board
   - On correct: green flash, advance to next card
   - On incorrect: show correct move with arrow, mark for sooner review
   - Progress bar showing cards remaining in session

3. **Session flow**
   - "Start Training" button on repertoire screen
   - Filter to due cards (nextReviewDate <= now)
   - Option to train all vs. due-only
   - Option: depth-first (complete one line) vs width-first (one move from each line)
   - End screen: stats (correct/incorrect/total, time spent)

4. **SM-2 integration**
   - After each card answer, call `SM2Service.calculateNextReview()`
   - Update card's `easeFactor`, `interval`, `nextReviewDate`
   - Persist updated cards to AsyncStorage

5. **Training dashboard**
   - Show due card count per repertoire
   - Show overall training stats (streak, accuracy %)
   - Color-code repertoires by training status

### 5.2 Position Filtering (HIGH PRIORITY)

**Goal**: From any board position, find all user/master games that reached that position.

**Implementation steps**:

1. **FEN indexing in database**
   - Add a `positions` table: `(game_id, fen_prefix, ply)` where `fen_prefix` is the board position portion of FEN (strip move counters)
   - On game import, replay moves and insert one row per position reached
   - Index on `fen_prefix` for fast lookup

2. **Migration**
   - Add migration v2 in `MigrationService`: create `positions` table, backfill existing games
   - Backfill can run async in background after app start

3. **Query API**
   - `DatabaseService.getGamesByPosition(fenPrefix: string): PaginatedResult<UserGame>`
   - Returns games that passed through this position, sorted by relevance

4. **UI integration**
   - Add "Find Games" button to Analysis Board (when a position is on the board)
   - Show results in a bottom sheet or modal
   - Tap a game → navigate to GameReviewScreen at that position

5. **Performance considerations**
   - Average game = 40 moves = 80 positions to index
   - 1000 games = 80,000 position rows — SQLite handles this fine with proper indexing
   - FEN prefix (board + turn + castling + en passant) is the key, ignore halfmove/fullmove clocks

### 5.3 Analysis Board Improvements

- **Variation support**: When user plays a move that deviates from the current line, create a variation in the MoveTree instead of replacing the main line
- **Keyboard shortcuts** (for when connected to external keyboard / Chromebook): arrow keys for navigation, 'f' to flip board
- **PGN export**: Export current analysis as PGN file

### 5.4 Engine Improvements

- **Configurable NNUE**: If a future Stockfish version ships with a bundled NNUE net that works on mobile, allow enabling it in settings for stronger eval (at cost of startup time)
- **Engine lines interactivity**: Tap a PV line to play it on the board (preview mode)
- **Analysis depth indicator**: Show current depth in the eval bar area as a small number

### 5.5 Database Evolution

As features grow, the database schema will need updates:

- **Schema versioning**: Add a `schema_version` table so `MigrationService` can run incremental migrations (v1 → v2 → v3) instead of just a one-time flag
- **Position index table** (for 5.2 above)
- **Training stats table**: Move `LineStats` from AsyncStorage to SQLite for better querying
- **Consider moving repertoires to SQLite**: As repertoire count grows, AsyncStorage may become a bottleneck. SQLite with lazy-loading chapters would scale better.

### 5.6 Quality of Life

- **App icon and splash screen**: Replace Expo defaults with Kingside branding
- **Dark/light theme toggle**: Currently hardcoded dark theme
- **Haptic feedback**: Vibrate on piece placement (already have VIBRATE permission)
- **Undo move**: Long-press back button to undo last move on analysis board
- **Game notes**: Add free-text notes per game (store in database)

---

## Appendix: File Reference

### Files to create (new)

```
scripts/bump-version.js
build-release-apk.bat
.eslintrc.js
.lintstagedrc.json
.github/workflows/ci.yml
.github/workflows/release.yml
src/components/ErrorBoundary.tsx
src/__mocks__/expo-sqlite.ts
src/__mocks__/@react-native-async-storage/async-storage.ts
src/utils/__tests__/MoveTree.test.ts
src/services/engine/__tests__/EngineAnalyzer.test.ts
src/services/engine/__tests__/StockfishBridge.test.ts
src/services/database/__tests__/DatabaseService.test.ts
src/services/pgn/__tests__/PGNService.test.ts
src/services/gameReview/__tests__/GameReviewService.test.ts
src/services/spaced-repetition/__tests__/SM2Service.test.ts
src/services/storage/__tests__/StorageService.test.ts
src/store/__tests__/store.test.ts
src/components/chess/__tests__/EvalBar.test.tsx
src/components/chess/__tests__/EngineLines.test.tsx
```

### Files to modify

```
android/app/build.gradle          (signing config, ProGuard)
android/app/proguard-rules.pro    (library keep rules)
android/keystore.properties       (git-ignored, local only)
.gitignore                        (keystore, properties)
package.json                      (scripts, devDependencies)
jest.config.js                    (multi-project setup)
jest.setup.js                     (mock setup)
App.tsx                           (ErrorBoundary wrapper)
src/types/repertoire.types.ts     (add site? to UserGame if needed)
```

### Files to potentially delete (if unused)

```
src/store/slices/repertoireSlice.ts    (if not imported anywhere)
src/store/slices/reviewSlice.ts        (if not imported anywhere)
src/screens/HomeScreen.tsx             (if not in navigator)
src/screens/repertoire/RepertoireLibraryScreen.tsx  (if broken and not routed)
src/screens/repertoire/RepertoireViewerScreen.tsx   (if broken and not routed)
src/screens/repertoire/ReviewSessionScreen.tsx      (if broken and not routed)
```

---

## Priority Execution Order

For maximum impact with minimum risk, work through in this order:

1. **Phase 0** — Fix TS errors (unblocks everything)
2. **Phase 1** — Production build (get a working release APK)
3. **Phase 2.1–2.4** — Test critical paths (MoveTree, Engine, DB, PGN)
4. **Phase 3.1–3.3** — ESLint, husky, error boundary
5. **Phase 4.1** — CI workflow (automate quality gates)
6. **Phase 2.5–2.10** — Remaining test coverage
7. **Phase 4.2** — Release workflow
8. **Phase 5.1** — Spaced repetition (first major feature)
9. **Phase 5.2** — Position filtering (second major feature)
