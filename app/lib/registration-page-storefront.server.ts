/** Storefront registration page is ready when the page is published and either the theme template exists or the app embed injects the form on /pages/customer-registration. */
export function canServeRegistrationPageViaAppEmbed(opts: {
  pageExists: boolean;
  pagePublished: boolean;
  appEmbedEnabled: boolean;
}): boolean {
  return opts.pageExists && opts.pagePublished && opts.appEmbedEnabled;
}

export function isRegistrationPageStorefrontReady(opts: {
  pageExists: boolean;
  pagePublished: boolean;
  templateFileExists: boolean;
  appEmbedEnabled: boolean;
}): boolean {
  if (!opts.pageExists || !opts.pagePublished) return false;
  return opts.templateFileExists || canServeRegistrationPageViaAppEmbed(opts);
}

export function isRegistrationFormLiveOnStorefront(opts: {
  blockOnDedicatedTemplate: boolean;
  pageExists: boolean;
  pagePublished: boolean;
  appEmbedEnabled: boolean;
}): boolean {
  if (opts.blockOnDedicatedTemplate) return true;
  return canServeRegistrationPageViaAppEmbed(opts);
}
