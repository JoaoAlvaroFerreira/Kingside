@echo off
setlocal

if "%~1"=="" (
    echo Usage: release.bat v1.3.0
    echo.
    echo This will bump the version, build the release APK, tag the commit,
    echo and create a GitHub release.
    exit /b 1
)

set TAG=%~1
set APK_SRC=android\app\build\outputs\apk\release\app-release.apk
set APK_OUT=Kingside.apk

REM Strip a leading "v" to get the bare semver the bump script expects.
set VERSION=%TAG%
if "%TAG:~0,1%"=="v" set VERSION=%TAG:~1%

echo ========================================
echo Releasing %TAG%
echo ========================================
echo.

REM Stamp the version into package.json, app.json and build.gradle BEFORE the
REM build, so the APK actually carries it. Skipping this is how every release
REM from v1.0.4 to v1.4.3 shipped as versionName 1.0.0 / versionCode 10000.
echo Setting version to %VERSION%...
call node "%~dp0scripts\bump-version.js" %VERSION%
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Version bump failed. Aborting release.
    exit /b 1
)

REM Commit the bump so the tag points at a commit that contains it. Re-running
REM a release with no version change leaves nothing to commit, which is fine.
git diff --quiet --exit-code package.json app.json android\app\build.gradle
if %ERRORLEVEL% NEQ 0 (
    git add package.json app.json android\app\build.gradle
    git commit -m "Release %TAG%"
    REM "if errorlevel" evaluates at runtime; %ERRORLEVEL% inside a parenthesized
    REM block is expanded when the block is parsed, so it would read a stale value.
    if errorlevel 1 (
        echo ERROR: Failed to commit version bump.
        exit /b 1
    )
) else (
    echo Version files already at %VERSION%, nothing to commit.
)
echo.

REM Build the release APK
REM NOTE: must use an explicit path (%~dp0), not a bare filename - some
REM shells/sandboxes that hand off to cmd.exe don't replicate cmd's
REM implicit "search CWD first" behavior for bare command names.
call "%~dp0build-release-apk.bat" --ci
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

echo Pushing %TAG% and the release commit...
git push origin HEAD
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Failed to push branch.
    exit /b 1
)
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
