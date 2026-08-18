import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system';
import * as DocumentPicker from 'expo-document-picker';
import { DatabaseService } from '@services/database/DatabaseService';

export interface BackupResult {
  status: 'ok' | 'cancelled' | 'error';
  message: string;
}

const backupFileName = (): string => {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `kingside-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}.db`;
};

class BackupServiceClass {
  /**
   * Write a copy of the SQLite database to a folder the user picks.
   *
   * Uses the Storage Access Framework rather than a share sheet so the file
   * lands somewhere the user can find again without any extra native module.
   */
  async exportDatabase(): Promise<BackupResult> {
    if (Platform.OS !== 'android') {
      return { status: 'error', message: 'Backup export is currently Android only.' };
    }

    try {
      // Fold the WAL back in first, or recent changes would be missing from the copy.
      await DatabaseService.checkpoint();

      const dbPath = DatabaseService.databaseFilePath;
      const info = await FileSystem.getInfoAsync(dbPath);
      if (!info.exists) {
        return { status: 'error', message: 'No database file found to export.' };
      }

      const permission = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
      if (!permission.granted) {
        return { status: 'cancelled', message: 'Export cancelled.' };
      }

      const contents = await FileSystem.readAsStringAsync(dbPath, {
        encoding: FileSystem.EncodingType.Base64,
      });

      const name = backupFileName();
      const targetUri = await FileSystem.StorageAccessFramework.createFileAsync(
        permission.directoryUri,
        name,
        'application/octet-stream'
      );
      await FileSystem.writeAsStringAsync(targetUri, contents, {
        encoding: FileSystem.EncodingType.Base64,
      });

      const sizeMb = ((info as { size?: number }).size ?? 0) / (1024 * 1024);
      return { status: 'ok', message: `Saved ${name} (${sizeMb.toFixed(1)} MB).` };
    } catch (e) {
      console.error('[Backup] Export failed:', e);
      return { status: 'error', message: `Export failed: ${e instanceof Error ? e.message : String(e)}` };
    }
  }

  /**
   * Replace the live database with a previously exported file.
   *
   * The connection is closed and the sidecars deleted before the copy, because
   * a stale -wal alongside a swapped-in .db would corrupt the result. The
   * caller is responsible for re-running store initialization afterwards.
   */
  async importDatabase(): Promise<BackupResult> {
    try {
      const picked = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        copyToCacheDirectory: true,
      });
      if (picked.canceled || !picked.assets?.length) {
        return { status: 'cancelled', message: 'Restore cancelled.' };
      }

      const source = picked.assets[0];
      const sourceInfo = await FileSystem.getInfoAsync(source.uri);
      if (!sourceInfo.exists) {
        return { status: 'error', message: 'Could not read the selected file.' };
      }

      if ((await this.readSqliteHeader(source.uri)) === 'not-sqlite') {
        return {
          status: 'error',
          message: 'That file is not a Kingside backup (missing SQLite header).',
        };
      }

      await DatabaseService.checkpoint();
      await DatabaseService.close();
      await DatabaseService.deleteDatabase();

      await FileSystem.copyAsync({ from: source.uri, to: DatabaseService.databaseFilePath });

      return { status: 'ok', message: `Restored from ${source.name ?? 'backup'}.` };
    } catch (e) {
      console.error('[Backup] Import failed:', e);
      return { status: 'error', message: `Restore failed: ${e instanceof Error ? e.message : String(e)}` };
    }
  }

  /**
   * Every SQLite file begins with a fixed 16-byte header, so reading the first
   * bytes keeps a mistaken pick from destroying the live database.
   *
   * 'unknown' is returned when the header cannot be read or decoded, and is
   * deliberately treated as passing: refusing a genuine backup because base64
   * decoding was unavailable would be worse than skipping the check.
   */
  private async readSqliteHeader(uri: string): Promise<'sqlite' | 'not-sqlite' | 'unknown'> {
    try {
      const head = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
        length: 16,
        position: 0,
      });
      const decode = typeof global.atob === 'function' ? global.atob : null;
      if (!decode) return 'unknown';
      return decode(head).startsWith('SQLite format 3') ? 'sqlite' : 'not-sqlite';
    } catch {
      return 'unknown';
    }
  }
}

export const BackupService = new BackupServiceClass();
