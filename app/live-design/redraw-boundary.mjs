// Impeccable's live tools move page elements React rendered (its versions wrapper takes the picked element's
// place). React's next update can then fail on a node that is no longer where it left it, and without a
// boundary that blanks the whole editor frame. This boundary draws the page again from the draft instead.
import { Component, Fragment, createElement } from 'react';

const MAX_REDRAWS = 3;

export class RedrawBoundary extends Component {
  state = { failed: false, redraws: 0 };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error) {
    console.warn('[live-design] redrawing the page after a render error', error);
    // ponytail: a fixed cap stops a page that always throws from looping; it then shows the note below.
    if (this.state.redraws < MAX_REDRAWS) this.setState((s) => ({ failed: false, redraws: s.redraws + 1 }));
  }

  render() {
    if (this.state.failed) return createElement('p', { style: { padding: 24, fontFamily: 'system-ui', color: '#9ca29b' } }, 'This page could not be drawn. Reload the editor.');
    // A new key mounts a fresh tree, so nothing from the moved DOM is reused.
    return createElement(Fragment, { key: this.state.redraws }, this.props.children);
  }
}
