/**
 * Runs inline in <head> before first paint: resolves the stored theme
 * (falling back to the system preference, dark-first) and stamps the class
 * on <html> so there is never a flash of the wrong theme.
 */
export const THEME_STORAGE_KEY = "kinetiq-theme";

export const themeScript = `(function(){try{var k="${THEME_STORAGE_KEY}",t=localStorage.getItem(k);if(t!=="light"&&t!=="dark"){t=window.matchMedia("(prefers-color-scheme: light)").matches?"light":"dark"}var c=document.documentElement.classList;c.remove("light","dark");c.add(t)}catch(e){}})()`;
