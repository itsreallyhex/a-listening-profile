/* =============================================================
   Optional Last.fm proxy (Path B).

   Deploy this and the API key lives here, in the function's
   environment, instead of in config.js. It forwards one request
   to Last.fm and hands back the JSON. The key is never in the
   response.

   Vercel picks up files in api/ on its own. On Netlify the
   included netlify.toml points /api/lastfm here.

   Set two environment variables in your host's dashboard:
     LASTFM_API_KEY   your Last.fm API key
     LASTFM_USER      your Last.fm username

   If they are missing the function returns 501 and the page
   falls back to calling Last.fm directly.
   ============================================================= */

const UPSTREAM = "https://ws.audioscrobbler.com/2.0/";

// Only the calls the page actually makes. Keeps this from being an
// open proxy for the whole Last.fm API.
const ALLOWED_METHODS = new Set([
  "user.getRecentTracks",
  "user.getInfo",
  "user.getTopArtists",
  "user.getTopAlbums",
  "user.getTopTracks",
  // track.getInfo is how the page finds cover art for the top tracks list.
  "track.getInfo",
]);

// Query params that are safe to pass straight through.
const PASS_THROUGH = [
  "limit", "page", "period", "extended", "from", "to",
  "artist", "track", "autocorrect",
];

export default async function handler(req, res) {
  const apiKey = process.env.LASTFM_API_KEY;
  const user = process.env.LASTFM_USER;

  if (!apiKey || !user) {
    res.status(501).json({
      error: "Proxy not configured. Set LASTFM_API_KEY and LASTFM_USER.",
    });
    return;
  }

  const method = String(req.query.method || "");
  if (!ALLOWED_METHODS.has(method)) {
    res.status(400).json({ error: `Method not allowed: ${method}` });
    return;
  }

  const url = new URL(UPSTREAM);
  url.searchParams.set("method", method);
  url.searchParams.set("user", user);
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("format", "json");
  for (const name of PASS_THROUGH) {
    const value = req.query[name];
    if (value != null && value !== "") url.searchParams.set(name, String(value));
  }

  try {
    const upstream = await fetch(url, {
      headers: { "User-Agent": "listening-profile" },
    });
    const body = await upstream.text();
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.status(upstream.status).send(body);
  } catch (err) {
    res.status(502).json({ error: "Could not reach Last.fm." });
  }
}
