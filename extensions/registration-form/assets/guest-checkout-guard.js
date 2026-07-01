/**
 * Storefront checkout / Buy it now guard (app proxy config):
 * - Guests: redirect when redirectGuestsFromCheckout (no popup).
 * - Logged-in without approved tag: modal + redirect only when blockLoggedInWithoutApprovedTag.
 */
(function () {
  'use strict';

  if (window.__approvefyGuestCheckoutGuardLoaded) {
    return;
  }
  window.__approvefyGuestCheckoutGuardLoaded = true;

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

  var cfg = window.__REGISTRATION_FORM_CONFIG__ || {};
  var shop = cfg.shop || (typeof window !== 'undefined' && window.Shopify && window.Shopify.shop) || '';
  if (!shop) {
    return;
  }
  cfg.shop = shop;
  window.__REGISTRATION_FORM_CONFIG__ = cfg;
  if (!Array.isArray(cfg.customerTags)) {
    cfg.customerTags = [];
  }

  function resolveLoggedInShopifyCustomerId() {
    if (
      cfg.shopifyLoggedInCustomerId != null &&
      String(cfg.shopifyLoggedInCustomerId).trim() !== ''
    ) {
      return String(cfg.shopifyLoggedInCustomerId).trim();
    }
    try {
      var stGlobal = typeof __st !== 'undefined' ? __st : window.__st;
      if (stGlobal && stGlobal.cid != null && String(stGlobal.cid).trim() !== '') {
        return String(stGlobal.cid).trim();
      }
    } catch (eSt) {
      void eSt;
    }
    try {
      if (window.Shopify && window.Shopify.customer && window.Shopify.customer.id != null) {
        var shopifyCustomerId = String(window.Shopify.customer.id).trim();
        if (shopifyCustomerId) {
          return shopifyCustomerId;
        }
      }
    } catch (eShopifyCustomer) {
      void eShopifyCustomer;
    }
    try {
      var analyticsId =
        window.ShopifyAnalytics &&
        window.ShopifyAnalytics.meta &&
        window.ShopifyAnalytics.meta.page &&
        window.ShopifyAnalytics.meta.page.customerId;
      if (analyticsId != null && String(analyticsId).trim() !== '') {
        return String(analyticsId).trim();
      }
    } catch (eAnalytics) {
      void eAnalytics;
    }
    try {
      var meta = document.querySelector(
        'meta[name="shopify-customer-id"], meta[name="customer-id"]'
      );
      if (meta) {
        var metaId = (meta.getAttribute('content') || '').trim();
        if (metaId) {
          return metaId;
        }
      }
    } catch (eMeta) {
      void eMeta;
    }
    return '';
  }

  function syncLoggedInCustomerConfig(customerId) {
    if (!customerId) {
      return;
    }
    cfg.customerLoggedIn = true;
    cfg.shopifyLoggedInCustomerId = customerId;
    window.__REGISTRATION_FORM_CONFIG__ = cfg;
  }

  function fetchCustomerIdFromCart() {
    return fetch('/cart.js', { credentials: 'same-origin', cache: 'no-store' })
      .then(function (r) {
        return r.ok ? r.json() : null;
      })
      .then(function (cart) {
        if (
          cart &&
          cart.customer_id != null &&
          String(cart.customer_id).trim() !== '' &&
          Number(cart.customer_id) > 0
        ) {
          var cartCustomerId = String(cart.customer_id).trim();
          syncLoggedInCustomerConfig(cartCustomerId);
          return cartCustomerId;
        }
        return '';
      })
      .catch(function () {
        return '';
      });
  }

  function resolveCustomerLoggedIn() {
    var id = resolveLoggedInShopifyCustomerId();
    if (id) {
      syncLoggedInCustomerConfig(id);
      return true;
    }
    if (cfg.customerLoggedIn === true && cfg.shopifyLoggedInCustomerId) {
      return true;
    }
    return false;
  }

  function guardCustomerShopifyIdParam() {
    var id = resolveLoggedInShopifyCustomerId();
    return id ? '&customerShopifyId=' + encodeURIComponent(id) : '';
  }

  function guardCustomerEmailParam() {
    if (
      resolveCustomerLoggedIn() &&
      cfg.customerEmail &&
      String(cfg.customerEmail).trim() !== ''
    ) {
      return '&customerEmail=' + encodeURIComponent(String(cfg.customerEmail).trim());
    }
    return '';
  }

  var guardStorefrontCustomerTags = null;
  var guardConfigLoadedFromNetwork = false;
  /** Cached `/cart.js` probe: null = not yet checked, '' = guest, string = customer id. */
  var cartCustomerIdCached = null;
  var cartCustomerIdFetchPromise = null;

  function blockCheckMayNeedCart() {
    return !!(guardConfig && guardConfig.blockLoggedInWithoutApprovedTag === true);
  }

  function probeCartCustomerId() {
    if (cartCustomerIdCached !== null) {
      return Promise.resolve(cartCustomerIdCached);
    }
    if (cartCustomerIdFetchPromise) {
      return cartCustomerIdFetchPromise;
    }
    cartCustomerIdFetchPromise = fetchCustomerIdFromCart()
      .then(function (cartId) {
        cartCustomerIdCached = cartId || '';
        cartCustomerIdFetchPromise = null;
        return cartCustomerIdCached;
      })
      .catch(function () {
        cartCustomerIdCached = '';
        cartCustomerIdFetchPromise = null;
        return '';
      });
    return cartCustomerIdFetchPromise;
  }

  function prewarmCartCustomerProbe() {
    if (!blockCheckMayNeedCart() || resolveCustomerLoggedIn()) {
      return;
    }
    probeCartCustomerId();
  }

  var guardConfig = null;
  var guardTranslations = null;
  function guardLocaleParam() {
    var loc = (document.documentElement.lang || '').toLowerCase().split('-')[0];
    if (!loc) {
      var pathMatch = (window.location.pathname || '').match(/^\/([a-z]{2})(?:-[a-z]{2})?(\/|$)/);
      loc = pathMatch ? pathMatch[1].toLowerCase() : '';
    }
    if (!loc) loc = 'en';
    return loc;
  }
  function translateGuard(key, fallback) {
    if (!guardTranslations || typeof guardTranslations !== 'object') return fallback;
    var v = guardTranslations[key];
    if (v != null && String(v).trim() !== '') return String(v).trim();
    return fallback;
  }
  function applyGuardConfig(data) {
    guardTranslations = (data && data.translations) || null;
    var cas = data && data.customerApprovalSettings;
    guardConfig = cas || null;
    if (data && data.settingsUpdatedAt) {
      try {
        if (window.sessionStorage) {
          sessionStorage.setItem(
            'approvefy_settings_revision_' + shop,
            String(data.settingsUpdatedAt)
          );
        }
      } catch (eRev) {
        void eRev;
      }
    }
    if (data && Array.isArray(data.storefrontCustomerTags)) {
      guardStorefrontCustomerTags = data.storefrontCustomerTags;
      cfg.customerTags = data.storefrontCustomerTags.slice();
      window.__REGISTRATION_FORM_CONFIG__ = cfg;
    }
    var resolvedId = resolveLoggedInShopifyCustomerId();
    if (resolvedId) {
      cfg.customerLoggedIn = true;
      cfg.shopifyLoggedInCustomerId = resolvedId;
      window.__REGISTRATION_FORM_CONFIG__ = cfg;
    }
    if (guardConfig && guardConfig.redirectSignInLinksToFormPage === false) {
      window.__approvefySignInRedirectEnabled = false;
    } else {
      window.__approvefySignInRedirectEnabled = true;
    }
    ensureShopifyAccountModalHidden();
    prewarmCartCustomerProbe();
    return guardConfig;
  }

  function buildGuardConfigUrl() {
    return (
      '/apps/customer-approval/config?shop=' +
      encodeURIComponent(shop) +
      '&locale=' +
      encodeURIComponent(guardLocaleParam()) +
      guardCustomerShopifyIdParam() +
      guardCustomerEmailParam() +
      '&guardOnly=1'
    );
  }

  function fetchGuardConfigFromNetwork() {
    var fetchOpts = {
      credentials: 'same-origin',
      cache: 'no-store',
    };
    return fetch(buildGuardConfigUrl(), fetchOpts)
      .then(function (r) {
        return r.json();
      })
      .then(function (data) {
        guardConfigLoadedFromNetwork = true;
        return applyGuardConfig(data);
      })
      .catch(function () {
        guardConfig = null;
        guardTranslations = null;
        return null;
      });
  }

  function guardNeedsCustomerTagsRefresh() {
    if (!resolveCustomerLoggedIn()) {
      return false;
    }
    if (Array.isArray(guardStorefrontCustomerTags)) {
      return false;
    }
    if (Array.isArray(cfg.customerTags) && cfg.customerTags.length > 0) {
      return false;
    }
    return true;
  }

  function ensureGuardConfigReady() {
    var prefetchUrl = window.__approvefyConfigPrefetchUrl;
    var prefetchHadCustomerId =
      prefetchUrl && typeof prefetchUrl === 'string' && prefetchUrl.indexOf('customerShopifyId=') !== -1;
    var canUsePrefetch =
      window.__approvefyConfigPromise && typeof window.__approvefyConfigPromise.then === 'function';
    if (canUsePrefetch && resolveLoggedInShopifyCustomerId() && prefetchUrl && !prefetchHadCustomerId) {
      canUsePrefetch = false;
    }

    if (canUsePrefetch) {
      return window.__approvefyConfigPromise
        .then(function (data) {
          guardConfigLoadedFromNetwork = true;
          return applyGuardConfig(data);
        })
        .catch(function () {
          return fetchGuardConfigFromNetwork();
        });
    }
    return fetchGuardConfigFromNetwork();
  }

  var guardReady = ensureGuardConfigReady()
    .then(function () {
      prewarmCartCustomerProbe();
      if (!blockCheckMayNeedCart()) {
        return guardConfig;
      }
      return ensureLoggedInCustomerIdResolved().then(function () {
        if (guardNeedsCustomerTagsRefresh()) {
          return fetchGuardConfigFromNetwork();
        }
        return guardConfig;
      });
    });

  function watchForLateCustomerLogin() {
    var knownId = resolveLoggedInShopifyCustomerId();
    var ticks = 0;
    var maxTicks = 80;
    var timer = window.setInterval(function () {
      ticks += 1;
      var id = resolveLoggedInShopifyCustomerId();
      if (id && id !== knownId) {
        window.clearInterval(timer);
        guardReady = fetchGuardConfigFromNetwork();
        return;
      }
      if (ticks >= maxTicks) {
        window.clearInterval(timer);
        if (!knownId) {
          probeCartCustomerId().then(function (cartId) {
            if (cartId && cartId !== knownId) {
              guardReady = fetchGuardConfigFromNetwork();
            }
          });
        }
      }
    }, 50);
  }
  watchForLateCustomerLogin();

  function registrationPageFallback() {
    if (guardConfig) {
      var regPath = guardConfig.registrationPagePath;
      if (regPath && String(regPath).trim() && !isUnsafeRegistrationRedirectUrl(String(regPath).trim())) {
        return String(regPath).trim();
      }
    }
    if (cfg && cfg.registrationPagePath && String(cfg.registrationPagePath).trim()) {
      var fromCfg = String(cfg.registrationPagePath).trim();
      if (!isUnsafeRegistrationRedirectUrl(fromCfg)) {
        return fromCfg;
      }
    }
    return DEFAULT_REGISTRATION_PAGE_PATH;
  }

  function redirectDestination() {
    if (!guardConfig) {
      return '';
    }
    var u = guardConfig.guestCheckoutRedirectUrl;
    var s = (u && String(u).trim()) || '';
    if (s && !isUnsafeRegistrationRedirectUrl(s)) {
      return s;
    }
    if (
      guardConfig.redirectGuestsFromCheckout === true ||
      guardConfig.blockLoggedInWithoutApprovedTag === true
    ) {
      return registrationPageFallback();
    }
    return '';
  }

  var DEFAULT_REGISTRATION_PAGE_PATH = '/pages/customer-registration';

  function signInRedirectDestination() {
    var dest = redirectDestination();
    if (dest) {
      return dest;
    }
    return registrationPageFallback();
  }

  function signInRedirectEnabledInSettings() {
    if (guardConfig && guardConfig.redirectSignInLinksToFormPage === false) {
      return false;
    }
    return true;
  }

  function shouldRedirectSignInLinks() {
    if (cfg.customerLoggedIn) {
      return false;
    }
    if (!signInRedirectEnabledInSettings()) {
      return false;
    }
    return !!signInRedirectDestination();
  }

  function normalizePathForCompare(pathname, search) {
    var p = (pathname || '/').replace(/\/+$/, '') || '/';
    var q = search || '';
    return (p + q).toLowerCase();
  }

  function isAlreadyOnRedirectDestination(dest) {
    if (!dest) {
      return false;
    }
    var current = normalizePathForCompare(window.location.pathname, window.location.search);
    try {
      var d = dest.trim();
      if (d.indexOf('http://') === 0 || d.indexOf('https://') === 0 || d.indexOf('//') === 0) {
        var u = new URL(d.indexOf('//') === 0 ? 'https:' + d : d);
        if (u.origin !== window.location.origin) {
          return false;
        }
        return current === normalizePathForCompare(u.pathname, u.search);
      }
      var rel = d.indexOf('/') === 0 ? d : '/' + d;
      var parts = rel.split('?');
      return current === normalizePathForCompare(parts[0], parts[1] ? '?' + parts[1] : '');
    } catch (e) {
      return false;
    }
  }

  function pathWithoutLocaleSegment(pathname) {
    var p = (pathname || '/').toLowerCase();
    var m = p.match(/^(\/[a-z]{2}(?:-[a-z]{2})?)(\/.*|$)/);
    if (m && m[1] && m[1].length <= 6) {
      return m[2] && m[2].length > 0 ? m[2] : '/';
    }
    return p;
  }

  function normalizeComparePathForRegistration(pathnameOrUrl) {
    var raw = String(pathnameOrUrl || '').trim();
    if (!raw) {
      return '/';
    }
    try {
      if (raw.indexOf('http://') === 0 || raw.indexOf('https://') === 0 || raw.indexOf('//') === 0) {
        var abs = new URL(raw.indexOf('//') === 0 ? 'https:' + raw : raw);
        raw = abs.pathname || '/';
      }
    } catch (ePath) {
      void ePath;
    }
    var pathOnly = raw.split('?')[0];
    var stripped = pathWithoutLocaleSegment(pathOnly).replace(/\/+$/, '') || '/';
    return stripped.toLowerCase();
  }

  function isDedicatedRegistrationPagePath(cas) {
    var current = normalizeComparePathForRegistration(window.location.pathname);
    if (/\/pages\/customer-registration\/?$/i.test(current)) {
      return true;
    }
    var candidates = ['/pages/customer-registration'];
    if (cfg && cfg.registrationPagePath) {
      candidates.push(cfg.registrationPagePath);
    }
    if (cas && cas.registrationPagePath) {
      candidates.push(cas.registrationPagePath);
    }
    var i;
    for (i = 0; i < candidates.length; i++) {
      if (normalizeComparePathForRegistration(candidates[i]) === current) {
        return true;
      }
    }
    return false;
  }

  function storefrontHomeHref() {
    try {
      if (window.Shopify && window.Shopify.routes && window.Shopify.routes.root) {
        return window.Shopify.routes.root;
      }
    } catch (eHome) {
      void eHome;
    }
    return '/';
  }

  function maybeLeaveDisabledRegistrationPage() {
    if (!isDedicatedRegistrationPagePath(null)) {
      return;
    }
    guardReady.then(function (cas) {
      if (cas && cas.redirectSignInLinksToFormPage === true) {
        return;
      }
      var home = storefrontHomeHref();
      if (normalizeComparePathForRegistration(window.location.pathname) === normalizeComparePathForRegistration(home)) {
        return;
      }
      window.location.replace(home);
    });
  }

  function pathIsCustomerAccountEntry(pathname) {
    var p = pathWithoutLocaleSegment(pathname).replace(/\/+$/, '') || '/';
    if (p.indexOf('/account/logout') === 0) {
      return false;
    }
    if (p === '/account') {
      return true;
    }
    if (/\/account\/(?:login|register)(?:\/|\?|$)/.test(p)) {
      return true;
    }
    if (p === '/customer_authentication') {
      return true;
    }
    if (/\/customer_authentication\/(?:login|register|profile)(?:\/|\?|$)/.test(p)) {
      return true;
    }
    return false;
  }

  function hrefLooksLikeSignInOrRegister(href) {
    if (!href || typeof href !== 'string') {
      return false;
    }
    var h = href.trim().toLowerCase();
    if (!h || h === '#') {
      return false;
    }
    if (h.indexOf('javascript:') === 0 || h.indexOf('mailto:') === 0 || h.indexOf('tel:') === 0) {
      return false;
    }
    try {
      var u = new URL(href, window.location.origin);
      var host = (u.hostname || '').toLowerCase();
      if (host === 'shopify.com' || host === 'www.shopify.com' || host.indexOf('shopify.com') !== -1) {
        return true;
      }
      if (host && host !== window.location.hostname.toLowerCase()) {
        return false;
      }
      return pathIsCustomerAccountEntry(u.pathname || '/');
    } catch (e) {
      return false;
    }
  }

  function isInsideSiteHeader(el) {
    return isInsideThemeHeader(el);
  }

  function isShopifyAccountElement(el) {
    return !!(el && el.nodeType === 1 && String(el.nodeName || '').toLowerCase() === 'shopify-account');
  }

  function isShopifyAccountComponent(el) {
    return isShopifyAccountElement(el) || !!(el && el.closest && el.closest('shopify-account'));
  }

  function isInsideThemeHeader(el) {
    return !!(
      el &&
      el.closest &&
      el.closest(
        [
          'header',
          'header-component',
          'sticky-header',
          '#shopify-section-header',
          '.shopify-section-header',
          '.header',
          '.section-header',
          'shop-header',
          '.header-wrapper',
          '.site-header',
          '#header',
          '[id^="shopify-section"][id*="header"]',
          '.shopify-section-group-header-group',
        ].join(', ')
      )
    );
  }

  function composedPathNodes(event) {
    if (event.composedPath && typeof event.composedPath === 'function') {
      return event.composedPath();
    }
    var out = [];
    var n = event.target;
    while (n) {
      out.push(n);
      n = n.parentNode || (n.host && n.host);
    }
    return out;
  }

  function findShopifyAccountHostInComposedPath(event) {
    if (!event) {
      return null;
    }
    var nodes = composedPathNodes(event);
    var i;
    var node;
    for (i = 0; i < nodes.length; i++) {
      node = nodes[i];
      if (node && isShopifyAccountElement(node) && isInsideThemeHeader(node)) {
        return node;
      }
    }
    return null;
  }

  var HEADER_LOGO_HOME_SELECTORS =
    'a[rel="home"], [data-header-logo], .header__logo, .site-header__logo, .site-logo, a.logo, .header__heading-link, .header__heading, .site-header__logo-link, a.header__logo-link, .logo-link';

  function hrefLooksLikeHomepage(href) {
    if (!href || typeof href !== 'string') {
      return false;
    }
    var h = href.trim();
    if (!h || h === '#') {
      return false;
    }
    if (h.indexOf('javascript:') === 0 || h.indexOf('mailto:') === 0 || h.indexOf('tel:') === 0) {
      return false;
    }
    try {
      var u = new URL(href, window.location.origin);
      if (
        u.hostname &&
        u.hostname.toLowerCase() !== window.location.hostname.toLowerCase()
      ) {
        return false;
      }
      var path = pathWithoutLocaleSegment(u.pathname || '/').replace(/\/+$/, '') || '/';
      var homePath = pathWithoutLocaleSegment(storefrontHomeHref()).replace(/\/+$/, '') || '/';
      return path === homePath;
    } catch (eHomeHref) {
      void eHomeHref;
      return false;
    }
  }

  function isHeaderLogoOrHomeNavigationTarget(el) {
    if (!el || !el.closest) {
      return false;
    }
    if (el.closest(HEADER_LOGO_HOME_SELECTORS)) {
      return true;
    }
    var link = el.closest('a[href]');
    if (!link) {
      return false;
    }
    if (link.getAttribute && link.getAttribute('rel') === 'home') {
      return true;
    }
    if (link.closest(HEADER_LOGO_HOME_SELECTORS)) {
      return true;
    }
    return hrefLooksLikeHomepage(link.getAttribute('href') || link.href || '');
  }

  function isBenignHeaderNavigationClick(event) {
    var t = event && event.target;
    if (!t || !t.closest) {
      return false;
    }
    if (isInsideApprovefyAuthTabs(t)) {
      return false;
    }
    if (!isInsideThemeHeader(t)) {
      return false;
    }
    if (isHeaderLogoOrHomeNavigationTarget(t)) {
      return true;
    }
    if (isExcludedHeaderUtilityIcon(t)) {
      return true;
    }
    var link = t.closest('a[href]');
    if (link && isExcludedHeaderUtilityIcon(link)) {
      return true;
    }
    if (findShopifyAccountHostInComposedPath(event)) {
      return false;
    }
    return false;
  }

  function isInsideApprovefyAuthTabs(node) {
    return !!(node && node.closest && node.closest('.approvefy-auth-tabs'));
  }

  function isExcludedHeaderUtilityIcon(el) {
    if (!el || !el.closest) {
      return false;
    }
    return !!el.closest(
      [
        'a.header__icon--cart',
        '.header__icon--cart',
        'button.header__icon--cart',
        'a.header__icon--search',
        '.header__icon--search',
        'button.header__icon--search',
        'summary.header__icon--search',
        '.header__icon--menu',
        'a.header__icon--menu',
        'button.header__icon--menu',
        '.header__icon--hamburger',
        'a[href="/cart"]',
        'a[href*="/cart"]:not([href*="account"])',
        'a[href*="/search"]:not([href*="account"])',
        '.header__search',
        '.header__heading-link',
        '.header__heading',
        '.header__menu-item',
        '.list-menu__item',
        '#cart-icon-bubble',
        'cart-drawer',
        'cart-drawer-component',
        'cart-notification',
        'cart-icon',
        'cart-icon-bubble',
        '.cart-count-bubble',
        'a[href*="predictive-search"]',
        '.predictive-search',
        'search-form',
        'predictive-search',
        'details-modal',
        'menu-drawer',
        'header-drawer',
        'header-menu',
        'button[aria-controls*="cart"]',
        'button[aria-controls*="Cart"]',
        'button[aria-controls*="search"]',
        'button[aria-controls*="Search"]',
      ].join(', ')
    );
  }

  function isStorefrontUiChromeClick(event) {
    var t = event && event.target;
    if (!t || !t.closest) {
      return false;
    }
    if (isInsideApprovefyAuthTabs(t)) {
      return false;
    }
    if (isBenignHeaderNavigationClick(event)) {
      return true;
    }
    if (isInsideThemeHeader(t) && !isStrictHeaderAccountClickTarget(t, event)) {
      return true;
    }
    return !!t.closest(
      [
        'cart-drawer',
        'cart-drawer-component',
        'cart-notification',
        'cart-icon-bubble',
        '#cart-icon-bubble',
        '#CartDrawer',
        '#CartDrawer-Overlay',
        '.cart-drawer',
        '.cart-items',
        '.drawer',
        '.search-modal',
        'details-modal',
        'menu-drawer',
        'header-drawer',
        'header-menu',
        '.header__search',
        'predictive-search',
        'shopify-accelerated-checkout-cart',
      ].join(', ')
    );
  }

  function isStrictHeaderAccountClickTarget(el, event) {
    if (event && isBenignHeaderNavigationClick(event)) {
      return false;
    }
    if (el && isHeaderLogoOrHomeNavigationTarget(el)) {
      return false;
    }
    if (event && findShopifyAccountHostInComposedPath(event)) {
      return !cfg.customerLoggedIn;
    }
    if (!el || !el.closest) {
      return false;
    }
    if (isInsideApprovefyAuthTabs(el)) {
      return false;
    }
    if (!isInsideThemeHeader(el)) {
      return false;
    }
    if (isExcludedHeaderUtilityIcon(el)) {
      return false;
    }
    if (isShopifyAccountComponent(el)) {
      return true;
    }
    if (el.closest('.header__icon--account, a.customer-account-link, #HeaderMenu-account')) {
      return true;
    }
    var link = el.closest('a[href]');
    if (link && linkLooksLikeHeaderAccountIcon(link)) {
      return true;
    }
    return false;
  }

  function linkLooksLikeHeaderAccountIcon(linkEl) {
    if (!linkEl || linkEl.nodeName !== 'A') {
      return false;
    }
    if (isHeaderLogoOrHomeNavigationTarget(linkEl)) {
      return false;
    }
    if (isExcludedHeaderUtilityIcon(linkEl)) {
      return false;
    }
    if (
      linkEl.classList &&
      (linkEl.classList.contains('header__icon--account') ||
        linkEl.classList.contains('customer-account-link'))
    ) {
      return true;
    }
    var h = linkEl.getAttribute('href') || linkEl.href || '';
    if (!h || h === '#') {
      return false;
    }
    return hrefLooksLikeSignInOrRegister(h);
  }

  function goToSignInRedirect(dest) {
    if (!dest || isAlreadyOnRedirectDestination(dest)) {
      return;
    }
    go(dest);
  }

  function findHeaderAccountIconClick(event) {
    var t = event && event.target;
    if (isHeaderLogoOrHomeNavigationTarget(t)) {
      return null;
    }
    if (!isStrictHeaderAccountClickTarget(t, event)) {
      return null;
    }
    if (findShopifyAccountHostInComposedPath(event) || isShopifyAccountComponent(t)) {
      return { kind: 'account-icon', href: '' };
    }
    var accountLink = t.closest('a[href]');
    return {
      kind: 'link',
      href: accountLink ? accountLink.getAttribute('href') || accountLink.href : '',
    };
  }

  function replayNativeAccountIconNavigation(intent) {
    window.__approvefyBypassGuestCheckoutGuard = true;
    if (intent.href) {
      window.location.href = intent.href;
      return;
    }
    // Never programmatically click <shopify-account> — it opens the Shop sign-in drawer.
  }

  function shouldInterceptHeaderAccountIcon(intent) {
    if (!intent) {
      return false;
    }
    if (cfg.customerLoggedIn) {
      return false;
    }
    return signInRedirectEnabledInSettings();
  }

  function ensureShopifyAccountModalHidden() {
    if (!signInRedirectEnabledInSettings() || cfg.customerLoggedIn) {
      var existing = document.getElementById('approvefy-hide-shopify-account-ui');
      if (existing && existing.parentNode) {
        existing.parentNode.removeChild(existing);
      }
      return;
    }
    if (document.getElementById('approvefy-hide-shopify-account-ui')) {
      return;
    }
    var style = document.createElement('style');
    style.id = 'approvefy-hide-shopify-account-ui';
    style.textContent =
      'shopify-account-modal,shopify-account-dialog,shopify-account-popover,[data-shopify-account-modal]{display:none!important;visibility:hidden!important;pointer-events:none!important}';
    document.head.appendChild(style);
  }

  function dismissShopifyAccountModalIfOpen() {
    var nodes = document.querySelectorAll(
      'shopify-account-modal, shopify-account-dialog, shopify-account-popover, [data-shopify-account-modal]'
    );
    var i;
    for (i = 0; i < nodes.length; i++) {
      var node = nodes[i];
      if (!node) {
        continue;
      }
      if (typeof node.close === 'function') {
        try {
          node.close();
        } catch (closeErr) {
          void closeErr;
        }
      }
      node.removeAttribute('open');
      node.setAttribute('aria-hidden', 'true');
      node.style.display = 'none';
    }
  }

  function blockHeaderAccountIconNativeUi(e) {
    if (window.__approvefyBypassGuestCheckoutGuard) {
      return;
    }
    if (isBenignHeaderNavigationClick(e)) {
      return;
    }
    if (!shouldInterceptHeaderAccountIcon(findHeaderAccountIconClick(e))) {
      return;
    }
    e.preventDefault();
    if (typeof e.stopImmediatePropagation === 'function') {
      e.stopImmediatePropagation();
    }
    e.stopPropagation();
    dismissShopifyAccountModalIfOpen();
  }

  function redirectHeaderAccountIcon(e) {
    e.preventDefault();
    if (typeof e.stopImmediatePropagation === 'function') {
      e.stopImmediatePropagation();
    }
    e.stopPropagation();
    dismissShopifyAccountModalIfOpen();
    var dest = signInRedirectDestination();
    if (!dest || isAlreadyOnRedirectDestination(dest)) {
      return;
    }
    go(dest);
  }

  function handleHeaderAccountIconClick(e) {
    if (window.__approvefyBypassGuestCheckoutGuard) {
      return;
    }
    if (isBenignHeaderNavigationClick(e)) {
      return;
    }
    var intent = findHeaderAccountIconClick(e);
    if (!intent) {
      return;
    }
    if (shouldInterceptHeaderAccountIcon(intent)) {
      redirectHeaderAccountIcon(e);
      return;
    }
    if (guardConfig !== null) {
      return;
    }
    if (intent.kind !== 'account-icon') {
      return;
    }
    e.preventDefault();
    if (typeof e.stopImmediatePropagation === 'function') {
      e.stopImmediatePropagation();
    }
    e.stopPropagation();
    guardReady.then(function () {
      if (shouldInterceptHeaderAccountIcon(intent)) {
        redirectHeaderAccountIcon(e);
        return;
      }
      if (intent.href) {
        replayNativeAccountIconNavigation(intent);
      }
    });
  }

  function shouldRedirectGuest() {
    return (
      !resolveCustomerLoggedIn() &&
      guardConfig &&
      guardConfig.redirectGuestsFromCheckout === true &&
      !!redirectDestination()
    );
  }

  function effectiveCustomerTags() {
    if (Array.isArray(guardStorefrontCustomerTags)) {
      return guardStorefrontCustomerTags;
    }
    if (Array.isArray(cfg.customerTags)) {
      return cfg.customerTags;
    }
    return [];
  }

  function customerHasApprovedTag() {
    var raw = guardConfig && guardConfig.approvedTag;
    if (!raw || typeof raw !== 'string') {
      return false;
    }
    var parts = raw.split(',').map(function (s) {
      return String(s || '').trim().toLowerCase();
    }).filter(Boolean);
    if (!parts.length) {
      return false;
    }
    var tags = effectiveCustomerTags();
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

  function shouldBlockLoggedInWithoutTag() {
    return (
      resolveCustomerLoggedIn() &&
      guardConfig &&
      guardConfig.blockLoggedInWithoutApprovedTag === true &&
      !customerHasApprovedTag() &&
      !!redirectDestination()
    );
  }

  function loggedInBlockedAlertMessage() {
    var m = guardConfig && guardConfig.loggedInCheckoutBlockedMessage;
    if (m && String(m).trim()) {
      return String(m).trim();
    }
    return translateGuard(
      'logged_in_checkout_blocked_message',
      'Please complete the registration form after your order.'
    );
  }

  function shouldInterceptCheckout() {
    return shouldRedirectGuest() || shouldBlockLoggedInWithoutTag();
  }

  /** Popup only when blocking logged-in customers without the approved tag (not for guest redirect). */
  function shouldShowCheckoutBlockedModal() {
    return shouldBlockLoggedInWithoutTag();
  }

  function checkoutInterceptLockActive() {
    return !!(
      window.__approvefyCheckoutInterceptInProgress ||
      document.getElementById(CHECKOUT_BLOCK_MODAL_ID)
    );
  }

  function shouldShowPopupBeforeRedirect() {
    if (!guardConfig || guardConfig.blockLoggedInWithoutApprovedTag !== true) {
      return false;
    }
    if (!redirectDestination()) {
      return false;
    }
    if (customerHasApprovedTag()) {
      return false;
    }
    return resolveCustomerLoggedIn();
  }

  function handleCheckoutIntercept() {
    if (document.getElementById(CHECKOUT_BLOCK_MODAL_ID)) {
      return;
    }
    var dest = redirectDestination();
    if (!dest) {
      return;
    }

    function showModalOrRedirect() {
      if (document.getElementById(CHECKOUT_BLOCK_MODAL_ID)) {
        return;
      }
      if (shouldShowPopupBeforeRedirect()) {
        showCheckoutBlockedModal(loggedInBlockedAlertMessage(), dest);
        return;
      }
      window.__approvefyCheckoutInterceptInProgress = false;
      go(dest);
    }

    showModalOrRedirect();
  }

  function guardConfigReadyForFastIntercept() {
    if (!guardConfig) {
      return false;
    }
    if (guardNeedsCustomerTagsRefresh()) {
      return false;
    }
    if (blockCheckMayNeedCart() && !resolveCustomerLoggedIn() && cartCustomerIdCached === null) {
      return false;
    }
    return true;
  }

  /**
   * Links to the cart page, cart updates, or drawer "View cart" — must NOT trigger guest redirect.
   * (Checkout / Buy it now is handled separately.)
   */
  function isCartPageNavigationOnly(href) {
    if (!href || typeof href !== 'string') {
      return false;
    }
    var h = href.trim().toLowerCase();
    if (h.indexOf('javascript:') === 0 || h.indexOf('mailto:') === 0 || h.indexOf('tel:') === 0) {
      return false;
    }
    try {
      var u = new URL(href, window.location.origin);
      if (u.searchParams.get('checkout')) {
        return false;
      }
      var path = (u.pathname || '').replace(/\/+$/, '').toLowerCase();
      if (path.indexOf('/checkout') !== -1 || path.indexOf('/checkouts/') !== -1) {
        return false;
      }
      if (path.indexOf('/cart/add') !== -1) {
        return false;
      }
      if (path === '/cart' || path.lastIndexOf('/cart') === path.length - 5) {
        return true;
      }
      if (path.indexOf('/cart/change') !== -1 || path.indexOf('/cart/update') !== -1) {
        return true;
      }
    } catch (e) {
      return false;
    }
    return false;
  }

  function innermostLinkHref(event) {
    var t = event.target;
    if (!t || !t.closest) {
      return null;
    }
    var a = t.closest('a[href]');
    if (!a) {
      return null;
    }
    return a.getAttribute('href');
  }

  function hrefLooksLikeCheckout(href) {
    if (!href || typeof href !== 'string') {
      return false;
    }
    var h = href.trim().toLowerCase();
    if (h.indexOf('javascript:') === 0 || h.indexOf('mailto:') === 0 || h.indexOf('tel:') === 0) {
      return false;
    }
    try {
      var u = new URL(href, window.location.origin);
      var path = (u.pathname || '').toLowerCase();
      if (path.indexOf('/checkout') !== -1 || path.indexOf('/checkouts/') !== -1) {
        return true;
      }
      if (path.indexOf('/cart') !== -1) {
        if (u.searchParams.get('checkout')) {
          return true;
        }
        var rt = u.searchParams.get('return_to') || '';
        if (rt.toLowerCase().indexOf('checkout') !== -1) {
          return true;
        }
      }
      if (path.indexOf('/cart/add') !== -1) {
        if (u.searchParams.get('checkout')) {
          return true;
        }
      }
    } catch (e) {
      return false;
    }
    return false;
  }

  function returnToTargetsCheckout(form) {
    if (!form || !form.querySelector) {
      return false;
    }
    var rt = form.querySelector('input[name="return_to"], textarea[name="return_to"]');
    if (!rt || !rt.value) {
      return false;
    }
    return hrefLooksLikeCheckout(rt.value);
  }

  var BUY_IT_NOW_ANCESTOR_SELECTORS =
    '.shopify-payment-button, shopify-buy-it-now-button, shopify-accelerated-checkout, shopify-accelerated-checkout-button, [data-shopify="payment-button"], .dynamic-checkout__content';

  function isBuyItNowControl(el) {
    if (!el || el.nodeType !== 1) {
      return false;
    }
    if (isShopifyCheckoutCustomElement(el)) {
      return true;
    }
    if (isDynamicCheckoutNode(el)) {
      return true;
    }
    if (!el.closest) {
      return false;
    }
    return !!el.closest(BUY_IT_NOW_ANCESTOR_SELECTORS);
  }

  /** True when this form submission would send the buyer toward checkout (Buy it now, cart checkout, etc.). */
  function formLeadsToCheckout(form) {
    if (!form || form.nodeName !== 'FORM') {
      return false;
    }
    if (form.closest && form.closest(BUY_IT_NOW_ANCESTOR_SELECTORS)) {
      return true;
    }
    var action = form.getAttribute('action') || form.action || '';
    if (hrefLooksLikeCheckout(action)) {
      return true;
    }
    if (form.querySelector('[name="checkout"]')) {
      return true;
    }
    if (returnToTargetsCheckout(form)) {
      return true;
    }
    var al = action.toLowerCase();
    if (al.indexOf('/cart/add') !== -1) {
      if (form.querySelector('input[name="checkout"], button[name="checkout"]')) {
        return true;
      }
      if (returnToTargetsCheckout(form)) {
        return true;
      }
    }
    return false;
  }

  function submissionLeadsToCheckout(form, submitter) {
    if (!form || form.nodeName !== 'FORM') {
      return false;
    }
    if (submitter && isBuyItNowControl(submitter)) {
      return true;
    }
    if (submitter && submitter.getAttribute && submitter.getAttribute('name') === 'checkout') {
      return true;
    }
    return formLeadsToCheckout(form);
  }

  /* Do not include shopify-accelerated-checkout-cart — it wraps the whole cart drawer ("View cart" lives inside). */
  var DYNAMIC_CHECKOUT_SELECTORS = [
    '.shopify-payment-button',
    '.shopify-payment-button__button',
    '.shopify-payment-button__more-options',
    'shopify-buy-it-now-button',
    'shopify-accelerated-checkout',
    '[data-shopify="payment-button"]',
    '[data-testid="Checkout-button"]',
    '.dynamic-checkout__content',
  ].join(', ');

  function isShopifyCheckoutCustomElement(node) {
    if (!node || !node.nodeName) {
      return null;
    }
    var name = node.nodeName;
    if (
      name === 'SHOPIFY-BUY-IT-NOW-BUTTON' ||
      name === 'SHOPIFY-ACCELERATED-CHECKOUT' ||
      name === 'SHOPIFY-ACCELERATED-CHECKOUT-BUTTON'
    ) {
      return node;
    }
    return null;
  }

  function isDynamicCheckoutNode(el) {
    if (!el) {
      return null;
    }
    var host = isShopifyCheckoutCustomElement(el);
    if (host) {
      return host;
    }
    if (!el.closest) {
      return null;
    }
    return el.closest(DYNAMIC_CHECKOUT_SELECTORS);
  }

  function findCheckoutIntent(event) {
    if (isStorefrontUiChromeClick(event)) {
      return null;
    }
    var cartNav = innermostLinkHref(event);
    if (cartNav && isCartPageNavigationOnly(cartNav)) {
      return null;
    }

    var nodes = composedPathNodes(event);
    var i;
    var node;
    var href;
    var a;
    var form;
    var dyn;

    for (i = 0; i < nodes.length; i++) {
      node = nodes[i];
      if (!node || node.nodeType !== 1) {
        continue;
      }

      if (node.nodeName === 'A' && node.href) {
        href = node.getAttribute('href');
        if (hrefLooksLikeCheckout(href)) {
          return { kind: 'link', href: href };
        }
      }

      dyn = isShopifyCheckoutCustomElement(node) || isDynamicCheckoutNode(node);
      if (dyn) {
        return { kind: 'dynamic', el: dyn };
      }

      if (node.nodeName === 'FORM') {
        form = node;
        if (formLeadsToCheckout(form)) {
          return { kind: 'form', form: form };
        }
      }

      if ((node.nodeName === 'BUTTON' || node.nodeName === 'INPUT') && isBuyItNowControl(node)) {
        form = node.closest ? node.closest('form') : null;
        return { kind: 'dynamic', el: isDynamicCheckoutNode(node) || node, form: form };
      }

      if ((node.nodeName === 'BUTTON' || node.nodeName === 'INPUT') && node.getAttribute('name') === 'checkout') {
        form = node.closest('form');
        if (form && formLeadsToCheckout(form)) {
          return { kind: 'form', form: form };
        }
        return { kind: 'named-checkout', el: node };
      }
    }

    /* Fallback: single-target closest (non-shadow) */
    var t = event.target;
    if (!t || !t.closest) {
      return null;
    }
    a = t.closest('a[href]');
    if (a) {
      href = a.getAttribute('href');
      if (hrefLooksLikeCheckout(href)) {
        return { kind: 'link', href: href };
      }
    }
    dyn = isShopifyCheckoutCustomElement(t) || isDynamicCheckoutNode(t);
    if (dyn) {
      return { kind: 'dynamic', el: dyn };
    }
    form = t.closest('form');
    if (form && formLeadsToCheckout(form)) {
      return { kind: 'form', form: form };
    }
    return null;
  }

  function go(dest) {
    var d = String(dest || '').trim();
    if (!d) return;
    if (d.indexOf('http://') === 0 || d.indexOf('https://') === 0 || d.indexOf('//') === 0) {
      window.location.href = d.indexOf('//') === 0 ? 'https:' + d : d;
      return;
    }
    var root = '/';
    try {
      if (window.Shopify && window.Shopify.routes && window.Shopify.routes.root) {
        root = window.Shopify.routes.root;
      }
    } catch (eRoot) {
      void eRoot;
    }
    var path = d.indexOf('/') === 0 ? d : '/' + d;
    var base = String(root || '/');
    if (base.charAt(base.length - 1) !== '/') base += '/';
    window.location.href = base + path.replace(/^\//, '');
  }

  var CHECKOUT_BLOCK_MODAL_ID = 'approvefy-checkout-block-modal';

  function removeCheckoutBlockedModal() {
    var existing = document.getElementById(CHECKOUT_BLOCK_MODAL_ID);
    if (existing) {
      existing.remove();
    }
    if (document.body) {
      document.body.style.overflow = '';
    }
    document.removeEventListener('keydown', onCheckoutBlockedModalEscape, true);
    window.__approvefyCheckoutInterceptInProgress = false;
  }

  function onCheckoutBlockedModalEscape(ke) {
    if (ke.key === 'Escape') {
      ke.preventDefault();
      removeCheckoutBlockedModal();
    }
  }

  /**
   * In-page modal (styles in guest-checkout-guard.css). Continue → redirect; close / backdrop / Esc → dismiss only.
   */
  function showCheckoutBlockedModal(message, dest) {
    removeCheckoutBlockedModal();
    window.__approvefyCheckoutInterceptInProgress = true;
    if (!document.body) {
      window.__approvefyCheckoutInterceptInProgress = false;
      go(dest);
      return;
    }

    var overlay = document.createElement('div');
    overlay.id = CHECKOUT_BLOCK_MODAL_ID;
    overlay.className = 'approvefy-checkout-block-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'approvefy-checkout-block-title');

    var panel = document.createElement('div');
    panel.className = 'approvefy-checkout-block-panel';

    var closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'approvefy-checkout-block-close';
    closeBtn.setAttribute(
      'aria-label',
      translateGuard('logged_in_checkout_close_label', 'Close')
    );
    closeBtn.textContent = '\u00d7';

    var title = document.createElement('h2');
    title.id = 'approvefy-checkout-block-title';
    title.className = 'approvefy-checkout-block-title';
    title.textContent = translateGuard('logged_in_checkout_modal_title', 'Before you continue');

    var msg = document.createElement('p');
    msg.className = 'approvefy-checkout-block-message';
    msg.textContent = message || '';

    var actions = document.createElement('div');
    actions.className = 'approvefy-checkout-block-actions';

    var primary = document.createElement('button');
    primary.type = 'button';
    primary.className = 'approvefy-checkout-block-btn approvefy-checkout-block-btn-primary';
    primary.textContent = translateGuard('logged_in_checkout_continue', 'Continue');

    function handleContinue() {
      removeCheckoutBlockedModal();
      go(dest);
    }

    function handleDismiss() {
      removeCheckoutBlockedModal();
    }

    closeBtn.addEventListener('click', handleDismiss);
    overlay.addEventListener('click', function (ev) {
      if (ev.target === overlay) {
        handleDismiss();
      }
    });
    panel.addEventListener('click', function (ev) {
      ev.stopPropagation();
    });
    primary.addEventListener('click', handleContinue);

    actions.appendChild(primary);
    panel.appendChild(closeBtn);
    panel.appendChild(title);
    panel.appendChild(msg);
    panel.appendChild(actions);
    overlay.appendChild(panel);
    document.body.appendChild(overlay);
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onCheckoutBlockedModalEscape, true);

    window.setTimeout(function () {
      try {
        primary.focus();
      } catch (f) {
        void f;
      }
    }, 0);
  }

  function resumeCheckoutIntent(intent) {
    window.__approvefyBypassGuestCheckoutGuard = true;
    if (intent.kind === 'link' && intent.href) {
      window.location.href = intent.href;
      return;
    }
    if (intent.kind === 'form' && intent.form) {
      if (typeof intent.form.requestSubmit === 'function') {
        intent.form.requestSubmit();
      } else {
        intent.form.submit();
      }
      return;
    }
    if (intent.kind === 'dynamic' && intent.el && typeof intent.el.click === 'function') {
      intent.el.click();
      return;
    }
    if (intent.kind === 'named-checkout' && intent.el && typeof intent.el.click === 'function') {
      intent.el.click();
    }
  }

  function ensureLoggedInCustomerIdResolved() {
    var id = resolveLoggedInShopifyCustomerId();
    if (id) {
      syncLoggedInCustomerConfig(id);
      return Promise.resolve(id);
    }
    if (cfg.customerLoggedIn === true && cfg.shopifyLoggedInCustomerId) {
      return Promise.resolve(String(cfg.shopifyLoggedInCustomerId));
    }
    if (!blockCheckMayNeedCart()) {
      return Promise.resolve('');
    }
    return probeCartCustomerId();
  }

  function whenGuardReadyForIntercept() {
    if (guardConfigReadyForFastIntercept()) {
      return Promise.resolve(guardConfig);
    }
    return guardReady.then(function () {
      if (guardConfigReadyForFastIntercept()) {
        return guardConfig;
      }
      if (blockCheckMayNeedCart() && !resolveCustomerLoggedIn()) {
        return probeCartCustomerId().then(function (cartId) {
          if (cartId && guardNeedsCustomerTagsRefresh()) {
            return fetchGuardConfigFromNetwork();
          }
          return guardConfig;
        });
      }
      if (guardNeedsCustomerTagsRefresh()) {
        return fetchGuardConfigFromNetwork();
      }
      return guardConfig;
    });
  }

  function finishCheckoutIntercept(intent) {
    if (checkoutInterceptLockActive()) {
      return;
    }
    if (shouldInterceptCheckout()) {
      window.__approvefyCheckoutInterceptInProgress = true;
      window.__approvefyLastCheckoutIntercept = Date.now();
      handleCheckoutIntercept();
      return;
    }
    window.__approvefyCheckoutInterceptInProgress = false;
    resumeCheckoutIntent(intent);
  }

  function runCheckoutInterceptFlow(intent) {
    if (guardConfigReadyForFastIntercept()) {
      finishCheckoutIntercept(intent);
      return;
    }
    whenGuardReadyForIntercept().then(function () {
      finishCheckoutIntercept(intent);
    });
  }

  function blockGuestCheckoutPointerEarly(e) {
    if (window.__approvefyBypassGuestCheckoutGuard) {
      return;
    }
    if (isStorefrontUiChromeClick(e)) {
      return;
    }
    if (e && typeof e.button === 'number' && e.button !== 0) {
      return;
    }
    if (checkoutInterceptLockActive()) {
      return;
    }
    var intent = findCheckoutIntent(e);
    if (!intent) {
      return;
    }
    if (!guardConfigReadyForFastIntercept()) {
      return;
    }
    if (!shouldInterceptCheckout()) {
      return;
    }
    e.preventDefault();
    if (typeof e.stopImmediatePropagation === 'function') {
      e.stopImmediatePropagation();
    }
    e.stopPropagation();
  }

  function handleGuestCheckoutEvent(e) {
    if (isStorefrontUiChromeClick(e)) {
      return;
    }
    if (checkoutInterceptLockActive()) {
      if (findCheckoutIntent(e)) {
        e.preventDefault();
        if (typeof e.stopImmediatePropagation === 'function') {
          e.stopImmediatePropagation();
        }
        e.stopPropagation();
      }
      return;
    }
    if (e.type === 'click') {
      var last = window.__approvefyLastCheckoutIntercept;
      if (last && Date.now() - last < 600) {
        return;
      }
    }
    if (window.__approvefyBypassGuestCheckoutGuard) {
      window.__approvefyBypassGuestCheckoutGuard = false;
      return;
    }
    var intent = findCheckoutIntent(e);
    if (!intent) {
      return;
    }
    e.preventDefault();
    if (typeof e.stopImmediatePropagation === 'function') {
      e.stopImmediatePropagation();
    }
    e.stopPropagation();
    runCheckoutInterceptFlow(intent);
  }

  document.addEventListener('pointerdown', blockHeaderAccountIconNativeUi, true);
  document.addEventListener('mousedown', blockHeaderAccountIconNativeUi, true);
  document.addEventListener('click', handleHeaderAccountIconClick, true);
  document.addEventListener('pointerdown', blockGuestCheckoutPointerEarly, true);
  document.addEventListener('click', handleGuestCheckoutEvent, true);

  document.addEventListener(
    'submit',
    function (e) {
      if (checkoutInterceptLockActive()) {
        var form = e.target;
        if (form && form.nodeName === 'FORM' && submissionLeadsToCheckout(form, e.submitter || null)) {
          e.preventDefault();
          if (typeof e.stopImmediatePropagation === 'function') {
            e.stopImmediatePropagation();
          }
          e.stopPropagation();
        }
        return;
      }
      if (window.__approvefyBypassGuestCheckoutGuard) {
        window.__approvefyBypassGuestCheckoutGuard = false;
        return;
      }
      var form = e.target;
      if (!form || form.nodeName !== 'FORM') {
        return;
      }
      var submitter = e.submitter || null;
      if (!submissionLeadsToCheckout(form, submitter)) {
        return;
      }
      e.preventDefault();
      if (typeof e.stopImmediatePropagation === 'function') {
        e.stopImmediatePropagation();
      }
      e.stopPropagation();
      whenGuardReadyForIntercept().then(function () {
        if (checkoutInterceptLockActive()) {
          return;
        }
        if (shouldInterceptCheckout()) {
          window.__approvefyCheckoutInterceptInProgress = true;
          handleCheckoutIntercept();
        } else {
          window.__approvefyBypassGuestCheckoutGuard = true;
          if (typeof form.requestSubmit === 'function') {
            form.requestSubmit();
          } else {
            form.submit();
          }
        }
      });
    },
    true
  );

  /**
   * When "Block buyers without an approved customer tag" is on, customers who are not approved
   * (e.g. status:pending or status:denied) are redirected away from /account* so a login session
   * cannot use the account area until they have an approved tag. Uses the same guard settings as checkout.
   */
  function pathWithoutLocale(pathname) {
    var p = pathname || '/';
    var m = p.toLowerCase().match(/^(\/[a-z]{2}(?:-[a-z]{2})?)(\/.*|$)/);
    if (m && m[1] && m[1].length <= 6) {
      return m[2] && m[2].length > 0 ? m[2] : '/';
    }
    return p;
  }

  function isAccountAreaPath() {
    var p = pathWithoutLocale(window.location.pathname || '/').toLowerCase();
    if (p === '/account' || p.indexOf('/account/') === 0) {
      if (p.indexOf('/account/logout') === 0) {
        return false;
      }
      return true;
    }
    return false;
  }

  function accountBlockDestination() {
    var d = redirectDestination();
    if (d) {
      return d;
    }
    try {
      if (window.Shopify && window.Shopify.routes && window.Shopify.routes.root) {
        return window.Shopify.routes.root;
      }
    } catch (e) {
      void 0;
    }
    return '/';
  }

  function hasPendingOrDeniedStatusTag() {
    var tags = effectiveCustomerTags();
    if (!Array.isArray(tags)) {
      return false;
    }
    var i;
    for (i = 0; i < tags.length; i++) {
      var t = String(tags[i] == null ? '' : tags[i])
        .trim()
        .toLowerCase();
      if (t === 'status:pending' || t === 'status:denied') {
        return true;
      }
    }
    return false;
  }

  function shouldRedirectUnapprovedFromAccount() {
    if (customerHasApprovedTag()) {
      return false;
    }
    if (!guardConfig) {
      return hasPendingOrDeniedStatusTag();
    }
    if (hasPendingOrDeniedStatusTag()) {
      return true;
    }
    return guardConfig.blockLoggedInWithoutApprovedTag === true;
  }

  function maybeRedirectUnapprovedFromAccount() {
    if (!resolveCustomerLoggedIn()) {
      return;
    }
    if (!isAccountAreaPath()) {
      return;
    }
    guardReady.then(function () {
      if (guardNeedsCustomerTagsRefresh()) {
        return fetchGuardConfigFromNetwork();
      }
      return guardConfig;
    }).then(function () {
      if (!shouldRedirectUnapprovedFromAccount()) {
        return;
      }
      var dest = accountBlockDestination();
      if (
        guardConfig &&
        guardConfig.blockLoggedInWithoutApprovedTag === true &&
        loggedInBlockedAlertMessage()
      ) {
        showCheckoutBlockedModal(loggedInBlockedAlertMessage(), dest);
        return;
      }
      go(dest);
    });
  }

  function maybeRedirectGuestFromAccountEntry() {
    if (!cfg || resolveCustomerLoggedIn()) {
      return;
    }
    if (!pathIsCustomerAccountEntry(window.location.pathname)) {
      return;
    }
    function attemptRedirect() {
      if (!shouldRedirectSignInLinks()) {
        return;
      }
      var dest = signInRedirectDestination();
      if (dest && !isAlreadyOnRedirectDestination(dest)) {
        window.location.replace(dest);
      }
    }
    if (guardConfig !== null) {
      attemptRedirect();
      return;
    }
    guardReady.then(attemptRedirect);
  }

  function runGuardIdle(fn) {
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(fn);
    } else {
      fn();
    }
  }

  function removeLegacyAccountDrawerBlocker() {
    var legacyStyle = document.getElementById('approvefy-block-shopify-account-drawer');
    if (legacyStyle && legacyStyle.parentNode) {
      legacyStyle.parentNode.removeChild(legacyStyle);
    }
  }

  function runInitialGuardTasks() {
    runGuardIdle(function () {
      removeCheckoutBlockedModal();
      removeLegacyAccountDrawerBlocker();
      ensureShopifyAccountModalHidden();
      dismissShopifyAccountModalIfOpen();
      maybeRedirectGuestFromAccountEntry();
      maybeRedirectUnapprovedFromAccount();
      maybeLeaveDisabledRegistrationPage();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', runInitialGuardTasks, { once: true });
  } else {
    runInitialGuardTasks();
  }
})();
