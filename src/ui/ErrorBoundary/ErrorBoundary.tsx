import { Component, type ErrorInfo, type ReactNode } from 'react';

import { captureException } from '@/lib/platform/telemetry';

interface Props {
  children: ReactNode;
  fallback: (reset: () => void) => ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * The only class component in the repo, because React's error-boundary API is
 * class-only. Reports to Sentry with the component stack (#45, #142).
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
