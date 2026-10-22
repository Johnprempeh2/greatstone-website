import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

test('closed FAQ answers are inert in the React 18 Vite renderer', async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  try {
    const { Faq } = await vite.ssrLoadModule('/src/blocks/Faq.jsx');
    const props = { id: 'faq-test', items: [{ q: 'Question', a: 'Answer' }], showSchema: false };
    const closed = renderToStaticMarkup(React.createElement(Faq, props));
    assert.match(closed, /class="b-faq-a"[^>]*\binert=""/);

    const editing = renderToStaticMarkup(React.createElement(Faq, { ...props, puck: { isEditing: true } }));
    assert.doesNotMatch(editing, /class="b-faq-a"[^>]*\binert=/);
  } finally {
    await vite.close();
  }
});
