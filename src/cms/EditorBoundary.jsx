import React from 'react';
import { reportError } from '../lib/report.mjs';

// A React error boundary so one block that throws (a bad prop after a migration, a malformed
// array) shows a recoverable card instead of white-screening the whole studio or the public
// site. Keyed by page+puckKey in App, so switching page or discarding the draft gives a fresh
// boundary; onReset lets the editor revert to the published version and carry on.
export default class EditorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error, info) { reportError(error, { where: 'EditorBoundary', label: this.props.label, componentStack: info && info.componentStack }); }
  recover = () => { this.setState({ error: null }); if (this.props.onReset) this.props.onReset(); };

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="gs-boundary">
        <div className="gs-boundary-card">
          <h3>This {this.props.label || 'view'} hit an error.</h3>
          <p>A block couldn’t render. Your other pages and the published site are unaffected.</p>
          <code className="gs-boundary-msg">{String((this.state.error && this.state.error.message) || this.state.error)}</code>
          <div className="gs-boundary-actions">
            {this.props.onReset && <button className="gs-btn primary" onClick={this.recover}>{this.props.resetLabel || 'Recover'}</button>}
            <button className="gs-btn ghost" onClick={() => location.reload()}>Reload</button>
          </div>
        </div>
      </div>
    );
  }
}
