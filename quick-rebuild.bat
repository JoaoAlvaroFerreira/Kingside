@echo off
echo ========================================
echo Kingside Quick Rebuild Script
echo ========================================
echo.

echo [1/2] Building debug APK...
cd android
call gradlew assembleDebug
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo ERROR: Build failed!
    cd ..
    pause
    exit /b 1
)
cd ..

echo.
echo [2/2] Installing APK...
adb install -r android\app\build\outputs\apk\debug\app-debug.apk
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo ERROR: Installation failed!
    echo Make sure a device/emulator is connected and USB debugging is enabled.
    pause
    exit /b 1
)

echo.
echo ========================================
echo SUCCESS! App rebuilt and installed.
echo ========================================
pause
