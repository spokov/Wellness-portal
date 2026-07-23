import { createContext, useContext, useEffect, useState } from 'react'
import { parseDateOnly } from './date.js'

const STORAGE_KEY = 'client-db-lang'

export const translations = {
  bg: {
    // menu
    menuLabel: 'Меню',
    backToHome: '← Обратно към картотеката',
    backToProfile: '← Обратно към профила',
    navHome: 'Начало',
    navSettings: 'Настройки на параметрите',
    navHierarchy: 'Структура',

    // common
    loading: 'Зареждане...',
    skipToContent: 'Към основното съдържание',
    cancel: 'Отказ',
    save: 'Запази',
    saving: 'Запис...',
    delete: 'Изтрий',
    refresh: 'Обнови',
    showPassword: 'Покажи',
    hidePassword: 'Скрий',
    savedSuccess: 'Промените са запазени успешно.',
    configErrorTitle: 'Липсва конфигурация за Supabase',
    configErrorMessage: 'Създай .env файл по примера от .env.example и добави адреса и публичния anon ключ на проекта.',

    // home page
    clientsTitle: 'Клиенти',
    clientsSubtitle: 'Управление на профили, контакти и измервания на клиентите.',
    clientCount: 'Всички клиенти',
    resultsCount: 'Показани',
    trainerClientCount: 'Клиенти с роля треньор',
    clearSearch: 'Изчисти търсенето',
    sortNewest: 'Най-нови първо',
    sortName: 'По име',
    searchPlaceholder: 'Търси по име, телефон, имейл или адрес...',
    newClient: '+ Нов клиент',
    noClientsYet: 'Все още няма добавени клиенти.',
    noSearchMatches: 'Няма съвпадения за търсенето.',
    deleteClientTitle: 'Изтриване на {name}',
    deleteClientMessage:
      'Това ще изтрие клиента и цялата история от параметри. Действието е необратимо.',

    // client card
    noContacts: 'Няма контакти',
    deleteClientAria: 'Изтрий клиент',
    ageSuffix: ' г.',

    // add client modal
    newClientTitle: 'Нов клиент',
    nameRequired: 'Името е задължително.',
    genericSaveError: 'Възникна грешка при запис.',
    fieldFullName: 'Име и фамилия *',
    fieldPhone: 'Телефон',
    fieldEmail: 'Имейл',
    fieldAddress: 'Адрес',
    fieldBirthDate: 'Дата на раждане',
    fieldGender: 'Пол',
    fieldPhoto: 'Снимка',
    fieldNotes: 'Бележки',
    fieldHeight: 'Височина (см)',
    cmSuffix: 'см',
    hierarchyTitle: 'Структура на треньорите и клиентите',
    hierarchyDescription:
      'Кой е създал кого - от администратор надолу през треньорите до клиентите им.',
    noStructureYet: 'Все още няма създадени треньори или клиенти.',
    moveNode: 'Премести',
    moveTrainerHelp: 'Избери под кого да премине този треньор (заедно с всичките му треньори и клиенти под него).',
    moveClientHelp: 'Избери на кой треньор да принадлежи този клиент.',
    moveNewParent: 'Нов треньор/ръководител',
    moveTopLevel: '— най-горно ниво (без ръководител) —',
    genderMale: 'Мъж',
    genderFemale: 'Жена',
    genderOther: 'Друго',
    saveClient: 'Запази клиент',
    requiredFieldsHint: 'Полетата със звездичка са задължителни.',
    futureBirthDate: 'Датата на раждане не може да бъде в бъдещето.',
    invalidHeight: 'Височината трябва да бъде между 80 и 250 см.',
    invalidPhotoType: 'Снимката трябва да бъде JPG, PNG или WebP.',
    photoTooLarge: 'Снимката не може да бъде по-голяма от 5 MB.',
    photoPreview: 'Преглед на избраната снимка',
    passwordHint: 'Паролата трябва да съдържа поне 8 символа.',

    // client profile
    changePhoto: 'Смени снимка',
    removePhoto: 'Премахни снимка',
    editClient: 'Редактирай',
    deleteClient: 'Изтрий клиента',
    parametersHeading: 'Параметри',
    openArrow: 'Отвори →',
    tanitaTitle: 'Танита измервания',
    tanitaSubtitleShort: 'Везна Tanita',
    bodyTitle: 'Мерки на тялото',
    bodySubtitleShort: 'Обиколки',
    clientProfileLabel: 'Профил на клиент',
    measurementsTitle: 'Измервания и проследяване',
    clientPortalLabel: 'Моят профил',
    clientPortalSubtitle: 'Прегледай своите резултати и добавяй мерки на тялото.',

    // parameter group page
    unknownGroup: 'Непозната група параметри.',
    measurementDate: 'Дата на измерване',
    addAll: 'Добави',
    tanitaSubtitleLong: 'Измервания от везна Tanita',
    bodySubtitleLong: 'Обиколки с шивашки метър',
    invalidMeasurementDate: 'Избери валидна дата, която не е в бъдещето.',
    invalidNumber: 'Въведи валидна числова стойност.',
    invalidNumberFor: 'Невалидна стойност за „{name}".',
    measurementsSaved: 'Записани измервания: {count}.',
    noParameters: 'В тази група няма настроени параметри.',

    // parameters table
    historyButton: 'История →',
    colNum: '№',
    colParameter: 'Параметър',
    colLatest: 'Последна стойност',
    colNewValue: 'Нова стойност',
    newValuePlaceholder: 'Нова стойност...',
    measurementInputHelp: 'Може да използваш точка или запетая за десетични стойности.',

    // history modal
    historyTitle: 'История по дати',
    closeAria: 'Затвори',
    noValuesYet: 'Няма въведени стойности все още.',
    deleteQuestion: 'Изтрий?',
    no: 'Не',
    noValueForDate: 'Няма стойност за тази дата',
    ageAtDate: 'Възраст',
    fatExcellent: 'Отлично',
    fatGood: 'Добро',
    fatAverage: 'Средно',
    fatDanger: 'Опасно',
    exportButton: 'Експорт',
    printButton: 'Принтирай',
    importButton: 'Импорт',
    importParseError: 'Файлът не можа да се разчете. Увери се, че е .csv в същия формат като експорта.',
    importNothingFound: 'Не бяха намерени стойности за внасяне във файла.',
    importSuccess: 'Внесени/обновени стойности: {count}.',
    importUnmatched: 'Пропуснати редове (непознат параметър)',
    importInvalidRows: 'Файлът съдържа невалидна числова стойност или дата в бъдещето.',
    importFileTooLarge: 'CSV файлът не може да бъде по-голям от 2 MB.',
    editAria: 'Редактирай',
    deleteAria: 'Изтрий',
    saveAria: 'Запази',
    cancelAria: 'Отказ',

    // settings page
    settingsTitle: 'Настройки на параметрите',
    settingsDescription:
      'Преименувай, добавяй или изтривай параметри във всяка група. Всички стойности са числови. Изтриването на параметър трие и цялата му история.',
    namePlaceholder: 'Име на параметъра',
    newParamPlaceholder: 'Име на нов параметър...',
    addParameter: '+ Добави параметър',
    deleteParamAria: 'Изтрий параметъра',
    deleteParamConfirm: 'Изтрий „{name}" и цялата му история?',

    // auth / login
    loginTitle: 'Вход',
    loginSubtitle: 'Влез с потребителско име и парола, за да продължиш.',
    loginPassword: 'Парола',
    loginButton: 'Влез',
    loginError: 'Грешен имейл или парола.',
    signOut: 'Изход',
    navAccounts: 'Акаунти',
    noLinkedClient: 'Няма свързан клиентски запис към този акаунт.',
    viewOnly: 'Само преглед',
    noProfileYet: 'Този акаунт все още няма профил. Помоли администратор да го довърши.',

    // roles
    roleAdmin: 'Администратор',
    roleTrainer: 'Треньор',
    roleClient: 'Клиент',

    // accounts page
    accountsTitle: 'Акаунти',
    accountsDescription:
      'Създавай и управлявай треньорски акаунти. Клиентски акаунти се създават автоматично от "+ Нов клиент". Виждаш само акаунтите, създадени от теб (пряко или през друг треньор).',
    newAccount: '+ Нов акаунт',
    noAccountsYet: 'Все още няма създадени акаунти.',
    accountRole: 'Роля',
    accountFullName: 'Име',
    accountClientRecordName: 'Име в картотеката (по желание)',
    deleteAccountConfirm: 'Изтрий акаунта на „{name}"? Достъпът му ще бъде спрян незабавно.',
    fieldUsername: 'Потребителско име',
    usernameHelp: 'Само букви, цифри, точка, долна черта или тире (3-40 символа). Не е нужен реален имейл.',
    usernameInvalid: 'Невалидно потребителско име (3-40 символа: букви, цифри, . _ -).',
    changePassword: 'Смени парола',
    newPassword: 'Нова парола',
    passwordChanged: 'Паролата е сменена успешно.',
    changeRole: 'Смени роля',
    confirm: 'Потвърди',
    changeRoleToClientWarning:
      'Този акаунт ще стане клиент. Ако в момента управлява клиенти, те ще преминат под неговия треньор, а самият той ще остане само със собствения си клиентски запис. Нищо не се изтрива.',
    changeRoleToTrainerWarning:
      'Този акаунт ще стане треньор. Собственият му клиентски запис (данни и история) се запазва и ще бъде отбелязан с "Треньор" в картотеката.',
    clientLoginSectionTitle: 'Вход за клиента',
    fieldFirstName: 'Име',
    fieldLastName: 'Фамилия',
    usernameAutoHelp:
      'Потребителското име се генерира автоматично от името на клиента и не може да се променя тук.',
    clientCreatedTitle: 'Клиентът е създаден',
    clientCreatedSubtitle: 'Дай на клиента това потребителско име и паролата, която зададе, за да влезе в сайта.',
    done: 'Готово',
  },
  en: {
    // menu
    menuLabel: 'Menu',
    backToHome: '← Back to client list',
    backToProfile: '← Back to profile',
    navHome: 'Home',
    navSettings: 'Parameter settings',
    navHierarchy: 'Structure',

    // common
    loading: 'Loading...',
    skipToContent: 'Skip to main content',
    cancel: 'Cancel',
    save: 'Save',
    saving: 'Saving...',
    delete: 'Delete',
    refresh: 'Refresh',
    showPassword: 'Show',
    hidePassword: 'Hide',
    savedSuccess: 'Changes saved successfully.',
    configErrorTitle: 'Supabase configuration is missing',
    configErrorMessage: 'Create a .env file from .env.example and add your project URL and public anon key.',

    // home page
    clientsTitle: 'Clients',
    clientsSubtitle: 'Manage client profiles, contact details, and measurements.',
    clientCount: 'All clients',
    resultsCount: 'Displayed',
    trainerClientCount: 'Clients with trainer role',
    clearSearch: 'Clear search',
    sortNewest: 'Newest first',
    sortName: 'By name',
    searchPlaceholder: 'Search by name, phone, email or address...',
    newClient: '+ New client',
    noClientsYet: 'No clients added yet.',
    noSearchMatches: 'No matches for your search.',
    deleteClientTitle: 'Delete {name}',
    deleteClientMessage:
      'This will delete the client and all parameter history. This action cannot be undone.',

    // client card
    noContacts: 'No contact info',
    deleteClientAria: 'Delete client',
    ageSuffix: ' yrs',

    // add client modal
    newClientTitle: 'New client',
    nameRequired: 'Name is required.',
    genericSaveError: 'Something went wrong while saving.',
    fieldFullName: 'Full name *',
    fieldPhone: 'Phone',
    fieldEmail: 'Email',
    fieldAddress: 'Address',
    fieldBirthDate: 'Date of birth',
    fieldGender: 'Gender',
    fieldPhoto: 'Photo',
    fieldNotes: 'Notes',
    fieldHeight: 'Height (cm)',
    cmSuffix: 'cm',
    hierarchyTitle: 'Trainer & client structure',
    hierarchyDescription: 'Who created whom - from admin down through trainers to their clients.',
    noStructureYet: 'No trainers or clients created yet.',
    moveNode: 'Move',
    moveTrainerHelp: 'Choose who this trainer should move under (along with every trainer and client below them).',
    moveClientHelp: 'Choose which trainer this client should belong to.',
    moveNewParent: 'New trainer/manager',
    moveTopLevel: '— top level (no manager) —',
    genderMale: 'Male',
    genderFemale: 'Female',
    genderOther: 'Other',
    saveClient: 'Save client',
    requiredFieldsHint: 'Fields marked with an asterisk are required.',
    futureBirthDate: 'Date of birth cannot be in the future.',
    invalidHeight: 'Height must be between 80 and 250 cm.',
    invalidPhotoType: 'The photo must be a JPG, PNG, or WebP image.',
    photoTooLarge: 'The photo cannot be larger than 5 MB.',
    photoPreview: 'Selected photo preview',
    passwordHint: 'The password must contain at least 8 characters.',

    // client profile
    changePhoto: 'Change photo',
    removePhoto: 'Remove photo',
    editClient: 'Edit',
    deleteClient: 'Delete client',
    parametersHeading: 'Parameters',
    openArrow: 'Open →',
    tanitaTitle: 'Tanita measurements',
    tanitaSubtitleShort: 'Tanita scale',
    bodyTitle: 'Body measurements',
    bodySubtitleShort: 'Tape measurements',
    clientProfileLabel: 'Client profile',
    measurementsTitle: 'Measurements and progress',
    clientPortalLabel: 'My profile',
    clientPortalSubtitle: 'Review your results and add your body measurements.',

    // parameter group page
    unknownGroup: 'Unknown parameter group.',
    measurementDate: 'Measurement date',
    addAll: 'Add',
    tanitaSubtitleLong: 'Measurements from a Tanita scale',
    bodySubtitleLong: 'Tape measurements',
    invalidMeasurementDate: 'Choose a valid date that is not in the future.',
    invalidNumber: 'Enter a valid numeric value.',
    invalidNumberFor: 'Invalid value for “{name}”.',
    measurementsSaved: 'Measurements saved: {count}.',
    noParameters: 'No parameters are configured in this group.',

    // parameters table
    historyButton: 'History →',
    colNum: '№',
    colParameter: 'Parameter',
    colLatest: 'Latest value',
    colNewValue: 'New value',
    newValuePlaceholder: 'New value...',
    measurementInputHelp: 'You can use a period or comma for decimal values.',

    // history modal
    historyTitle: 'History by date',
    closeAria: 'Close',
    noValuesYet: 'No values recorded yet.',
    deleteQuestion: 'Delete?',
    no: 'No',
    noValueForDate: 'No value recorded for this date',
    ageAtDate: 'Age',
    fatExcellent: 'Excellent',
    fatGood: 'Good',
    fatAverage: 'Average',
    fatDanger: 'Danger',
    exportButton: 'Export',
    printButton: 'Print',
    importButton: 'Import',
    importParseError: "Couldn't read the file. Make sure it's a .csv in the same format as the export.",
    importNothingFound: 'No values to import were found in the file.',
    importSuccess: 'Imported/updated values: {count}.',
    importUnmatched: 'Skipped rows (unknown parameter)',
    importInvalidRows: 'The file contains an invalid numeric value or a future date.',
    importFileTooLarge: 'The CSV file cannot be larger than 2 MB.',
    editAria: 'Edit',
    deleteAria: 'Delete',
    saveAria: 'Save',
    cancelAria: 'Cancel',

    // settings page
    settingsTitle: 'Parameter settings',
    settingsDescription:
      'Rename, add, or delete parameters in each group. All values are numeric. Deleting a parameter also deletes its entire history.',
    namePlaceholder: 'Parameter name',
    newParamPlaceholder: 'New parameter name...',
    addParameter: '+ Add parameter',
    deleteParamAria: 'Delete parameter',
    deleteParamConfirm: 'Delete "{name}" and all its history?',

    // auth / login
    loginTitle: 'Sign in',
    loginSubtitle: 'Sign in with your username and password to continue.',
    loginPassword: 'Password',
    loginButton: 'Sign in',
    loginError: 'Incorrect email or password.',
    signOut: 'Sign out',
    navAccounts: 'Accounts',
    noLinkedClient: 'No client record is linked to this account.',
    viewOnly: 'View only',
    noProfileYet: 'This account has no profile yet. Ask an admin to finish setting it up.',

    // roles
    roleAdmin: 'Admin',
    roleTrainer: 'Trainer',
    roleClient: 'Client',

    // accounts page
    accountsTitle: 'Accounts',
    accountsDescription:
      'Create and manage trainer accounts. Client accounts are created automatically from "+ New client". You only see accounts you created (directly or through another trainer).',
    newAccount: '+ New account',
    noAccountsYet: 'No accounts created yet.',
    accountRole: 'Role',
    accountFullName: 'Name',
    accountClientRecordName: 'Client record name (optional)',
    deleteAccountConfirm: 'Delete the account for "{name}"? Their access will be revoked immediately.',
    fieldUsername: 'Username',
    usernameHelp: 'Letters, digits, dot, underscore or hyphen only (3-40 characters). No real email needed.',
    usernameInvalid: 'Invalid username (3-40 characters: letters, digits, . _ -).',
    changePassword: 'Change password',
    newPassword: 'New password',
    passwordChanged: 'Password changed successfully.',
    changeRole: 'Change role',
    confirm: 'Confirm',
    changeRoleToClientWarning:
      "This account will become a client. If it currently manages clients, they'll move to its own trainer, and it will keep only its own client record. Nothing is deleted.",
    changeRoleToTrainerWarning:
      'This account will become a trainer. Its own client record (data and history) is kept, and will show a "Trainer" note in the roster.',
    clientLoginSectionTitle: 'Client login',
    fieldFirstName: 'First name',
    fieldLastName: 'Last name',
    usernameAutoHelp:
      "The username is generated automatically from the client's name and can't be changed here.",
    clientCreatedTitle: 'Client created',
    clientCreatedSubtitle: 'Give the client this username and the password you set so they can log in.',
    done: 'Done',
  },
}

const LOCALES = { bg: 'bg-BG', en: 'en-GB' }

const LanguageContext = createContext(null)

export function LanguageProvider({ children }) {
  const [lang, setLang] = useState(() => {
    if (typeof window === 'undefined') return 'bg'
    return window.localStorage.getItem(STORAGE_KEY) || 'bg'
  })

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, lang)
    document.documentElement.lang = lang
  }, [lang])

  function t(key, vars) {
    const dict = translations[lang] || translations.bg
    let str = dict[key] ?? translations.bg[key] ?? key
    if (vars) {
      for (const [k, v] of Object.entries(vars)) {
        str = str.replace(`{${k}}`, v)
      }
    }
    return str
  }

  function formatDate(iso) {
    if (!iso) return ''
    const d = parseDateOnly(iso) || new Date(iso)
    if (Number.isNaN(d.getTime())) return ''
    return d.toLocaleDateString(LOCALES[lang] || LOCALES.bg, {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    })
  }

  // Client gender is stored using the fixed Bulgarian values the database
  // expects ("Мъж"/"Жена"/"Друго"), regardless of UI language - this just
  // maps that stored value to a translated label for display.
  function genderLabel(value) {
    if (value === 'Мъж') return t('genderMale')
    if (value === 'Жена') return t('genderFemale')
    if (value === 'Друго') return t('genderOther')
    return value
  }

  return (
    <LanguageContext.Provider value={{ lang, setLang, t, formatDate, genderLabel }}>
      {children}
    </LanguageContext.Provider>
  )
}

export function useLanguage() {
  const ctx = useContext(LanguageContext)
  if (!ctx) throw new Error('useLanguage must be used within a LanguageProvider')
  return ctx
}
