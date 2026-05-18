import { Component, type ErrorInfo, type ReactNode } from 'react';

import { captureException } from '@/lib/telemetry';

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
 * retry. Forwards the caught error to Sentry via `captureException` with
 * the React component stack as context (#45, #142).
 */
export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    captureException(error, {
      contexts: { react: { componentStack: info.componentStack ?? '' } },
    });
  }

  reset = (): void => {
    this.setState({ error: null });
  };

  override render(): ReactNode {
    return this.state.error ? this.props.fallback(this.reset) : this.props.children;
  }
}
