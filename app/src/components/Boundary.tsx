/* A panel that fails without taking the page with it.
 *
 * React unmounts the whole tree when a render throws, so before this existed a
 * single bad value anywhere — an unexpected shape back from a public RPC, a
 * balance that would not parse — turned the entire app into a blank white page
 * with nothing on it and no way to tell what happened.
 *
 * So the boundaries are per-panel rather than one around the app. The anonymity
 * scan failing has nothing to do with whether you can split a balance, and the
 * two should not share a fate.
 *
 * The wording matters more here than in most fallbacks. This is a privacy tool,
 * and a panel that vanishes silently could be read as "there is nothing to
 * report" — the reassuring direction, and the wrong one. Each fallback says
 * plainly that something broke and that its absence is not an all-clear.
 */

import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  /* Named so the fallback can say which panel died, rather than making someone
     guess from the gap where it used to be. */
  name: string;
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class Boundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    /* The console is the only reporting channel this app has — there is no
       backend, and shipping errors to a third party from a privacy tool would
       be its own bug. */
    console.error(`[airlock] ${this.props.name} crashed`, error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <section className="card" role="alert">
        <header className="card-h">
          <h2>{this.props.name}</h2>
          <span className="card-h-note">unavailable</span>
        </header>
        <div className="notice notice-blocked">
          <strong>This panel stopped working.</strong> The rest of the page is
          unaffected, and nothing was sent anywhere. Reload to try again — and
          read this as "unknown", not as "nothing to report".
        </div>
        <p className="muted sm mono">{error.message || String(error)}</p>
      </section>
    );
  }
}
