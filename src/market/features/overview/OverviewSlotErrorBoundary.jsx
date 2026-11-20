import React from 'react';

/**
 * OverviewSlotErrorBoundary
 *
 * Catches rendering exceptions in individual feature slots so that
 * an unhandled error in a sibling component cannot blank the remaining
 * sections of the Overview dashboard.
 */
export class OverviewSlotErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    if (typeof this.props.onError === 'function') {
      this.props.onError(error, errorInfo);
    }
  }

  resetError = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      const { slotTitle = 'Section', workspaceId, workspaceTitle, onNavigate } = this.props;
      return (
        <div className="overview-slot-error" role="alert">
          <p className="overview-slot-error__message">
            <strong>{slotTitle}</strong> is temporarily unavailable.
          </p>
          <div className="overview-slot-error__actions">
            <button
              type="button"
              className="overview-slot-error__retry-btn"
              onClick={this.resetError}
            >
              Retry section
            </button>
            {workspaceId && typeof onNavigate === 'function' && (
              <button
                type="button"
                className="overview-slot-error__nav-btn"
                onClick={() => onNavigate(workspaceId)}
              >
                Open {workspaceTitle || slotTitle}
              </button>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default OverviewSlotErrorBoundary;
