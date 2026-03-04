import { ScreenSettingsService } from '../ScreenSettingsService';

describe('ScreenSettingsService', () => {
  describe('getDefaults', () => {
    it('returns xlarge board size for all screens', () => {
      const defaults = ScreenSettingsService.getDefaults();
      expect(defaults.analysis.boardSize).toBe('xlarge');
      expect(defaults.repertoire.boardSize).toBe('xlarge');
      expect(defaults.gameReview.boardSize).toBe('xlarge');
      expect(defaults.training.boardSize).toBe('xlarge');
    });

    it('returns engine disabled by default for all screens', () => {
      const defaults = ScreenSettingsService.getDefaults();
      expect(defaults.analysis.engineEnabled).toBe(false);
      expect(defaults.repertoire.engineEnabled).toBe(false);
      expect(defaults.gameReview.engineEnabled).toBe(false);
      expect(defaults.training.engineEnabled).toBe(false);
    });

    it('returns coordinates visible by default', () => {
      const defaults = ScreenSettingsService.getDefaults();
      expect(defaults.analysis.coordinatesVisible).toBe(true);
      expect(defaults.repertoire.coordinatesVisible).toBe(true);
    });
  });
});
