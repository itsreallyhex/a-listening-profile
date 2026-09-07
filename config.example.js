/* Copy this file to config.js and fill in your own values. config.js is
   gitignored, so your key stays out of the repo.

   On Path A (the default) whatever key you put here is visible to anyone who
   opens the page. The Last.fm read API needs no login and cannot change
   anything, so an exposed read key is low risk, but use one you are fine
   having in the open. Path B moves the key off the page entirely. The README
   explains both. */

window.HEX_CONFIG = {
  // Path A: your Last.fm API key. Make one in about a minute at
  // https://www.last.fm/api/account/create
  // Path B: leave this blank and set LASTFM_API_KEY in your host instead.
  // The page finds the /api/lastfm function on its own. See the README.
  lastfmApiKey: "YOUR_LASTFM_API_KEY",

  // Your Last.fm username. Needed on Path A. On Path B the function uses
  // LASTFM_USER from the environment, and the page picks up your name from
  // your Last.fm profile, so you can leave this blank.
  lastfmUser: "your-lastfm-username",

  // Optional. The name in the header and browser tab. Leave it blank to use
  // your username.
  displayName: "",

  // Optional. How often to re-check what is playing, in milliseconds. Lower
  // is snappier. The totals and top lists refresh on their own slower timer.
  refreshMs: 8000,
};
