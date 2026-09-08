/* =============================================================
   The same Last.fm proxy as api/lastfm.js, in the shape Netlify
   Functions expect. netlify.toml routes /api/lastfm to here.

   Set LASTFM_API_KEY and LASTFM_USER in the Netlify dashboard
   under Site settings, Environment variables. Do not commit them.
   ============================================================= */

const UPSTREAM = "https://ws.audioscrobbler.com/2.0/";

const ALLOWED_METHODS = new Set([
  "user.getRecentTracks",
  "user.getInfo",
  "user.getTopArtists",
  "user.getTopAlbums",
  "user.getTopTracks",
  // track.getInfo is how the page finds cover art for the top tracks list.
  "track.getInfo",
]);

const PASS_THROUGH = [
  "limit", "page", "period", "extended", "from", "to",
  "artist", "track", "autocorrect",
];

const json = (status, body) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });

export default async (request) => {
  const apiKey = process.env.LASTFM_API_KEY;
  const user = process.env.LASTFM_USER;

  if (!apiKey || !user) {
    return json(501, {
      error: "Proxy not configured. Set LASTFM_API_KEY and LASTFM_USER.",
    });
  }

  const incoming = new URL(request.url);
  const method = incoming.searchParams.get("method") || "";
  if (!ALLOWED_METHODS.has(method)) {
    return json(400, { error: `Method not allowed: ${method}` });
  }

  const url = new URL(UPSTREAM);
  url.searchParams.set("method", method);
  url.searchParams.set("user", user);
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("format", "json");
  for (const name of PASS_THROUGH) {
    const value = incoming.searchParams.get(name);
    if (value) url.searchParams.set(name, value);
  }

  try {
    const upstream = await fetch(url, {
      headers: { "User-Agent": "listening-profile" },
    });
    return new Response(await upstream.text(), {
      status: upstream.status,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    return json(502, { error: "Could not reach Last.fm." });
  }
};
