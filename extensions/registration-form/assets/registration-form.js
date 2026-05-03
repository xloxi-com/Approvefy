(function() {
  var inlineRootEarly = document.querySelector('[data-approvefy-registration-block]');
  var isRegisterPageEarly = window.location.pathname.indexOf('/account/register') !== -1;
  // Register page OR a theme section block that mounts the form inline (e.g. home page)
  if (!isRegisterPageEarly && !inlineRootEarly) return;

  if (window.__approvefyRegistrationScriptLoaded) {
    return;
  }
  window.__approvefyRegistrationScriptLoaded = true;

  /** Same rules as app/lib/safe-registration-redirect.ts */
  function isAllowedStorefrontAccountRedirectPath(pathLower) {
    var p = pathLower.indexOf('/') === 0 ? pathLower : '/' + pathLower;
    return /\/(?:[a-z]{2}(?:-[a-z]{2})?\/)?account\/(?:login|register)(?:\/|\?|$)/.test(p);
  }
  function isUnsafeRegistrationRedirectUrl(raw) {
    var t = (raw && String(raw).trim()) || '';
    if (!t) return true;
    var lower = t.toLowerCase();
    if (lower.indexOf('javascript:') === 0 || lower.indexOf('data:') === 0 || lower.indexOf('vbscript:') === 0) return true;
    try {
      if (lower.indexOf('http://') === 0 || lower.indexOf('https://') === 0 || lower.indexOf('//') === 0) {
        var u = new URL(lower.indexOf('//') === 0 ? 'https:' + lower : t);
        var host = (u.hostname || '').toLowerCase();
        if (host === 'shopify.com' || host === 'www.shopify.com') return true;
        var urlPath = (u.pathname || '/').toLowerCase();
        if (isAllowedStorefrontAccountRedirectPath(urlPath)) return false;
        if (urlPath === '/account' || urlPath.indexOf('/account/') === 0) return true;
        return false;
      }
      var pathPart = t.split('?')[0];
      var relPath = (pathPart.indexOf('/') === 0 ? pathPart : '/' + pathPart).toLowerCase();
      if (isAllowedStorefrontAccountRedirectPath(relPath)) return false;
      if (relPath === '/account' || relPath.indexOf('/account/') === 0) return true;
      return false;
    } catch (e) {
      return true;
    }
  }

  // Detect locale: from html lang attribute or URL path (e.g. /fr/, /de/, /es/)
  var locale = (document.documentElement.lang || '').toLowerCase().split('-')[0];
  if (!locale) {
    var pathMatch = window.location.pathname.match(/^\/([a-z]{2})(\/|$)/);
    locale = pathMatch ? pathMatch[1].toLowerCase() : 'en';
  }
  if (!locale) locale = 'en';

  var cfg = window.__REGISTRATION_FORM_CONFIG__ || {}; var embedFormId = (typeof cfg.embedFormId === 'string') ? cfg.embedFormId : '';
  var formIdParam = (typeof embedFormId === 'string' && embedFormId.trim()) ? '&formId=' + encodeURIComponent(embedFormId.trim()) : '';

  // Backend translations (from Settings) - set after config fetch. When set, these override fallbacks.
  var backendTranslations = null;
  // eslint-disable-next-line no-unused-vars -- stored from config.availableLocales for future use
  var backendAvailableLocales = ['en'];
  // Custom CSS coming from app backend Appearance tab
  var backendCustomCss = '';

  // Map frontend t() keys to backend translation keys (snake_case)
  var UI_KEY_TO_BACKEND = {
    loading: 'loading_form',
    createAccount: 'create_account_btn',
    processing: 'processing',
    previous: 'step_previous',
    next: 'step_next',
    stepOf: 'step_label',
    of: 'step_of',
    submit: 'submit',
    createYourAccount: 'create_your_account',
    formDescription: 'form_description',
    formNotConfigured: 'form_not_configured',
    enterPrefix: 'enter_prefix',
    enterYour: 'enter_your',
    selectPlaceholder: 'select_placeholder',
    selectCountry: 'select_country',
    searchCountry: 'search_country',
    phonePlaceholder: 'phone_placeholder',
    addressPlaceholder: 'address_placeholder',
    uploadClickOrDrag: 'upload_click_or_drag',
    uploadHint: 'upload_hint',
    fileRequired: 'file_required',
    fileTypeError: 'file_type_error',
    fileSizeError: 'file_size_error',
    fileCountError: 'file_count_error',
    uploadProgress: 'upload_progress',
    filesSelected: 'files_selected',
    registrationSuccess: 'registration_success',
    success_message: 'success_message',
    registrationFailed: 'error_message',
    errorOccurred: 'error_occurred',
    invalidResponse: 'invalid_response',
    heading: 'heading',
    phoneAlreadyRegistered: 'phone_already_registered',
    openCalendar: 'open_calendar',
    chooseDate: 'choose_date',
    invalidDateFormat: 'invalid_date_format',
    checkboxMinRequired: 'checkbox_min_required',
    thisField: 'this_field',
    uploadHintMax: 'upload_hint_max',
    fieldRequired: 'field_required',
    invalidEmailFormat: 'invalid_email_format',
    newsletterOptionYes: 'newsletter_option_yes',
    approvedAccountHeading: 'approved_account_heading',
    approvedAccountMessage: 'approved_account_message',
    registrationPendingHeading: 'registration_pending_heading',
    registrationPendingMessage: 'registration_pending_message',
    pendingNoticeLine1: 'pending_notice_line1',
    pendingNoticeLine2: 'pending_notice_line2',
    pendingSubmittedAccountMessage: 'pending_submitted_account_message',
    myAccount: 'my_account',
    progressComplete: 'progress_complete',
    signUpTab: 'sign_up_tab',
    logInTab: 'log_in_tab',
    logInHeading: 'log_in_heading',
    logInDescription: 'log_in_description',
    logInBtn: 'log_in_btn',
    forgotPassword: 'forgot_password',
    emailPendingApproval: 'email_pending_approval',
    emailAlreadyRegistered: 'email_already_registered',
    emailAlreadyPendingRegistration: 'email_already_pending_registration',
    emailRegistrationRejected: 'email_registration_rejected',
    emailRegistrationRejectedLead: 'email_registration_rejected_lead',
    emailApprovalRemovedContactSupport: 'email_approval_removed_contact_support',
    emailApprovalRemovedLead: 'email_approval_removed_lead',
    contactSupport: 'contact_support',
    contactUs: 'contact_us'
  };
  // Map API field label (English) to backend translation key for field labels
  var LABEL_TO_KEY = {
    'First Name': 'first_name', 'Last Name': 'last_name', 'Email': 'email', 'Password': 'password',
    'Phone Number': 'phone', 'Phone': 'phone', 'Company Name': 'company', 'Company': 'company',
    'Address': 'address', 'City': 'city', 'State / Province': 'state', 'State': 'state',
    'Country': 'country', 'Zip / Postal Code': 'zip_code', 'Zip Code': 'zip_code',
    'Preferred Language': 'language', 'Street address': 'street_address',
    'Subscribe to newsletter': 'newsletter_label'
  };

  var TRANSLATIONS = {
    en: {
      loading: 'Loading form...',
      createAccount: 'Create Account',
      processing: 'Processing...',
      previous: 'Previous step',
      next: 'Next step',
      submit: 'Submit',
      stepOf: 'Step',
      of: 'of',
      createYourAccount: 'Create Your Account',
      formDescription: 'Please fill out the information below. Your registration will be reviewed by our team.',
      formNotConfigured: 'Registration form is not configured yet. Please contact the store owner.',
      enterPrefix: 'Enter ',
      enterYour: 'Enter your',
      selectPlaceholder: 'Select...',
      selectCountry: 'Select country',
      searchCountry: 'Search country...',
      phonePlaceholder: 'Phone number',
      addressPlaceholder: 'Enter your address',
      uploadClickOrDrag: 'Click or drag to upload',
      uploadProgress: 'Uploading',
      filesSelected: 'files selected',
      registrationSuccess: 'Registration successful! Redirecting...',
      success_message: 'Registration successful! Your account is pending approval. You will receive an email once approved.',
      registrationFailed: 'Registration failed. Please try again.',
      errorOccurred: 'An error occurred. Please try again.',
      invalidResponse: 'Invalid response from server',
      heading: 'Heading',
      phoneAlreadyRegistered: 'This phone number is already registered. Please use a different number.',
      openCalendar: 'Choose date',
      chooseDate: 'Choose date',
      invalidDateFormat: 'Please enter the date in the correct format.',
      checkboxMinRequired: 'Please select at least {min} option(s) for "{label}".',
      fileRequired: 'This file is required.',
      fileTypeError: 'Only JPG, PNG, and PDF files are allowed.',
      fileSizeError: 'File size must be under {max} MB.',
      fileCountError: 'You can upload a maximum of {max} file(s).',
      thisField: 'This field',
      uploadHintMax: 'JPG, PNG, PDF — Max {max} MB',
      fieldRequired: 'This field is required.',
      invalidEmailFormat: 'Please enter a valid email address.',
      approvedAccountHeading: 'Account already approved',
      approvedAccountMessage: 'Your account creation was successful and already approved. You can now check your orders in My Account.',
      registrationPendingHeading: 'Your registration has been submitted successfully.',
      registrationPendingMessage:
        'Your account is currently pending approval. Please check your email for updates and further instructions.',
      pendingNoticeLine1: 'Already submitted',
      pendingNoticeLine2: 'Please wait for your approval',
      pendingSubmittedAccountMessage:
        'Your account is currently pending approval. Please check your email for updates and further instructions.',
      myAccount: 'My Account',
      progressComplete: '{pct}% complete',
      signUpTab: 'Sign up',
      logInTab: 'Log in',
      logInHeading: 'Log in to your account',
      logInDescription: 'Enter your email and password to continue.',
      logInBtn: 'Log in',
      forgotPassword: 'Forgot password?',
      emailPendingApproval:
        'Your account is currently pending approval. Please check your email for updates and further instructions.',
      emailAlreadyPendingRegistration: 'This customer is already registered. Approval is pending.',
      emailRegistrationRejected: 'We have rejected this email. Please contact us.',
      emailRegistrationRejectedLead: 'We have rejected this email. Please',
      emailApprovalRemovedContactSupport:
        'Your account no longer shows as approved. Please contact support.',
      emailApprovalRemovedLead:
        'Your account no longer shows as approved in our records. Please',
      contactSupport: 'Contact support',
      contactUs: 'Contact us',
      emailAlreadyRegistered: 'This email is already registered. Please log in with your existing account.'
    },
    fr: {
      loading: 'Chargement du formulaire...',
      createAccount: 'Cr\u00e9er un compte',
      processing: 'Traitement en cours...',
      previous: '\u00c9tape pr\u00e9c\u00e9dente',
      next: '\u00c9tape suivante',
      submit: 'Soumettre',
      stepOf: '\u00c9tape',
      of: 'sur',
      createYourAccount: 'Cr\u00e9ez votre compte',
      formDescription: 'Veuillez remplir les informations ci-dessous. Votre inscription sera examin\u00e9e par notre \u00e9quipe.',
      formNotConfigured: "Le formulaire d'inscription n'est pas encore configur\u00e9. Veuillez contacter le propri\u00e9taire de la boutique.",
      enterPrefix: 'Saisir ',
      selectPlaceholder: 'S\u00e9lectionner...',
      selectCountry: 'Choisir un pays',
      phonePlaceholder: 'Num\u00e9ro de t\u00e9l\u00e9phone',
      addressPlaceholder: 'Saisissez votre adresse',
      registrationSuccess: 'Inscription r\u00e9ussie ! Redirection...',
      success_message: 'Inscription r\u00e9ussie ! Votre compte est en attente d\'approbation. Vous recevrez un e-mail une fois approuv\u00e9.',
      registrationFailed: "L'inscription a \u00e9chou\u00e9. Veuillez r\u00e9essayer.",
      errorOccurred: "Une erreur s'est produite. Veuillez r\u00e9essayer.",
      invalidResponse: 'R\u00e9ponse invalide du serveur',
      heading: 'Titre',
      phoneAlreadyRegistered: 'Ce num\u00e9ro de t\u00e9l\u00e9phone est d\u00e9j\u00e0 enregistr\u00e9. Veuillez en utiliser un autre.',
      enterYour: 'Saisissez votre',
      searchCountry: 'Rechercher un pays...',
      uploadClickOrDrag: 'Cliquez ou glissez pour t\u00e9l\u00e9verser',
      uploadProgress: 'T\u00e9l\u00e9versement',
      filesSelected: 'fichier(s) s\u00e9lectionn\u00e9(s)',
      openCalendar: 'Choisir une date',
      chooseDate: 'Choisir une date',
      invalidDateFormat: 'Veuillez saisir la date au format correct.',
      checkboxMinRequired: 'Veuillez s\u00e9lectionner au moins {min} option(s) pour "{label}".',
      fileRequired: 'Ce fichier est obligatoire.',
      fileTypeError: 'Seuls les fichiers JPG, PNG et PDF sont accept\u00e9s.',
      fileSizeError: 'La taille du fichier doit \u00eatre inf\u00e9rieure \u00e0 {max} Mo.',
      fileCountError: 'Vous pouvez t\u00e9l\u00e9verser au maximum {max} fichier(s).',
      thisField: 'Ce champ',
      uploadHintMax: 'JPG, PNG, PDF \u2014 Max {max} Mo',
      fieldRequired: 'Ce champ est obligatoire.',
      invalidEmailFormat: 'Veuillez saisir une adresse e-mail valide.',
      approvedAccountHeading: 'Compte deja approuve',
      approvedAccountMessage: 'La creation de votre compte est reussie et deja approuvee. Vous pouvez maintenant consulter vos commandes dans Mon compte.',
      registrationPendingHeading: 'Inscription envoyee',
      registrationPendingMessage: 'Votre inscription a ete envoyee et est en attente d\'approbation.',
      pendingNoticeLine1: 'Deja soumis',
      pendingNoticeLine2: 'Veuillez patienter pour votre approbation',
      pendingSubmittedAccountMessage:
        'Vous avez deja soumis votre compte pour approbation. Veuillez patienter et consulter vos e-mails.',
      myAccount: 'Mon compte',
      progressComplete: '{pct} % termin\u00e9',
      signUpTab: 'Inscription',
      logInTab: 'Connexion',
      logInHeading: 'Connectez-vous \u00e0 votre compte',
      logInDescription: 'Saisissez votre e-mail et votre mot de passe pour continuer.',
      logInBtn: 'Connexion',
      forgotPassword: 'Mot de passe oubli\u00e9 ?',
      emailPendingApproval: 'Votre inscription a ete envoyee et est en attente d\'approbation.',
      emailAlreadyPendingRegistration: 'Ce client est deja enregistre. L\'approbation est en attente.',
      emailRegistrationRejected:
        'Nous avons refus\u00e9 cette adresse e-mail. Veuillez nous contacter.',
      emailRegistrationRejectedLead: 'Nous avons refus\u00e9 cette adresse e-mail. Veuillez',
      contactUs: 'nous contacter',
      emailApprovalRemovedContactSupport:
        'Votre compte n\'apparaît plus comme approuvé. Veuillez contacter le support.',
      emailApprovalRemovedLead:
        'Votre compte n\'apparaît plus comme approuvé dans nos dossiers. Veuillez',
      contactSupport: 'contacter le support',
      emailAlreadyRegistered: 'Cette adresse e-mail est deja enregistree. Veuillez vous connecter avec votre compte existant.',
      newsletterOptionYes: 'Oui, je souhaite recevoir des e-mails'
    }
  };
  var FIELD_LABEL_FR = {
    'First Name': 'Pr\u00e9nom',
    'Last Name': 'Nom',
    'Email': 'E-mail',
    'Password': 'Mot de passe',
    'Phone': 'T\u00e9l\u00e9phone',
    'Company': 'Entreprise',
    'Address': 'Adresse',
    'City': 'Ville',
    'State': '\u00c9tat / R\u00e9gion',
    'Country': 'Pays',
    'Zip Code': 'Code postal'
  };
  /** Bootstrap labels when API translations are not loaded yet (same English keys as the form schema). */
  var FIELD_LABEL_DE = {
    'First Name': 'Vorname',
    'Last Name': 'Nachname',
    'Email': 'E-Mail',
    'Password': 'Passwort',
    'Phone': 'Telefon',
    'Phone Number': 'Telefonnummer',
    'Company': 'Firma',
    'Company Name': 'Firmenname',
    'Address': 'Adresse',
    'City': 'Stadt',
    'State': 'Bundesland / Region',
    'Country': 'Land',
    'Zip Code': 'PLZ',
    'Preferred Language': 'Bevorzugte Sprache',
    'Street address': 'Straße und Hausnummer',
    'Subscribe to newsletter': 'Newsletter abonnieren'
  };
  var FIELD_LABEL_ES = {
    'First Name': 'Nombre',
    'Last Name': 'Apellido',
    'Email': 'Correo electrónico',
    'Password': 'Contraseña',
    'Phone': 'Teléfono',
    'Phone Number': 'Número de teléfono',
    'Company': 'Empresa',
    'Company Name': 'Nombre de la empresa',
    'Address': 'Dirección',
    'City': 'Ciudad',
    'State': 'Estado / Provincia',
    'Country': 'País',
    'Zip Code': 'Código postal',
    'Preferred Language': 'Idioma preferido',
    'Street address': 'Dirección',
    'Subscribe to newsletter': 'Suscribirse al boletín'
  };
  var FIELD_LABEL_IT = {
    'First Name': 'Nome',
    'Last Name': 'Cognome',
    'Email': 'Email',
    'Password': 'Password',
    'Phone': 'Telefono',
    'Phone Number': 'Numero di telefono',
    'Company': 'Azienda',
    'Company Name': 'Nome azienda',
    'Address': 'Indirizzo',
    'City': 'Città',
    'State': 'Stato / Provincia',
    'Country': 'Paese',
    'Zip Code': 'CAP',
    'Preferred Language': 'Lingua preferita',
    'Street address': 'Indirizzo',
    'Subscribe to newsletter': 'Iscriviti alla newsletter'
  };
  var FIELD_LABEL_NL = {
    'First Name': 'Voornaam',
    'Last Name': 'Achternaam',
    'Email': 'E-mail',
    'Password': 'Wachtwoord',
    'Phone': 'Telefoon',
    'Phone Number': 'Telefoonnummer',
    'Company': 'Bedrijf',
    'Company Name': 'Bedrijfsnaam',
    'Address': 'Adres',
    'City': 'Plaats',
    'State': 'Provincie / Regio',
    'Country': 'Land',
    'Zip Code': 'Postcode',
    'Preferred Language': 'Voorkeurstaal',
    'Street address': 'Adres',
    'Subscribe to newsletter': 'Inschrijven voor nieuwsbrief'
  };
  var FIELD_LABEL_PL = {
    'First Name': 'Imię',
    'Last Name': 'Nazwisko',
    'Email': 'E-mail',
    'Password': 'Hasło',
    'Phone': 'Telefon',
    'Phone Number': 'Numer telefonu',
    'Company': 'Firma',
    'Company Name': 'Nazwa firmy',
    'Address': 'Adres',
    'City': 'Miasto',
    'State': 'Województwo / Region',
    'Country': 'Kraj',
    'Zip Code': 'Kod pocztowy',
    'Preferred Language': 'Preferowany język',
    'Street address': 'Adres',
    'Subscribe to newsletter': 'Zapisz się do newslettera'
  };
  var FIELD_LABEL_PT = {
    'First Name': 'Nome',
    'Last Name': 'Sobrenome',
    'Email': 'E-mail',
    'Password': 'Senha',
    'Phone': 'Telefone',
    'Phone Number': 'Número de telefone',
    'Company': 'Empresa',
    'Company Name': 'Nome da empresa',
    'Address': 'Endereço',
    'City': 'Cidade',
    'State': 'Estado / Província',
    'Country': 'País',
    'Zip Code': 'Código postal',
    'Preferred Language': 'Idioma preferido',
    'Street address': 'Endereço',
    'Subscribe to newsletter': 'Subscrever a newsletter'
  };
  var FIELD_LABEL_BY_LOCALE = {
    fr: FIELD_LABEL_FR,
    de: FIELD_LABEL_DE,
    es: FIELD_LABEL_ES,
    it: FIELD_LABEL_IT,
    nl: FIELD_LABEL_NL,
    pl: FIELD_LABEL_PL,
    pt: FIELD_LABEL_PT
  };
  var LOADING_FALLBACK_BY_LOCALE = {
    de: 'Formular wird geladen...',
    es: 'Cargando formulario...',
    it: 'Caricamento modulo...',
    nl: 'Formulier laden...',
    pl: '\u0141adowanie formularza...',
    pt: 'A carregar formul\u00e1rio...'
  };
  function t(key) {
    if (backendTranslations) {
      var backKey = UI_KEY_TO_BACKEND[key] || key;
      var val = backendTranslations[backKey] || backendTranslations[key];
      var str = val != null ? String(val).trim() : '';
      if (str !== '' && str !== key && str !== backKey) return str;
    }
    var locLine = TRANSLATIONS[locale] && TRANSLATIONS[locale][key];
    if (locLine) return locLine;
    if (key === 'loading' && LOADING_FALLBACK_BY_LOCALE[locale]) return LOADING_FALLBACK_BY_LOCALE[locale];
    return TRANSLATIONS.en[key] || key;
  }
  // If server sends an error key (snake_case or camelCase), return translated message; else return msg as-is
  function translateError(msg) {
    if (!msg || typeof msg !== 'string') return msg;
    var trimmed = msg.trim();
    var uiKey = null;
    if (TRANSLATIONS.en[trimmed]) uiKey = trimmed;
    else {
      for (var k in UI_KEY_TO_BACKEND) { if (UI_KEY_TO_BACKEND[k] === trimmed) { uiKey = k; break; } }
    }
    if (uiKey) {
      var out = t(uiKey);
      if (out && out !== uiKey && out !== trimmed) return out;
      var locLine = TRANSLATIONS[locale] && TRANSLATIONS[locale][uiKey];
      if (locLine && locLine !== uiKey) return locLine;
      var enLine = TRANSLATIONS.en && TRANSLATIONS.en[uiKey];
      if (enLine && enLine !== uiKey) return enLine;
      return trimmed;
    }
    return trimmed;
  }
  function translateLabel(label) {
    if (!label) return '';
    var trimmed = String(label).trim();
    if (backendTranslations) {
      var key = LABEL_TO_KEY[trimmed] || LABEL_TO_KEY[label];
      if (key) {
        var val = backendTranslations[key];
        if (val != null && String(val).trim() !== '') return String(val).trim();
      }
    }
    var locLabels = FIELD_LABEL_BY_LOCALE[locale];
    if (locLabels) {
      var mapped = locLabels[trimmed] || locLabels[label];
      if (mapped) return mapped;
    }
    return label;
  }
  const shop = window.Shopify?.shop || (cfg.shop || '');
  var shopCountryCode = (cfg.shopCountryCode || 'US');

  // Config caching: short TTL so Appearance / form saves show on storefront soon; tab focus still forces refresh.
  var loggedInCustIdForCache =
    cfg.customerLoggedIn && cfg.shopifyLoggedInCustomerId != null && String(cfg.shopifyLoggedInCustomerId).trim() !== ''
      ? String(cfg.shopifyLoggedInCustomerId).trim()
      : '0';
  var CONFIG_CACHE_KEY =
    'customer_approval_config_' + shop + '_' + (embedFormId || '') + '_' + locale + '_' + loggedInCustIdForCache;
  var CONFIG_CACHE_TTL_MS = 5 * 60 * 1000; // 5 min — fast repeat loads; tab-switch refresh only after long absence (below)
  var FORM_HTML_CACHE_KEY =
    'customer_approval_rendered_form_' + shop + '_' + (embedFormId || '') + '_' + locale + '_' + loggedInCustIdForCache;
  var FORM_HTML_CACHE_TTL_MS = 30 * 60 * 1000;

  function readCachedConfig() {
    try {
      var raw = null;
      if (window.sessionStorage) {
        raw = sessionStorage.getItem(CONFIG_CACHE_KEY);
      }
      if (!raw && window.localStorage) {
        raw = localStorage.getItem(CONFIG_CACHE_KEY);
      }
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return null;
      if (parsed.ts && (Date.now() - parsed.ts) > CONFIG_CACHE_TTL_MS) return null;
      if (!parsed.data || typeof parsed.data !== 'object') {
        return null;
      }
      return parsed.data || null;
    } catch (e) {
      return null;
    }
  }

  function writeCachedConfig(cfg) {
    try {
      var payload = { ts: Date.now(), data: cfg };
      var json = JSON.stringify(payload);
      if (window.sessionStorage) sessionStorage.setItem(CONFIG_CACHE_KEY, json);
      if (window.localStorage) localStorage.setItem(CONFIG_CACHE_KEY, json);
    } catch (e) {
      // ignore quota / privacy mode
    }
  }

  function clearStoredApprovalConfigCache() {
    try {
      if (window.sessionStorage) sessionStorage.removeItem(CONFIG_CACHE_KEY);
      if (window.localStorage) localStorage.removeItem(CONFIG_CACHE_KEY);
    } catch (eClr) {
      void eClr;
    }
  }

  function readCachedRenderedFormHtml() {
    try {
      var raw = null;
      if (window.sessionStorage) raw = sessionStorage.getItem(FORM_HTML_CACHE_KEY);
      if (!raw && window.localStorage) raw = localStorage.getItem(FORM_HTML_CACHE_KEY);
      if (!raw) return '';
      var parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return '';
      if (parsed.ts && (Date.now() - parsed.ts) > FORM_HTML_CACHE_TTL_MS) return '';
      if (typeof parsed.html !== 'string' || !parsed.html.trim()) return '';
      return parsed.html;
    } catch (e) {
      return '';
    }
  }

  function writeCachedRenderedFormHtml(html) {
    try {
      if (typeof html !== 'string' || !html.trim()) return;
      var payload = JSON.stringify({ ts: Date.now(), html: html });
      if (window.sessionStorage) sessionStorage.setItem(FORM_HTML_CACHE_KEY, payload);
      if (window.localStorage) localStorage.setItem(FORM_HTML_CACHE_KEY, payload);
    } catch (e) {
      // ignore quota/privacy mode
    }
  }

  // Config URL must match inline prefetch in registration-form-embed.liquid when locale/formId/customer id align.
  var customerShopifyIdParam =
    cfg.customerLoggedIn && cfg.shopifyLoggedInCustomerId != null && String(cfg.shopifyLoggedInCustomerId).trim() !== ''
      ? '&customerShopifyId=' + encodeURIComponent(String(cfg.shopifyLoggedInCustomerId).trim())
      : '';
  var customerEmailParam =
    cfg.customerLoggedIn && cfg.customerEmail && String(cfg.customerEmail).trim() !== ''
      ? '&customerEmail=' + encodeURIComponent(String(cfg.customerEmail).trim())
      : '';
  var configUrl =
    '/apps/customer-approval/config?shop=' +
    encodeURIComponent(shop) +
    '&locale=' +
    encodeURIComponent(locale) +
    formIdParam +
    customerShopifyIdParam +
    customerEmailParam;
  var configPromise;
  function wireConfigPromise(p) {
    return p.then(function (cfg) {
      writeCachedConfig(cfg);
      return cfg;
    });
  }
  if (window.__approvefyConfigPrefetchUrl === configUrl && window.__approvefyConfigPromise) {
    configPromise = wireConfigPromise(window.__approvefyConfigPromise);
    window.__approvefyConfigPromise = configPromise;
  } else {
    configPromise = wireConfigPromise(
      fetch(configUrl, { cache: 'default', credentials: 'same-origin' }).then(function (r) {
        return r.json();
      })
    );
    window.__approvefyConfigPrefetchUrl = configUrl;
    window.__approvefyConfigPromise = configPromise;
  }

  function fetchFreshConfig() {
    clearStoredApprovalConfigCache();
    var fresh = fetch(configUrl + '&_t=' + Date.now(), { cache: 'reload', credentials: 'same-origin' })
      .then(function (r) {
        return r.json();
      })
      .then(function (cfg) {
        writeCachedConfig(cfg);
        return cfg;
      });
    configPromise = fresh;
    window.__approvefyConfigPromise = fresh;
    window.__approvefyConfigPrefetchUrl = configUrl;
    return configPromise;
  }

  function refreshConfigAndForm() {
    fetchFreshConfig().then(function () {
      var inlineBlock = document.querySelector('[data-approvefy-registration-block]');
      if (inlineBlock) inlineBlock.removeAttribute('data-approvefy-mounted');
      init(shop);
    });
  }
  // Avoid refetch + full remount on every tab return (felt like slow “refresh” for guests).
  // Still pick up admin changes after the tab was in background for a while or bfcache restore.
  var lastTabHiddenAt = 0;
  var VISIBILITY_REFRESH_MIN_HIDDEN_MS = 5 * 60 * 1000;
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') {
      lastTabHiddenAt = Date.now();
      return;
    }
    if (lastTabHiddenAt <= 0) return;
    var hiddenFor = Date.now() - lastTabHiddenAt;
    lastTabHiddenAt = 0;
    if (hiddenFor < VISIBILITY_REFRESH_MIN_HIDDEN_MS) return;
    refreshConfigAndForm();
  });
  window.addEventListener('pageshow', function (ev) {
    if (ev.persisted) refreshConfigAndForm();
  });

  var COUNTRY_PHONES = [
    {c:'AF',d:'+93',n:'Afghanistan'},{c:'AL',d:'+355',n:'Albania'},{c:'DZ',d:'+213',n:'Algeria'},{c:'AD',d:'+376',n:'Andorra'},{c:'AO',d:'+244',n:'Angola'},{c:'AG',d:'+1268',n:'Antigua'},{c:'AR',d:'+54',n:'Argentina'},{c:'AM',d:'+374',n:'Armenia'},{c:'AU',d:'+61',n:'Australia'},{c:'AT',d:'+43',n:'Austria'},{c:'AZ',d:'+994',n:'Azerbaijan'},
    {c:'BS',d:'+1242',n:'Bahamas'},{c:'BH',d:'+973',n:'Bahrain'},{c:'BD',d:'+880',n:'Bangladesh'},{c:'BB',d:'+1246',n:'Barbados'},{c:'BY',d:'+375',n:'Belarus'},{c:'BE',d:'+32',n:'Belgium'},{c:'BZ',d:'+501',n:'Belize'},{c:'BJ',d:'+229',n:'Benin'},{c:'BT',d:'+975',n:'Bhutan'},{c:'BO',d:'+591',n:'Bolivia'},{c:'BA',d:'+387',n:'Bosnia'},{c:'BW',d:'+267',n:'Botswana'},
    {c:'BR',d:'+55',n:'Brazil'},{c:'BN',d:'+673',n:'Brunei'},{c:'BG',d:'+359',n:'Bulgaria'},{c:'BF',d:'+226',n:'Burkina Faso'},{c:'BI',d:'+257',n:'Burundi'},{c:'KH',d:'+855',n:'Cambodia'},{c:'CM',d:'+237',n:'Cameroon'},{c:'CA',d:'+1',n:'Canada'},{c:'CV',d:'+238',n:'Cape Verde'},{c:'CF',d:'+236',n:'Central African Rep'},{c:'TD',d:'+235',n:'Chad'},{c:'CL',d:'+56',n:'Chile'},
    {c:'CN',d:'+86',n:'China'},{c:'CO',d:'+57',n:'Colombia'},{c:'KM',d:'+269',n:'Comoros'},{c:'CG',d:'+242',n:'Congo'},{c:'CD',d:'+243',n:'DR Congo'},{c:'CR',d:'+506',n:'Costa Rica'},{c:'CI',d:'+225',n:'Ivory Coast'},{c:'HR',d:'+385',n:'Croatia'},{c:'CU',d:'+53',n:'Cuba'},{c:'CY',d:'+357',n:'Cyprus'},{c:'CZ',d:'+420',n:'Czech Republic'},
    {c:'DK',d:'+45',n:'Denmark'},{c:'DJ',d:'+253',n:'Djibouti'},{c:'DM',d:'+1767',n:'Dominica'},{c:'DO',d:'+1809',n:'Dominican Rep'},{c:'EC',d:'+593',n:'Ecuador'},{c:'EG',d:'+20',n:'Egypt'},{c:'SV',d:'+503',n:'El Salvador'},{c:'GQ',d:'+240',n:'Equatorial Guinea'},{c:'ER',d:'+291',n:'Eritrea'},{c:'EE',d:'+372',n:'Estonia'},{c:'SZ',d:'+268',n:'Eswatini'},{c:'ET',d:'+251',n:'Ethiopia'},
    {c:'FJ',d:'+679',n:'Fiji'},{c:'FI',d:'+358',n:'Finland'},{c:'FR',d:'+33',n:'France'},{c:'GA',d:'+241',n:'Gabon'},{c:'GM',d:'+220',n:'Gambia'},{c:'GE',d:'+995',n:'Georgia'},{c:'DE',d:'+49',n:'Germany'},{c:'GH',d:'+233',n:'Ghana'},{c:'GR',d:'+30',n:'Greece'},{c:'GD',d:'+1473',n:'Grenada'},{c:'GT',d:'+502',n:'Guatemala'},{c:'GN',d:'+224',n:'Guinea'},{c:'GW',d:'+245',n:'Guinea-Bissau'},{c:'GY',d:'+592',n:'Guyana'},
    {c:'HT',d:'+509',n:'Haiti'},{c:'HN',d:'+504',n:'Honduras'},{c:'HK',d:'+852',n:'Hong Kong'},{c:'HU',d:'+36',n:'Hungary'},{c:'IS',d:'+354',n:'Iceland'},{c:'IN',d:'+91',n:'India'},{c:'ID',d:'+62',n:'Indonesia'},{c:'IR',d:'+98',n:'Iran'},{c:'IQ',d:'+964',n:'Iraq'},{c:'IE',d:'+353',n:'Ireland'},{c:'IL',d:'+972',n:'Israel'},{c:'IT',d:'+39',n:'Italy'},
    {c:'JM',d:'+1876',n:'Jamaica'},{c:'JP',d:'+81',n:'Japan'},{c:'JO',d:'+962',n:'Jordan'},{c:'KZ',d:'+7',n:'Kazakhstan'},{c:'KE',d:'+254',n:'Kenya'},{c:'KI',d:'+686',n:'Kiribati'},{c:'KP',d:'+850',n:'North Korea'},{c:'KR',d:'+82',n:'South Korea'},{c:'KW',d:'+965',n:'Kuwait'},{c:'KG',d:'+996',n:'Kyrgyzstan'},{c:'LA',d:'+856',n:'Laos'},{c:'LV',d:'+371',n:'Latvia'},{c:'LB',d:'+961',n:'Lebanon'},{c:'LS',d:'+266',n:'Lesotho'},{c:'LR',d:'+231',n:'Liberia'},{c:'LY',d:'+218',n:'Libya'},{c:'LI',d:'+423',n:'Liechtenstein'},{c:'LT',d:'+370',n:'Lithuania'},{c:'LU',d:'+352',n:'Luxembourg'},
    {c:'MO',d:'+853',n:'Macau'},{c:'MG',d:'+261',n:'Madagascar'},{c:'MW',d:'+265',n:'Malawi'},{c:'MY',d:'+60',n:'Malaysia'},{c:'MV',d:'+960',n:'Maldives'},{c:'ML',d:'+223',n:'Mali'},{c:'MT',d:'+356',n:'Malta'},{c:'MH',d:'+692',n:'Marshall Islands'},{c:'MR',d:'+222',n:'Mauritania'},{c:'MU',d:'+230',n:'Mauritius'},{c:'MX',d:'+52',n:'Mexico'},{c:'FM',d:'+691',n:'Micronesia'},{c:'MD',d:'+373',n:'Moldova'},{c:'MC',d:'+377',n:'Monaco'},{c:'MN',d:'+976',n:'Mongolia'},{c:'ME',d:'+382',n:'Montenegro'},{c:'MA',d:'+212',n:'Morocco'},{c:'MZ',d:'+258',n:'Mozambique'},{c:'MM',d:'+95',n:'Myanmar'},
    {c:'NA',d:'+264',n:'Namibia'},{c:'NR',d:'+674',n:'Nauru'},{c:'NP',d:'+977',n:'Nepal'},{c:'NL',d:'+31',n:'Netherlands'},{c:'NZ',d:'+64',n:'New Zealand'},{c:'NI',d:'+505',n:'Nicaragua'},{c:'NE',d:'+227',n:'Niger'},{c:'NG',d:'+234',n:'Nigeria'},{c:'MK',d:'+389',n:'North Macedonia'},{c:'NO',d:'+47',n:'Norway'},{c:'OM',d:'+968',n:'Oman'},{c:'PK',d:'+92',n:'Pakistan'},{c:'PW',d:'+680',n:'Palau'},{c:'PA',d:'+507',n:'Panama'},{c:'PG',d:'+675',n:'Papua New Guinea'},{c:'PY',d:'+595',n:'Paraguay'},{c:'PE',d:'+51',n:'Peru'},{c:'PH',d:'+63',n:'Philippines'},{c:'PL',d:'+48',n:'Poland'},{c:'PT',d:'+351',n:'Portugal'},{c:'PR',d:'+1787',n:'Puerto Rico'},{c:'QA',d:'+974',n:'Qatar'},
    {c:'RO',d:'+40',n:'Romania'},{c:'RU',d:'+7',n:'Russia'},{c:'RW',d:'+250',n:'Rwanda'},{c:'KN',d:'+1869',n:'Saint Kitts'},{c:'LC',d:'+1758',n:'Saint Lucia'},{c:'VC',d:'+1784',n:'Saint Vincent'},{c:'WS',d:'+685',n:'Samoa'},{c:'SM',d:'+378',n:'San Marino'},{c:'ST',d:'+239',n:'Sao Tome'},{c:'SA',d:'+966',n:'Saudi Arabia'},{c:'SN',d:'+221',n:'Senegal'},{c:'RS',d:'+381',n:'Serbia'},{c:'SC',d:'+248',n:'Seychelles'},{c:'SL',d:'+232',n:'Sierra Leone'},{c:'SG',d:'+65',n:'Singapore'},{c:'SK',d:'+421',n:'Slovakia'},{c:'SI',d:'+386',n:'Slovenia'},{c:'SB',d:'+677',n:'Solomon Islands'},{c:'SO',d:'+252',n:'Somalia'},{c:'ZA',d:'+27',n:'South Africa'},{c:'SS',d:'+211',n:'South Sudan'},{c:'ES',d:'+34',n:'Spain'},{c:'LK',d:'+94',n:'Sri Lanka'},{c:'SD',d:'+249',n:'Sudan'},{c:'SR',d:'+597',n:'Suriname'},{c:'SE',d:'+46',n:'Sweden'},{c:'CH',d:'+41',n:'Switzerland'},{c:'SY',d:'+963',n:'Syria'},
    {c:'TW',d:'+886',n:'Taiwan'},{c:'TJ',d:'+992',n:'Tajikistan'},{c:'TZ',d:'+255',n:'Tanzania'},{c:'TH',d:'+66',n:'Thailand'},{c:'TL',d:'+670',n:'Timor-Leste'},{c:'TG',d:'+228',n:'Togo'},{c:'TO',d:'+676',n:'Tonga'},{c:'TT',d:'+1868',n:'Trinidad'},{c:'TN',d:'+216',n:'Tunisia'},{c:'TR',d:'+90',n:'Turkey'},{c:'TM',d:'+993',n:'Turkmenistan'},{c:'TV',d:'+688',n:'Tuvalu'},{c:'UG',d:'+256',n:'Uganda'},{c:'UA',d:'+380',n:'Ukraine'},{c:'AE',d:'+971',n:'UAE'},{c:'GB',d:'+44',n:'United Kingdom'},{c:'US',d:'+1',n:'United States'},{c:'UY',d:'+598',n:'Uruguay'},{c:'UZ',d:'+998',n:'Uzbekistan'},{c:'VU',d:'+678',n:'Vanuatu'},{c:'VA',d:'+379',n:'Vatican'},{c:'VE',d:'+58',n:'Venezuela'},{c:'VN',d:'+84',n:'Vietnam'},{c:'YE',d:'+967',n:'Yemen'},{c:'ZM',d:'+260',n:'Zambia'},{c:'ZW',d:'+263',n:'Zimbabwe'},{c:'XK',d:'+383',n:'Kosovo'}
  ];

  var FLAG_CDN = 'https://flagcdn.com/24x18/';

  /** Dial codes sorted by length descending so +353 matches before +33, +33 before +3 */
  var COUNTRY_PHONES_BY_DIAL_LENGTH = COUNTRY_PHONES.slice().sort(function(a, b) { return (b.d.length - a.d.length); });

  /**
   * If value starts with + and matches a country dial code, return { country, nationalNumber }.
   * nationalNumber is the rest of the value after the dial code (digits/spaces only, trimmed).
   */
  function parsePhoneWithCountryCode(value) {
    if (!value || typeof value !== 'string') return null;
    var raw = value.trim();
    if (raw.charAt(0) !== '+') return null;
    var digitsAfterPlus = raw.slice(1).replace(/\D/g, '');
    var normalized = '+' + digitsAfterPlus;
    for (var i = 0; i < COUNTRY_PHONES_BY_DIAL_LENGTH.length; i++) {
      var cp = COUNTRY_PHONES_BY_DIAL_LENGTH[i];
      if (normalized === cp.d || (normalized.length > cp.d.length && normalized.indexOf(cp.d) === 0)) {
        var rest = raw.slice(cp.d.length).replace(/^\s+/, '').trim();
        return { country: cp, nationalNumber: rest };
      }
    }
    return null;
  }

  /** Build custom dropdown: closed = "+33 FR", open list = "+33 France" */
  function buildCountryCodeDropdownHTML(defaultCountry, uniqueId) {
    var dc = (defaultCountry || 'US').toUpperCase();
    var selected = null;
    for (var i = 0; i < COUNTRY_PHONES.length; i++) {
      if (COUNTRY_PHONES[i].c === dc) { selected = COUNTRY_PHONES[i]; break; }
    }
    selected = selected || COUNTRY_PHONES[0];
    var triggerText = selected.d + ' ' + selected.c;
    var listHtml = '';
    COUNTRY_PHONES.forEach(function(cp) {
      var activeClass = cp.c === selected.c ? ' active' : '';
      var codeLower = cp.c.toLowerCase();
      listHtml += '<div class="custom-phone-country-item' + activeClass + '" data-dial="' + escapeHtml(cp.d) + '" data-code="' + cp.c + '" data-name="' + escapeHtml(cp.n) + '" data-search="' + escapeHtml((cp.d + ' ' + cp.c + ' ' + cp.n).toLowerCase()) + '"><span class="custom-phone-country-flag-wrap"><img src="' + FLAG_CDN + codeLower + '.png" alt="" class="custom-phone-country-flag" role="presentation"></span>' + cp.d + ' ' + cp.n + '</div>';
    });
    return '<div class="custom-phone-country-dropdown" data-unique="' + uniqueId + '">' +
      '<div class="custom-phone-country-trigger" tabindex="0" role="combobox" aria-expanded="false" aria-haspopup="listbox">' +
        '<span class="custom-phone-country-trigger-flag"><img src="' + FLAG_CDN + selected.c.toLowerCase() + '.png" alt="" role="presentation"></span>' +
        '<span class="custom-phone-country-trigger-text">' + triggerText + '</span>' +
        '<svg viewBox="0 0 12 12"><path fill="currentColor" d="M6 8L1 3h10z"/></svg>' +
      '</div>' +
      '<div class="custom-phone-country-list" role="listbox">' +
        '<input type="text" class="custom-phone-country-search" placeholder="' + escapeHtml(t('searchCountry') || 'Search country...') + '" autocomplete="off" aria-label="' + escapeHtml(t('searchCountry') || 'Search country') + '">' +
        '<div class="custom-phone-country-no-results">No country found</div>' +
        '<div class="custom-phone-country-list-inner">' + listHtml + '</div>' +
      '</div>' +
      '<input type="hidden" name="phoneCountryCode" value="' + escapeHtml(selected.d) + '">' +
    '</div>';
  }

  // Map Form Builder field types to HTML input types
  function getInputType(fieldType) {
    const k = String(fieldType || '').trim().toLowerCase();
    const map = {
      first_name: 'text',
      last_name: 'text',
      text: 'text',
      textarea: 'text',
      email: 'email',
      password: 'password',
      phone: 'tel',
      number: 'number',
      company: 'text',
      date: 'date',
      address: 'text',
      zip_code: 'text',
      city: 'text',
      state: 'text',
      country: 'text'
    };
    return map[k] || 'text';
  }
  
  // Map field type to backend API input name
  function getFieldName(field, index) {
    const t = String(field && field.type != null ? field.type : '').trim().toLowerCase();
    const backendMap = {
      first_name: 'firstName',
      last_name: 'lastName',
      email: 'email',
      phone: 'phone',
      company: 'company',
      password: 'password',
      address: 'address',
      zip_code: 'zipCode',
      city: 'city',
      state: 'state',
      country: 'country'
    };
    return backendMap[t] || ('custom_' + String(field.label || '').toLowerCase().replace(/\s+/g, '_') + '_' + index);
  }

  // Date format placeholders (example text for each format)
  var DATE_FORMAT_PLACEHOLDERS = {
    dd_slash_mm_yyyy: '05/03/2026',
    mm_slash_dd_yyyy: '03/05/2026',
    yyyy_slash_mm_dd: '2026/03/05',
    yyyy_dash_mm_dd: '2026-03-05',
    dd_dash_mm_yyyy: '05-03-2026',
    mm_dash_dd_yy: '03-05-26',
    dd_dot_mm_yyyy: '05.03.2026',
    yyyymmdd: '20260305',
    dd_short_month_yyyy: '05 Mar 2026',
    d_short_month_yyyy: '5 Mar 2026',
    short_month_dd_yyyy: 'Mar 05, 2026',
    short_month_d_yyyy: 'Mar 5, 2026',
    dd_dash_short_month_yyyy: '05-Mar-2026',
    dd_full_month_yyyy: '05 March 2026',
    full_month_dd_yyyy: 'March 05, 2026',
    d_ordinal_full_month_yyyy: '5th March 2026',
    weekday_full_month_d_yyyy: 'Thursday, March 5, 2026'
  };

  var MONTH_NAMES_SHORT = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
  var MONTH_NAMES_FULL = ['january','february','march','april','may','june','july','august','september','october','november','december'];

  function parseDateByFormat(str, formatKey) {
    if (!str || typeof str !== 'string') return null;
    var s = str.trim();
    if (!s) return null;
    var d, m, y;
    var parts, monthIdx;

    switch (formatKey) {
      case 'dd_slash_mm_yyyy':
        parts = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
        if (parts) { d = parts[1]; m = parts[2]; y = parts[3]; }
        break;
      case 'mm_slash_dd_yyyy':
        parts = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
        if (parts) { m = parts[1]; d = parts[2]; y = parts[3]; }
        break;
      case 'yyyy_slash_mm_dd':
        parts = s.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
        if (parts) { y = parts[1]; m = parts[2]; d = parts[3]; }
        break;
      case 'yyyy_dash_mm_dd':
        parts = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
        if (parts) { y = parts[1]; m = parts[2]; d = parts[3]; }
        break;
      case 'dd_dash_mm_yyyy':
        parts = s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
        if (parts) { d = parts[1]; m = parts[2]; y = parts[3]; }
        break;
      case 'mm_dash_dd_yy':
        parts = s.match(/^(\d{1,2})-(\d{1,2})-(\d{2})$/);
        if (parts) { m = parts[1]; d = parts[2]; y = parts[3]; y = parseInt(y, 10) < 50 ? '20' + y : '19' + y; }
        break;
      case 'dd_dot_mm_yyyy':
        parts = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
        if (parts) { d = parts[1]; m = parts[2]; y = parts[3]; }
        break;
      case 'yyyymmdd':
        parts = s.match(/^(\d{4})(\d{2})(\d{2})$/);
        if (parts) { y = parts[1]; m = parts[2]; d = parts[3]; }
        break;
      case 'dd_short_month_yyyy':
      case 'd_short_month_yyyy':
        parts = s.match(/^(\d{1,2})\s+([a-z]{3})\s+(\d{4})$/i);
        if (parts) { d = parts[1]; y = parts[3]; monthIdx = MONTH_NAMES_SHORT.indexOf(parts[2].toLowerCase()); if (monthIdx >= 0) m = String(monthIdx + 1); }
        break;
      case 'short_month_dd_yyyy':
      case 'short_month_d_yyyy':
        parts = s.match(/^([a-z]{3})\s+(\d{1,2}),?\s+(\d{4})$/i);
        if (parts) { monthIdx = MONTH_NAMES_SHORT.indexOf(parts[1].toLowerCase()); if (monthIdx >= 0) { m = String(monthIdx + 1); d = parts[2]; y = parts[3]; } }
        break;
      case 'dd_dash_short_month_yyyy':
        parts = s.match(/^(\d{1,2})-([a-z]{3})-(\d{4})$/i);
        if (parts) { d = parts[1]; y = parts[3]; monthIdx = MONTH_NAMES_SHORT.indexOf(parts[2].toLowerCase()); if (monthIdx >= 0) m = String(monthIdx + 1); }
        break;
      case 'dd_full_month_yyyy':
        parts = s.match(/^(\d{1,2})\s+([a-z]+)\s+(\d{4})$/i);
        if (parts) { d = parts[1]; y = parts[3]; monthIdx = MONTH_NAMES_FULL.indexOf(parts[2].toLowerCase()); if (monthIdx >= 0) m = String(monthIdx + 1); }
        break;
      case 'full_month_dd_yyyy':
        parts = s.match(/^([a-z]+)\s+(\d{1,2}),?\s+(\d{4})$/i);
        if (parts) { monthIdx = MONTH_NAMES_FULL.indexOf(parts[1].toLowerCase()); if (monthIdx >= 0) { m = String(monthIdx + 1); d = parts[2]; y = parts[3]; } }
        break;
      case 'd_ordinal_full_month_yyyy':
        parts = s.match(/^(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]+)\s+(\d{4})$/i);
        if (parts) { d = parts[1]; y = parts[3]; monthIdx = MONTH_NAMES_FULL.indexOf(parts[2].toLowerCase()); if (monthIdx >= 0) m = String(monthIdx + 1); }
        break;
      case 'weekday_full_month_d_yyyy':
        parts = s.match(/^[a-z]+,\s+([a-z]+)\s+(\d{1,2}),?\s+(\d{4})$/i);
        if (parts) { monthIdx = MONTH_NAMES_FULL.indexOf(parts[1].toLowerCase()); if (monthIdx >= 0) { m = String(monthIdx + 1); d = parts[2]; y = parts[3]; } }
        break;
      default:
        return null;
    }

    if (d == null || m == null || y == null) return null;
    var dd = parseInt(d, 10);
    var mm = parseInt(m, 10);
    var yy = parseInt(y, 10);
    if (isNaN(dd) || isNaN(mm) || isNaN(yy) || mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
    var yStr = String(yy);
    if (yStr.length === 2) yStr = (yy < 50 ? '20' : '19') + yStr;
    var mStr = mm < 10 ? '0' + mm : String(mm);
    var dStr = dd < 10 ? '0' + dd : String(dd);
    return yStr + '-' + mStr + '-' + dStr;
  }

  function formatDateToDisplay(isoYyyyMmDd, formatKey) {
    if (!isoYyyyMmDd || typeof isoYyyyMmDd !== 'string') return '';
    var parts = isoYyyyMmDd.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!parts) return '';
    var y = parts[1];
    var m = parts[2];
    var d = parts[3];
    var mm = parseInt(m, 10);
    var dd = parseInt(d, 10);
    var monthShort = MONTH_NAMES_SHORT[mm - 1] ? (MONTH_NAMES_SHORT[mm - 1].charAt(0).toUpperCase() + MONTH_NAMES_SHORT[mm - 1].slice(1)) : '';
    var monthFull = MONTH_NAMES_FULL[mm - 1] ? (MONTH_NAMES_FULL[mm - 1].charAt(0).toUpperCase() + MONTH_NAMES_FULL[mm - 1].slice(1)) : '';
    var ord = (n) => { var j = n % 10, k = n % 100; return n + (j === 1 && k !== 11 ? 'st' : j === 2 && k !== 12 ? 'nd' : j === 3 && k !== 13 ? 'rd' : 'th'); };
    var weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    var dateObj = new Date(parseInt(parts[1], 10), mm - 1, dd);
    var weekday = weekdays[dateObj.getDay()];
    switch (formatKey) {
      case 'dd_slash_mm_yyyy': return d + '/' + m + '/' + y;
      case 'mm_slash_dd_yyyy': return m + '/' + d + '/' + y;
      case 'yyyy_slash_mm_dd': return y + '/' + m + '/' + d;
      case 'yyyy_dash_mm_dd': return y + '-' + m + '-' + d;
      case 'dd_dash_mm_yyyy': return d + '-' + m + '-' + y;
      case 'mm_dash_dd_yy': return m + '-' + d + '-' + y.slice(2);
      case 'dd_dot_mm_yyyy': return d + '.' + m + '.' + y;
      case 'yyyymmdd': return y + m + d;
      case 'dd_short_month_yyyy': return d + ' ' + monthShort + ' ' + y;
      case 'd_short_month_yyyy': return String(dd) + ' ' + monthShort + ' ' + y;
      case 'short_month_dd_yyyy': return monthShort + ' ' + d + ', ' + y;
      case 'short_month_d_yyyy': return monthShort + ' ' + dd + ', ' + y;
      case 'dd_dash_short_month_yyyy': return d + '-' + monthShort + '-' + y;
      case 'dd_full_month_yyyy': return d + ' ' + monthFull + ' ' + y;
      case 'full_month_dd_yyyy': return monthFull + ' ' + d + ', ' + y;
      case 'd_ordinal_full_month_yyyy': return ord(dd) + ' ' + monthFull + ' ' + y;
      case 'weekday_full_month_d_yyyy': return weekday + ', ' + monthFull + ' ' + dd + ', ' + y;
      default: return isoYyyyMmDd;
    }
  }
  
  // Build single field HTML (uses translated labels when locale is French)
  function buildFieldHTML(field, index) {
    var displayLabel = translateLabel(field.label) || field.label;
    const inputType = getInputType(field.type);
    const name = getFieldName(field, index);
    const requiredAttr = field.required ? ' required' : '';
    const requiredStar = field.required ? ' <span class="required">*</span>' : '';
    const isPassword = String(field.type || '').toLowerCase() === 'password';

    var helpHtml = (field.helpText && String(field.helpText).trim()) ? '<p class="custom-help-text">' + escapeHtml(field.helpText) + '</p>' : '';
    var phPhone = (field.placeholder && String(field.placeholder).trim()) ? field.placeholder : t('phonePlaceholder');
    var widthClass = 'field-w-' + (field.width || '100');

    // File upload field (uses drag & drop zone + hidden JS data map)
    if (field.type === 'file_upload') {
      var maxCount = typeof field.maxFileCount === 'number' && field.maxFileCount > 0 ? field.maxFileCount : 1;
      var rawMb = field.maxFileSizeMb != null ? field.maxFileSizeMb : (field.max_file_size_mb != null ? field.max_file_size_mb : 5);
      var maxFileSizeMb = typeof rawMb === 'number' && rawMb > 0 ? rawMb : (typeof rawMb === 'string' ? (parseInt(rawMb, 10) || 5) : 5);
      if (maxFileSizeMb < 1 || maxFileSizeMb > 100) maxFileSizeMb = 5;
      var zoneId = 'file-upload-' + index;
      var uploadLabel = t('uploadClickOrDrag') || 'Click or drag to upload';
      var hintMax = t('uploadHintMax');
      if (!hintMax || hintMax === 'uploadHintMax') hintMax = 'JPG, PNG, PDF \u2014 Max {max} MB';
      var uploadHint = hintMax.replace('{max}', String(maxFileSizeMb)) + (maxCount > 1 ? ' \u00b7 Max ' + maxCount + ' files' : '');
      var multipleAttr = maxCount > 1 ? ' multiple' : '';
      return '<div class="custom-form-field ' + widthClass + '">' +
        '<label>' + escapeHtml(displayLabel) + requiredStar + '</label>' +
        helpHtml +
        '<div class="custom-file-upload-zone" id="' + zoneId + '" data-field-name="' + name + '" data-max-file-count="' + maxCount + '" data-max-file-size-mb="' + maxFileSizeMb + '"' + (field.required ? ' data-required="true"' : '') + '>' +
          '<div class="custom-file-upload-prompt">' +
            '<div class="custom-file-upload-icon" aria-hidden="true">' +
              '<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>' +
            '</div>' +
            '<div class="custom-file-upload-text">' + escapeHtml(uploadLabel) + '</div>' +
            '<div class="custom-file-upload-hint">' + escapeHtml(uploadHint) + '</div>' +
          '</div>' +
          '<input type="file" accept=".jpg,.jpeg,.png,.pdf" style="display:none;"' + multipleAttr + ' />' +
          '<div class="custom-file-upload-progress" style="display:none;">' +
            '<span class="custom-file-upload-spinner" aria-hidden="true"></span>' +
            '<div class="custom-file-upload-progress-track">' +
              '<div class="custom-file-upload-progress-bar"></div>' +
            '</div>' +
            '<div class="custom-file-upload-progress-text"></div>' +
          '</div>' +
          '<div class="custom-file-upload-list"></div>' +
        '</div>' +
        '<div class="custom-file-upload-error" id="' + zoneId + '-error" style="display:none;"></div>' +
      '</div>';
    }

    if (field.type === 'phone') {
      var defaultPhoneCountry = (field.phoneCountryCode && String(field.phoneCountryCode).trim()) ? field.phoneCountryCode : shopCountryCode;
      var phoneDropdownId = 'phone-dd-' + index;
      var phoneDropdownHtml = buildCountryCodeDropdownHTML(defaultPhoneCountry, phoneDropdownId);
      return '<div class="custom-form-field ' + widthClass + '">' +
        '<label>' + escapeHtml(displayLabel) + requiredStar + '</label>' +
        helpHtml +
        '<div class="custom-phone-wrapper">' +
          phoneDropdownHtml +
          '<input type="tel" name="' + name + '" data-field-type="phone" data-field-label="' + escapeHtml(field.label) + '" data-step="' + (field.step || 1) + '"' + requiredAttr + ' placeholder="' + escapeHtml(phPhone) + '">' +
        '</div>' +
        '<div class="custom-phone-error" id="phone-field-error" style="display:none;"></div>' +
      '</div>';
    }

    if (field.type === 'heading') {
      return '';
    }

    if (field.type === 'dropdown') {
      var opts = field.options && field.options.length > 0 ? field.options : ['Option 1', 'Option 2'];
      var placeholder = (field.placeholder && String(field.placeholder).trim()) ? field.placeholder : t('selectPlaceholder');
      var listHtml = '';
      opts.forEach(function(o) {
        listHtml += '<div class="custom-select-item" data-value="' + escapeHtml(o) + '">' + escapeHtml(o) + '</div>';
      });
      var ddId = 'custom-dd-' + index;
      var reqDataAttr = field.required ? ' data-required="true"' : '';
      var reqInputAttr = field.required ? ' required' : '';
      return '<div class="custom-form-field ' + widthClass + '">' +
        '<label>' + escapeHtml(displayLabel) + requiredStar + '</label>' +
        helpHtml +
        '<div class="custom-select-dropdown" id="' + ddId + '" data-field-name="' + name + '" data-field-type="dropdown" data-field-label="' + escapeHtml(field.label) + '" data-step="' + (field.step || 1) + '"' + reqDataAttr + '>' +
          '<div class="custom-select-trigger" tabindex="0" role="combobox" aria-expanded="false" aria-haspopup="listbox">' +
            '<span class="custom-select-trigger-text placeholder">' + escapeHtml(placeholder) + '</span>' +
            '<svg viewBox="0 0 12 12"><path fill="currentColor" d="M6 8L1 3h10z"/></svg>' +
          '</div>' +
          '<div class="custom-select-list" role="listbox">' + listHtml + '</div>' +
          '<input type="hidden" name="' + name + '" value=""' + reqInputAttr + '>' +
        '</div>' +
        '<div class="custom-field-error" style="display:none;"></div>' +
      '</div>';
    }

    if (field.type === 'radio') {
      var radioOpts = field.options && field.options.length > 0 ? field.options : ['Option 1', 'Option 2'];
      var radioHtml = '';
      radioOpts.forEach(function(o) {
        radioHtml += '<label class="custom-radio-item"><input type="radio" name="' + name + '" value="' + escapeHtml(o) + '" data-field-type="radio" data-field-label="' + escapeHtml(field.label) + '" data-step="' + (field.step || 1) + '"' + requiredAttr + '><span class="custom-option-label-text">' + escapeHtml(o) + '</span></label>';
      });
      return '<div class="custom-form-field ' + widthClass + '">' +
        '<label>' + escapeHtml(displayLabel) + requiredStar + '</label>' +
        helpHtml +
        '<div class="custom-options-group">' + radioHtml + '</div>' +
        '<div class="custom-field-error" style="display:none;"></div>' +
      '</div>';
    }

    if (field.type === 'checkbox') {
      var checkOpts = field.options && field.options.length > 0 ? field.options : ['Option 1', 'Option 2'];
      var minReq = field.minRequired != null ? field.minRequired : (field.required ? 1 : 0);
      var checkboxRequiredStar = (field.required || (field.minRequired != null && field.minRequired >= 1)) ? ' <span class="required">*</span>' : '';
      var checkHtml = '';
      checkOpts.forEach(function(o, idx) {
        var reqAttr = (minReq >= 1 && idx === 0) ? ' required' : '';
        checkHtml += '<label class="custom-checkbox-item"><input type="checkbox" name="' + name + '" value="' + escapeHtml(o) + '" data-field-type="checkbox" data-field-label="' + escapeHtml(field.label) + '" data-step="' + (field.step || 1) + '"' + reqAttr + '><span class="custom-option-label-text">' + escapeHtml(o) + '</span></label>';
      });
      return '<div class="custom-form-field ' + widthClass + '">' +
        '<label>' + escapeHtml(displayLabel) + checkboxRequiredStar + '</label>' +
        helpHtml +
        '<div class="custom-options-group" data-min-required="' + minReq + '" data-field-name="' + escapeHtml(name) + '" data-field-label="' + escapeHtml(field.label) + '">' + checkHtml + '</div>' +
        '<div class="custom-checkbox-error" style="display:none;"></div>' +
      '</div>';
    }

    if (field.type === 'newsletter') {
      var translatedNewsletterLabel = t('newsletterOptionYes');
      var hasTranslatedNewsletter =
        translatedNewsletterLabel &&
        translatedNewsletterLabel !== 'newsletterOptionYes';
      var newsletterLabel = hasTranslatedNewsletter
        ? translatedNewsletterLabel
        : ((field.options && field.options.length > 0 && String(field.options[0]).trim())
            ? String(field.options[0]).trim()
            : 'Yes, I want email updates');
      var newsletterRequired = field.required ? 1 : 0;
      return '<div class="custom-form-field ' + widthClass + '">' +
        '<label>' + escapeHtml(displayLabel) + (newsletterRequired ? ' <span class="required">*</span>' : '') + '</label>' +
        helpHtml +
        '<div class="custom-options-group" data-min-required="' + newsletterRequired + '" data-field-name="' + escapeHtml(name) + '" data-field-label="' + escapeHtml(field.label) + '">' +
          '<label class="custom-checkbox-item"><input type="checkbox" name="' + name + '" value="yes" data-field-type="newsletter" data-field-label="' + escapeHtml(field.label) + '" data-step="' + (field.step || 1) + '"><span class="custom-option-label-text">' + escapeHtml(newsletterLabel) + '</span></label>' +
        '</div>' +
        '<div class="custom-checkbox-error" style="display:none;"></div>' +
      '</div>';
    }

    if (field.type === 'textarea') {
      var ph = (field.placeholder && String(field.placeholder).trim()) ? field.placeholder : displayLabel;
      return '<div class="custom-form-field ' + widthClass + '">' +
        '<label>' + escapeHtml(displayLabel) + requiredStar + '</label>' +
        helpHtml +
        '<textarea name="' + name + '" rows="4" data-field-type="textarea" data-field-label="' + escapeHtml(field.label) + '" data-step="' + (field.step || 1) + '"' + requiredAttr + ' placeholder="' + escapeHtml(ph) + '"></textarea>' +
        '<div class="custom-field-error" style="display:none;"></div>' +
      '</div>';
    }

    var isAddressField = field.type === 'address' || LABEL_TO_KEY[field.label] === 'address';
    if (isAddressField) {
      var addressPh = (field.placeholder && String(field.placeholder).trim()) ? field.placeholder : (t('addressPlaceholder') || 'Enter your address');
      return '<div class="custom-form-field ' + widthClass + ' address-autocomplete-wrap">' +
        '<label>' + escapeHtml(displayLabel) + requiredStar + '</label>' +
        helpHtml +
        '<input type="text" name="' + name + '" data-field-type="address" data-field-label="' + escapeHtml(field.label) + '" data-step="' + (field.step || 1) + '" autocomplete="off"' + requiredAttr + ' placeholder="' + escapeHtml(addressPh) + '">' +
        '<ul class="address-autocomplete-list" role="listbox" aria-label="Address suggestions" style="display:none;"></ul>' +
        '<div class="custom-field-error" style="display:none;"></div>' +
      '</div>';
    }

    if (field.type === 'country') {
      var defaultCountry = (field.phoneCountryCode && String(field.phoneCountryCode).trim()) ? field.phoneCountryCode : shopCountryCode;
      var dc = (defaultCountry || 'US').toUpperCase();
      var selectedCountry = null;
      for (var ci = 0; ci < COUNTRY_PHONES.length; ci++) {
        if (COUNTRY_PHONES[ci].c === dc) { selectedCountry = COUNTRY_PHONES[ci]; break; }
      }
      selectedCountry = selectedCountry || COUNTRY_PHONES[0];
      var selectCountryLabel = t('selectCountry');
      var triggerText = selectedCountry ? selectedCountry.n : selectCountryLabel;
      var triggerPlaceholder = !selectedCountry;
      var listItemsHtml = '';
      COUNTRY_PHONES.forEach(function(cp) {
        var activeClass = cp.c === (selectedCountry && selectedCountry.c) ? ' active' : '';
        var searchText = (cp.c + ' ' + cp.n).toLowerCase();
        var codeLower = cp.c.toLowerCase();
        listItemsHtml += '<div class="custom-country-select-item' + activeClass + '" data-value="' + escapeHtml(cp.c) + '" data-name="' + escapeHtml(cp.n) + '" data-search="' + escapeHtml(searchText) + '"><span class="custom-country-select-flag-wrap"><img src="' + FLAG_CDN + codeLower + '.png" alt="" class="custom-country-select-flag" role="presentation"></span>' + escapeHtml(cp.n) + '</div>';
      });
      var triggerFlagSrc = selectedCountry ? FLAG_CDN + selectedCountry.c.toLowerCase() + '.png' : '';
      return '<div class="custom-form-field ' + widthClass + '">' +
        '<label>' + escapeHtml(displayLabel) + requiredStar + '</label>' +
        helpHtml +
        '<div class="custom-country-select-dropdown" data-field-type="country" data-field-label="' + escapeHtml(field.label) + '" data-step="' + (field.step || 1) + '">' +
          '<div class="custom-country-select-trigger" tabindex="0" role="combobox" aria-expanded="false" aria-haspopup="listbox">' +
            (triggerFlagSrc ? '<span class="custom-country-select-trigger-flag"><img src="' + triggerFlagSrc + '" alt="" role="presentation"></span>' : '') +
            '<span class="custom-country-select-trigger-text' + (triggerPlaceholder ? ' placeholder' : '') + '">' + escapeHtml(triggerText) + '</span>' +
            '<svg viewBox="0 0 12 12"><path fill="currentColor" d="M6 8L1 3h10z"/></svg>' +
          '</div>' +
          '<div class="custom-country-select-list" role="listbox">' +
            '<input type="text" class="custom-country-select-search" placeholder="' + escapeHtml(t('searchCountry') || 'Search country...') + '" autocomplete="off" aria-label="' + escapeHtml(t('searchCountry') || 'Search country') + '" style="border-radius: 0;">' +
            '<div class="custom-country-select-no-results">No country found</div>' +
            '<div class="custom-country-select-list-inner">' + listItemsHtml + '</div>' +
          '</div>' +
          '<input type="hidden" name="' + name + '" value="' + escapeHtml(selectedCountry ? selectedCountry.c : '') + '"' + requiredAttr + '>' +
        '</div>' +
        '<div class="custom-field-error" style="display:none;"></div>' +
      '</div>';
    }

    if (field.type === 'date' && field.dateFormat) {
      var datePh = (field.placeholder && String(field.placeholder).trim()) ? field.placeholder : (DATE_FORMAT_PLACEHOLDERS[field.dateFormat] || 'YYYY-MM-DD');
      var dateWrapId = 'custom-date-wrap-' + index;
      return '<div class="custom-form-field ' + widthClass + '">' +
        '<label>' + escapeHtml(displayLabel) + requiredStar + '</label>' +
        helpHtml +
        '<div class="custom-date-input-wrap" id="' + dateWrapId + '" data-date-format="' + escapeHtml(field.dateFormat) + '">' +
          '<input type="text" name="' + name + '" data-field-type="date" data-date-format="' + escapeHtml(field.dateFormat) + '" data-field-label="' + escapeHtml(field.label) + '" data-step="' + (field.step || 1) + '"' + requiredAttr + ' placeholder="' + escapeHtml(datePh) + '" autocomplete="off">' +
          '<button type="button" class="custom-date-picker-btn" aria-label="' + escapeHtml(t('openCalendar') || 'Choose date') + '" tabindex="-1">' +
            '<svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path fill-rule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clip-rule="evenodd"/></svg>' +
          '</button>' +
          '<div class="custom-date-picker" role="dialog" aria-label="' + escapeHtml(t('chooseDate') || 'Choose date') + '" style="display:none;"></div>' +
        '</div>' +
        '<div class="custom-field-error" style="display:none;"></div>' +
      '</div>';
    }

    var inputPlaceholder = (field.placeholder && String(field.placeholder).trim()) ? field.placeholder : displayLabel;
    const minLength = isPassword ? ' minlength="8"' : '';
    return '<div class="custom-form-field ' + widthClass + '">' +
      '<label>' + escapeHtml(displayLabel) + requiredStar + '</label>' +
      helpHtml +
      '<input type="' + inputType + '" name="' + name + '" data-field-type="' + escapeHtml(field.type) + '" data-field-label="' + escapeHtml(field.label) + '" data-step="' + (field.step || 1) + '"' + requiredAttr + minLength + ' placeholder="' + escapeHtml(inputPlaceholder) + '">' +
      '<div class="custom-field-error" style="display:none;"></div>' +
    '</div>';
  }
  
  // Build form HTML - ONLY fields with "Show in form" enabled. When formType === 'wholesale' no steps.
  // Password: always render when the field exists in config (ignores the visibility toggle) so the storefront
  // matches the live preview. Remove the field in the app if you do not want a password on the form.
  function buildFormFieldsHTML(fields, formType) {
    if (!fields || fields.length === 0) return { html: '', steps: 1 };
    const enabledFields = fields.filter(function(f) {
      if (f && String(f.type || '').toLowerCase() === 'password') return true;
      return f.enabled !== false;
    });
    if (enabledFields.length === 0) return { html: '', steps: 1 };
    var useSteps = (formType || '').toLowerCase() === 'multi_step';
    const steps = {};
    let maxStep = 1;
    enabledFields.forEach(function(field, index) {
      const step = useSteps ? (field.step || 1) : 1;
      maxStep = Math.max(maxStep, step);
      if (!steps[step]) steps[step] = [];
      steps[step].push({ field: field, index: index });
    });
    let html = '';
    const stepCount = useSteps ? maxStep : 1;
    if (stepCount > 1) {
      for (let s = 1; s <= stepCount; s++) {
        const stepFields = steps[s] || [];
        html += '<div class="form-step form-fields-grid" data-step="' + s + '"' + (s > 1 ? ' style="display:none"' : '') + '>';
        stepFields.forEach(function(item) {
          html += buildFieldHTML(item.field, item.index);
        });
        html += '</div>';
      }
    } else {
      html += '<div class="form-fields-grid">';
      enabledFields.forEach(function(field, index) {
        html += buildFieldHTML(field, index);
      });
      html += '</div>';
    }
    return { html: html, steps: stepCount };
  }
  
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /** Contact page: set in theme snippet (pages.contact) or defaults to /pages/contact on this storefront. */
  function resolveStorefrontContactHref() {
    var raw = cfg && cfg.contactPageUrl ? String(cfg.contactPageUrl).trim() : '';
    if (!raw) raw = '/pages/contact';
    try {
      if (/^https?:\/\//i.test(raw)) return raw;
      return new URL(raw, window.location.origin).href;
    } catch (e) {
      try {
        return new URL('/pages/contact', window.location.origin).href;
      } catch (e2) {
        return raw.charAt(0) === '/' ? raw : '/' + raw;
      }
    }
  }

  function buildRejectedRegistrationMessageHtml() {
    var href = escapeHtml(resolveStorefrontContactHref());
    var lead = t('emailRegistrationRejectedLead');
    if (!lead || lead === 'emailRegistrationRejectedLead') {
      lead = 'We have rejected this email. Please';
    }
    lead = String(lead).replace(/\s+$/, '');
    var cta = t('contactUs');
    if (!cta || cta === 'contactUs') cta = 'Contact us';
    return (
      '<span class="approvefy-rejected-msg">' +
      escapeHtml(lead) +
      '</span> <a href="' +
      href +
      '" class="approvefy-contact-link">' +
      escapeHtml(cta) +
      '</a><span class="approvefy-rejected-msg-tail">.</span>'
    );
  }

  function buildApprovalRemovedSupportMessageHtml() {
    var href = escapeHtml(resolveStorefrontContactHref());
    var lead = t('emailApprovalRemovedLead');
    if (!lead || lead === 'emailApprovalRemovedLead') {
      lead = 'Your account no longer shows as approved in our records. Please';
    }
    lead = String(lead).replace(/\s+$/, '');
    var cta = t('contactSupport');
    if (!cta || cta === 'contactSupport') cta = 'Contact support';
    return (
      '<span class="approvefy-rejected-msg">' +
      escapeHtml(lead) +
      '</span> <a href="' +
      href +
      '" class="approvefy-contact-link">' +
      escapeHtml(cta) +
      '</a><span class="approvefy-rejected-msg-tail">.</span>'
    );
  }

  /** Logged-in customer has at least one Customer-approval "approved" tag (same rules as checkout guard). */
  function customerHasApprovedTagFromSettings(cas) {
    var raw = cas && cas.approvedTag;
    if (!raw || typeof raw !== 'string') {
      return false;
    }
    var parts = raw.split(',').map(function (s) {
      return String(s || '').trim().toLowerCase();
    }).filter(Boolean);
    if (!parts.length) {
      return false;
    }
    var tags = cfg.customerTags;
    if (!Array.isArray(tags)) {
      return false;
    }
    var i;
    var j;
    for (i = 0; i < tags.length; i++) {
      var ct = String(tags[i] == null ? '' : tags[i]).trim().toLowerCase();
      if (!ct) continue;
      for (j = 0; j < parts.length; j++) {
        if (ct === parts[j]) {
          return true;
        }
      }
    }
    return false;
  }

  /** Pre-fill email (and name) when logged in and not yet carrying the approved tag. */
  function shouldPrefillLoggedInCustomerWithoutApprovedTag(formConfig) {
    if (!cfg.customerLoggedIn) {
      return false;
    }
    var cas = formConfig && formConfig.customerApprovalSettings;
    if (!cas || !cas.approvedTag || !String(cas.approvedTag).trim()) {
      return true;
    }
    return !customerHasApprovedTagFromSettings(cas);
  }

  function prefillLoggedInCustomerRegistrationFields(formEl, formConfig) {
    if (!formEl || !shouldPrefillLoggedInCustomerWithoutApprovedTag(formConfig)) {
      return;
    }
    var email = typeof cfg.customerEmail === 'string' ? cfg.customerEmail.trim() : '';
    if (!email) {
      return;
    }
    var emailInput = formEl.querySelector('input[name="email"]');
    if (emailInput && !String(emailInput.value || '').trim()) {
      emailInput.value = email;
      try {
        emailInput.dispatchEvent(new Event('input', { bubbles: true }));
        emailInput.dispatchEvent(new Event('change', { bubbles: true }));
      } catch (evErr) {
        void evErr;
      }
    }
    var fn = typeof cfg.customerFirstName === 'string' ? cfg.customerFirstName.trim() : '';
    var ln = typeof cfg.customerLastName === 'string' ? cfg.customerLastName.trim() : '';
    if (fn) {
      var firstInp = formEl.querySelector('input[name="firstName"]');
      if (firstInp && !String(firstInp.value || '').trim()) {
        firstInp.value = fn;
      }
    }
    if (ln) {
      var lastInp = formEl.querySelector('input[name="lastName"]');
      if (lastInp && !String(lastInp.value || '').trim()) {
        lastInp.value = ln;
      }
    }
  }

  /** Logged-in customers should not edit the account email on storefront registration form. */
  function lockLoggedInCustomerEmailField(formEl) {
    if (!formEl || !cfg.customerLoggedIn) {
      return;
    }
    var emailInput = formEl.querySelector('input[name="email"]');
    if (!emailInput) {
      return;
    }
    var lockedValue = String(emailInput.value || cfg.customerEmail || '').trim();
    if (!lockedValue) {
      return;
    }

    // Keep email in payload while showing a true disabled field on UI.
    var hiddenEmail = formEl.querySelector('input[type="hidden"][name="email"][data-email-locked-hidden="true"]');
    if (!hiddenEmail) {
      hiddenEmail = document.createElement('input');
      hiddenEmail.type = 'hidden';
      hiddenEmail.name = 'email';
      hiddenEmail.setAttribute('data-email-locked-hidden', 'true');
      formEl.appendChild(hiddenEmail);
    }
    hiddenEmail.value = lockedValue;

    emailInput.value = lockedValue;
    emailInput.name = 'email_display';
    emailInput.disabled = true;
    emailInput.setAttribute('disabled', 'disabled');
    emailInput.setAttribute('aria-disabled', 'true');
    emailInput.setAttribute('data-email-locked', 'true');
  }

  function isValidEmailAddress(value) {
    var email = String(value || '').trim();
    if (!email || email.length > 254) return false;
    if (email.indexOf(' ') !== -1) return false;
    if (email.indexOf('@') <= 0 || email.lastIndexOf('@') !== email.indexOf('@')) return false;
    var parts = email.split('@');
    if (parts.length !== 2) return false;
    var local = parts[0];
    var domain = parts[1];
    if (!local || !domain) return false;
    if (local.length > 64) return false;
    if (domain.indexOf('.') === -1) return false;
    if (domain.startsWith('.') || domain.endsWith('.')) return false;
    if (domain.indexOf('..') !== -1 || local.indexOf('..') !== -1) return false;
    if (!/^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+$/.test(local)) return false;
    if (!/^[A-Za-z0-9.-]+$/.test(domain)) return false;
    if (!/[A-Za-z]{2,}$/.test(domain.split('.').pop() || '')) return false;
    return true;
  }

  // For inline section blocks, start immediately to avoid perceived delay.
  // Register page keeps DOM-ready guard to ensure native form/container selectors exist.
  if (inlineRootEarly) {
    init(shop);
  } else if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() { init(shop); });
  } else {
    init(shop);
  }
  
  async function init(shopDomain) {
    var inlineRoot = document.querySelector('[data-approvefy-registration-block]');
    var isRegisterPage = window.location.pathname.indexOf('/account/register') !== -1;
    var isInline = !!(inlineRoot && !isRegisterPage);
    var floatingLoaderId = 'approvefy-inline-floating-loader';
    var loadingFormLabel = function () {
      return escapeHtml(t('loading') || 'Loading form...');
    };
    var ensureLoaderSpinKeyframes = function () {
      if (document.getElementById('approvefy-loader-spin-style')) return;
      var spinStyle = document.createElement('style');
      spinStyle.id = 'approvefy-loader-spin-style';
      spinStyle.type = 'text/css';
      spinStyle.appendChild(document.createTextNode('@keyframes approvefySpin{to{transform:rotate(360deg)}}'));
      document.head.appendChild(spinStyle);
    };
    var renderInlineLoadingState = function () {
      if (!isInline || !inlineRoot) return;
      var mount = inlineRoot.querySelector('.approvefy-registration-mount');
      if (mount) {
        if (mount.querySelector('#custom-registration-container')) return;
        if (!mount.querySelector('.approvefy-form-loading')) {
          ensureLoaderSpinKeyframes();
          mount.innerHTML =
            '<div class="approvefy-form-loading" style="padding:32px 16px;text-align:center;color:#6b7280;font-size:15px;line-height:1.5;">' +
              '<div style="display:inline-flex;align-items:center;justify-content:center;gap:12px;">' +
                '<span style="width:22px;height:22px;border:2px solid #e5e7eb;border-top-color:#111827;border-radius:50%;display:inline-block;animation:approvefySpin .75s linear infinite;flex-shrink:0;" aria-hidden="true"></span>' +
                '<span>' + loadingFormLabel() + '</span>' +
              '</div>' +
            '</div>';
        }
      } else if (!document.getElementById(floatingLoaderId)) {
        ensureLoaderSpinKeyframes();
        var floating = document.createElement('div');
        floating.id = floatingLoaderId;
        floating.setAttribute('role', 'status');
        floating.setAttribute('aria-live', 'polite');
        floating.style.cssText = 'position:fixed;right:18px;bottom:18px;z-index:2147483000;background:#111827;color:#fff;border-radius:999px;padding:10px 14px;display:inline-flex;align-items:center;gap:10px;box-shadow:0 8px 22px rgba(0,0,0,.24);font-size:13px;';
        floating.innerHTML =
          '<span style="width:15px;height:15px;border:2px solid rgba(255,255,255,.35);border-top-color:#fff;border-radius:50%;display:inline-block;animation:approvefySpin .75s linear infinite;flex-shrink:0;" aria-hidden="true"></span>' +
          '<span>' + loadingFormLabel() + '</span>';
        document.body.appendChild(floating);
      }
    };
    var clearFloatingInlineLoader = function () {
      var floating = document.getElementById(floatingLoaderId);
      if (floating && floating.parentNode) floating.parentNode.removeChild(floating);
    };
    var registerLoaderId = 'approvefy-register-spinner-loader';
    var renderRegisterSpinnerLoader = function () {
      if (!isRegisterPage || isInline) return;
      if (!existingRegisterForm || !existingRegisterForm.parentNode) return;
      if (document.getElementById(registerLoaderId)) return;
      var loader = document.createElement('div');
      loader.id = registerLoaderId;
      loader.setAttribute('role', 'status');
      loader.setAttribute('aria-live', 'polite');
      loader.style.cssText = 'display:flex;justify-content:center;align-items:center;gap:12px;margin:14px 0 18px;color:#6b7280;font-size:15px;';
      ensureLoaderSpinKeyframes();
      loader.innerHTML =
        '<span style="width:20px;height:20px;border:2px solid #d1d5db;border-top-color:#111827;border-radius:50%;display:inline-block;animation:approvefySpin .75s linear infinite;flex-shrink:0;" aria-hidden="true"></span>' +
        '<span>' + loadingFormLabel() + '</span>';
      existingRegisterForm.parentNode.insertBefore(loader, existingRegisterForm);
    };
    var clearRegisterSpinnerLoader = function () {
      var loader = document.getElementById(registerLoaderId);
      if (loader && loader.parentNode) loader.parentNode.removeChild(loader);
    };

    if (isInline && inlineRoot.getAttribute('data-approvefy-mounted') === '1') {
      return;
    }

    // Find the main content area and the existing Shopify registration form
    const mainContent = document.querySelector('#MainContent') || document.querySelector('main') || document.body;
    const existingRegisterForm = mainContent.querySelector('form[action*="/account"]');

    // Optional existing container if we've already rendered once
    let container = document.getElementById('custom-registration-container');

    let formFieldsHTML = '';
    let hasConfig = false;
    var config = null;
    if (!readCachedConfig() && isInline && inlineRoot) {
      var cachedFormHtml = readCachedRenderedFormHtml();
      if (cachedFormHtml) {
        var mountCached = inlineRoot.querySelector('.approvefy-registration-mount');
        if (mountCached) {
          mountCached.innerHTML = cachedFormHtml;
        }
      } else {
        renderInlineLoadingState();
      }
    }
    if (!readCachedConfig()) {
      renderRegisterSpinnerLoader();
    }
    try {
      // Use cached config for instant reloads when available, fall back to network.
      config = readCachedConfig();
      if (!config) {
        config = await configPromise;
      }
      if (config.error) {
        console.warn('[Approvefy] Config API error:', config.error);
      }
      if (config.shopCountryCode) shopCountryCode = config.shopCountryCode;
      if (config.translations && typeof config.translations === 'object') {
        backendTranslations = config.translations;
      }
      if (config.availableLocales && Array.isArray(config.availableLocales) && config.availableLocales.length > 0) {
        backendAvailableLocales = config.availableLocales;
      }
      if (typeof config.customCss === 'string' && config.customCss.trim().length > 0) {
        backendCustomCss = String(config.customCss);
      }
      if (config.fields && Array.isArray(config.fields) && config.fields.length > 0) {
        var formType = (config.formType || '').toLowerCase();
        const formResult = buildFormFieldsHTML(config.fields, formType);
        formFieldsHTML = formResult.html;
        hasConfig = formFieldsHTML.length > 0;
        window.__registrationFormSteps = formResult.steps;
        window.__registrationFormType = formType;
      }
    } catch (e) {
      console.warn('[Approvefy] Could not load form config:', e);
    } finally {
      clearFloatingInlineLoader();
      clearRegisterSpinnerLoader();
    }

    if (config && typeof config === 'object') {
      var cas0 = config.customerApprovalSettings;
      var casDefaults = {
        approvalMode: 'manual',
        afterSubmit: 'message',
        redirectUrl: '',
        successMessage: '',
        approvedTag: 'status:approved',
        redirectGuestsFromCheckout: false,
        guestCheckoutRedirectUrl: '',
        blockLoggedInWithoutApprovedTag: false,
        loggedInCheckoutBlockedMessage: ''
      };
      if (!cas0 || typeof cas0 !== 'object' || Array.isArray(cas0)) {
        config.customerApprovalSettings = casDefaults;
      } else {
        config.customerApprovalSettings = Object.assign({}, casDefaults, cas0);
        if (!String(config.customerApprovalSettings.approvedTag || '').trim()) {
          config.customerApprovalSettings.approvedTag = casDefaults.approvedTag;
        }
      }
    }

    // If there is no active configuration, leave the native Shopify form as-is (register page), or show a message in the section block.
    if (!hasConfig) {
      if (isInline && inlineRoot) {
        var mountEmpty = inlineRoot.querySelector('.approvefy-registration-mount');
        if (mountEmpty) {
          mountEmpty.innerHTML = '<p class="approvefy-form-not-configured" style="padding:12px;border-radius:8px;background:#fef3c7;color:#92400e;">' + escapeHtml(t('formNotConfigured')) + '</p>';
        }
      }
      return;
    }

    // We have a configured form: enable our custom experience.
    document.body.classList.add('custom-registration-enabled');

    function getLoggedInPendingSessionKey() {
      var id = cfg.shopifyLoggedInCustomerId;
      var suf = id != null && String(id) !== '' ? String(id) : '0';
      return 'approvefy_logged_in_pending_submit_' + suf;
    }
    function setLoggedInPendingSubmittedSession() {
      try {
        if (window.sessionStorage && cfg.customerLoggedIn) {
          sessionStorage.setItem(getLoggedInPendingSessionKey(), '1');
        }
      } catch (eSess) {
        void eSess;
      }
    }
    function readLoggedInPendingSubmittedSession() {
      try {
        if (window.sessionStorage && cfg.customerLoggedIn) {
          var v = sessionStorage.getItem(getLoggedInPendingSessionKey());
          return v === '1' || v === 'true';
        }
      } catch (eRead) {
        void eRead;
      }
      return false;
    }
    function clearLoggedInPendingSubmittedSession() {
      try {
        if (window.sessionStorage) sessionStorage.removeItem(getLoggedInPendingSessionKey());
      } catch (eClr) {
        void eClr;
      }
    }

    const stepCount = window.__registrationFormSteps || 1;
    var initialStepPct = stepCount > 1 ? Math.min(100, Math.round((1 / stepCount) * 100)) : 0;
    var showStorefrontStepProgress = stepCount > 1 && config && config.showProgressBar !== false;
    var stepNavHTML = '';
    if (stepCount > 1) {
      var pctLabel0 = (t('progressComplete') || '{pct}% complete').replace('{pct}', String(initialStepPct));
      var progressBlock = showStorefrontStepProgress
        ? '<div class="approvefy-step-progress" id="step-progress-root" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + initialStepPct + '" aria-label="' + escapeHtml(pctLabel0) + '">' +
          '<div class="approvefy-step-progress-track" id="step-progress-track">' +
          '<div class="approvefy-step-progress-bar" id="step-progress-bar" style="width:' + initialStepPct + '%"></div>' +
          '</div>' +
          '<span class="approvefy-step-progress-text" id="step-progress-text">' + escapeHtml(pctLabel0) + '</span>' +
          '</div>'
        : '';
      stepNavHTML =
        '<div class="approvefy-step-nav-wrap">' +
        progressBlock +
        '<div class="form-step-nav" style="display:flex;justify-content:space-between;align-items:center;margin:20px 0;flex-wrap:wrap;gap:12px">' +
        '<button type="button" class="step-prev-btn custom-submit-btn" style="max-width:140px" id="step-prev-btn" disabled>' + escapeHtml(t('previous')) + '</button>' +
        '<span id="step-indicator">' + escapeHtml(t('stepOf')) + ' 1 ' + t('of') + ' ' + stepCount + '</span>' +
        '<button type="button" class="step-next-btn custom-submit-btn" style="max-width:140px" id="step-next-btn">' + escapeHtml(t('next')) + '</button>' +
        '</div></div>';
    }
    
    var customH = isInline && inlineRoot && inlineRoot.getAttribute('data-heading');
    var customD = isInline && inlineRoot && inlineRoot.getAttribute('data-description');
    var cfgHeading = config && typeof config.storefrontHeading === 'string' ? String(config.storefrontHeading).trim() : '';
    var cfgDesc = config && typeof config.storefrontDescription === 'string' ? String(config.storefrontDescription).trim() : '';
    var h2Text = customH
      ? escapeHtml(customH)
      : (cfgHeading ? escapeHtml(cfgHeading) : escapeHtml(t('createYourAccount')));
    var descText = customD
      ? escapeHtml(customD)
      : (cfgDesc ? escapeHtml(cfgDesc) : escapeHtml(t('formDescription')));
    var customerAlreadyApproved = cfg.customerLoggedIn && customerHasApprovedTagFromSettings(config && config.customerApprovalSettings);

    function storefrontAccountPath(segment) {
      var path = window.location.pathname || '';
      var regMarker = '/account/register';
      var regIdx = path.indexOf(regMarker);
      if (regIdx !== -1) {
        return path.slice(0, regIdx) + '/account/' + segment + path.slice(regIdx + regMarker.length);
      }
      var loginMarker = '/account/login';
      var loginIdx = path.indexOf(loginMarker);
      if (loginIdx !== -1) {
        return path.slice(0, loginIdx) + '/account/' + segment + path.slice(loginIdx + loginMarker.length);
      }
      var pref = path.match(/^(\/[a-z]{2}(?:-[a-z]{2})?)\//);
      if (pref) return pref[1] + '/account/' + segment;
      return '/account/' + segment;
    }
    function storefrontCustomerAccountHref() {
      var path = window.location.pathname || '';
      var regMarker = '/account/register';
      var regIdx = path.indexOf(regMarker);
      if (regIdx !== -1) {
        return path.slice(0, regIdx) + '/account' + path.slice(regIdx + regMarker.length);
      }
      var loginMarker = '/account/login';
      var loginIdx = path.indexOf(loginMarker);
      if (loginIdx !== -1) {
        return path.slice(0, loginIdx) + '/account' + path.slice(loginIdx + loginMarker.length);
      }
      var pref = path.match(/^(\/[a-z]{2}(?:-[a-z]{2})?)\//);
      if (pref) return pref[1] + '/account';
      return '/account';
    }

    var shopifyLoginHref = storefrontAccountPath('login');
    try {
      var spLoginEarly = new URLSearchParams(window.location.search || '');
      spLoginEarly.delete('view');
      var restLoginEarly = spLoginEarly.toString();
      if (restLoginEarly) shopifyLoginHref += '?' + restLoginEarly;
    } catch (eLoginHref) {
      void eLoginHref;
    }

    function buildLoggedInPendingSubmittedHtml() {
      var casPending = config && config.customerApprovalSettings;
      var backendPendingTitle =
        casPending && typeof casPending.pendingRegistrationScreenTitle === 'string'
          ? String(casPending.pendingRegistrationScreenTitle).trim()
          : '';
      var backendPendingMsg =
        casPending && typeof casPending.pendingRegistrationScreenMessage === 'string'
          ? String(casPending.pendingRegistrationScreenMessage).trim()
          : '';
      var bodyMsg = backendPendingMsg || t('pendingSubmittedAccountMessage');
      if (!bodyMsg || bodyMsg === 'pendingSubmittedAccountMessage') {
        bodyMsg = t('registrationPendingMessage');
      }
      var cardTitle = backendPendingTitle || t('registrationPendingHeading');
      if (!cardTitle || cardTitle === 'registrationPendingHeading') {
        cardTitle = t('registrationPendingHeading');
      }
      var pendingCardIcon =
        '<svg class="approvefy-pending-card__svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">' +
          '<rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" stroke-width="1.75"/>' +
          '<path d="M3 7l9 6 9-6" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/>' +
        '</svg>';
      return (
        '<div id="custom-registration-container">' +
          '<div class="approvefy-pending-notice approvefy-pending-notice--modern" role="status">' +
            '<div class="approvefy-pending-card">' +
              '<div class="approvefy-pending-card__accent" aria-hidden="true"></div>' +
              '<div class="approvefy-pending-card__icon-wrap">' +
                pendingCardIcon +
              '</div>' +
              '<h3 class="approvefy-pending-card__title">' + escapeHtml(cardTitle) + '</h3>' +
              '<p class="approvefy-pending-card__body">' + escapeHtml(bodyMsg) + '</p>' +
            '</div>' +
          '</div>' +
        '</div>'
      );
    }

    function mountLoggedInPendingHtml(htmlStr) {
      if (isInline && inlineRoot) {
        var pm = inlineRoot.querySelector('.approvefy-registration-mount');
        if (!pm) {
          console.warn('[Approvefy] Missing .approvefy-registration-mount inside registration block');
          return;
        }
        pm.innerHTML = htmlStr;
        writeCachedRenderedFormHtml(htmlStr);
        inlineRoot.setAttribute('data-approvefy-mounted', '1');
      } else {
        var ctn = document.getElementById('custom-registration-container');
        if (!ctn) {
          ctn = document.createElement('div');
          ctn.id = 'custom-registration-container';
          if (existingRegisterForm && existingRegisterForm.parentNode) {
            existingRegisterForm.parentNode.insertBefore(ctn, existingRegisterForm);
          } else {
            mainContent.insertBefore(ctn, mainContent.firstChild);
          }
        }
        ctn.outerHTML = htmlStr;
      }
      if (existingRegisterForm) {
        existingRegisterForm.style.display = 'none';
      }
    }

    var preferLoginTab =
      typeof window !== 'undefined' &&
      window.location.search &&
      /[?&](?:view=login|show=login|login=1)(?:&|$)/i.test(window.location.search);
    if (preferLoginTab && isRegisterPage && !isInline && !cfg.customerLoggedIn) {
      window.location.assign(shopifyLoginHref);
      return;
    }

    if (customerAlreadyApproved) {
      clearLoggedInPendingSubmittedSession();
      var approvedAccountHref = escapeHtml(storefrontCustomerAccountHref());
      var casApproved = config && config.customerApprovalSettings;
      var successMsgRaw =
        casApproved && typeof casApproved.successMessage === 'string' ? casApproved.successMessage.trim() : '';
      var approvedMessageInner = successMsgRaw
        ? '<div class="approvefy-approved-card__message approvefy-approved-message-html">' + successMsgRaw + '</div>'
        : '<p class="approvefy-approved-card__body">' + escapeHtml(t('approvedAccountMessage')) + '</p>';
      var approvedCardIcon =
        '<svg class="approvefy-approved-card__svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">' +
        '<path d="M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Z" stroke="currentColor" stroke-width="1.65"/>' +
        '<path d="m8.25 12.25 2.25 2.25L15.75 9" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round"/>' +
        '</svg>';
      var approvedHTML =
        '<div id="custom-registration-container" class="approvefy-approved-screen">' +
        '<div class="approvefy-approved-notice approvefy-approved-notice--modern" role="status">' +
        '<div class="approvefy-approved-card">' +
        '<div class="approvefy-approved-card__accent" aria-hidden="true"></div>' +
        '<div class="approvefy-approved-card__icon-wrap">' +
        approvedCardIcon +
        '</div>' +
        '<h3 class="approvefy-approved-card__title">' +
        escapeHtml(t('approvedAccountHeading')) +
        '</h3>' +
        approvedMessageInner +
        '</div>' +
        '</div>' +
        '<a href="' +
        approvedAccountHref +
        '" class="custom-submit-btn approvefy-approved-cta approvefy-approved-cta--modern" style="display:inline-flex;align-items:center;justify-content:center;text-decoration:none;">' +
        escapeHtml(t('myAccount')) +
        '</a>' +
        '</div>';

      if (isInline && inlineRoot) {
        var approvedMount = inlineRoot.querySelector('.approvefy-registration-mount');
        if (!approvedMount) {
          console.warn('[Approvefy] Missing .approvefy-registration-mount inside registration block');
          return;
        }
        approvedMount.innerHTML = approvedHTML;
        writeCachedRenderedFormHtml(approvedHTML);
        inlineRoot.setAttribute('data-approvefy-mounted', '1');
      } else {
        if (!container) {
          container = document.createElement('div');
          container.id = 'custom-registration-container';
          if (existingRegisterForm && existingRegisterForm.parentNode) {
            existingRegisterForm.parentNode.insertBefore(container, existingRegisterForm);
          } else {
            mainContent.insertBefore(container, mainContent.firstChild);
          }
        }
        container.outerHTML = approvedHTML;
      }

      if (existingRegisterForm) {
        existingRegisterForm.style.display = 'none';
      }
      return;
    }

    // Do not treat Shopify tag `status:pending` alone as "form already submitted": the
    // customers_create webhook tags new accounts before they fill this form, which would
    // hide the form prematurely. Show this screen when Approvefy has a pending DB row for
    // this logged-in customer (config) and/or the session flag right after POST. If the
    // merchant removed the pending application in the app, the server returns false — then
    // clear the session flag so the registration form shows again (not a stuck pending card).
    var casPendingGate = config && config.customerApprovalSettings;
    var pendingFromServer =
      config && Object.prototype.hasOwnProperty.call(config, 'loggedInCustomerHasPendingRegistration')
        ? config.loggedInCustomerHasPendingRegistration
        : undefined;
    if (cfg.customerLoggedIn && pendingFromServer === false) {
      clearLoggedInPendingSubmittedSession();
    }
    var showLoggedInPendingSubmittedView =
      cfg.customerLoggedIn &&
      !customerHasApprovedTagFromSettings(casPendingGate) &&
      (pendingFromServer === true ||
        (pendingFromServer !== false && readLoggedInPendingSubmittedSession()));
    if (showLoggedInPendingSubmittedView) {
      mountLoggedInPendingHtml(buildLoggedInPendingSubmittedHtml());
      return;
    }

    var authTabsNavHref = cfg.customerLoggedIn ? storefrontCustomerAccountHref() : shopifyLoginHref;
    var authTabsNavLabel = cfg.customerLoggedIn ? t('myAccount') : t('logInTab');
    var authTabsAriaLabel = cfg.customerLoggedIn
      ? escapeHtml(t('myAccount') + ' / ' + t('signUpTab'))
      : escapeHtml(t('logInTab') + ' / ' + t('signUpTab'));

    const formHTML = `
      <div id="custom-registration-container">
        <div class="approvefy-auth-tabs" aria-label="${authTabsAriaLabel}">
          <a class="approvefy-auth-tab approvefy-auth-tab--link" href="${escapeHtml(authTabsNavHref)}">${escapeHtml(authTabsNavLabel)}</a>
          <span class="approvefy-auth-tab approvefy-auth-tab--active" aria-current="page">${escapeHtml(t('signUpTab'))}</span>
        </div>
        <h2>${h2Text}</h2>
        <p class="form-description">${descText}</p>
        <form id="custom-registration-form" novalidate>
          ${formFieldsHTML}
          ${stepNavHTML}
          <button type="submit" class="custom-submit-btn form-final-step" id="custom-submit-btn" ${stepCount > 1 ? 'style="display:none"' : ''}>
            <span id="btn-text">${escapeHtml(t('createAccount'))}</span>
            <span id="btn-loading" class="custom-btn-loading" style="display:none;">
              <span class="custom-btn-spinner" aria-hidden="true"></span>
              <span>${escapeHtml(t('processing'))}</span>
            </span>
          </button>
        </form>
        <div class="custom-message approvefy-form-footer-message" id="custom-message"></div>
      </div>
    `;
    
    if (isInline && inlineRoot) {
      var mountPt = inlineRoot.querySelector('.approvefy-registration-mount');
      if (!mountPt) {
        console.warn('[Approvefy] Missing .approvefy-registration-mount inside registration block');
        return;
      }
      mountPt.innerHTML = formHTML;
      writeCachedRenderedFormHtml(formHTML);
      inlineRoot.setAttribute('data-approvefy-mounted', '1');
    } else {
      // If no container exists yet, create one now at the right place
      if (!container) {
        container = document.createElement('div');
        container.id = 'custom-registration-container';
        if (existingRegisterForm && existingRegisterForm.parentNode) {
          existingRegisterForm.parentNode.insertBefore(container, existingRegisterForm);
        } else {
          mainContent.insertBefore(container, mainContent.firstChild);
        }
      }

      container.outerHTML = formHTML;
    }

    // Appearance CSS applies immediately; Google Fonts deferred so first paint is not blocked by font CSS.
    var existingThemeStyle = document.getElementById('customer-approval-theme-style');
    if (existingThemeStyle) existingThemeStyle.remove();
    if (backendCustomCss && typeof backendCustomCss === 'string' && backendCustomCss.trim().length > 0) {
      try {
        var styleEl = document.createElement('style');
        styleEl.id = 'customer-approval-theme-style';
        styleEl.type = 'text/css';
        styleEl.appendChild(document.createTextNode(backendCustomCss));
        document.head.appendChild(styleEl);
      } catch (e) {
        console.warn('[Approvefy] Failed to apply custom CSS from settings:', e);
      }
    }
    (function () {
      var oldOverride = document.getElementById('customer-approval-override-style');
      if (oldOverride) oldOverride.remove();
      var override = document.createElement('style');
      override.id = 'customer-approval-override-style';
      override.type = 'text/css';
      override.appendChild(
        document.createTextNode(
          '#custom-registration-form .custom-country-select-search,#custom-registration-form .custom-country-select-search:focus{border-radius:0!important;}'
        )
      );
      document.head.appendChild(override);
    })();
    function injectGoogleFontDeferred() {
      var existingFontLink = document.getElementById('customer-approval-google-font');
      if (existingFontLink) existingFontLink.remove();
      if (config.googleFont && typeof config.googleFont === 'string' && config.googleFont.trim().length > 0) {
        try {
          var fontFamilyParam = config.googleFont.trim().replace(/\s+/g, '+');
          var fontLink = document.createElement('link');
          fontLink.id = 'customer-approval-google-font';
          fontLink.rel = 'stylesheet';
          fontLink.href = 'https://fonts.googleapis.com/css2?family=' + fontFamilyParam + ':wght@400;500;600;700&display=swap';
          document.head.appendChild(fontLink);
        } catch (e) {
          console.warn('[Approvefy] Failed to load Google Font:', e);
        }
      }
    }
    if (typeof window.requestAnimationFrame === 'function') {
      window.requestAnimationFrame(function () {
        window.requestAnimationFrame(injectGoogleFontDeferred);
      });
    } else {
      setTimeout(injectGoogleFontDeferred, 0);
    }
    
    /* Hide duplicate theme heading only on the native registration page, not on arbitrary pages with the section block */
    if (isRegisterPage && !isInline) {
      (function hideThemeDuplicateHeading() {
        var container = document.getElementById('custom-registration-container');
        if (!container || !container.parentElement) return;
        var parent = container.parentElement;
        var children = Array.prototype.slice.call(parent.children);
        for (var i = 0; i < children.length; i++) {
          var el = children[i];
          if (el === container) break;
          if (el.tagName === 'H1' || el.tagName === 'H2' || el.tagName === 'P') {
            el.style.setProperty('display', 'none', 'important');
          }
        }
      })();
    }
    
    const form = document.getElementById('custom-registration-form');
    if (!form) return;

    prefillLoggedInCustomerRegistrationFields(form, config);
    lockLoggedInCustomerEmailField(form);

    if (cfg.customerLoggedIn && cfg.shopifyLoggedInCustomerId != null && String(cfg.shopifyLoggedInCustomerId) !== '') {
      var hidCid = document.createElement('input');
      hidCid.type = 'hidden';
      hidCid.name = 'loggedInShopifyCustomerId';
      hidCid.value = String(cfg.shopifyLoggedInCustomerId);
      form.appendChild(hidCid);
    }

    form.addEventListener('input', function(e) {
      var target = e.target;
      var wrap = target.closest('.custom-form-field');
      if (wrap) {
        var err = wrap.querySelector('.custom-field-error');
        if (err) { err.style.display = 'none'; err.textContent = ''; }
      }
    });
    form.addEventListener('change', function(e) {
      var target = e.target;
      var wrap = target.closest('.custom-form-field');
      if (wrap) {
        var err = wrap.querySelector('.custom-field-error');
        if (err) { err.style.display = 'none'; err.textContent = ''; }
      }
    });
    
    const currentStepCount = window.__registrationFormSteps || 1;
    var updateStepUI;
    if (currentStepCount > 1) {
      let currentStep = 1;
      const steps = form.querySelectorAll('.form-step');
      const prevBtn = document.getElementById('step-prev-btn');
      const nextBtn = document.getElementById('step-next-btn');
      const stepIndicator = document.getElementById('step-indicator');
      const stepProgressBar = document.getElementById('step-progress-bar');
      const stepProgressTrack = document.getElementById('step-progress-track');
      const stepProgressText = document.getElementById('step-progress-text');
      const stepProgressRoot = document.getElementById('step-progress-root');
      var finalElements = form.querySelectorAll('.form-final-step');
      var applyProgressBarColors = function() {
        if (stepProgressTrack) {
          stepProgressTrack.style.setProperty('background-color', '#e5e7eb', 'important');
          stepProgressTrack.style.setProperty('background-image', 'none', 'important');
        }
        if (stepProgressBar) {
          stepProgressBar.style.setProperty('display', 'block', 'important');
          stepProgressBar.style.setProperty('min-height', '10px', 'important');
          stepProgressBar.style.setProperty('height', '100%', 'important');
          stepProgressBar.style.setProperty('background-color', '#2563eb', 'important');
          stepProgressBar.style.setProperty('background-image', 'linear-gradient(90deg, #1d4ed8, #6366f1)', 'important');
          stepProgressBar.style.setProperty('box-shadow', 'inset 0 0 0 1px rgba(255,255,255,0.2)', 'important');
        }
      };
      updateStepUI = function() {
        steps.forEach(function(el, idx) { el.style.display = (idx + 1) === currentStep ? 'block' : 'none'; });
        if (prevBtn) prevBtn.disabled = currentStep <= 1;
        if (nextBtn) { nextBtn.textContent = currentStep >= currentStepCount ? (t('submit') || 'Submit') : t('next'); nextBtn.type = currentStep >= currentStepCount ? 'submit' : 'button'; }
        if (stepIndicator) stepIndicator.textContent = t('stepOf') + ' ' + currentStep + ' ' + t('of') + ' ' + currentStepCount;
        var pct = Math.min(100, Math.round((currentStep / currentStepCount) * 100));
        var pctMsg = (t('progressComplete') || '{pct}% complete').replace('{pct}', String(pct));
        applyProgressBarColors();
        if (stepProgressBar) stepProgressBar.style.setProperty('width', pct + '%', 'important');
        if (stepProgressText) stepProgressText.textContent = pctMsg;
        if (stepProgressRoot) {
          stepProgressRoot.setAttribute('aria-valuenow', String(pct));
          stepProgressRoot.setAttribute('aria-label', pctMsg);
        }
        finalElements.forEach(function(el) { el.style.display = currentStep >= currentStepCount ? 'block' : 'none'; });
      };
      if (prevBtn) prevBtn.addEventListener('click', function() { if (currentStep > 1) { currentStep--; updateStepUI(); } });
      if (nextBtn) nextBtn.addEventListener('click', function(e) { if (currentStep < currentStepCount) { e.preventDefault(); currentStep++; updateStepUI(); } });
      updateStepUI();
    }
    
    var ALLOWED_TYPES = ['image/jpeg', 'image/png', 'application/pdf'];
    var ALLOWED_EXT = ['.jpg', '.jpeg', '.png', '.pdf'];
    var fileDataMap = {};

    function initFileUploadZones() {
      var zones = form.querySelectorAll('.custom-file-upload-zone');
      zones.forEach(function(zone) {
        var input = zone.querySelector('input[type="file"]');
        var fieldName = zone.getAttribute('data-field-name');
        var maxCount = parseInt(zone.getAttribute('data-max-file-count'), 10) || 1;
        var maxFileSizeMb = parseInt(zone.getAttribute('data-max-file-size-mb'), 10) || 5;
        var maxFileSizeBytes = maxFileSizeMb * 1024 * 1024;
        var errorDiv = document.getElementById(zone.id + '-error');

        zone.addEventListener('click', function(e) {
          if (e.target === input) return;
          input.click();
        });

        zone.addEventListener('dragover', function(e) {
          e.preventDefault();
          zone.classList.add('dragover');
        });

        zone.addEventListener('dragleave', function() {
          zone.classList.remove('dragover');
        });

        zone.addEventListener('drop', function(e) {
          e.preventDefault();
          zone.classList.remove('dragover');
          if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            var existing = fileDataMap[fieldName];
            var existingCount = Array.isArray(existing) ? existing.length : (existing ? 1 : 0);
            var incomingCount = e.dataTransfer.files.length;
            if (existingCount >= maxCount || existingCount + incomingCount > maxCount) {
              if (errorDiv) {
                var countErrorMsg = t('fileCountError');
        if (!countErrorMsg || countErrorMsg === 'fileCountError') countErrorMsg = 'You can upload a maximum of {max} file(s).';
                if (countErrorMsg.indexOf('{max}') === -1) countErrorMsg = 'You can upload a maximum of {max} file(s).';
                errorDiv.textContent = countErrorMsg.replace('{max}', String(maxCount));
                errorDiv.style.display = 'block';
              }
              return;
            }
            var allowed = Math.min(maxCount - existingCount, incomingCount);
            var files = Array.prototype.slice.call(e.dataTransfer.files, 0, allowed);
            handleFileSelect(files, zone, fieldName, errorDiv, maxCount, maxFileSizeBytes);
          }
        });

        input.addEventListener('change', function() {
          if (input.files && input.files.length > 0) {
            var existing = fileDataMap[fieldName];
            var existingCount = Array.isArray(existing) ? existing.length : (existing ? 1 : 0);
            var incomingCount = input.files.length;
            if (existingCount >= maxCount || existingCount + incomingCount > maxCount) {
              if (errorDiv) {
                var countErrorMsg = t('fileCountError');
        if (!countErrorMsg || countErrorMsg === 'fileCountError') countErrorMsg = 'You can upload a maximum of {max} file(s).';
                if (countErrorMsg.indexOf('{max}') === -1) countErrorMsg = 'You can upload a maximum of {max} file(s).';
                errorDiv.textContent = countErrorMsg.replace('{max}', String(maxCount));
                errorDiv.style.display = 'block';
              }
              input.value = '';
              return;
            }
            var allowed = Math.min(maxCount - existingCount, incomingCount);
            var files = Array.prototype.slice.call(input.files, 0, allowed);
            handleFileSelect(files, zone, fieldName, errorDiv, maxCount, maxFileSizeBytes);
          }
        });
      });
    }

    function handleFileSelect(files, zone, fieldName, errorDiv, maxCount, maxFileSizeBytes) {
      if (errorDiv) { errorDiv.style.display = 'none'; errorDiv.textContent = ''; }
      if (!files || files.length === 0) return;
      maxCount = maxCount || 1;
      maxFileSizeBytes = maxFileSizeBytes || (5 * 1024 * 1024);
      var fileList = files.length ? Array.isArray(files) ? files : [files] : [];
      var existing = fileDataMap[fieldName];
      var existingCount = Array.isArray(existing) ? existing.length : (existing ? 1 : 0);
      if (existingCount + fileList.length > maxCount) {
        if (errorDiv) {
          var countErrorMsg = t('fileCountError');
        if (!countErrorMsg || countErrorMsg === 'fileCountError') countErrorMsg = 'You can upload a maximum of {max} file(s).';
          if (countErrorMsg.indexOf('{max}') === -1) countErrorMsg = 'You can upload a maximum of {max} file(s).';
          errorDiv.textContent = countErrorMsg.replace('{max}', String(maxCount));
          errorDiv.style.display = 'block';
        }
        return;
      }
      var hasError = false;
      var results = [];
      var pending = fileList.length;
      var maxMb = Math.round(maxFileSizeBytes / (1024 * 1024));
      var progressWrap = zone.querySelector('.custom-file-upload-progress');
      var progressBar = zone.querySelector('.custom-file-upload-progress-bar');
      var progressText = zone.querySelector('.custom-file-upload-progress-text');
      var totalBytes = 0;
      fileList.forEach(function(f) { totalBytes += f.size; });
      var loadedByIndex = {};
      function updateProgress() {
        if (!progressBar || !progressText) return;
        var loaded = 0;
        for (var k in loadedByIndex) loaded += loadedByIndex[k];
        var pct = totalBytes ? Math.min(100, Math.round((loaded / totalBytes) * 100)) : 0;
        progressBar.style.width = pct + '%';
        var label = t('uploadProgress') || 'Uploading';
        progressText.textContent = label + ' ' + pct + '%';
      }
      var readersStarted = 0;
      if (progressWrap && progressBar && progressText) {
        progressWrap.style.display = 'block';
        progressBar.style.width = '0%';
        var startLabel = t('uploadProgress') || 'Uploading';
        progressText.textContent = startLabel + ' 0%';
      }
      fileList.forEach(function(file, idx) {
        var ext = '.' + file.name.split('.').pop().toLowerCase();
        if (ALLOWED_EXT.indexOf(ext) === -1 && ALLOWED_TYPES.indexOf(file.type) === -1) {
          var typeErr = t('fileTypeError');
          if (errorDiv) { errorDiv.textContent = (typeErr && typeErr !== 'fileTypeError') ? typeErr : 'Only JPG, PNG, and PDF files are allowed.'; errorDiv.style.display = 'block'; }
          hasError = true;
          return;
        }
        if (file.size > maxFileSizeBytes) {
          if (errorDiv) {
            var sizeErrorMsg = t('fileSizeError');
            if (!sizeErrorMsg || sizeErrorMsg === 'fileSizeError') sizeErrorMsg = 'File size must be under {max} MB.';
            if (sizeErrorMsg.indexOf('{max}') === -1) sizeErrorMsg = 'File size must be under {max} MB.';
            errorDiv.textContent = sizeErrorMsg.replace('{max}', String(maxMb));
            errorDiv.style.display = 'block';
          }
          hasError = true;
          return;
        }
        readersStarted++;
        var reader = new FileReader();
        reader.onprogress = function(e) {
          loadedByIndex[idx] = (e && e.lengthComputable && e.loaded != null) ? e.loaded : file.size;
          updateProgress();
        };
        reader.onload = function() {
          if (hasError) return;
          loadedByIndex[idx] = file.size;
          updateProgress();
          results.push({ name: file.name, type: file.type, size: file.size, data: reader.result });
          pending--;
          if (pending === 0) {
            if (progressWrap && progressBar && progressText) {
              progressWrap.style.display = 'none';
              progressBar.style.width = '0%';
            }
            var existingArr = Array.isArray(existing) ? existing.slice() : (existing ? [existing] : []);
            var combined = existingArr.concat(results).slice(0, maxCount);
            if (combined.length === 1) {
              fileDataMap[fieldName] = combined[0];
            } else {
              fileDataMap[fieldName] = combined;
            }
            renderFileList(zone, fieldName);
          }
        };
        reader.readAsDataURL(file);
      });
      if (readersStarted === 0 && progressWrap) progressWrap.style.display = 'none';
    }

    function renderFileList(zone, fieldName) {
      var list = zone.querySelector('.custom-file-upload-list');
      var textEl = zone.querySelector('.custom-file-upload-text');
      var hintEl = zone.querySelector('.custom-file-upload-hint');
      if (!list) return;
      list.innerHTML = '';
      var value = fileDataMap[fieldName];
      var files = Array.isArray(value) ? value.slice() : (value ? [value] : []);
      if (!files.length) {
        zone.classList.remove('has-file');
        if (textEl) textEl.textContent = t('uploadClickOrDrag');
        if (hintEl) { var mb = zone.getAttribute('data-max-file-size-mb') || '5'; var h = t('uploadHintMax'); hintEl.textContent = (h && h !== 'uploadHintMax') ? h.replace('{max}', mb) : 'JPG, PNG, PDF \u2014 Max ' + mb + ' MB'; }
        return;
      }
      files.forEach(function(file, idx) {
        var row = document.createElement('div');
        row.className = 'custom-file-item';
        var nameSpan = document.createElement('span');
        nameSpan.className = 'custom-file-item-name';
        nameSpan.textContent = file.name;
        var removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.className = 'custom-file-item-remove';
        removeBtn.textContent = '×';
        removeBtn.addEventListener('click', function(e) {
          e.stopPropagation();
          var current = fileDataMap[fieldName];
          var arr = Array.isArray(current) ? current.slice() : (current ? [current] : []);
          arr.splice(idx, 1);
          if (!arr.length) {
            delete fileDataMap[fieldName];
          } else if (arr.length === 1) {
            fileDataMap[fieldName] = arr[0];
          } else {
            fileDataMap[fieldName] = arr;
          }
          var input = zone.querySelector('input[type="file"]');
          if (input) input.value = '';
          renderFileList(zone, fieldName);
        });
        row.appendChild(nameSpan);
        row.appendChild(removeBtn);
        list.appendChild(row);
      });
      zone.classList.add('has-file');
      if (files.length === 1) {
        if (textEl) textEl.textContent = files[0].name;
        if (hintEl) hintEl.textContent = (files[0].size / 1024).toFixed(1) + ' KB';
      } else {
        if (textEl) textEl.textContent = files.length + ' ' + (t('filesSelected') || 'files selected');
        if (hintEl) hintEl.textContent = '';
      }
    }

    function initPhoneCountryDropdowns() {
      var dropdowns = form.querySelectorAll('.custom-phone-country-dropdown');
      function closeAll() {
        form.querySelectorAll('.custom-phone-country-list.open').forEach(function(l) { l.classList.remove('open'); });
        form.querySelectorAll('.custom-phone-country-trigger.open').forEach(function(t) { t.classList.remove('open'); t.setAttribute('aria-expanded', 'false'); });
      }
      document.addEventListener('click', function(e) {
        if (!e.target.closest('.custom-phone-country-dropdown')) closeAll();
      });
      dropdowns.forEach(function(dd) {
        var trigger = dd.querySelector('.custom-phone-country-trigger');
        var list = dd.querySelector('.custom-phone-country-list');
        var listInner = dd.querySelector('.custom-phone-country-list-inner');
        var searchInput = dd.querySelector('.custom-phone-country-search');
        var noResults = dd.querySelector('.custom-phone-country-no-results');
        var hidden = dd.querySelector('input[name="phoneCountryCode"]');
        if (!trigger || !list || !hidden) return;

        function filterList(query) {
          var q = (query || '').toLowerCase().trim();
          var items = listInner ? listInner.querySelectorAll('.custom-phone-country-item') : list.querySelectorAll('.custom-phone-country-item');
          var visibleCount = 0;
          items.forEach(function(item) {
            var searchText = item.getAttribute('data-search') || (item.getAttribute('data-dial') + ' ' + item.getAttribute('data-code') + ' ' + item.getAttribute('data-name')).toLowerCase();
            var show = !q || searchText.indexOf(q) !== -1;
            item.setAttribute('data-filter-hidden', show ? 'false' : 'true');
            if (show) visibleCount++;
          });
          if (noResults) noResults.classList.toggle('visible', visibleCount === 0);
        }

        function close() {
          trigger.classList.remove('open');
          list.classList.remove('open');
          trigger.setAttribute('aria-expanded', 'false');
          if (searchInput) { searchInput.value = ''; filterList(''); }
        }

        function open() {
          closeAll();
          trigger.classList.add('open');
          list.classList.add('open');
          trigger.setAttribute('aria-expanded', 'true');
          if (searchInput) { searchInput.value = ''; filterList(''); searchInput.focus(); }
        }

        trigger.addEventListener('click', function(e) {
          e.preventDefault();
          e.stopPropagation();
          var isOpen = list.classList.contains('open');
          if (isOpen) close(); else open();
        });

        if (searchInput) {
          searchInput.addEventListener('click', function(e) { e.stopPropagation(); });
          searchInput.addEventListener('input', function() { filterList(this.value); });
          searchInput.addEventListener('keydown', function(e) {
            if (e.key === 'Escape') { close(); e.preventDefault(); }
          });
        }

        var itemsContainer = listInner || list;
        itemsContainer.querySelectorAll('.custom-phone-country-item').forEach(function(item) {
          item.addEventListener('click', function(e) {
            e.preventDefault();
            if (item.getAttribute('data-filter-hidden') === 'true') return;
            var dial = item.getAttribute('data-dial');
            var code = item.getAttribute('data-code');
            hidden.value = dial;
            var triggerTextEl = trigger.querySelector('.custom-phone-country-trigger-text');
            if (triggerTextEl) triggerTextEl.textContent = dial + ' ' + code;
            var triggerFlagImg = trigger.querySelector('.custom-phone-country-trigger-flag img');
            if (triggerFlagImg && code) triggerFlagImg.src = FLAG_CDN + code.toLowerCase() + '.png';
            list.querySelectorAll('.custom-phone-country-item').forEach(function(i) { i.classList.remove('active'); });
            item.classList.add('active');
            close();
          });
        });
      });
    }

    /** When user types a number starting with + (e.g. +33), sync country dropdown and show only national number in input */
    function initPhoneInputSyncCountryCode() {
      var phoneInputs = form.querySelectorAll('.custom-phone-wrapper input[type="tel"], .custom-phone-wrapper input[name="phone"], .custom-phone-wrapper input[data-field-type="phone"]');
      phoneInputs.forEach(function(phoneInput) {
        function stripPhoneSpaces() {
          var v = (phoneInput.value || '').replace(/\s/g, '');
          if (v !== phoneInput.value) phoneInput.value = v;
        }
        function syncFromValue() {
          stripPhoneSpaces();
          var val = (phoneInput.value && phoneInput.value.trim()) || '';
          var parsed = parsePhoneWithCountryCode(val);
          if (!parsed) return;
          var wrapper = phoneInput.closest('.custom-phone-wrapper');
          var dd = wrapper && wrapper.querySelector('.custom-phone-country-dropdown');
          var hidden = dd && dd.querySelector('input[name="phoneCountryCode"]');
          var trigger = dd && dd.querySelector('.custom-phone-country-trigger');
          var list = dd && dd.querySelector('.custom-phone-country-list');
          if (!hidden || !trigger) return;
          var cp = parsed.country;
          hidden.value = cp.d;
          var triggerText = trigger.querySelector('.custom-phone-country-trigger-text');
          if (triggerText) triggerText.textContent = cp.d + ' ' + cp.c;
          var triggerFlagImg = trigger.querySelector('.custom-phone-country-trigger-flag img');
          if (triggerFlagImg && cp.c) triggerFlagImg.src = FLAG_CDN + cp.c.toLowerCase() + '.png';
          if (list) {
            list.querySelectorAll('.custom-phone-country-item').forEach(function(i) {
              i.classList.toggle('active', i.getAttribute('data-dial') === cp.d);
            });
          }
          phoneInput.value = parsed.nationalNumber.replace(/\s/g, '');
        }
        phoneInput.addEventListener('input', syncFromValue);
        phoneInput.addEventListener('blur', syncFromValue);
      });
    }

    function initAddressAutocomplete(formEl) {
      // Use OpenStreetMap Nominatim for free address suggestions (fair-use, not guaranteed unlimited)
      var NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
      var DEBOUNCE_MS = 280;
      var wrappers = formEl.querySelectorAll('.address-autocomplete-wrap');
      if (!wrappers.length) return;
      var debounceTimer = null;
      var currentAbort = null;

      function setFormAddress(feature) {
        var props = feature.properties || feature || {};
        var addr = feature.address || {};
        var street = [
          addr.road || props.street,
          addr.house_number || props.housenumber
        ].filter(Boolean).join(' ') || addr.name || props.name || '';
        var city = addr.city || addr.town || addr.village || props.city || '';
        var state = addr.state || props.state || '';
        var postcode = addr.postcode || props.postcode || '';
        var countryCode = (addr.country_code || props.countrycode || '').toUpperCase();
        var addressInput = formEl.querySelector('input[name="address"], input[data-field-type="address"]');
        var cityInput = formEl.querySelector('input[name="city"], input[data-field-type="city"]');
        var stateInput = formEl.querySelector('input[name="state"], input[data-field-type="state"]');
        var zipInput = formEl.querySelector('input[name="zipCode"], input[data-field-type="zip_code"]');
        var countrySelect = formEl.querySelector('select[name="country"]');
        var countryHidden = formEl.querySelector('.custom-country-select-dropdown input[name="country"]');
        if (addressInput) addressInput.value = street;
        if (cityInput) cityInput.value = city;
        if (stateInput) stateInput.value = state;
        if (zipInput) zipInput.value = postcode;
        if (countryCode) {
          if (countrySelect) {
            var opt = countrySelect.querySelector('option[value="' + countryCode + '"]');
            if (opt) countrySelect.value = countryCode;
          }
          if (countryHidden) {
            countryHidden.value = countryCode;
            var dd = countryHidden.closest('.custom-country-select-dropdown');
            var item = dd && dd.querySelector('.custom-country-select-item[data-value="' + countryCode + '"]');
            if (item && dd) {
              var triggerTextEl = dd.querySelector('.custom-country-select-trigger-text');
              if (triggerTextEl) {
                var itemName = (item.getAttribute('data-name') || item.textContent || '').trim();
                triggerTextEl.textContent = itemName;
                triggerTextEl.classList.remove('placeholder');
              }
              var triggerFlagWrap = dd.querySelector('.custom-country-select-trigger-flag');
              if (triggerFlagWrap) {
                var flagImg = triggerFlagWrap.querySelector('img');
                if (flagImg && countryCode) {
                  flagImg.src = FLAG_CDN + countryCode.toLowerCase() + '.png';
                  flagImg.style.display = '';
                }
              }
              dd.querySelectorAll('.custom-country-select-item').forEach(function(i) { i.classList.remove('active'); });
              item.classList.add('active');
            }
          }
        }
      }

      function hideAllLists() {
        formEl.querySelectorAll('.address-autocomplete-list').forEach(function(list) {
          list.style.display = 'none';
          list.innerHTML = '';
        });
      }

      wrappers.forEach(function(wrap) {
        var input = wrap.querySelector('input[data-field-type="address"]');
        var list = wrap.querySelector('.address-autocomplete-list');
        if (!input || !list) return;

        function showSuggestions(features) {
          list.innerHTML = '';
          if (!features || features.length === 0) {
            list.style.display = 'none';
            return;
          }
          features.forEach(function(f) {
            var p = f.properties || f || {};
            var a = f.address || {};
            var street = [
              a.road || p.street,
              a.house_number || p.housenumber
            ].filter(Boolean).join(' ') || a.name || p.name || '';
            var city = a.city || a.town || a.village || p.city || '';
            var state = a.state || p.state || '';
            var postcode = a.postcode || p.postcode || '';
            var country = a.country || p.country || '';
            var parts = [street, city, state, postcode, country].filter(Boolean);
            var text = parts.join(', ');
            var li = document.createElement('li');
            li.setAttribute('role', 'option');
            li.setAttribute('aria-selected', 'false');
            li.textContent = text;
            li.addEventListener('click', function() {
              setFormAddress(f);
              input.value = street;
              hideAllLists();
              input.focus();
            });
            list.appendChild(li);
          });
          list.style.display = 'block';
        }

        function fetchSuggestions(q) {
          if (currentAbort) currentAbort.abort();
          var query = (q || '').trim();
          if (query.length < 2) {
            hideAllLists();
            return;
          }
          currentAbort = new AbortController();
          var url = NOMINATIM_URL + '?q=' + encodeURIComponent(query) + '&format=json&addressdetails=1&limit=6';
          fetch(url, {
            signal: currentAbort.signal,
            headers: {
              'Accept-Language': (typeof locale !== 'undefined' && locale) ? locale : 'en',
              'User-Agent': 'customer-approval-app'
            }
          })
          .then(function(r) { return r.json(); })
          .then(function(data) {
            var features = Array.isArray(data) ? data : (data && data.features) ? data.features : [];
            showSuggestions(features);
          })
          .catch(function(err) {
            if (err.name !== 'AbortError') hideAllLists();
          });
        }

        input.addEventListener('input', function() {
          clearTimeout(debounceTimer);
          debounceTimer = setTimeout(function() {
            fetchSuggestions(input.value);
          }, DEBOUNCE_MS);
        });

        input.addEventListener('focus', function() {
          if (list.children.length > 0) list.style.display = 'block';
        });

        input.addEventListener('blur', function() {
          setTimeout(hideAllLists, 180);
        });

        input.addEventListener('keydown', function(e) {
          var items = list.querySelectorAll('li');
          if (e.key === 'Escape') {
            hideAllLists();
            return;
          }
          if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp' && e.key !== 'Enter') return;
          e.preventDefault();
          if (items.length === 0) return;
          var current = list.querySelector('li[aria-selected="true"]');
          var idx = current ? Array.prototype.indexOf.call(items, current) : -1;
          if (e.key === 'ArrowDown') {
            idx = idx < items.length - 1 ? idx + 1 : 0;
          } else if (e.key === 'ArrowUp') {
            idx = idx <= 0 ? items.length - 1 : idx - 1;
          } else if (e.key === 'Enter' && current) {
            current.click();
            return;
          }
          items.forEach(function(item, i) {
            item.setAttribute('aria-selected', i === idx ? 'true' : 'false');
          });
          if (items[idx]) items[idx].scrollIntoView({ block: 'nearest' });
        });
      });

      document.addEventListener('click', function(e) {
        if (!e.target.closest('.address-autocomplete-wrap')) hideAllLists();
      });
    }

    function getFullPhoneValue() {
      var phoneInput = form.querySelector('input[name="phone"], input[data-field-type="phone"]');
      if (!phoneInput || !phoneInput.value.replace(/\s/g, '').length) return '';
      var wrapper = phoneInput.closest('.custom-phone-wrapper');
      var codeInput = wrapper && wrapper.querySelector('input[name="phoneCountryCode"]');
      var code = (codeInput && codeInput.value) ? String(codeInput.value).replace(/\s/g, '') : '';
      var num = (phoneInput.value || '').replace(/^\+\s*/, '').replace(/\s/g, '').trim();
      return code ? code + num : num;
    }

    /**
     * Validate phone using selected dial code + national digits (storefront UX).
     * NANP (+1 US/CA): full international digits must be exactly 11 and match ITU NANP pattern.
     * Others: E.164 total 8–15 digits, national part at least 7.
     */
    function validatePhoneInput(phoneInput) {
      if (!phoneInput) return null;
      var nationalDigits = (phoneInput.value || '').replace(/\D/g, '');
      if (!nationalDigits) return null;
      var wrapper = phoneInput.closest('.custom-phone-wrapper');
      var codeInput = wrapper && wrapper.querySelector('input[name="phoneCountryCode"]');
      var dial = (codeInput && codeInput.value) ? String(codeInput.value).trim() : '';
      var dialDigits = dial.replace(/\D/g, '');
      var totalDigits = dialDigits.length + nationalDigits.length;
      if (totalDigits < 8 || totalDigits > 15) {
        return 'Phone number must be between 8 and 15 digits (including country code).';
      }
      if (dialDigits === '1') {
        var full = dialDigits + nationalDigits;
        if (full.length !== 11 || !/^1[2-9]\d{2}[2-9]\d{6}$/.test(full)) {
          return 'Enter a valid US or Canadian number (10 digits: area code + local number).';
        }
        return null;
      }
      if (dialDigits === '91' && nationalDigits.length !== 10) {
        return 'Enter a valid 10-digit phone number for India.';
      }
      if (nationalDigits.length < 7) {
        return 'Phone number looks too short for the selected country.';
      }
      return null;
    }

    function showPhoneValidationError(phoneInput, message) {
      var phoneErrorEl = document.getElementById('phone-field-error');
      if (!phoneInput || !phoneErrorEl) return;
      if (message) {
        phoneErrorEl.textContent = message;
        phoneErrorEl.style.display = 'block';
        phoneInput.focus();
      } else {
        phoneErrorEl.style.display = 'none';
        phoneErrorEl.textContent = '';
      }
    }

    function initPhoneAlreadyRegisteredCheck() {
      var phoneInput = form.querySelector('input[name="phone"], input[data-field-type="phone"]');
      var errorEl = document.getElementById('phone-field-error');
      if (!phoneInput || !errorEl) return;
      var checkTimeout = null;
      function doCheck() {
        if (validatePhoneInput(phoneInput)) {
          errorEl.style.display = 'none';
          errorEl.textContent = '';
          phoneInput.removeAttribute('data-phone-taken');
          return;
        }
        var full = getFullPhoneValue();
        if (!full || full.replace(/\D/g, '').length < 8) {
          errorEl.style.display = 'none';
          errorEl.textContent = '';
          phoneInput.removeAttribute('data-phone-taken');
          return;
        }
        var shop = window.Shopify && window.Shopify.shop ? window.Shopify.shop : (typeof shopDomain !== 'undefined' ? shopDomain : '');
        if (!shop) { errorEl.style.display = 'none'; return; }
        fetch('/apps/customer-approval/check-phone?shop=' + encodeURIComponent(shop) + '&phone=' + encodeURIComponent(full), { method: 'GET' })
          .then(function(r) { return r.json(); })
          .then(function(data) {
            if (data.taken) {
              errorEl.textContent = t('phoneAlreadyRegistered');
              errorEl.style.display = 'block';
              phoneInput.setAttribute('data-phone-taken', 'true');
            } else {
              errorEl.style.display = 'none';
              errorEl.textContent = '';
              phoneInput.removeAttribute('data-phone-taken');
            }
          })
          .catch(function() {
            errorEl.style.display = 'none';
            phoneInput.removeAttribute('data-phone-taken');
          });
      }
      phoneInput.addEventListener('blur', function() {
        var fmtErr = validatePhoneInput(phoneInput);
        if (fmtErr) {
          errorEl.textContent = fmtErr;
          errorEl.style.display = 'block';
          phoneInput.removeAttribute('data-phone-taken');
          return;
        }
        if (checkTimeout) clearTimeout(checkTimeout);
        checkTimeout = setTimeout(doCheck, 300);
      });
      phoneInput.addEventListener('input', function() {
        errorEl.style.display = 'none';
        errorEl.textContent = '';
        phoneInput.removeAttribute('data-phone-taken');
      });
    }

    function initCustomSelectDropdowns() {
      var dropdowns = form.querySelectorAll('.custom-select-dropdown');
      function closeAllSelect() {
        form.querySelectorAll('.custom-select-list.open').forEach(function(l) { l.classList.remove('open'); });
        form.querySelectorAll('.custom-select-trigger.open').forEach(function(t) { t.classList.remove('open'); t.setAttribute('aria-expanded', 'false'); });
      }
      document.addEventListener('click', function(e) {
        if (!e.target.closest('.custom-select-dropdown')) closeAllSelect();
      });
      dropdowns.forEach(function(dd) {
        var trigger = dd.querySelector('.custom-select-trigger');
        var list = dd.querySelector('.custom-select-list');
        var hidden = dd.querySelector('input[type="hidden"]');
        var triggerText = trigger && trigger.querySelector('.custom-select-trigger-text');
        if (!trigger || !list || !hidden || !triggerText) return;

        function close() {
          trigger.classList.remove('open');
          list.classList.remove('open');
          trigger.setAttribute('aria-expanded', 'false');
        }

        function open() {
          closeAllSelect();
          trigger.classList.add('open');
          list.classList.add('open');
          trigger.setAttribute('aria-expanded', 'true');
        }

        trigger.addEventListener('click', function(e) {
          e.preventDefault();
          e.stopPropagation();
          var isOpen = list.classList.contains('open');
          if (isOpen) close(); else open();
        });

        trigger.addEventListener('keydown', function(e) {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            var isOpen = list.classList.contains('open');
            if (isOpen) close(); else open();
          }
        });

        list.querySelectorAll('.custom-select-item').forEach(function(item) {
          item.addEventListener('click', function(e) {
            e.preventDefault();
            var val = item.getAttribute('data-value');
            hidden.value = val;
            triggerText.textContent = val;
            triggerText.classList.remove('placeholder');
            list.querySelectorAll('.custom-select-item').forEach(function(i) { i.classList.remove('active'); });
            item.classList.add('active');
            close();
          });
        });
      });
    }

    function initCountrySelectDropdowns() {
      var dropdowns = form.querySelectorAll('.custom-country-select-dropdown');
      function closeAll() {
        form.querySelectorAll('.custom-country-select-list.open').forEach(function(l) { l.classList.remove('open'); });
        form.querySelectorAll('.custom-country-select-trigger.open').forEach(function(t) { t.classList.remove('open'); t.setAttribute('aria-expanded', 'false'); });
      }
      document.addEventListener('click', function(e) {
        if (!e.target.closest('.custom-country-select-dropdown')) closeAll();
      });
      dropdowns.forEach(function(dd) {
        var trigger = dd.querySelector('.custom-country-select-trigger');
        var list = dd.querySelector('.custom-country-select-list');
        var listInner = dd.querySelector('.custom-country-select-list-inner');
        var searchInput = dd.querySelector('.custom-country-select-search');
        var noResults = dd.querySelector('.custom-country-select-no-results');
        var hidden = dd.querySelector('input[type="hidden"]');
        if (!trigger || !list || !hidden) return;

        function filterList(query) {
          var q = (query || '').toLowerCase().trim();
          var items = listInner ? listInner.querySelectorAll('.custom-country-select-item') : list.querySelectorAll('.custom-country-select-item');
          var visibleCount = 0;
          items.forEach(function(item) {
            var searchText = item.getAttribute('data-search') || '';
            var show = !q || searchText.indexOf(q) !== -1;
            item.setAttribute('data-filter-hidden', show ? 'false' : 'true');
            if (show) visibleCount++;
          });
          if (noResults) noResults.classList.toggle('visible', visibleCount === 0);
        }

        function close() {
          trigger.classList.remove('open');
          list.classList.remove('open');
          trigger.setAttribute('aria-expanded', 'false');
          if (searchInput) { searchInput.value = ''; filterList(''); }
        }

        function open() {
          closeAll();
          trigger.classList.add('open');
          list.classList.add('open');
          trigger.setAttribute('aria-expanded', 'true');
          if (searchInput) { searchInput.value = ''; filterList(''); searchInput.focus(); }
        }

        trigger.addEventListener('click', function(e) {
          e.preventDefault();
          e.stopPropagation();
          var isOpen = list.classList.contains('open');
          if (isOpen) close(); else open();
        });

        if (searchInput) {
          searchInput.addEventListener('click', function(e) { e.stopPropagation(); });
          searchInput.addEventListener('input', function() { filterList(this.value); });
          searchInput.addEventListener('keydown', function(e) {
            if (e.key === 'Escape') { close(); e.preventDefault(); }
          });
        }

        var itemsContainer = listInner || list;
        itemsContainer.querySelectorAll('.custom-country-select-item').forEach(function(item) {
          item.addEventListener('click', function(e) {
            e.preventDefault();
            if (item.getAttribute('data-filter-hidden') === 'true') return;
            var val = item.getAttribute('data-value');
            var text = (item.getAttribute('data-name') || item.textContent || '').trim();
            hidden.value = val || '';
            var triggerTextEl = trigger.querySelector('.custom-country-select-trigger-text');
            if (triggerTextEl) {
              triggerTextEl.textContent = text || (t('selectCountry') || 'Select country');
              triggerTextEl.classList.toggle('placeholder', !val);
            }
            var triggerFlagWrap = trigger.querySelector('.custom-country-select-trigger-flag');
            if (triggerFlagWrap) {
              var flagImg = triggerFlagWrap.querySelector('img');
              if (flagImg && val) {
                flagImg.src = FLAG_CDN + val.toLowerCase() + '.png';
                flagImg.style.display = '';
              } else if (flagImg) flagImg.style.display = 'none';
            } else if (val) {
              var wrap = document.createElement('span');
              wrap.className = 'custom-country-select-trigger-flag';
              var img = document.createElement('img');
              img.src = FLAG_CDN + val.toLowerCase() + '.png';
              img.alt = '';
              img.setAttribute('role', 'presentation');
              wrap.appendChild(img);
              trigger.insertBefore(wrap, triggerTextEl);
            }
            list.querySelectorAll('.custom-country-select-item').forEach(function(i) { i.classList.remove('active'); });
            item.classList.add('active');
            close();
          });
        });
      });
    }

    function initDatePickers() {
      var wraps = form.querySelectorAll('.custom-date-input-wrap');
      var monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
      var openPicker = null;

      function closeAllPickers() {
        if (openPicker) {
          openPicker.querySelector('.custom-date-picker').style.display = 'none';
          openPicker = null;
        }
      }

      wraps.forEach(function(wrap) {
        var input = wrap.querySelector('input[data-date-format]');
        var btn = wrap.querySelector('.custom-date-picker-btn');
        var pickerEl = wrap.querySelector('.custom-date-picker');
        var formatKey = wrap.getAttribute('data-date-format');
        if (!input || !pickerEl || !formatKey) return;

        function getDisplayYearMonth() {
          var raw = (input.value && input.value.trim()) || '';
          var iso = raw ? parseDateByFormat(raw, formatKey) : null;
          if (iso) {
            var p = iso.match(/^(\d{4})-(\d{2})/);
            if (p) return { year: parseInt(p[1], 10), month: parseInt(p[2], 10) - 1 };
          }
          var now = new Date();
          return { year: now.getFullYear(), month: now.getMonth() };
        }

        function renderCalendar(year, month) {
          var first = new Date(year, month, 1);
          var last = new Date(year, month + 1, 0);
          var startDay = first.getDay();
          var daysInMonth = last.getDate();
          var prevMonth = month === 0 ? 11 : month - 1;
          var prevYear = month === 0 ? year - 1 : year;
          var prevLast = new Date(prevYear, prevMonth + 1, 0);
          var prevDays = prevLast.getDate();
          var html = '<div class="custom-date-picker-header">' +
            '<button type="button" class="custom-date-picker-prev" aria-label="Previous month">&lsaquo;</button>' +
            '<span class="custom-date-picker-title">' + monthNames[month] + ' ' + year + '</span>' +
            '<button type="button" class="custom-date-picker-next" aria-label="Next month">&rsaquo;</button>' +
            '</div><table class="custom-date-picker-table"><thead><tr>' +
            '<th scope="col">Su</th><th scope="col">Mo</th><th scope="col">Tu</th><th scope="col">We</th><th scope="col">Th</th><th scope="col">Fr</th><th scope="col">Sa</th>' +
            '</tr></thead><tbody><tr>';
          var dayCount = 0;
          for (var i = 0; i < startDay; i++) {
            var d = prevDays - startDay + i + 1;
            html += '<td class="custom-date-picker-day other-month"><button type="button" data-year="' + prevYear + '" data-month="' + (prevMonth + 1) + '" data-day="' + d + '">' + d + '</button></td>';
            dayCount++;
          }
          for (var dayNum = 1; dayNum <= daysInMonth; dayNum++) {
            if (dayCount > 0 && dayCount % 7 === 0) html += '</tr><tr>';
            html += '<td class="custom-date-picker-day"><button type="button" data-year="' + year + '" data-month="' + (month + 1) + '" data-day="' + dayNum + '">' + dayNum + '</button></td>';
            dayCount++;
          }
          var nextMonthStart = 1;
          while (dayCount % 7 !== 0) {
            html += '<td class="custom-date-picker-day other-month"><button type="button" data-year="' + (month === 11 ? year + 1 : year) + '" data-month="' + (month === 11 ? 1 : month + 2) + '" data-day="' + nextMonthStart + '">' + nextMonthStart + '</button></td>';
            nextMonthStart++;
            dayCount++;
          }
          html += '</tr></tbody></table>';
          pickerEl.innerHTML = html;

          pickerEl.querySelector('.custom-date-picker-prev').addEventListener('click', function(e) {
            e.preventDefault();
            if (month === 0) { month = 11; year--; } else month--;
            renderCalendar(year, month);
          });
          pickerEl.querySelector('.custom-date-picker-next').addEventListener('click', function(e) {
            e.preventDefault();
            if (month === 11) { month = 0; year++; } else month++;
            renderCalendar(year, month);
          });

          pickerEl.querySelectorAll('.custom-date-picker-day button').forEach(function(bt) {
            bt.addEventListener('click', function(e) {
              e.preventDefault();
              var y = parseInt(bt.getAttribute('data-year'), 10);
              var m = parseInt(bt.getAttribute('data-month'), 10);
              var d = parseInt(bt.getAttribute('data-day'), 10);
              var mStr = m < 10 ? '0' + m : String(m);
              var dStr = d < 10 ? '0' + d : String(d);
              var iso = y + '-' + mStr + '-' + dStr;
              input.value = formatDateToDisplay(iso, formatKey);
              pickerEl.style.display = 'none';
              openPicker = null;
              input.focus();
            });
          });
        }

        function showPicker() {
          closeAllPickers();
          openPicker = wrap;
          var dm = getDisplayYearMonth();
          renderCalendar(dm.year, dm.month);
          pickerEl.style.display = 'block';
        }

        btn.addEventListener('click', function(e) {
          e.preventDefault();
          if (pickerEl.style.display === 'block') { closeAllPickers(); return; }
          showPicker();
        });
        input.addEventListener('focus', function() { showPicker(); });
        input.addEventListener('click', function() { showPicker(); });
      });

      document.addEventListener('click', function(e) {
        if (openPicker && !openPicker.contains(e.target)) closeAllPickers();
      });
      document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') closeAllPickers();
      });
    }

    function runApprovefyFieldEnhancements() {
      initFileUploadZones();
      initPhoneCountryDropdowns();
      initPhoneInputSyncCountryCode();
      initAddressAutocomplete(form);
      initPhoneAlreadyRegisteredCheck();
      initCustomSelectDropdowns();
      initCountrySelectDropdowns();
      initDatePickers();
    }
    if (typeof window.requestAnimationFrame === 'function') {
      window.requestAnimationFrame(function () {
        window.requestAnimationFrame(runApprovefyFieldEnhancements);
      });
    } else {
      setTimeout(runApprovefyFieldEnhancements, 0);
    }

    const submitBtn = document.getElementById('custom-submit-btn');
    const btnText = document.getElementById('btn-text');
    const btnLoading = document.getElementById('btn-loading');
    const messageDiv = document.getElementById('custom-message');
    
    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      var requiredMsg = t('fieldRequired');
      if (!requiredMsg || requiredMsg === 'fieldRequired') requiredMsg = 'This field is required.';
      form.querySelectorAll('.custom-field-error').forEach(function(el) { el.style.display = 'none'; el.textContent = ''; });
      form.querySelectorAll('.custom-phone-error').forEach(function(el) { el.style.display = 'none'; el.textContent = ''; });

      var requiredInputs = form.querySelectorAll('input[required]:not([type="hidden"]), textarea[required]');
      for (var ri = 0; ri < requiredInputs.length; ri++) {
        var inp = requiredInputs[ri];
        var val = (inp.value && inp.value.trim()) || '';
        if (!val) {
          var wrap = inp.closest('.custom-form-field');
          var errEl = wrap ? wrap.querySelector('.custom-field-error') : null;
          if (errEl) { errEl.textContent = requiredMsg; errEl.style.display = 'block'; }
          inp.focus();
          return;
        }
      }
      var requiredHidden = form.querySelectorAll('input[type="hidden"][required]');
      for (var rh = 0; rh < requiredHidden.length; rh++) {
        var hid = requiredHidden[rh];
        var hVal = (hid.value && hid.value.trim()) || '';
        if (!hVal) {
          var wrapH = hid.closest('.custom-form-field');
          var errH = wrapH ? wrapH.querySelector('.custom-field-error') : null;
          if (errH) { errH.textContent = requiredMsg; errH.style.display = 'block'; }
          var trigger = wrapH ? wrapH.querySelector('[tabindex="0"]') : null;
          if (trigger) trigger.focus();
          return;
        }
      }
      var radioGroups = form.querySelectorAll('input[type="radio"][required]');
      for (var rg = 0; rg < radioGroups.length; rg++) {
        var r = radioGroups[rg];
        var name = r.getAttribute('name');
        var checked = form.querySelector('input[type="radio"][name="' + name.replace(/"/g, '\\"') + '"]:checked');
        if (!checked) {
          var wrapR = r.closest('.custom-form-field');
          var errR = wrapR ? wrapR.querySelector('.custom-field-error') : null;
          if (errR) { errR.textContent = requiredMsg; errR.style.display = 'block'; }
          r.focus();
          return;
        }
      }

      var emailInputForValidation = form.querySelector('input[name="email"]');
      var emailWrap = emailInputForValidation ? emailInputForValidation.closest('.custom-form-field') : null;
      var emailErrEl = emailWrap ? emailWrap.querySelector('.custom-field-error') : null;
      var emailValueForValidation = emailInputForValidation ? (emailInputForValidation.value || '') : '';
      if (!emailInputForValidation) {
        var hiddenEmailInput = form.querySelector('input[type="hidden"][name="email"]');
        emailValueForValidation = hiddenEmailInput ? (hiddenEmailInput.value || '') : '';
      }
      if (emailValueForValidation && !isValidEmailAddress(emailValueForValidation)) {
        var invalidEmailMsg = t('invalidEmailFormat');
        if (!invalidEmailMsg || invalidEmailMsg === 'invalidEmailFormat') invalidEmailMsg = 'Please enter a valid email address.';
        if (emailErrEl) {
          emailErrEl.textContent = invalidEmailMsg;
          emailErrEl.style.display = 'block';
        } else {
          showMessage(invalidEmailMsg, 'error');
        }
        if (emailInputForValidation) emailInputForValidation.focus();
        return;
      }

      var fileZones = form.querySelectorAll('.custom-file-upload-zone');
      var fileError = false;
      fileZones.forEach(function(zone) {
        var fieldName = zone.getAttribute('data-field-name');
        var isRequired = zone.getAttribute('data-required') === 'true';
        var errorDiv = document.getElementById(zone.id + '-error');
        var value = fileDataMap[fieldName];
        var isEmpty = value == null || (Array.isArray(value) ? value.length === 0 : false);
        if (isRequired && isEmpty) {
          var reqMsg = t('fileRequired');
          if (errorDiv) { errorDiv.textContent = (reqMsg && reqMsg !== 'fileRequired') ? reqMsg : 'This file is required.'; errorDiv.style.display = 'block'; }
          fileError = true;
        }
      });
      if (fileError) return;

      var dateFormatInputsCheck = form.querySelectorAll('input[data-date-format]');
      for (var di = 0; di < dateFormatInputsCheck.length; di++) {
        var dateInp = dateFormatInputsCheck[di];
        var rawVal = (dateInp.value && dateInp.value.trim()) || '';
        if (rawVal) {
          var fmt = dateInp.getAttribute('data-date-format');
          if (!parseDateByFormat(rawVal, fmt)) {
            var dateErrMsg = t('invalidDateFormat');
            if (!dateErrMsg || dateErrMsg === 'invalidDateFormat') dateErrMsg = 'Please enter the date in the correct format.';
            showMessage(dateErrMsg, 'error');
            dateInp.focus();
            return;
          }
        }
      }

      form.querySelectorAll('.custom-checkbox-error').forEach(function(el) { el.style.display = 'none'; el.textContent = ''; });
      var checkboxGroups = form.querySelectorAll('.custom-options-group[data-min-required]');
      for (var cg = 0; cg < checkboxGroups.length; cg++) {
        var group = checkboxGroups[cg];
        var minRequired = parseInt(group.getAttribute('data-min-required'), 10) || 0;
        if (minRequired < 1) continue;
        var checkedCount = group.querySelectorAll('input[type="checkbox"]:checked').length;
        if (checkedCount < minRequired) {
          var label = group.getAttribute('data-field-label') || t('thisField');
          var msgKey = t('checkboxMinRequired');
          var cbMsg = (msgKey && msgKey !== 'checkboxMinRequired') ? msgKey : 'Please select at least {min} option(s) for "{label}".';
          cbMsg = cbMsg.replace('{min}', String(minRequired)).replace('{label}', label);
          var fieldWrap = group.closest('.custom-form-field');
          var cbErrEl = fieldWrap ? fieldWrap.querySelector('.custom-checkbox-error') : null;
          if (cbErrEl) {
            cbErrEl.textContent = cbMsg;
            cbErrEl.style.display = 'block';
          } else {
            showMessage(cbMsg, 'error');
          }
          var firstCb = group.querySelector('input[type="checkbox"]');
          if (firstCb) firstCb.focus();
          return;
        }
      }

      // Zip / Postal Code validation (country-specific)
      var zipInput = form.querySelector('input[name="zipCode"]');
      if (zipInput) {
        var rawZip = (zipInput.value && zipInput.value.trim()) || '';
        if (rawZip) {
          var countrySelectEl = form.querySelector('select[name="country"]');
          var countryHiddenEl = form.querySelector('.custom-country-select-dropdown input[name="country"]');
          var countryCode = (countryHiddenEl && countryHiddenEl.value) || (countrySelectEl && countrySelectEl.value) || (typeof shopCountryCode !== 'undefined' ? shopCountryCode : '');
          countryCode = (countryCode || '').toUpperCase();

          // For Sri Lanka (LK) require exactly 5 numeric digits
          if (countryCode === 'LK') {
            var zipDigits = rawZip.replace(/\D/g, '');
            if (zipDigits.length !== 5) {
              var zipFieldWrap = zipInput.closest('.custom-form-field');
              var zipErrEl = zipFieldWrap ? zipFieldWrap.querySelector('.custom-field-error') : null;
              var zipMsg = 'Postal code must be 5 digits.';
              if (zipErrEl) {
                zipErrEl.textContent = zipMsg;
                zipErrEl.style.display = 'block';
              } else {
                showMessage(zipMsg, 'error');
              }
              zipInput.focus();
              return;
            }
          }
        }
      }

      var phoneInput = form.querySelector('input[name="phone"], input[data-field-type="phone"]');
      if (phoneInput) {
        var phoneFmtErr = validatePhoneInput(phoneInput);
        if (phoneFmtErr) {
          showPhoneValidationError(phoneInput, phoneFmtErr);
          return;
        }
      }
      if (phoneInput && phoneInput.getAttribute('data-phone-taken') === 'true') {
        var phoneErr = document.getElementById('phone-field-error');
        var phoneMsg = t('phoneAlreadyRegistered');
        if (phoneErr) { phoneErr.style.display = 'block'; phoneErr.textContent = (phoneMsg && phoneMsg !== 'phoneAlreadyRegistered') ? phoneMsg : 'This phone number is already registered. Please use a different number.'; }
        phoneInput.focus();
        return;
      }
      
      submitBtn.disabled = true;
      btnText.style.display = 'none';
      btnLoading.style.display = 'inline-flex';

      var registrationSucceeded = false;

      try {
        const formData = new FormData(form);

        var dateFormatInputs = form.querySelectorAll('input[data-date-format]');
        dateFormatInputs.forEach(function(inp) {
          var formatKey = inp.getAttribute('data-date-format');
          var raw = (inp.value && inp.value.trim()) || '';
          if (raw) {
            var normalized = parseDateByFormat(raw, formatKey);
            if (normalized) formData.set(inp.name, normalized);
          }
        });

        if (phoneInput) {
          var phoneWrapper = phoneInput.closest('.custom-phone-wrapper');
          var phoneCodeInput = phoneWrapper && phoneWrapper.querySelector('input[name="phoneCountryCode"]');
          if (phoneCodeInput && phoneInput.value) {
            var codePart = String(phoneCodeInput.value || '').replace(/\s/g, '');
            var numPart = String(phoneInput.value || '').replace(/^\+/, '').replace(/\s/g, '');
            formData.set('phone', codePart + numPart);
          }
        }
        formData.delete('phoneCountryCode');

        for (var fk in fileDataMap) {
          if (Object.prototype.hasOwnProperty.call(fileDataMap, fk)) {
            formData.append(fk, JSON.stringify(fileDataMap[fk]));
          }
        }

        formData.delete('');
        var keysToRemove = [];
        for (var pair of formData.entries()) {
          if (pair[1] instanceof File) keysToRemove.push(pair[0]);
        }
        keysToRemove.forEach(function(k) { formData.delete(k); });

        if (cfg.customerLoggedIn && cfg.shopifyLoggedInCustomerId != null && String(cfg.shopifyLoggedInCustomerId) !== '') {
          var cidSubmit = String(cfg.shopifyLoggedInCustomerId);
          if (!formData.get('loggedInShopifyCustomerId')) {
            formData.set('loggedInShopifyCustomerId', cidSubmit);
          }
        }

        const shop = window.Shopify?.shop || (cfg.shop || '');
        
        const response = await fetch(`/apps/customer-approval/register?shop=${shop}`, {
          method: 'POST',
          body: formData
        });
        
        let data = {};
        try {
          data = await response.json();
        } catch (_) {
          var invResp = t('invalidResponse');
          data = { error: (invResp && invResp !== 'invalidResponse') ? invResp : 'Invalid response from server' };
        }
        
        var okSuccess = response.ok && (data.success === true || data.success === 'true');
        if (okSuccess) {
          var afterSubmit = (data.afterSubmit === 'redirect') ? 'redirect' : 'message';
          var redirectUrl = (data.redirectUrl && String(data.redirectUrl).trim()) ? String(data.redirectUrl).trim() : '';
          if (afterSubmit === 'redirect' && redirectUrl && !isUnsafeRegistrationRedirectUrl(redirectUrl)) {
            window.location.href = redirectUrl;
            return;
          }
          if (cfg.customerLoggedIn) {
            setLoggedInPendingSubmittedSession();
            clearStoredApprovalConfigCache();
            mountLoggedInPendingHtml(buildLoggedInPendingSubmittedHtml());
            registrationSucceeded = true;
          } else {
          // Prefer server copy (auto vs manual, custom success text); do not let generic t('success_message') override API message.
          var serverLine =
            (typeof data.successMessage === 'string' && data.successMessage.trim()) ||
            (typeof data.message === 'string' && data.message.trim()) ||
            '';
          var trOk = t('success_message');
          if (!trOk || trOk === 'success_message') trOk = '';
          var trReg = t('registrationSuccess');
          if (!trReg || trReg === 'registrationSuccess') trReg = '';
          var successMsg = serverLine || trOk || trReg || 'Registration successful!';
          var msgBox = messageDiv && messageDiv.isConnected ? messageDiv : document.getElementById('custom-message');
          if (!msgBox) {
            console.warn('[Approvefy] Missing #custom-message; cannot show success text.');
          } else {
            msgBox.innerHTML = successMsg;
            msgBox.className = 'custom-message success';
            msgBox.style.display = 'block';
            try {
              msgBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            } catch (scrollErr) { /* ignore */ }
          }
          form.querySelectorAll('input:not([type="hidden"]), textarea, select').forEach(function(el) { el.value = ''; });
          form.querySelectorAll('.custom-select-trigger-text').forEach(function(el) { el.textContent = el.classList.contains('placeholder') ? (form.querySelector('[data-field-type="dropdown"]') ? t('selectPlaceholder') : '') : ''; el.classList.add('placeholder'); });
          form.querySelectorAll('.custom-country-select-trigger-text').forEach(function(el) { el.textContent = t('selectCountry') || 'Select country'; el.classList.add('placeholder'); });
          form.querySelectorAll('input[type="hidden"]').forEach(function(el) { if (el.name) el.value = ''; });
          Object.keys(fileDataMap).forEach(function(k) { delete fileDataMap[k]; });
          form.querySelectorAll('.custom-file-upload-zone').forEach(function(zone) {
            zone.classList.remove('has-file');
            var textEl = zone.querySelector('.custom-file-upload-text');
            var hintEl = zone.querySelector('.custom-file-upload-hint');
            if (textEl) textEl.textContent = t('uploadClickOrDrag');
            if (hintEl) { var mb = zone.getAttribute('data-max-file-size-mb') || '5'; var h = t('uploadHintMax'); hintEl.textContent = (h && h !== 'uploadHintMax') ? h.replace('{max}', mb) : 'JPG, PNG, PDF \u2014 Max ' + mb + ' MB'; }
            var listEl = zone.querySelector('.custom-file-upload-list');
            if (listEl) listEl.innerHTML = '';
            var inp = zone.querySelector('input[type="file"]');
            if (inp) inp.value = '';
          });
          // Keep the full form visible (heading, fields, button) like the storefront example; only hide step chrome so multi-step nav is not used after success.
          form.querySelectorAll('.form-step-nav, .approvefy-step-nav-wrap').forEach(function(el) {
            el.style.display = 'none';
          });
          if (submitBtn) {
            submitBtn.style.display = 'flex';
          }
          registrationSucceeded = true;
          }
        } else {
          const rawErr = data.error || data.message || (data.details && data.details.map(function(d){ return d.message; }).join(', ')) || '';
          var rawTrim = typeof rawErr === 'string' ? rawErr.trim() : '';
          var isPendingDuplicate =
            rawTrim === 'email_already_pending_registration' || rawTrim === 'email_pending_approval';
          var isRejectedRegistration = rawTrim === 'email_registration_rejected';
          var isApprovalRemovedContactSupport =
            rawTrim === 'email_approval_removed_contact_support';
          var errMsg = '';
          var useHtmlMessage = false;
          if (rawTrim) {
            if (isPendingDuplicate) {
              var penDup = t('emailAlreadyPendingRegistration');
              errMsg =
                penDup && penDup !== 'emailAlreadyPendingRegistration'
                  ? penDup
                  : 'This customer is already registered. Approval is pending.';
            } else if (isRejectedRegistration) {
              errMsg = buildRejectedRegistrationMessageHtml();
              useHtmlMessage = true;
            } else if (isApprovalRemovedContactSupport) {
              errMsg = buildApprovalRemovedSupportMessageHtml();
              useHtmlMessage = true;
            } else {
              errMsg = translateError(rawTrim);
            }
          } else {
            errMsg =
              t('registrationFailed') !== 'registrationFailed'
                ? t('registrationFailed')
                : 'Registration failed. Please try again.';
          }
          if (cfg.customerLoggedIn && isPendingDuplicate) {
            setLoggedInPendingSubmittedSession();
            clearStoredApprovalConfigCache();
            mountLoggedInPendingHtml(buildLoggedInPendingSubmittedHtml());
          } else if (useHtmlMessage) {
            showMessageHtml(errMsg, 'error');
          } else {
            showMessage(errMsg, isPendingDuplicate ? 'warning' : 'error');
          }
        }
      } catch (error) {
        var errOccurred = t('errorOccurred');
        showMessage((errOccurred && errOccurred !== 'errorOccurred' ? errOccurred : 'An error occurred. Please try again.') + ' ' + (error.message || ''), 'error');
      } finally {
        if (submitBtn) {
          submitBtn.disabled = !!registrationSucceeded;
        }
        if (btnText) btnText.style.display = 'inline';
        if (btnLoading) btnLoading.style.display = 'none';
      }
    });
    
    function showMessage(msg, type) {
      var el = messageDiv && messageDiv.isConnected ? messageDiv : document.getElementById('custom-message');
      if (!el) {
        console.warn('[Approvefy] Missing #custom-message; cannot show message.');
        return;
      }
      el.textContent = msg;
      el.className = 'custom-message ' + (type || 'error');
      el.style.display = 'block';
    }

    function showMessageHtml(html, type) {
      var el = messageDiv && messageDiv.isConnected ? messageDiv : document.getElementById('custom-message');
      if (!el) {
        console.warn('[Approvefy] Missing #custom-message; cannot show message.');
        return;
      }
      el.innerHTML = html;
      el.className = 'custom-message ' + (type || 'error');
      el.style.display = 'block';
    }
  }
})();