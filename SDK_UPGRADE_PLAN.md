# Expo SDK 52 → 54 upgrade

Goal: target API 36 and 16 KB page size support (Play requirements).

SDK 54, not latest: it reaches API 36 and is the last SDK with the legacy architecture,
which the Stockfish wrapper was written for. A further upgrade will be needed later.

Branch: `release` (`master` stays on SDK 52 until the first release is finalized)

## Progress

- [ ] **0. Baseline** — branch ✅, `tsc` ✅ and 537/537 tests ✅; **still to do (manual): export a DB backup from the phone**
- [x] **1. Engine spike** — 16 KB linker flags in the wrapper's `CMakeLists.txt` via `patch-package`; build on SDK 52.
      Done when `arm64-v8a` and `x86_64` `libstockfish.so` are 16 KB aligned
- [ ] **2. JS upgrade** — `expo@54`, `expo install --fix` (RN 0.81, React 19); `newArchEnabled=false`; stay on Reanimated 3
- [ ] **3. Code changes** — `expo-file-system/legacy` imports (6 files); React 19 type errors;
      remove `react-native-paper` and `@react-navigation/bottom-tabs` if confirmed unused
- [ ] **4. Native project** — generate a fresh SDK 54 template outside the repo, merge into `android/` by hand.
      Never run `prebuild` on the real folder
- [ ] **5. Edge-to-edge** — safe-area insets on custom headers, bottom controls, modals
- [ ] **6. Verify** — API 36 emulator with 16 KB pages, then phone

## Keep during the native merge

Release signing, ABI filters, `StockfishChessEngine_*SdkVersion` overrides (set to 36),
`org.gradle.java.home`, manifest, icons and splash, `file_paths.xml`. Set `targetSdk` explicitly.

## Verification checklist

- [ ] Engine starts, analyses, stops, restarts
- [ ] Install over the current version keeps all data
- [ ] Backup, restore, PGN import, `.kbook` import
- [ ] Back button / gesture in modals and mid-drill
- [ ] Startup with a large repertoire still fast
- [ ] Nothing under system bars, portrait and landscape

## Risks / open points

- No safe-area handling found in `src/`: phase 5 is likely the most visible work
- The wrapper has old Gradle settings (`jcenter()`); compatibility only shows in phase 4
- SDK 54's default NDK believed to be r27 (needs the flags) — unconfirmed
- Out of scope: app sends `Use NNUE value false` yet embeds the network (see `StockfishBridge.ts`)

## Log

- 2026-11-26, phase 0: on SDK 52, `tsc --noEmit` clean, 34 suites / 537 tests pass.
- 2026-11-26, phase 1: patch in `patches/`, applied by `postinstall`. `assembleDebug` succeeds;
  `libstockfish.so` went from `0x1000` to `0x4000`. Engine not yet run on a device.
  Still 4 KB in the APK, to recheck after phase 4: `libc++_shared`, `libcrsqlite`, `libexpo-*`,
  Hermes, RN, Fresco, Reanimated/worklets, screens, JSI. Check with `llvm-readelf -lW`
  (`LOAD` alignment); `zipalign -P 16` passed even with these, so it is not sufficient.
