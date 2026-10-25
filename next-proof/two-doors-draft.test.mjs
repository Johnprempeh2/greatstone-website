import assert from 'node:assert/strict';
import test from 'node:test';
import { splitTwoDoorsToolsDraft } from './two-doors-draft.mjs';

test('old tools draft becomes three selectable blocks without losing content or its original id', () => {
  const original = { root: { props: { title: 'Home' } }, content: [
    { type: 'TwoDoorsTools', props: { id: 'tools-1', toolsHeading: 'Tools', tools: [{ name: 'One' }], closeHeading: 'Talk', closeLine: 'Next step', contactHref: '#contact', bottomHeading: 'Choose', bottomTools: 'Tools', toolsHref: '#tools' } },
  ] };
  const split = splitTwoDoorsToolsDraft(original);
  assert.deepEqual(split.content.map((block) => [block.type, block.props.id]), [
    ['TwoDoorsTools', 'tools-1'], ['TwoDoorsClose', 'tools-1-close'], ['TwoDoorsBottom', 'tools-1-choice'],
  ]);
  assert.deepEqual(split.content[0].props.tools, [{ name: 'One' }]);
  assert.equal(split.content[1].props.contactHref, '#contact');
  assert.equal(split.content[2].props.toolsHref, '#tools');
  assert.equal(split.content[0].props.closeHeading, undefined);
  assert.equal(splitTwoDoorsToolsDraft(split), split);
  assert.equal(original.content.length, 1);
});
