export type Theme = "light" | "dark" | "system";

export const THEME_STORAGE_KEY = "sf-theme";

/**
 * Runs before first paint (inlined in <head>) so the page never flashes the wrong
 * theme. Kept tiny and dependency-free; it must stay in sync with ThemeProvider.
 */
export const themeScript = `(function(){try{var t=localStorage.getItem("${THEME_STORAGE_KEY}");var d=t==="dark"||((!t||t==="system")&&window.matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.classList.toggle("dark",d);document.documentElement.style.colorScheme=d?"dark":"light"}catch(e){}})();`;
