/**
 * Storefront checkout / Buy it now guard (app proxy config):
 * - Guests: redirect when redirectGuestsFromCheckout + redirect URL.
 * - Logged-in without approved tag: custom modal + redirect on Continue when blockLoggedInWithoutApprovedTag.
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

  var cfg = window.__REGISTRATION_FORM_CONFIG__;
  if (!cfg || !cfg.shop) {
    return;
  }
  if (!Array.isArray(cfg.customerTags)) {
    cfg.customerTags = [];
  }

  var shop = cfg.shop;
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
    return guardConfig;
  }
  var guardReady =
    window.__approvefyConfigPromise && typeof window.__approvefyConfigPromise.then === 'function'
      ? window.__approvefyConfigPromise.then(applyGuardConfig).catch(function () {
          guardConfig = null;
          guardTranslations = null;
          return null;
        })
      : fetch(
          '/apps/customer-approval/config?shop=' +
            encodeURIComponent(shop) +
            '&locale=' +
            encodeURIComponent(guardLocaleParam())
        )
          .then(function (r) {
            return r.json();
          })
          .then(applyGuardConfig)
          .catch(function () {
            guardConfig = null;
            guardTranslations = null;
            return null;
          });

  function redirectDestination() {
    if (!guardConfig) {
      return '';
    }
    var u = guardConfig.guestCheckoutRedirectUrl;
    var s = (u && String(u).trim()) || '';
    if (!s || isUnsafeRegistrationRedirectUrl(s)) {
      return '';
    }
    return s;
  }

  function shouldRedirectGuest() {
    return (
      !cfg.customerLoggedIn &&
      guardConfig &&
      guardConfig.redirectGuestsFromCheckout === true &&
      !!redirectDestination()
    );
  }

  function customerHasApprovedTag() {
    var raw = guardConfig && guardConfig.approvedTag;
    if (!raw || typeof raw !== 'string') {
      return true;
    }
    var parts = raw.split(',').map(function (s) {
      return String(s || '').trim().toLowerCase();
    }).filter(Boolean);
    if (!parts.length) {
      return true;
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

  function shouldBlockLoggedInWithoutTag() {
    return (
      cfg.customerLoggedIn &&
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

  /** True when this form submission would send the buyer toward checkout (Buy it now, cart checkout, etc.). */
  function formLeadsToCheckout(form) {
    if (!form || form.nodeName !== 'FORM') {
      return false;
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

  /**
   * Dynamic checkout / Buy it now often live in Shadow DOM — event.target.closest() does not cross shadow roots.
   * composedPath() includes shadow hosts and ancestors.
   */
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

  function findCheckoutIntent(event) {
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
    window.location.href = dest;
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
  }

  function onCheckoutBlockedModalEscape(ke) {
    if (ke.key === 'Escape') {
      ke.preventDefault();
      removeCheckoutBlockedModal();
    }
  }

  /**
   * In-page modal (styles in registration-form.css). Continue → redirect; close / backdrop / Esc → dismiss only.
   */
  function showCheckoutBlockedModal(message, dest) {
    removeCheckoutBlockedModal();
    if (!document.body) {
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

  function handleGuestCheckoutEvent(e) {
    if (window.__approvefyBypassGuestCheckoutGuard) {
      window.__approvefyBypassGuestCheckoutGuard = false;
      return;
    }
    var intent = findCheckoutIntent(e);
    if (!intent) {
      return;
    }
    if (guardConfig !== null) {
      if (!shouldInterceptCheckout()) {
        return;
      }
      e.preventDefault();
      if (typeof e.stopImmediatePropagation === 'function') {
        e.stopImmediatePropagation();
      }
      e.stopPropagation();
      if (shouldBlockLoggedInWithoutTag()) {
        showCheckoutBlockedModal(loggedInBlockedAlertMessage(), redirectDestination());
        return;
      }
      go(redirectDestination());
      return;
    }
    e.preventDefault();
    if (typeof e.stopImmediatePropagation === 'function') {
      e.stopImmediatePropagation();
    }
    e.stopPropagation();
    guardReady.then(function () {
      if (shouldInterceptCheckout()) {
        if (shouldBlockLoggedInWithoutTag()) {
          showCheckoutBlockedModal(loggedInBlockedAlertMessage(), redirectDestination());
          return;
        }
        go(redirectDestination());
        return;
      }
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
    });
  }

  document.addEventListener('click', handleGuestCheckoutEvent, true);

  document.addEventListener(
    'submit',
    function (e) {
      if (window.__approvefyBypassGuestCheckoutGuard) {
        window.__approvefyBypassGuestCheckoutGuard = false;
        return;
      }
      var form = e.target;
      if (!form || form.nodeName !== 'FORM') {
        return;
      }
      if (!formLeadsToCheckout(form)) {
        return;
      }
      if (guardConfig !== null) {
        if (!shouldInterceptCheckout()) {
          return;
        }
        e.preventDefault();
        if (typeof e.stopImmediatePropagation === 'function') {
          e.stopImmediatePropagation();
        }
        e.stopPropagation();
        if (shouldBlockLoggedInWithoutTag()) {
          showCheckoutBlockedModal(loggedInBlockedAlertMessage(), redirectDestination());
          return;
        }
        go(redirectDestination());
        return;
      }
      e.preventDefault();
      if (typeof e.stopImmediatePropagation === 'function') {
        e.stopImmediatePropagation();
      }
      e.stopPropagation();
      guardReady.then(function () {
        if (shouldInterceptCheckout()) {
          if (shouldBlockLoggedInWithoutTag()) {
            showCheckoutBlockedModal(loggedInBlockedAlertMessage(), redirectDestination());
            return;
          }
          go(redirectDestination());
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
    var tags = cfg && cfg.customerTags;
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
    if (!cfg || !cfg.customerLoggedIn) {
      return;
    }
    if (!isAccountAreaPath()) {
      return;
    }
    guardReady.then(function () {
      if (shouldRedirectUnapprovedFromAccount()) {
        go(accountBlockDestination());
      }
    });
  }

  maybeRedirectUnapprovedFromAccount();
})();
