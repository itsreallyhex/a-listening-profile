#!/usr/bin/env python3
"""
Turn a Spotify library export (CSV) into archive-data.js.

Run it like this:

    python scripts/analyze-spotify-export.py your-export.csv > archive-data.js

Get the CSV from a tool like Exportify (https://exportify.net), or ask Spotify
for your data directly. The script reads these columns and ignores the rest:

    Track URI, Track Name, Artist Name(s), Album Name, Album Release Date,
    Track Duration (ms), Explicit, Popularity, ISRC, Added At

To sort each track into a group, it guesses:

    - a spotify:local: URI              is a local or leaked file
    - a normal track URI with no ISRC   is a rip hiding as a podcast
    - anything else                     is a normal release

The guess is rough, so open archive-data.js afterwards and fix the labels and
notes if they do not match your library.
"""

import csv
import collections
import json
import re
import sys

# The release-year chart always starts here, even if your oldest track is newer.
RANGE_START = 1975


def load(path):
    with open(path, encoding="utf-8") as f:
        return list(csv.DictReader(f))


def analyze(rows):
    n = len(rows)
    if not n:
        sys.exit("No rows found in the CSV.")

    proper = local = podcast = 0
    artists = collections.Counter()
    pops = []
    explicit = 0
    years = collections.Counter()
    months = collections.Counter()
    juice_any = 0

    for r in rows:
        uri = r.get("Track URI", "")
        isrc = (r.get("ISRC") or "").strip()
        names = r.get("Artist Name(s)", "")

        if uri.startswith("spotify:local:"):
            local += 1
        elif not isrc:
            podcast += 1
        else:
            proper += 1

        artists[names.split(",")[0].strip() or "Unknown"] += 1
        # The page has a section for one artist. Swap this name for whoever
        # dominates your own library, or drop that section from index.html.
        if "juice wrld" in names.lower():
            juice_any += 1

        pop = (r.get("Popularity") or "").strip()
        if pop.lstrip("-").isdigit():
            pops.append(int(pop))

        if (r.get("Explicit") or "").strip().lower() == "true":
            explicit += 1

        ym = re.match(r"(\d{4})-(\d{2})", r.get("Added At", "") or "")
        if ym:
            months[ym.group(0)] += 1

        y = re.match(r"(\d{4})", r.get("Album Release Date", "") or "")
        if y:
            years[int(y.group(1))] += 1

    buckets = collections.OrderedDict(
        [("0-19", 0), ("20-39", 0), ("40-59", 0), ("60-79", 0), ("80-100", 0)]
    )
    for p in pops:
        key = min(p // 20, 4)
        buckets[list(buckets)[key]] += 1
    mean_pop = round(sum(pops) / len(pops), 1) if pops else None

    year_max = max(years) if years else RANGE_START

    return {
        "ready": True,
        "totalTracks": n,
        "composition": [
            {"label": "Proper releases", "value": proper},
            {"label": "Local / leak files", "value": local},
            {"label": "Podcast-wrapped rips", "value": podcast},
        ],
        "topArtists": [{"name": a, "value": c} for a, c in artists.most_common(10)],
        "juiceWrldDominancePct": round(juice_any / n * 100, 1),
        "juiceWrldNote": f"{juice_any} of the {n} tracks credit Juice WRLD.",
        "popularity": {
            "mean": mean_pop,
            "buckets": [{"label": k, "value": v} for k, v in buckets.items()],
        },
        "explicitPct": round(explicit / n * 100, 1),
        "explicitNote": f"{explicit} of the {n} tracks are marked explicit.",
        "releaseYears": {
            str(y): years[y] for y in range(RANGE_START, year_max + 1) if years[y]
        },
        "releaseYearRange": [RANGE_START, max(year_max, RANGE_START)],
        "monthlyAdds": [{"month": m, "value": months[m]} for m in sorted(months)],
    }


def emit(data):
    body = json.dumps(data, indent=2, ensure_ascii=False)
    return (
        "/* =============================================================\n"
        "   ARCHIVE DATA\n\n"
        "   Built by scripts/analyze-spotify-export.py from a Spotify\n"
        "   export. Nothing here is fetched while the page runs; main.js\n"
        "   just draws it. The composition labels are only guesses, so\n"
        "   open this file and fix them and the notes to match your own\n"
        "   library.\n"
        "   ============================================================= */\n\n"
        f"window.ARCHIVE = {body};\n"
    )


def main():
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    print(emit(analyze(load(sys.argv[1]))))


if __name__ == "__main__":
    main()
