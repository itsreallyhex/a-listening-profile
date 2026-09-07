/* =============================================================
   ARCHIVE DATA

   A frozen snapshot of a Spotify library export. Nothing here is
   fetched while the page runs; main.js just draws whatever this
   object holds.

   To rebuild it from your own export:
     python scripts/analyze-spotify-export.py your-export.csv > archive-data.js

   You can also edit the numbers by hand. Set `ready: false` and
   the page shows a short "nothing here yet" note instead.
   ============================================================= */

window.ARCHIVE = {
  ready: true,

  totalTracks: 499,

  // Where the 499 saved tracks come from.
  //  - Proper releases .... normal releases, the kind with an ISRC code
  //  - Local leak files ... spotify:local: files, so session leaks, "v1" to "v8", things marked "(Old)"
  //  - Fake-podcast rips .. real track URIs with no ISRC and a made-up artist name
  composition: [
    { label: "Proper releases", value: 366 },
    { label: "Local leak files", value: 129 },
    { label: "Fake-podcast rips", value: 4 },
  ],

  // The artists with the most tracks, counting only the first name credited on each.
  topArtists: [
    { name: "Juice WRLD", value: 201 },
    { name: "Eminem", value: 14 },
    { name: "Red Leather", value: 13 },
    { name: "TishiSSJ", value: 13 },
    { name: "XXXTENTACION", value: 10 },
    { name: "paulys x", value: 10 },
    { name: "Travis Scott", value: 9 },
    { name: "Marino", value: 8 },
    { name: "Kanye West", value: 7 },
    { name: "novanitys", value: 7 },
  ],

  // Share of tracks with Juice WRLD anywhere in the credits, lead or feature.
  juiceWrldDominancePct: 43.5,
  juiceWrldNote:
    "217 of the 499 tracks have Juice WRLD on them. He is the main artist on 201, and 129 of those never came out officially.",

  // Spotify's popularity score, 0 to 100, grouped into five bands.
  popularity: {
    mean: 36.4,
    buckets: [
      { label: "0-19", value: 196 },
      { label: "20-39", value: 49 },
      { label: "40-59", value: 93 },
      { label: "60-79", value: 120 },
      { label: "80-100", value: 41 },
    ],
  },

  // Share of tracks Spotify marks explicit.
  explicitPct: 52.9,
  explicitNote: "264 of the 499 tracks are marked explicit.",

  // Release year to track count. Only tracks with a real release date show up
  // here, and the chart fills in the empty years in between.
  releaseYears: {
    1975: 1, 1984: 1, 1992: 1,
    2000: 5, 2002: 2, 2004: 3, 2005: 3, 2007: 3, 2008: 1, 2009: 2,
    2010: 4, 2013: 4, 2014: 3, 2015: 4, 2016: 6, 2017: 7, 2018: 26,
    2019: 21, 2020: 25, 2021: 15, 2022: 26, 2023: 38, 2024: 49,
    2025: 58, 2026: 58,
  },
  releaseYearRange: [1975, 2026],

  // How many tracks were saved each month.
  monthlyAdds: [
    { month: "2025-10", value: 52 },
    { month: "2025-11", value: 30 },
    { month: "2025-12", value: 49 },
    { month: "2026-01", value: 32 },
    { month: "2026-02", value: 10 },
    { month: "2026-03", value: 28 },
    { month: "2026-04", value: 16 },
    { month: "2026-05", value: 25 },
    { month: "2026-06", value: 66 },
    { month: "2026-07", value: 29 },
    { month: "2026-08", value: 139 },
    { month: "2026-09", value: 23 },
  ],
};
