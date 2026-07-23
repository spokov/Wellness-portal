import { useLanguage } from '../lib/i18n.jsx'

export default function LanguageSwitcher() {
  const { lang, setLang } = useLanguage()

  return (
    <div className="fixed right-3 top-3 z-40 flex gap-1 rounded-lg border border-line bg-card/95 p-1 shadow-sm backdrop-blur">
      <button
        type="button"
        onClick={() => setLang('bg')}
        aria-label="Български"
        aria-pressed={lang === 'bg'}
        className={`flex h-9 min-w-10 items-center justify-center rounded-md px-2 text-xs font-semibold transition-colors ${
          lang === 'bg' ? 'bg-ledger text-white' : 'text-ink-soft hover:bg-paper hover:text-ink'
        }`}
      >
        BG
      </button>
      <button
        type="button"
        onClick={() => setLang('en')}
        aria-label="English"
        aria-pressed={lang === 'en'}
        className={`flex h-9 min-w-10 items-center justify-center rounded-md px-2 text-xs font-semibold transition-colors ${
          lang === 'en' ? 'bg-ledger text-white' : 'text-ink-soft hover:bg-paper hover:text-ink'
        }`}
      >
        EN
      </button>
    </div>
  )
}
