import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback: (reset: () => void) => ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * The only class component in the repo — React's error-boundary API is
 * class-only. Catches render-time exceptions in the descendant subtree and
 * hands the consumer a `reset()` so the fallback can clear the error and
 * retry. When #45 (production error tracking) lands, add
 * `componentDidCatch(error, info)` here to forward to Sentry; until then
 * React's own dev-mode console.error is the only signal we get.
 */
export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  reset = (): void => {
    this.setState({ error: null });
  };

  override render(): ReactNode {
    return this.state.error ? this.props.fallback(this.reset) : this.props.children;
  }
}
