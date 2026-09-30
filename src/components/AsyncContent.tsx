import { Component, Suspense } from 'react'
import type { ReactNode } from 'react'

type Props = { label: string; children: ReactNode }

class LoadBoundary extends Component<Props, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  render() {
    if (this.state.failed)
      return (
        <div className="async-content async-error" role="alert">
          <h2>{this.props.label} could not load.</h2>
          <p>
            Reload this page to try again. The navigation remains available.
          </p>
          <button className="button" onClick={() => window.location.reload()}>
            Reload page
          </button>
        </div>
      )
    return this.props.children
  }
}

export function AsyncContent({ label, children }: Props) {
  return (
    <LoadBoundary label={label}>
      <Suspense
        fallback={
          <div
            className="async-content"
            role="status"
            aria-label={`Loading ${label}`}
          >
            <span className="eyebrow">LOADING</span>
            <p>{label} is loading…</p>
          </div>
        }
      >
        {children}
      </Suspense>
    </LoadBoundary>
  )
}
