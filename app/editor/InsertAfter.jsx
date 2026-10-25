'use client';
import { createUsePuck } from '@puckeditor/core';

const usePuck = createUsePuck();

export default function InsertAfter({ id }) {
  const dispatch = usePuck((state) => state.dispatch);
  return <button type="button" className="gs-frame-insert-after" data-puck-overlay-portal="true" onClick={(event) => {
    event.preventDefault(); event.stopPropagation();
    dispatch({ type: 'setUi', ui: { itemSelector: null, leftSideBarVisible: true, rightSideBarVisible: false, plugin: { current: 'blocks' } } });
  }}>Add block</button>;
}
