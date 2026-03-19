module.exports = {
  documentDirectory: 'file:///mock-documents/',
  deleteAsync: jest.fn().mockResolvedValue(undefined),
  getInfoAsync: jest.fn().mockResolvedValue({ exists: false }),
};
