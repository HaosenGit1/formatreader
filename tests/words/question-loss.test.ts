import { describe, expect, test } from 'vitest';
import { lostToQuestionMarks } from '../../src/categories/words/shared/encoding/question-loss';

describe('lostToQuestionMarks', () => {
  test('Chinese saved as Windows-1252 CSV: flagged', () => {
    const csv = '??????????? (?6)  ?63?,,,\r\n2,???,,???????,PWR1? ???? 1 ?????\r\n3,??VSG,,???????,POWER? ????\r\n';
    expect(lostToQuestionMarks(csv)).toBeGreaterThan(40);
  });
  test('ordinary questions and code stay quiet', () => {
    expect(lostToQuestionMarks('What is this? Is it working? Yes. Why?\nOK?')).toBe(0);
    expect(lostToQuestionMarks('const x = a ?? b;\nconst y = c?.d ?? e;\nreturn x ?? y;\n'.repeat(3) + 'lots of ordinary code here '.repeat(20))).toBe(0);
    expect(lostToQuestionMarks('')).toBe(0);
  });
});
