'use client';
// GRE-3789: attaches the page behaviours (app/html-behaviours.mjs) to the page region of a schema 2 page
// once it is in the browser, and again when the visitor moves to another page.
import { useEffect } from 'react';
import { attachBehaviours } from './html-behaviours.mjs';

export default function HtmlBehaviours({ path }) {
  useEffect(() => attachBehaviours(document.querySelector('[data-gs-scope="page"]')), [path]);
  return null;
}
