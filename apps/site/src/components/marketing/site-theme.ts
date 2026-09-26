/** The site's own key, separate from the product app's theme preference. */
export const SITE_THEME_KEY = "sf-site-theme";

/**
 * Runs before first paint (inlined in <head>). The server renders `.dark` (the default for new
 * visitors); this only removes it when the visitor has chosen light, so dark never flashes light
 * and light flashes nothing.
 */
export const siteThemeScript = `(function(){try{var d=localStorage.getItem("${SITE_THEME_KEY}")!=="light";document.documentElement.classList.toggle("dark",d);document.documentElement.style.colorScheme=d?"dark":"light"}catch(e){}})();`;
