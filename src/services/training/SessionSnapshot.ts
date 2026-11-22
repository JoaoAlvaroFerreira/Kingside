/**
 * One saved training session, so standby killing the process does not end the drill.
 *
 * Written once when the app leaves the foreground rather than after every move: a big
 * repertoire's holdback can be thousands of lines, which is too much to serialize per answer.
 */

import { TrainingSession } from '@types';
import { DatabaseService } from '@services/database/DatabaseService';

const KEY = 'training_session_snapshot';

export const SessionSnapshot = {
  async save(session: TrainingSession): Promise<void> {
    await DatabaseService.saveSetting(KEY, session);
  },

  async load(): Promise<TrainingSession | null> {
    const session = await DatabaseService.getSetting<TrainingSession>(KEY);
    return session && !session.isComplete ? session : null;
  },

  async clear(): Promise<void> {
    await DatabaseService.saveSetting(KEY, null);
  },
};
