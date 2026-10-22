import test from 'node:test';
import assert from 'node:assert/strict';
import { changedBlockText } from './frame-conflict.mjs';

test('conflict comparison shows changed wording by block and field without raw props', () => {
  const mine = { content: [{ type: 'Hero', props: { id: 'a', title: 'My title', body: '<p>My body</p>', href: '/contact' } }] };
  const theirs = { content: [{ type: 'Hero', props: { id: 'a', title: 'Their title', body: '<p>My body</p>', href: '/about' } }] };
  assert.deepEqual(changedBlockText(mine, theirs), [{ id: 'a', name: 'Hero', fields: [{ label: 'Title', mine: 'My title', theirs: 'Their title' }] }]);
});

test('conflict comparison identifies wording in added and removed blocks', () => {
  const mine = { content: [{ type: 'Prose', props: { id: 'a', text: 'Keep this' } }] };
  const theirs = { content: [{ type: 'Hero', props: { id: 'b', title: 'New title' } }] };
  assert.deepEqual(changedBlockText(mine, theirs), [
    { id: 'a', name: 'Prose', fields: [{ label: 'Text', mine: 'Keep this', theirs: '' }] },
    { id: 'b', name: 'Hero', fields: [{ label: 'Title', mine: '', theirs: 'New title' }] },
  ]);
});

test('rich text comparison reads HTML entities and camel case labels', () => {
  const mine = { content: [{ type: 'Hero', props: { id: 'a', heroBody: '<p>One&nbsp;team &amp; goal</p>' } }] };
  const theirs = { content: [{ type: 'Hero', props: { id: 'a', heroBody: 'Another team' } }] };
  assert.deepEqual(changedBlockText(mine, theirs), [{ id: 'a', name: 'Hero', fields: [{ label: 'Hero Body', mine: 'One team & goal', theirs: 'Another team' }] }]);
});
