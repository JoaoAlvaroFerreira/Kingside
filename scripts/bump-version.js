#!/usr/bin/env node
/**
 * Version bump script — syncs version across package.json, app.json, and build.gradle.
 * Usage: node scripts/bump-version.js <semver>
 * Example: node scripts/bump-version.js 1.2.0
 */

const fs = require('fs');
const path = require('path');

const newVersion = process.argv[2];
if (!newVersion || !/^\d+\.\d+\.\d+$/.test(newVersion)) {
  console.error('Usage: node scripts/bump-version.js <semver>');
  console.error('Example: node scripts/bump-version.js 1.2.0');
  process.exit(1);
}

const [major, minor, patch] = newVersion.split('.').map(Number);
const versionCode = major * 10000 + minor * 100 + patch;

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
