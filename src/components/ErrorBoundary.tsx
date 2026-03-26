import React from 'react';
import { AlertCircle, RotateCcw } from 'lucide-react';

interface Props {
  children: React.ReactNode;
  fallbackLabel?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error(`[ErrorBoundary${this.props.fallbackLabel ? ` — ${this.props.fallbackLabel}` : ''}]`, error, info.componentStack);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          padding: '24px 16px',
          textAlign: 'center',
          color: 'var(--color-text-muted)',
          fontSize: '0.8125rem',
        }}>
          <AlertCircle size={28} style={{ margin: '0 auto 10px', display: 'block', opacity: 0.4, color: 'var(--color-error)' }} />
          <p style={{ marginBottom: '8px' }}>
            {this.props.fallbackLabel || 'Something went wrong'}
          </p>
          <p style={{ fontSize: '0.72rem', opacity: 0.6, marginBottom: '12px', maxWidth: '300px', margin: '0 auto 12px' }}>
            {this.state.error?.message || 'An unexpected error occurred'}
          </p>
          <button
            className="btn btn-secondary btn-sm"
            onClick={this.handleRetry}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
          >
            <RotateCcw size={12} />
            Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
