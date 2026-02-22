@echo off
setlocal

if "%~1"=="" (
    echo Usage: release.bat v1.0.0
    echo.
    echo This will build the release APK, tag the commit, and create a GitHub release.
    exit /b 1
)

set TAG=%~1
set APK_SRC=android\app\build\outputs\apk\release\app-release.apk
set APK_OUT=Kingside.apk

echo ========================================
echo Releasing %TAG%
echo ========================================
echo.

REM Build the release APK
call build-release-apk.bat --ci
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Build failed. Aborting release.
    exit /b 1
)

REM Rename APK
copy /Y "%APK_SRC%" "%APK_OUT%" >nul
echo.

REM Delete existing GitHub release if it exists
echo Cleaning up previous %TAG% release (if any)...
gh release delete %TAG% --yes 2>nul
git push origin --delete %TAG% 2>nul
git tag -d %TAG% 2>nul

echo.
echo Creating tag %TAG%...
git tag %TAG%
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Failed to create tag.
    exit /b 1
)

echo Pushing tag %TAG%...
git push origin %TAG%
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Failed to push tag.
    exit /b 1
)

echo Creating GitHub release...
gh release create %TAG% "%APK_OUT%" --title "%TAG%" --generate-notes
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Failed to create GitHub release.
    exit /b 1
)

del "%APK_OUT%" >nul 2>nul

echo.
echo ========================================
echo Release %TAG% created with %APK_OUT%!
echo https://github.com/JoaoAlvaroFerreira/Kingside/releases/tag/%TAG%
echo ========================================
