const store = {};

const AsyncStorage = {
  getItem: jest.fn((key) => Promise.resolve(store[key] ?? null)),
  setItem: jest.fn((key, value) => { store[key] = value; return Promise.resolve(); }),
  removeItem: jest.fn((key) => { delete store[key]; return Promise.resolve(); }),
  multiRemove: jest.fn((keys) => { keys.forEach(k => delete store[k]); return Promise.resolve(); }),
  clear: jest.fn(() => { Object.keys(store).forEach(k => delete store[k]); return Promise.resolve(); }),
  _store: store,
  _reset: () => { Object.keys(store).forEach(k => delete store[k]); },
};

module.exports = AsyncStorage;
module.exports.default = AsyncStorage;
