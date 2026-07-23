import { useLanguage } from '../lib/i18n.jsx'

export default function LanguageSwitcher() {
  const { lang, setLang } = useLanguage()

  const buttonClass = (language) => `flex h-10 min-w-12 items-center justify-center gap-1.5 rounded-md px-2 text-xs font-semibold transition-all ${
    lang === language
      ? 'bg-ledger text-white shadow-sm'
      : 'text-ink-soft hover:bg-paper hover:text-ink'
  }`

  return (
    <div className="fixed right-3 top-3 z-40 flex gap-1 rounded-lg border border-line bg-card/95 p-1 shadow-sm backdrop-blur no-print">
      <button
        type="button"
        onClick={() => setLang('bg')}
        aria-label="Български"
        aria-pressed={lang === 'bg'}
        title="Български"
        className={buttonClass('bg')}
      >
        <span aria-hidden="true" className="text-lg leading-none">🇧🇬</span>
        <span className="hidden sm:inline">BG</span>
      </button>
      <button
        type="button"
        onClick={() => setLang('en')}
        aria-label="English"
        aria-pressed={lang === 'en'}
        title="English"
        className={buttonClass('en')}
      >
        <span aria-hidden="true" className="text-lg leading-none">🇬🇧</span>
        <span className="hidden sm:inline">EN</span>
      </button>
    </div>
  )
}
