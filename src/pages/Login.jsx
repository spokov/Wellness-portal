import { useState } from 'react'
import { useAuth } from '../lib/auth.jsx'
import { useLanguage } from '../lib/i18n.jsx'
import { resolveLoginEmail } from '../lib/username.js'
import StatusMessage from '../components/StatusMessage.jsx'

export default function Login() {
  const { signIn } = useAuth()
  const { t } = useLanguage()
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(event) {
    event.preventDefault()
    if (loading) return

    setLoading(true)
    setError('')
    const { error: signInError } = await signIn(resolveLoginEmail(identifier), password)
    if (signInError) setError(t('loginError'))
    setLoading(false)
  }

  return (
    <div className="flex min-h-[58vh] items-center justify-center py-8">
      <form onSubmit={handleSubmit} className="w-full max-w-md rounded-2xl border border-line bg-card p-6 shadow-lg sm:p-8">
        <p className="eyebrow">Wellness Portal</p>
        <h1 className="mt-1 font-display text-3xl font-semibold text-ink">{t('loginTitle')}</h1>
        <p className="mt-2 text-sm leading-6 text-ink-soft">{t('loginSubtitle')}</p>

        <label className="mt-6 block">
          <span className="mb-1 block font-mono text-[11px] uppercase tracking-wide text-ink-soft">{t('fieldUsername')}</span>
          <input
            className="input"
            type="text"
            autoComplete="username"
            value={identifier}
            onChange={(event) => setIdentifier(event.target.value)}
            autoFocus
            required
          />
        </label>

        <label className="mt-4 block">
          <span className="mb-1 block font-mono text-[11px] uppercase tracking-wide text-ink-soft">{t('loginPassword')}</span>
          <div className="relative">
            <input
              className="input pr-16"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
            <button type="button" onClick={() => setShowPassword((value) => !value)} className="password-toggle">
              {showPassword ? t('hidePassword') : t('showPassword')}
            </button>
          </div>
        </label>

        <StatusMessage type="error" className="mt-4">{error}</StatusMessage>

        <button type="submit" disabled={loading} className="btn-primary mt-5 w-full">
          {loading ? t('loading') : t('loginButton')}
        </button>
      </form>
    </div>
  )
}
