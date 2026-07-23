import { Component } from 'react'

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error, info) {
    console.error('Unhandled application error', error, info)
  }

  render() {
    if (!this.state.hasError) return this.props.children

    return (
      <main className="min-h-screen bg-paper px-4 py-16">
        <div className="mx-auto max-w-lg rounded-xl border border-line bg-card p-6 text-center shadow-sm">
          <p className="font-display text-2xl font-semibold text-ink">Възникна неочаквана грешка</p>
          <p className="mt-2 text-sm text-ink-soft">
            Презаредете страницата. Ако проблемът се повтори, проверете настройките на Supabase.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="btn-primary mt-5"
          >
            Презареди
          </button>
        </div>
      </main>
    )
  }
}
