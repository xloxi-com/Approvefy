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
    redirectUrlLabel: "Redirect URL",
    redirectUrlPlaceholder: "/pages/contact or https://…",
    redirectUrlHelp: "Where guests are sent when blocked.",
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
        redirectUrlLabel: "URL de redirection",
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
        redirectUrlLabel: "Weiterleitungs-URL",
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
        redirectUrlLabel: "URL de redirección",
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
        redirectUrlLabel: "URL di reindirizzamento",
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
        redirectUrlLabel: "Redirect-URL",
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
        redirectUrlLabel: "URL przekierowania",
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
        redirectUrlLabel: "URL de redirecionamento",
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
        redirectUrlLabel: "திருப்பும் URL",
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
