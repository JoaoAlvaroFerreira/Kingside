jest.mock('react-native', () => ({ Platform: { OS: 'android' } }));

const mockFs = {
  documentDirectory: 'file:///mock-documents/',
  EncodingType: { Base64: 'base64' },
  getInfoAsync: jest.fn(),
  readAsStringAsync: jest.fn(),
  writeAsStringAsync: jest.fn().mockResolvedValue(undefined),
  copyAsync: jest.fn().mockResolvedValue(undefined),
  deleteAsync: jest.fn().mockResolvedValue(undefined),
  StorageAccessFramework: {
    requestDirectoryPermissionsAsync: jest.fn(),
    createFileAsync: jest.fn().mockResolvedValue('content://target/kingside.db'),
  },
};
jest.mock('expo-file-system', () => mockFs);

const mockPicker = { getDocumentAsync: jest.fn() };
jest.mock('expo-document-picker', () => mockPicker);

const mockDb = {
  databaseFilePath: 'file:///mock-documents/SQLite/kingside.db',
  checkpoint: jest.fn().mockResolvedValue(undefined),
  close: jest.fn().mockResolvedValue(undefined),
  deleteDatabase: jest.fn().mockResolvedValue(undefined),
};
jest.mock('@services/database/DatabaseService', () => ({ DatabaseService: mockDb }));

import { BackupService } from '../BackupService';

// "SQLite format 3\0" followed by padding, base64-encoded — a valid file header.
const SQLITE_HEADER_B64 = Buffer.from('SQLite format 3\0', 'binary').toString('base64');
const NOT_SQLITE_B64 = Buffer.from('PK\x03\x04 zip file!!', 'binary').toString('base64');

beforeEach(() => {
  jest.clearAllMocks();
  (global as any).atob = (b64: string) => Buffer.from(b64, 'base64').toString('binary');
});

describe('exportDatabase', () => {
  beforeEach(() => {
    mockFs.getInfoAsync.mockResolvedValue({ exists: true, size: 2 * 1024 * 1024 });
    mockFs.readAsStringAsync.mockResolvedValue('ZGF0YQ==');
    mockFs.StorageAccessFramework.requestDirectoryPermissionsAsync.mockResolvedValue({
      granted: true,
      directoryUri: 'content://picked-dir',
    });
  });

  // With WAL enabled the newest commits live in the -wal sidecar; copying the
  // .db without checkpointing first silently drops them.
  it('checkpoints the WAL before reading the database file', async () => {
    const result = await BackupService.exportDatabase();

    expect(result.status).toBe('ok');
    expect(mockDb.checkpoint).toHaveBeenCalled();
    const checkpointOrder = mockDb.checkpoint.mock.invocationCallOrder[0];
    const readOrder = mockFs.readAsStringAsync.mock.invocationCallOrder[0];
    expect(checkpointOrder).toBeLessThan(readOrder);
  });

  it('writes nothing when the user declines the folder picker', async () => {
    mockFs.StorageAccessFramework.requestDirectoryPermissionsAsync.mockResolvedValue({
      granted: false,
    });

    const result = await BackupService.exportDatabase();

    expect(result.status).toBe('cancelled');
    expect(mockFs.writeAsStringAsync).not.toHaveBeenCalled();
  });

  it('reports an error rather than writing an empty file when no database exists', async () => {
    mockFs.getInfoAsync.mockResolvedValue({ exists: false });

    const result = await BackupService.exportDatabase();

    expect(result.status).toBe('error');
    expect(mockFs.StorageAccessFramework.createFileAsync).not.toHaveBeenCalled();
  });
});

describe('importDatabase', () => {
  const pick = (uri: string) => {
    mockPicker.getDocumentAsync.mockResolvedValue({
      canceled: false,
      assets: [{ uri, name: 'backup.db' }],
    });
    mockFs.getInfoAsync.mockResolvedValue({ exists: true, size: 1024 });
  };

  it('restores a valid backup, closing the connection before overwriting', async () => {
    pick('file:///cache/backup.db');
    mockFs.readAsStringAsync.mockResolvedValue(SQLITE_HEADER_B64);

    const result = await BackupService.importDatabase();

    expect(result.status).toBe('ok');
    expect(mockFs.copyAsync).toHaveBeenCalledWith({
      from: 'file:///cache/backup.db',
      to: mockDb.databaseFilePath,
    });
    // Replacing the file under a live connection, or leaving a stale -wal
    // sidecar next to a swapped-in .db, corrupts the database.
    expect(mockDb.close.mock.invocationCallOrder[0])
      .toBeLessThan(mockFs.copyAsync.mock.invocationCallOrder[0]);
    expect(mockDb.deleteDatabase.mock.invocationCallOrder[0])
      .toBeLessThan(mockFs.copyAsync.mock.invocationCallOrder[0]);
  });

  // The destructive-mistake guard: picking the wrong file must not wipe the DB.
  it('leaves the database untouched when the file is not SQLite', async () => {
    pick('file:///cache/photo.zip');
    mockFs.readAsStringAsync.mockResolvedValue(NOT_SQLITE_B64);

    const result = await BackupService.importDatabase();

    expect(result.status).toBe('error');
    expect(mockDb.deleteDatabase).not.toHaveBeenCalled();
    expect(mockFs.copyAsync).not.toHaveBeenCalled();
  });

  it('does nothing when the picker is cancelled', async () => {
    mockPicker.getDocumentAsync.mockResolvedValue({ canceled: true });

    const result = await BackupService.importDatabase();

    expect(result.status).toBe('cancelled');
    expect(mockDb.deleteDatabase).not.toHaveBeenCalled();
    expect(mockFs.copyAsync).not.toHaveBeenCalled();
  });

  // Without atob the header cannot be checked; refusing a genuine backup then
  // would be worse than proceeding, so the restore is allowed through.
  it('proceeds when the header cannot be decoded', async () => {
    pick('file:///cache/backup.db');
    mockFs.readAsStringAsync.mockResolvedValue(SQLITE_HEADER_B64);
    delete (global as any).atob;

    const result = await BackupService.importDatabase();

    expect(result.status).toBe('ok');
    expect(mockFs.copyAsync).toHaveBeenCalled();
  });
});
