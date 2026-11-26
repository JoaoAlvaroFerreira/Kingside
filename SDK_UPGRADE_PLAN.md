# Expo SDK 52 → 54 upgrade

Goal: target API 36 and 16 KB page size support (Play requirements).

SDK 54, not latest: it reaches API 36 and is the last SDK with the legacy architecture,
which the Stockfish wrapper was written for. A further upgrade will be needed later.

Branch: `release` (`master` stays on SDK 52 until the first release is finalized)

## Where we left off (2026-11-26)

**Start here:** the release build fails (Metaspace) — item 0 under "Next session".

- Done: SDK 54 upgrade and edge-to-edge insets, pushed to `release`; `master` unchanged.
  `tsc` clean, 537/537 tests. Debug APK targets API 36, 64-bit libraries 16 KB aligned.
  On the emulator: installed over beta.2 keeping data, loaded, engine started, training header
  and move arrows clear the system bars.
- Do not install `app-release.apk` from the build folder: stale 22 Nov build targeting API 34.
- Not checked: landscape, modals, game review, PGN and `.kbook` import, backup/restore, engine
  output, 16 KB-page emulator, physical phone. **Export a phone backup before installing.**
- Machine: the builds installed SDK 36 and NDK 27 components. The emulator has the new build,
  engine analysis switched on and a test move played; its storage is nearly full (see the
  run skill). `issues.txt` is untracked.

## Progress

- [ ] **0. Baseline** — branch ✅, `tsc` ✅ and 537/537 tests ✅; **still to do (manual): export a DB backup from the phone**
- [x] **1. Engine spike** — 16 KB linker flags in the wrapper's `CMakeLists.txt` via `patch-package`; build on SDK 52.
      Done when `arm64-v8a` and `x86_64` `libstockfish.so` are 16 KB aligned
- [x] **2. JS upgrade** — `expo@54`, `expo install --fix` (RN 0.81, React 19); `newArchEnabled=false`; stay on Reanimated 3
- [x] **3. Code changes** — `expo-file-system/legacy` imports (6 files); React 19 type errors;
      remove `react-native-paper` and `@react-navigation/bottom-tabs` if confirmed unused
- [x] **4. Native project** — generate a fresh SDK 54 template outside the repo, merge into `android/` by hand.
      Never run `prebuild` on the real folder
- [ ] **5. Edge-to-edge** — insets added (root, headerless screens, chapter picker); **landscape, modals and game review not yet checked**
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

## Next session

0. **Release build is broken**: out of Metaspace in `minifyReleaseWithR8` and
   `lintVitalAnalyzeRelease` (plus a lint crash in `expo-modules-core`, possibly a knock-on).
   Try raising `-XX:MaxMetaspaceSize` (now 512m) in `android/gradle.properties`, then recheck
   target SDK and 16 KB alignment on the release APK
1. Phase 6: landscape, chapter picker, game review, other modals, back button/gesture
2. PGN import, `.kbook` import, backup and restore (the file-system code changed import path)
3. Engine: confirm analysis output, stop and restart
4. Run on a 16 KB-page emulator image (needs downloading)
5. Phone: **export a database backup first**, then install the release APK
6. Update the rest of `CLAUDE.md` if behaviour differs, then merge `release` into `master`

Other Play Store work is listed in `PLAYSTORE_TODO.md`.

## Risks / open points

- SDK 54 uses NDK 27.1, so the engine linker patch stays necessary
- Reanimated 3.19 and the legacy architecture end here: the next SDK upgrade needs both replaced
- Out of scope: app sends `Use NNUE value false` yet embeds the network (see `StockfishBridge.ts`)

## Log

- 2026-11-26, phase 0: on SDK 52, `tsc --noEmit` clean, 34 suites / 537 tests pass.
- 2026-11-26, phase 1: patch in `patches/`, applied by `postinstall`. `assembleDebug` succeeds;
  `libstockfish.so` went from `0x1000` to `0x4000`. Engine not yet run on a device.
  Still 4 KB in the APK, to recheck after phase 4: `libc++_shared`, `libcrsqlite`, `libexpo-*`,
  Hermes, RN, Fresco, Reanimated/worklets, screens, JSI. Check with `llvm-readelf -lW`
  (`LOAD` alignment); `zipalign -P 16` passed even with these, so it is not sufficient.
- 2026-11-26, phases 2–4: Expo 54, RN 0.81.5, React 19.1, Reanimated held at 3.19 (legacy arch,
  listed in `expo.install.exclude`). `tsc` clean, 537/537 tests. Native files merged from
  `expo-template-bare-minimum@54.0.55`; Gradle 8.14.3, NDK 27.1. Debug APK: target/compile 36,
  all 38 64-bit libraries 16 KB aligned. Release (R8) build and device run not yet verified.
- 2026-11-26: added `babel-preset-expo` (no longer hoisted; bundling failed without it).
  Phase 5: bottom/side inset at the navigator root, top inset on the headerless screens and the
  chapter picker. Emulator (API 36.1, 4 KB pages, x86_64 debug): installs over beta.2 keeping
  data, loads, engine reaches ready, training header and move arrows clear the system bars.
  Not yet checked: landscape, chapter picker, game review, other modals, import, backup/restore,
  eval correctness, a 16 KB-page image, a physical phone.
  Seen once: Master tab read 0 for a while after leaving a training session, then correct
  (2,000). Not compared with SDK 52.
- 2026-11-26: `assembleRelease` failed (Metaspace); not fixed yet. The `app-release.apk` on disk
  dated 22 Nov is a stale SDK 52 build (targets 34) — do not install or publish it.
  After the doc updates: `tsc` clean, 537/537 tests.
