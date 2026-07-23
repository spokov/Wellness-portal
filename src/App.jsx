import { useEffect, useRef, useState } from 'react'
import { Link, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import Home from './pages/Home.jsx'
import ClientProfile from './pages/ClientProfile.jsx'
import ParameterGroupPage from './pages/ParameterGroupPage.jsx'
import Settings from './pages/Settings.jsx'
import Accounts from './pages/Accounts.jsx'
import Hierarchy from './pages/Hierarchy.jsx'
import Login from './pages/Login.jsx'
import ClientPortal from './pages/ClientPortal.jsx'
import LanguageSwitcher from './components/LanguageSwitcher.jsx'
import StatusMessage from './components/StatusMessage.jsx'
import { useLanguage } from './lib/i18n.jsx'
import { useAuth } from './lib/auth.jsx'
import { isSupabaseConfigured } from './lib/supabaseClient.js'

function useBackTarget(t, isClientRole) {
  const location = useLocation()
  const segments = location.pathname.split('/').filter(Boolean)

  if (['settings', 'accounts', 'hierarchy'].includes(segments[0])) {
    return { to: '/', label: t('backToHome') }
  }
  if (segments[0] === 'client' && segments.length === 2) {
    return { to: '/', label: t('backToHome') }
  }
  if (segments[0] === 'client' && segments.length === 3) {
    return isClientRole
      ? { to: '/', label: t('backToHome') }
      : { to: `/client/${segments[1]}`, label: t('backToProfile') }
  }
  return null
}

function TopMenu() {
  const { t } = useLanguage()
  const { profile, signOut } = useAuth()
  const [open, setOpen] = useState(false)
  const location = useLocation()
  const menuRef = useRef(null)
  const isClientRole = profile?.role === 'client'
  const back = useBackTarget(t, isClientRole)

  useEffect(() => setOpen(false), [location.pathname])

  useEffect(() => {
    if (!open) return undefined
    function handleKeyDown(event) {
      if (event.key === 'Escape') setOpen(false)
    }
    function handlePointerDown(event) {
      if (!menuRef.current?.contains(event.target)) setOpen(false)
    }
    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('pointerdown', handlePointerDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('pointerdown', handlePointerDown)
    }
  }, [open])

  const navLink = (to, label) => (
    <Link
      to={to}
      className="block border-b border-line/60 px-4 py-3 text-sm text-ink transition-colors last:border-b-0 hover:bg-paper"
    >
      {label}
    </Link>
  )

  return (
    <div ref={menuRef} className="fixed left-3 top-3 z-50">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label={t('menuLabel')}
        aria-expanded={open}
        aria-controls="app-menu"
        className="flex h-11 w-11 items-center justify-center rounded-lg border border-line bg-card/95 text-xl text-ink shadow-sm backdrop-blur transition-colors hover:border-ledger hover:text-ledger"
      >
        <span aria-hidden="true">☰</span>
      </button>

      {open && (
        <nav
          id="app-menu"
          aria-label={t('menuLabel')}
          className="absolute left-0 mt-2 w-64 overflow-hidden rounded-xl border border-line bg-card shadow-xl"
        >
          <div className="border-b border-line bg-paper/60 px-4 py-3">
            <p className="truncate text-sm font-semibold text-ink">
              {profile?.full_name || profile?.username || profile?.email}
            </p>
            <p className="mt-0.5 font-mono text-[11px] uppercase tracking-wider text-ledger">
              {t(
                profile?.role === 'admin'
                  ? 'roleAdmin'
                  : profile?.role === 'trainer'
                    ? 'roleTrainer'
                    : 'roleClient'
              )}
            </p>
          </div>
          {back && navLink(back.to, back.label)}
          {navLink('/', t('navHome'))}
          {!isClientRole && navLink('/accounts', t('navAccounts'))}
          {profile?.role === 'admin' && navLink('/hierarchy', t('navHierarchy'))}
          {profile?.role === 'admin' && navLink('/settings', t('navSettings'))}
          <button
            type="button"
            onClick={() => signOut()}
            className="block w-full px-4 py-3 text-left text-sm text-stamp transition-colors hover:bg-red-50"
          >
            {t('signOut')}
          </button>
        </nav>
      )}
    </div>
  )
}

function Banner() {
  return (
    <header className="border-b border-line bg-card pt-1 shadow-sm">
      <Link to="/" className="mx-auto block max-w-[1200px]" aria-label="Wellness portal">
        <img
          src="/banner.png"
          alt="Believe in yourself — health, nutrition, balance, happiness"
          className="block h-auto w-full"
        />
      </Link>
    </header>
  )
}

function PageShell({ children, authenticated = false }) {
  const { t } = useLanguage()
  return (
    <div className="min-h-screen bg-paper">
      <a href="#main-content" className="skip-link">
        {t('skipToContent')}
      </a>
      {authenticated && <TopMenu />}
      <LanguageSwitcher />
      <Banner />
      <main id="main-content" className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
        {children}
      </main>
      <footer className="mx-auto max-w-6xl px-4 pb-8 text-center text-xs text-ink-soft/70 sm:px-6">
        Wellness Portal
      </footer>
    </div>
  )
}

function LoadingScreen() {
  const { t } = useLanguage()
  return (
    <PageShell>
      <div className="mx-auto max-w-md animate-pulse space-y-3 py-12">
        <div className="h-6 w-1/2 rounded bg-line/70" />
        <div className="h-24 rounded-xl bg-line/50" />
        <p className="text-center font-mono text-xs text-ink-soft">{t('loading')}</p>
      </div>
    </PageShell>
  )
}

function ConfigurationScreen() {
  const { t } = useLanguage()
  return (
    <PageShell>
      <div className="mx-auto max-w-xl py-10">
        <StatusMessage type="error">
          <p className="font-semibold">{t('configErrorTitle')}</p>
          <p className="mt-1">{t('configErrorMessage')}</p>
        </StatusMessage>
      </div>
    </PageShell>
  )
}

export default function App() {
  const { t } = useLanguage()
  const { session, profile, loading, authError } = useAuth()

  if (!isSupabaseConfigured) return <ConfigurationScreen />
  if (loading) return <LoadingScreen />

  if (!session) {
    return (
      <PageShell>
        <Login />
      </PageShell>
    )
  }

  if (!profile) {
    return (
      <PageShell authenticated>
        <StatusMessage type="error">
          {authError || t('noProfileYet')}
        </StatusMessage>
      </PageShell>
    )
  }

  return (
    <PageShell authenticated>
      {profile.role === 'client' ? (
        <Routes>
          <Route path="/" element={<ClientPortal />} />
          <Route path="/client/:id/:category" element={<ParameterGroupPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      ) : (
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/client/:id" element={<ClientProfile />} />
          <Route path="/client/:id/:category" element={<ParameterGroupPage />} />
          <Route path="/accounts" element={<Accounts />} />
          {profile.role === 'admin' && <Route path="/hierarchy" element={<Hierarchy />} />}
          {profile.role === 'admin' && <Route path="/settings" element={<Settings />} />}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      )}
    </PageShell>
  )
}
