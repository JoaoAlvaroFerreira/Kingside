const mockDb = {
  execAsync: jest.fn().mockResolvedValue(undefined),
  runAsync: jest.fn().mockResolvedValue({ changes: 1 }),
  getAllAsync: jest.fn().mockResolvedValue([]),
  getFirstAsync: jest.fn().mockResolvedValue(null),
  withTransactionAsync: jest.fn().mockImplementation(async (fn) => fn()),
};

const openDatabaseAsync = jest.fn().mockResolvedValue(mockDb);

module.exports = { openDatabaseAsync, _mockDb: mockDb };
