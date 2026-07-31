---
name: run-kingside-app
description: Launch the Kingside Expo dev-client app on the Android emulator and connect it to Metro so it can be driven with mobile-mcp. Use whenever asked to run, test, or verify a change in the actual app on-device.
---

# Running Kingside on the Android emulator

This is an Expo (bare-workflow, no `expo prebuild`) dev-client app — launching
the package alone opens Expo's native **Dev Launcher** screen, not the app.
It gets stuck on a plain splash unless explicitly pointed at Metro. Follow
these steps in order; skipping the deep-link step is the most common failure
mode (app appears to hang on a white/splash screen indefinitely).

## 1. Confirm a device is available

```bash
adb devices
```

If nothing is listed, ask the user to start the emulator (or use
`mobile_list_available_devices` if driving via mobile-mcp) before continuing.

## 2. Build + install the debug APK (skip if already installed and unchanged)

Do **not** run `quick-rebuild.bat` directly from a tool — it ends with a
`pause` that hangs non-interactive shells. Run the two steps manually instead:

```bash
cd android && ./gradlew assembleDebug
cd ..
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```

The package name is `com.kingside.app`.

## 3. Make sure Metro is running and reachable

```bash
netstat -an | grep 8081   # confirm Metro is listening; if not, run `npm start` in the background
adb reverse tcp:8081 tcp:8081
```

`adb reverse` is required even though the emulator can usually reach the host
— without it the Dev Launcher's "Loading from 127.0.0.1:8081…" step can stall.

## 4. Launch and deep-link straight into Metro

Launching the app normally (`mobile_launch_app` / `am start -n
com.kingside.app/.MainActivity`) opens `DevLauncherActivity`, which shows the
branded splash and waits for manual input — it will **not** auto-connect.
Skip that screen entirely with a deep link into the dev-client:

```bash
adb shell am start -a android.intent.action.VIEW \
  -d "exp+kingside://expo-development-client/?url=http%3A%2F%2Flocalhost%3A8081"
```

(`exp+kingside` is this app's dev-client scheme, registered in
`android/app/src/main/AndroidManifest.xml`.)

## 5. Confirm the JS bundle actually loaded

First bundle compile can take 30–90s. Poll logcat rather than guessing with a
screenshot:

```bash
i=0; until adb logcat -d | grep -q "ReactNativeJS\|BUNDLE_ERROR"; do
  i=$((i+1)); [ $i -ge 20 ] && { echo TIMEOUT; break; }; sleep 3
done
```

Once you see `ReactNativeJS` lines (e.g. `Store: Loaded data:`), the app is
up. A `mobile_take_screenshot` should now show the Analysis Board / drawer,
not a splash.

## Driving the app with mobile-mcp afterward

- **Coordinates are in device pixel space, not screenshot pixel space.**
  This emulator reports a 1080-wide screen but screenshots render at ~900px
  wide — clicking at a position eyeballed from the screenshot image will miss
  by ~15-20%. Always get real coordinates from
  `mobile_list_elements_on_screen` (each element's `coordinates.x/y` are in
  device space) and click those, not a visual estimate from the screenshot.
- After a state change (typing, navigating, toggling a switch), prefer
  re-calling `mobile_list_elements_on_screen` to confirm focus/state before
  the next action rather than chaining several blind clicks.
- Fresh installs have empty state (no repertoires/games). To test features
  that need repertoire data, import a small one first: Repertoire → Import
  Repertoire → paste PGN text (e.g. `1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4
  Nf6`) → Import.
