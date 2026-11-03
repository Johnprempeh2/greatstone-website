'use client';
// GRE-3789: attaches the page behaviours (app/html-behaviours.mjs) to the page region of a schema 2 page
// once it is in the browser, and again when the visitor moves to another page. GRE-3862: the header
// region too, which needs the page's path and title.
import { useEffect } from 'react';
import { attachBehaviours } from './html-behaviours.mjs';
import { track } from '../src/lib/analytics.js';

export default function HtmlBehaviours({ path, title = '' }) {
  useEffect(() => {
    const detach = ['page', 'header'].map((scope) => attachBehaviours(document.querySelector(`[data-gs-scope="${scope}"]`), undefined, { path, title, track }));
    return () => detach.forEach((stop) => stop());
  }, [path, title]);
  return null;
}
