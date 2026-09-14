import test from 'node:test';
import assert from 'node:assert/strict';
import {
  initialView,
  viewReducer,
  NavigationSequence,
} from '../lib/projects/workspace-state';
import { projectViewURL } from '../lib/projects/navigation';
void test('viewer controls preserve comparison selection and comparison changes clear only highlights', () => {
  const compared = viewReducer(initialView, {
    type: 'comparison',
    value: { from: 'v1', to: 'v3' },
  });
  const focused = viewReducer(compared, {
    type: 'viewer',
    value: { focus: true, mode: 'comparison', highlightId: 'part' },
  });
  assert.deepEqual(focused.comparison, compared.comparison);
  const swapped = viewReducer(focused, {
    type: 'comparison',
    value: { from: 'v3', to: 'v1' },
  });
  assert.equal(swapped.viewer.focus, true);
  assert.equal(swapped.viewer.highlightId, null);
  assert.equal(initialView.comparison, null);
});
void test('navigation completion ignores stale work and URLs carry explicit editing targets', () => {
  const sequence = new NavigationSequence(),
    old = sequence.next(),
    next = sequence.next();
  assert.equal(sequence.isCurrent(old), false);
  assert.equal(sequence.isCurrent(next), true);
  assert.equal(
    projectViewURL('p', { branchId: 'b', revisionId: 'v' }),
    '/api/projects/p?branch=b&revision=v',
  );
});
