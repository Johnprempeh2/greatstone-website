import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';

function findElement(node, predicate) {
  if (Array.isArray(node)) return node.map((child) => findElement(child, predicate)).find(Boolean);
  if (!node || typeof node !== 'object') return null;
  if (predicate(node)) return node;
  return findElement(node.props?.children, predicate);
}

test('verified case inline edits retain their index in the full case list', async () => {
  const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  try {
    const { TwoDoorsProof } = await server.ssrLoadModule('/src/blocks/TwoDoors.jsx');
    const cases = [
      { headline: 'Draft', result: 'Draft result', verified: false },
      { headline: 'Approved', result: 'Approved result', verified: true },
    ];
    const proof = TwoDoorsProof({ id: 'proof', cases, proofKicker: 'Proof' });
    const carousel = findElement(proof, (element) => element.type?.name === 'Carousel');
    assert.ok(carousel);
    const slide = carousel.props.render(cases[1], 0);
    const headline = findElement(slide, (element) => element.props?.field === 'headline' && element.props?.arrayField === 'cases');
    assert.equal(headline?.props.index, 1);
  } finally {
    await server.close();
  }
});
