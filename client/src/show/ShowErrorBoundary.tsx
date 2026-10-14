import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
  /** Rendered instead of the crashed subtree. The audience must never see a raw error. */
  fallback: ReactNode
  /** Changing this value clears the error (e.g. the stage key, so the next stage gets a fresh try). */
  resetKey?: unknown
  onError?: (error: Error) => void
}

interface State {
  error: Error | null
  resetKey: unknown
}

export class ShowErrorBoundary extends Component<Props, State> {
  state: State = { error: null, resetKey: this.props.resetKey }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error }
  }

  static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
    return props.resetKey !== state.resetKey ? { error: null, resetKey: props.resetKey } : null
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[show] render error', error, info.componentStack)
    this.props.onError?.(error)
  }

  render() {
    return this.state.error ? this.props.fallback : this.props.children
  }
}
