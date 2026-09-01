/**
 * "Alternatives": the branches a depth-first drill did not take.
 *
 * The question these answer is asked mid-drill — "what does my repertoire say against
 * their *other* replies to the move I just played?" — and depth-first will not reach those
 * branches until much later, if at all.
 */

import { TrainingService } from '../TrainingService';
import { MoveTree } from '@utils/MoveTree';
import { Repertoire, RepertoireColor, TrainingConfig } from '@types';

/** A chapter whose tree branches: each entry is a full line of SAN from the root. */
function chapter(id: string, lines: string[][]) {
  const tree = new MoveTree();
  for (const line of lines) {
    tree.goToStart();
    for (const san of line) {
      const existing = (tree.getCurrentNode()?.children ?? tree.getRootMoves())
        .find(child => child.san === san);
      if (existing) tree.navigateToNode(existing.id);
      else tree.addMove(san);
    }
  }
  return {
    id, name: id, pgn: '', moveTree: tree.toJSON(), order: 0,
    createdAt: new Date(0), updatedAt: new Date(0),
  };
}

function repertoire(color: RepertoireColor, chapters: ReturnType<typeof chapter>[]): Repertoire {
  return {
    id: 'rep1', name: 'Test', color, openingType: 'Other' as any, eco: '',
    chapters, createdAt: new Date(0), updatedAt: new Date(0),
  };
}

function session(rep: Repertoire, over: Partial<TrainingConfig> = {}) {
  return TrainingService.startSession(
    { repertoireId: rep.id, selection: { kind: 'all' }, order: 'depth-first', guidance: 'none', ...over },
    rep,
    []
  );
}

const sans = (line: { moves: Array<{ san: string }> }) => line.moves.map(m => m.san);

describe('alternativesAtCurrentPosition', () => {
  it('offers the opponent replies this line passed over, each with its answer', () => {
    const rep = repertoire('white', [chapter('ch1', [
      ['e4', 'c5', 'Nf3'],
      ['e4', 'e5', 'Nf3'],
      ['e4', 'e6', 'd4'],
    ])]);
    const sess = session(rep);
    sess.currentMoveIndex = 1; // being asked for 2.Nf3 against 1...c5

    const alternatives = TrainingService.alternativesAtCurrentPosition(sess, rep);

    expect(alternatives.map(sans)).toEqual([['e5', 'Nf3'], ['e6', 'd4']]);
  });

  it('finds them in the other chapters, where a repertoire usually files them', () => {
    // Drilling the Sicilian chapter and asking what meets 1...e5 is the whole case: the
    // answer is never in the chapter you are drilling.
    const rep = repertoire('white', [
      chapter('sicilian', [['e4', 'c5', 'Nf3']]),
      chapter('french', [['e4', 'e6', 'd4']]),
    ]);
    const sess = session(rep);
    sess.currentMoveIndex = 1;

    const alternatives = TrainingService.alternativesAtCurrentPosition(sess, rep);

    expect(alternatives.map(sans)).toEqual([['e6', 'd4']]);
    expect(alternatives[0].chapterId).toBe('french');
  });

  it('answers the case it was asked for: their first move, drilling as Black', () => {
    const rep = repertoire('black', [chapter('ch1', [
      ['e4', 'e5', 'Nf3', 'Nc6'],
      ['d4', 'd5'],
      ['c4', 'e5'],
    ])]);
    const sess = session(rep);

    // The very first thing you are asked as Black is a reply to their first move, so the
    // alternatives are their other first moves.
    const alternatives = TrainingService.alternativesAtCurrentPosition(sess, rep);

    expect(alternatives.map(sans)).toEqual([['d4', 'd5'], ['c4', 'e5']]);
  });

  it('stops at the answer, however deep the line it came from runs', () => {
    const rep = repertoire('black', [chapter('ch1', [
      ['e4', 'e5'],
      ['d4', 'd5', 'c4', 'e6', 'Nc3', 'Nf6'],
    ])]);
    const sess = session(rep);

    const alternatives = TrainingService.alternativesAtCurrentPosition(sess, rep);

    // A detour, not a second session: one reply, one answer.
    expect(alternatives.map(sans)).toEqual([['d4', 'd5']]);
  });

  it('lists a reply once, however many lines continue from it', () => {
    const rep = repertoire('black', [chapter('ch1', [
      ['e4', 'e5'],
      ['d4', 'd5', 'c4', 'e6'],
      ['d4', 'd5', 'Nf3', 'Nf6'],
    ])]);
    const sess = session(rep);

    const alternatives = TrainingService.alternativesAtCurrentPosition(sess, rep);

    expect(alternatives.map(sans)).toEqual([['d4', 'd5']]);
  });

  it('never offers the branch you are already on', () => {
    const rep = repertoire('black', [chapter('ch1', [['e4', 'e5'], ['d4', 'd5']])]);
    const sess = session(rep);

    const alternatives = TrainingService.alternativesAtCurrentPosition(sess, rep);

    expect(alternatives.map(sans)).not.toContainEqual(['e4', 'e5']);
  });

  it('has nothing to offer when nothing led into the position', () => {
    // As White the first move of a line is your own: no reply was made to branch from.
    const rep = repertoire('white', [chapter('ch1', [['e4', 'c5', 'Nf3'], ['d4', 'd5', 'c4']])]);
    const sess = session(rep);

    expect(TrainingService.alternativesAtCurrentPosition(sess, rep)).toEqual([]);
    expect(TrainingService.startAlternativesSession(sess, rep)).toBeNull();
  });

  it('builds a width-first detour that keeps the drill settings', () => {
    const rep = repertoire('black', [chapter('ch1', [['e4', 'e5'], ['d4', 'd5'], ['c4', 'e5']])]);
    const sess = session(rep, { guidance: 'semi-learn' });

    const detour = TrainingService.startAlternativesSession(sess, rep)!;

    expect(detour.order).toBe('width-first');
    expect(detour.guidance).toBe('semi-learn');
    expect(detour.color).toBe('black');
    expect(detour.lines).toHaveLength(2);
    expect(detour.holdbackLines).toEqual([]);
    // Fragment ids, so a two-move detour can never be mistaken for evidence about the
    // whole line it was cut from.
    expect(detour.lines.every(l => l.id.startsWith('alt:'))).toBe(true);
  });

  it('leaves the interrupted session exactly where it was', () => {
    const rep = repertoire('black', [chapter('ch1', [['e4', 'e5'], ['d4', 'd5']])]);
    const sess = session(rep);
    const before = { line: sess.currentLineIndex, move: sess.currentMoveIndex, lines: sess.lines };

    TrainingService.startAlternativesSession(sess, rep);

    expect(sess.currentLineIndex).toBe(before.line);
    expect(sess.currentMoveIndex).toBe(before.move);
    expect(sess.lines).toBe(before.lines);
  });
});
