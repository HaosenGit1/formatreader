import { expect, test } from 'vitest';
import { allViewers } from '../../src/categories';
import { VIEWER_LABELS } from '../../src/offline/labels';

test('every viewer has a name in the offline list (and no stale names)', () => {
  const ids = allViewers.map((v) => v.id).sort();
  expect(Object.keys(VIEWER_LABELS).sort()).toEqual(ids);
});
