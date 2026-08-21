#!/usr/bin/env node
/**
 * Version bump script — syncs version across package.json, app.json, and build.gradle.
 * Usage: node scripts/bump-version.js <semver>
 * Examples: node scripts/bump-version.js 1.2.0  /  1.0.0-beta.1
 */

const fs = require('fs');
const path = require('path');

const newVersion = process.argv[2];

// Accept a plain semver or a prerelease like 1.0.0-beta.1.
const parsed = /^(\d+)\.(\d+)\.(\d+)(?:-(alpha|beta|rc)\.(\d+))?$/.exec(newVersion || '');
if (!parsed) {
  console.error('Usage: node scripts/bump-version.js <semver>');
  console.error('Examples: 1.2.0, 1.0.0-beta.1');
  process.exit(1);
}

const [, majorStr, minorStr, patchStr, channel, channelNumStr] = parsed;
const [major, minor, patch] = [majorStr, minorStr, patchStr].map(Number);

// versionCode must rise monotonically and a prerelease must sort *below* the
// release it precedes, so each patch level owns a block of 100 codes: betas
// take a slot inside it and the final release takes the top slot. The old
// major*10000 scheme is left far below, so upgrades over a shipped APK work.
const CHANNEL_BASE = { alpha: 0, beta: 30, rc: 60 };
const RELEASE_SLOT = 99;
let slot = RELEASE_SLOT;
if (channel) {
  slot = CHANNEL_BASE[channel] + Number(channelNumStr);
  if (slot >= RELEASE_SLOT) {
    console.error(`Prerelease number too high: ${newVersion} does not fit below the release slot.`);
    process.exit(1);
  }
}
const versionCode = major * 1000000 + minor * 10000 + patch * 100 + slot;

// Update package.json
const pkgPath = path.join(__dirname, '..', 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
const oldVersion = pkg.version;
pkg.version = newVersion;
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
console.log(`package.json: ${oldVersion} → ${newVersion}`);

// Update app.json
const appPath = path.join(__dirname, '..', 'app.json');
const app = JSON.parse(fs.readFileSync(appPath, 'utf8'));
app.expo.version = newVersion;
fs.writeFileSync(appPath, JSON.stringify(app, null, 2) + '\n');
console.log(`app.json: expo.version → ${newVersion}`);

// Update android/app/build.gradle
const gradlePath = path.join(__dirname, '..', 'android', 'app', 'build.gradle');
let gradle = fs.readFileSync(gradlePath, 'utf8');
gradle = gradle.replace(/versionCode \d+/, `versionCode ${versionCode}`);
gradle = gradle.replace(/versionName "[^"]*"/, `versionName "${newVersion}"`);
fs.writeFileSync(gradlePath, gradle);
console.log(`build.gradle: versionCode → ${versionCode}, versionName → ${newVersion}`);

console.log(`\nVersion bumped to ${newVersion} (versionCode: ${versionCode})`);
