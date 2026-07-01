/**
 * Admin Settings → Store section labels (guest checkout + logged-in customers).
 * Follows the merchant's effective default storefront language where we have strings.
 */
import { normalizeLangCode } from "./languages";

export type SettingsStoreUiStrings = {
    storeSettingCardTitle: string;
    guestCheckoutHeading: string;
    redirectGuestsLabel: string;
    redirectGuestsHelp: string;
    redirectSignInLinksLabel: string;
    redirectSignInLinksHelp: string;
    customerAccountHeading: string;
    redirectUrlLabel: string;
    redirectUrlPlaceholder: string;
    redirectUrlHelp: string;
    loggedInCustomersHeading: string;
    blockLoggedInLabel: string;
    popupMessageLabel: string;
    popupMessageHelp: string;
    /** Default storefront popup when the merchant has not customized the message. */
    defaultLoggedInBlockedMessage: string;
};

/** English built-in default (DB / legacy); used to swap in a localized default in the loader. */
export const BUILTIN_EN_LOGGED_IN_BLOCKED_MESSAGE =
    "Please complete the registration form after your order.";

const EN: SettingsStoreUiStrings = {
    storeSettingCardTitle: "Store Setting",
    guestCheckoutHeading: "Guest checkout",
    redirectGuestsLabel: "Redirect guests away from checkout and Buy it now",
    redirectGuestsHelp: "Enable the app embed (or Registration Form block) in your theme.",
    redirectSignInLinksLabel: "Redirect header customer account icon to registration form page",
    redirectSignInLinksHelp:
        "When enabled, guests who click the customer account icon in the theme header are sent to your registration form page. Other sign-in links are not redirected. When disabled, /pages/customer-registration is not available on the storefront.",
    customerAccountHeading: "Customer account icon",
    redirectUrlLabel: "Registration form page URL",
    redirectUrlPlaceholder: "/pages/customer-registration or https://…",
    redirectUrlHelp: "Used for sign-in redirects and guest checkout blocking. Auto-filled as /pages/customer-registration when you create a form.",
    loggedInCustomersHeading: "Logged-in customers",
    blockLoggedInLabel: "Redirect customers without the approved tag",
    popupMessageLabel: "Popup message",
    popupMessageHelp: "Shown before redirect.",
    defaultLoggedInBlockedMessage: BUILTIN_EN_LOGGED_IN_BLOCKED_MESSAGE,
};

const BY_LANG: Record<string, SettingsStoreUiStrings> = {
    fr: {
        storeSettingCardTitle: "Paramètres de la boutique",
        guestCheckoutHeading: "Commande invité",
        redirectGuestsLabel: "Rediriger les invités loin du paiement et de « Acheter maintenant »",
        redirectGuestsHelp: "Activez l’intégration d’application (ou le bloc Formulaire d’inscription) dans votre thème.",
        redirectSignInLinksLabel: "Rediriger les liens de connexion vers la page du formulaire d’inscription",
        redirectSignInLinksHelp:
            "Si activé, l’icône compte client et les liens Connexion / Inscription envoient les invités vers votre page de formulaire.",
        customerAccountHeading: "Liens compte client",
        redirectUrlLabel: "URL de la page du formulaire d’inscription",
        redirectUrlPlaceholder: "/pages/contact ou https://…",
        redirectUrlHelp: "Destination des invités lorsqu’ils sont bloqués.",
        loggedInCustomersHeading: "Clients connectés",
        blockLoggedInLabel: "Rediriger les clients sans l’étiquette approuvée",
        popupMessageLabel: "Message de la fenêtre",
        popupMessageHelp: "Affiché avant la redirection.",
        defaultLoggedInBlockedMessage:
            "Veuillez remplir le formulaire d’inscription après votre commande.",
    },
    de: {
        storeSettingCardTitle: "Shop-Einstellungen",
        guestCheckoutHeading: "Gast-Checkout",
        redirectGuestsLabel: "Gäste vom Checkout und „Sofort kaufen“ wegleiten",
        redirectGuestsHelp: "App-Einbettung (oder Registrierungsformular-Block) im Theme aktivieren.",
        redirectSignInLinksLabel: "Anmelde-Links zur Registrierungsformular-Seite weiterleiten",
        redirectSignInLinksHelp:
            "Wenn aktiv, leiten Konto-Symbol und Anmelde-Links Gäste zu Ihrer Registrierungsformular-Seite.",
        customerAccountHeading: "Kundenkonto-Links",
        redirectUrlLabel: "URL der Registrierungsformular-Seite",
        redirectUrlPlaceholder: "/pages/contact oder https://…",
        redirectUrlHelp: "Wohin Gäste geschickt werden, wenn sie blockiert sind.",
        loggedInCustomersHeading: "Angemeldete Kunden",
        blockLoggedInLabel: "Kunden ohne Freigabe-Tag weiterleiten",
        popupMessageLabel: "Popup-Nachricht",
        popupMessageHelp: "Wird vor der Weiterleitung angezeigt.",
        defaultLoggedInBlockedMessage:
            "Bitte füllen Sie nach Ihrer Bestellung das Registrierungsformular aus.",
    },
    es: {
        storeSettingCardTitle: "Configuración de la tienda",
        guestCheckoutHeading: "Pago como invitado",
        redirectGuestsLabel: "Redirigir invitados fuera del pago y de Comprar ahora",
        redirectGuestsHelp: "Activa la incrustación de la app (o el bloque Formulario de registro) en tu tema.",
        redirectSignInLinksLabel: "Redirigir enlaces de inicio de sesión a la página del formulario de registro",
        redirectSignInLinksHelp:
            "Si está activado, el icono de cuenta y los enlaces de inicio de sesión envían invitados a su página de formulario.",
        customerAccountHeading: "Enlaces de cuenta de cliente",
        redirectUrlLabel: "URL de la página del formulario de registro",
        redirectUrlPlaceholder: "/pages/contact o https://…",
        redirectUrlHelp: "A dónde se envía a los invitados cuando se bloquean.",
        loggedInCustomersHeading: "Clientes con sesión iniciada",
        blockLoggedInLabel: "Redirigir clientes sin la etiqueta aprobada",
        popupMessageLabel: "Mensaje emergente",
        popupMessageHelp: "Se muestra antes de la redirección.",
        defaultLoggedInBlockedMessage:
            "Complete el formulario de registro después de realizar su pedido.",
    },
    it: {
        storeSettingCardTitle: "Impostazioni negozio",
        guestCheckoutHeading: "Checkout ospite",
        redirectGuestsLabel: "Reindirizza gli ospiti lontano dal checkout e da Compra ora",
        redirectGuestsHelp: "Abilita l’embed dell’app (o il blocco Modulo di registrazione) nel tema.",
        redirectSignInLinksLabel: "Reindirizza i link di accesso alla pagina del modulo di registrazione",
        redirectSignInLinksHelp:
            "Se attivo, l’icona account e i link di accesso inviano gli ospiti alla pagina del modulo.",
        customerAccountHeading: "Link account cliente",
        redirectUrlLabel: "URL pagina modulo di registrazione",
        redirectUrlPlaceholder: "/pages/contact o https://…",
        redirectUrlHelp: "Dove vengono inviati gli ospiti quando vengono bloccati.",
        loggedInCustomersHeading: "Clienti connessi",
        blockLoggedInLabel: "Reindirizza i clienti senza il tag approvato",
        popupMessageLabel: "Messaggio popup",
        popupMessageHelp: "Mostrato prima del reindirizzamento.",
        defaultLoggedInBlockedMessage:
            "Completa il modulo di registrazione dopo il tuo ordine.",
    },
    nl: {
        storeSettingCardTitle: "Winkelinstellingen",
        guestCheckoutHeading: "Gastafrekening",
        redirectGuestsLabel: "Gasten wegsturen van afrekenen en Nu kopen",
        redirectGuestsHelp: "Schakel de app-embed (of het registratieformulierblok) in je thema in.",
        redirectSignInLinksLabel: "Inloglinks doorsturen naar registratieformulierpagina",
        redirectSignInLinksHelp:
            "Indien ingeschakeld sturen het accountpictogram en inloglinks gasten naar uw registratiepagina.",
        customerAccountHeading: "Klantaccountlinks",
        redirectUrlLabel: "URL registratieformulierpagina",
        redirectUrlPlaceholder: "/pages/contact of https://…",
        redirectUrlHelp: "Waar gasten naartoe gaan als ze worden geblokkeerd.",
        loggedInCustomersHeading: "Ingelogde klanten",
        blockLoggedInLabel: "Klanten zonder goedkeuringslabel doorsturen",
        popupMessageLabel: "Pop-upbericht",
        popupMessageHelp: "Getoond vóór de omleiding.",
        defaultLoggedInBlockedMessage:
            "Vul na uw bestelling het registratieformulier in.",
    },
    pl: {
        storeSettingCardTitle: "Ustawienia sklepu",
        guestCheckoutHeading: "Płatność gościa",
        redirectGuestsLabel: "Przekieruj gości z kasy i z opcji Kup teraz",
        redirectGuestsHelp: "Włącz osadzenie aplikacji (lub blok formularza rejestracji) w motywie.",
        redirectSignInLinksLabel: "Przekieruj linki logowania na stronę formularza rejestracji",
        redirectSignInLinksHelp:
            "Po włączeniu ikona konta i linki logowania kierują gości na stronę formularza.",
        customerAccountHeading: "Linki konta klienta",
        redirectUrlLabel: "URL strony formularza rejestracji",
        redirectUrlPlaceholder: "/pages/contact lub https://…",
        redirectUrlHelp: "Dokąd trafiają goście po zablokowaniu.",
        loggedInCustomersHeading: "Zalogowani klienci",
        blockLoggedInLabel: "Przekieruj klientów bez zatwierdzonej etykiety",
        popupMessageLabel: "Komunikat w oknie",
        popupMessageHelp: "Wyświetlany przed przekierowaniem.",
        defaultLoggedInBlockedMessage:
            "Po złożeniu zamówienia wypełnij formularz rejestracyjny.",
    },
    pt: {
        storeSettingCardTitle: "Definições da loja",
        guestCheckoutHeading: "Checkout de convidado",
        redirectGuestsLabel: "Redirecionar convidados para fora do checkout e Comprar agora",
        redirectGuestsHelp: "Ative a incorporação da app (ou o bloco Formulário de registo) no tema.",
        redirectSignInLinksLabel: "Redirecionar links de início de sessão para a página do formulário de registo",
        redirectSignInLinksHelp:
            "Se ativo, o ícone de conta e links de início de sessão enviam convidados para a página do formulário.",
        customerAccountHeading: "Links da conta de cliente",
        redirectUrlLabel: "URL da página do formulário de registo",
        redirectUrlPlaceholder: "/pages/contact ou https://…",
        redirectUrlHelp: "Para onde os convidados são enviados quando bloqueados.",
        loggedInCustomersHeading: "Clientes com sessão iniciada",
        blockLoggedInLabel: "Redirecionar clientes sem a etiqueta aprovada",
        popupMessageLabel: "Mensagem pop-up",
        popupMessageHelp: "Mostrada antes do redirecionamento.",
        defaultLoggedInBlockedMessage:
            "Conclua o formulário de registo após o seu pedido.",
    },
    ta: {
        storeSettingCardTitle: "கடை அமைப்பு",
        guestCheckoutHeading: "விருந்தினர் பணம் செலுத்தல்",
        redirectGuestsLabel: "விருந்தினர்களை செக் அவுட் மற்றும் «இப்போது வாங்கு» பக்கத்திலிருந்து திருப்பி அனுப்பு",
        redirectGuestsHelp: "தீமில் ஆப் எம்பெட் (அல்லது பதிவுப் படிவத் தொகுதி) இயக்கவும்.",
        redirectSignInLinksLabel: "Header customer account icon-ஐ பதிவுப் படிவப் பக்கத்திற்குத் திருப்பு",
        redirectSignInLinksHelp:
            "இயக்கும்போது, theme header-ல் உள்ள customer account icon-ஐ விருந்தினர் கிளிக் செய்தால் மட்டும் பதிவுப் படிவப் பக்கத்திற்கு அனுப்பப்படுவார்கள். முடக்கும்போது /pages/customer-registration storefront-ல் வேலை செய்யாது.",
        customerAccountHeading: "Customer account icon",
        redirectUrlLabel: "பதிவுப் படிவப் பக்க URL",
        redirectUrlPlaceholder: "/pages/contact அல்லது https://…",
        redirectUrlHelp: "தடுக்கப்படும்போது விருந்தினர்கள் அனுப்பப்படும் இடம்.",
        loggedInCustomersHeading: "உள்நுழைந்த வாடிக்கையாளர்கள்",
        blockLoggedInLabel: "அங்கீகரிக்கப்பட்ட டேக் இல்லாத வாடிக்கையாளர்களைத் திருப்பி அனுப்பு",
        popupMessageLabel: "பாப்அப் செய்தி",
        popupMessageHelp: "திருப்பி அனுப்புவதற்கு முன் காட்டப்படும்.",
        defaultLoggedInBlockedMessage:
            "உங்கள் ஆர்டருக்குப் பிறகு பதிவுப் படிவத்தை நிறைவு செய்யவும்.",
    },
};

export function getSettingsStoreUiStrings(lang: string): SettingsStoreUiStrings {
    const code = normalizeLangCode(lang) || "en";
    return BY_LANG[code] ?? EN;
}
