@echo off
echo ========================================
echo Kingside Release Build
echo ========================================
echo.

if not exist "android\keystore.properties" (
    echo WARNING: android\keystore.properties not found.
    echo The APK will be signed with the debug key.
    echo Run 'keytool -genkeypair ...' to create a release keystore.
    echo See DEVELOPMENT.md Phase 1.1 for instructions.
    echo.
)

echo [1/3] Type checking...
call npx tsc --noEmit
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: TypeScript errors found. Fix them before building.
    pause
    exit /b 1
)

echo [2/3] Running tests...
call npx jest --forceExit
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Tests failed. Fix them before building.
    pause
    exit /b 1
)

echo [3/3] Building release APK...
cd android
call gradlew assembleRelease
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Build failed. Check the output above.
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
    if %ERRORLEVEL% NEQ 0 (
        echo ERROR: Install failed. Is a device connected with USB debugging enabled?
    ) else (
        echo Installed successfully.
    )
)
pause
