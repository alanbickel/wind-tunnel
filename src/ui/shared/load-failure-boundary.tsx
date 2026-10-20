import { Component, type ReactNode } from "react";

export interface LoadFailureBoundaryProps {
  /** Shown in place of the children once they fail. */
  readonly failure: ReactNode;
  readonly children: ReactNode;
}

interface LoadFailureBoundaryState {
  readonly failed: boolean;
}

/**
 * Shows `failure` instead of its children if they throw, as a `React.lazy`
 * part does when its chunk won't load: the user went offline after the app
 * loaded, or a redeploy renamed the chunks. Without a boundary, React
 * unmounts the whole app. React can only catch render errors in a class.
 */
export class LoadFailureBoundary extends Component<
  LoadFailureBoundaryProps,
  LoadFailureBoundaryState
> {
  override state: LoadFailureBoundaryState = { failed: false };

  static getDerivedStateFromError(): LoadFailureBoundaryState {
    return { failed: true };
  }

  override render(): ReactNode {
    return this.state.failed ? this.props.failure : this.props.children;
  }
}
