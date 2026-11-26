# Play Store readiness

Assessed 2026-11-26 from a config check, not a full audit. Account and cloud system are separate.

## Blockers
- [ ] Target API 36 and 16 KB pages — see `SDK_UPGRADE_PLAN.md`
- [ ] Licensing: Stockfish is GPLv3, `LICENSE` is MIT. Decide before designing the cloud system
- [ ] Build an App Bundle (AAB), check download size, enrol in Play App Signing
- [ ] Remove `SYSTEM_ALERT_WINDOW` (main manifest) and `READ`/`WRITE_EXTERNAL_STORAGE`
- [ ] Privacy policy, Data safety form, content rating, store listing assets
- [ ] With accounts: in-app and web account deletion

## Before launch
- [ ] About screen: licences and credits (cburnett pieces are CC BY-SA)
- [ ] Hide `.kbook` and Chessable import (see `CLAUDE.md`)
- [ ] First-run experience (sample repertoire or guided import)
- [ ] Lichess "restricted resource" error (`issues.txt`; need exact wording)
- [ ] Verify on device: Stockfish, move-history arrows, startup time
- [ ] Crash reporting (Play Vitals may be enough at first)
- [ ] Accessibility labels
- [ ] Check the name "Kingside" is free

## Process
- [ ] New personal accounts (after 13 Nov 2023): closed test, 12 testers, 14 consecutive days
- [ ] Check developer identity verification in Play Console (unconfirmed third-party claim)

## Later
- [ ] `Use NNUE value false` while the network ships: enable it, or drop it to shrink the APK
