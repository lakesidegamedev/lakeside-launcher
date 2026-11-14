// A bundled copy of the live store catalog, used only when the live one cannot
// be reached (offline, or a browser preview where the site blocks the request).
// Refreshed by hand when prices change; the live catalog always wins.
import type { LiveCatalog } from "./liveCatalog";

export const CATALOG_SNAPSHOT: LiveCatalog = {
  "products": [
    {
      "id": "complete",
      "game": "electioneer",
      "name": "Complete Collection",
      "description": "All 131 elections in all 14 countries from 1932 to 2027, unlocking the 116 that are not already free, plus every country and election added later.",
      "priceCents": 399,
      "currency": "usd"
    },
    {
      "id": "us-historical",
      "game": "electioneer",
      "name": "United States",
      "description": "Twenty-four presidential elections from 1932 to 2024 under the Electoral College, unlocking the 22 that are not already free (2020 and 2024 are free).",
      "priceCents": 99,
      "currency": "usd"
    },
    {
      "id": "uk-elections",
      "game": "electioneer",
      "name": "United Kingdom",
      "description": "Eighteen general elections from 1951 to 2024 under first past the post, unlocking the 17 before the free 2024 election.",
      "priceCents": 99,
      "currency": "usd"
    },
    {
      "id": "canada",
      "game": "electioneer",
      "name": "Canada",
      "description": "Twelve federal elections from 1984 to 2025 under first past the post, unlocking the 11 before the free 2025 election.",
      "priceCents": 99,
      "currency": "usd"
    },
    {
      "id": "germany",
      "game": "electioneer",
      "name": "Germany",
      "description": "Ten Bundestag elections from 1990 to 2025 under mixed-member proportional representation, unlocking the 9 before the free 2025 election.",
      "priceCents": 99,
      "currency": "usd"
    },
    {
      "id": "france",
      "game": "electioneer",
      "name": "France",
      "description": "Nine two-round presidential elections from 1981 to 2027, unlocking the 8 that are not already free (2022 is free).",
      "priceCents": 99,
      "currency": "usd"
    },
    {
      "id": "australia",
      "game": "electioneer",
      "name": "Australia",
      "description": "Eleven federal elections from 1996 to 2025 under preferential voting, unlocking the 10 before the free 2025 election.",
      "priceCents": 99,
      "currency": "usd"
    },
    {
      "id": "new-zealand",
      "game": "electioneer",
      "name": "New Zealand",
      "description": "Six MMP elections from 2008 to 2023, unlocking the 5 before the free 2023 election.",
      "priceCents": 99,
      "currency": "usd"
    },
    {
      "id": "india",
      "game": "electioneer",
      "name": "India",
      "description": "Six Lok Sabha elections from 1999 to 2024 under first past the post, unlocking the 5 before the free 2024 election.",
      "priceCents": 99,
      "currency": "usd"
    },
    {
      "id": "japan",
      "game": "electioneer",
      "name": "Japan",
      "description": "Eight House of Representatives elections from 2005 to 2026 under parallel voting, unlocking the 7 that are not already free (2024 is free).",
      "priceCents": 99,
      "currency": "usd"
    },
    {
      "id": "brazil",
      "game": "electioneer",
      "name": "Brazil",
      "description": "Six two-round presidential elections from 2002 to 2022, unlocking the 5 before the free 2022 election.",
      "priceCents": 99,
      "currency": "usd"
    },
    {
      "id": "ireland",
      "game": "electioneer",
      "name": "Ireland",
      "description": "Five Dáil elections from 2007 to 2024 under the single transferable vote, unlocking the 4 before the free 2024 election.",
      "priceCents": 99,
      "currency": "usd"
    },
    {
      "id": "spain",
      "game": "electioneer",
      "name": "Spain",
      "description": "Six Congress of Deputies elections from 2011 to 2023 under proportional representation by province, unlocking the 5 before the free 2023 election.",
      "priceCents": 99,
      "currency": "usd"
    },
    {
      "id": "italy",
      "game": "electioneer",
      "name": "Italy",
      "description": "Five Chamber of Deputies elections from 2006 to 2022 under changing electoral laws, unlocking the 4 before the free 2022 election.",
      "priceCents": 99,
      "currency": "usd"
    },
    {
      "id": "mexico",
      "game": "electioneer",
      "name": "Mexico",
      "description": "Five presidential elections from 2000 to 2024, each won by the most votes in one round, unlocking the 4 before the free 2024 election.",
      "priceCents": 99,
      "currency": "usd"
    },
    {
      "id": "corporate-warfare",
      "game": "corporate-warfare",
      "name": "Corporate Warfare",
      "description": "The corporate strategy game. One purchase, yours to keep; also included with Supporter+ and Champion.",
      "priceCents": 1499,
      "currency": "usd"
    },
    {
      "id": "ahd-singleplayer",
      "game": "a-house-divided",
      "name": "A House Divided: Single-player",
      "description": "The single-player edition of A House Divided. One purchase, yours to keep; also included with Supporter+ and Champion.",
      "priceCents": 1499,
      "currency": "usd"
    }
  ],
  "subscriptions": [
    {
      "id": "supporter",
      "name": "Supporter",
      "priceCents": 300,
      "interval": "month",
      "currency": "usd",
      "grants": ["complete"],
      "description": "support the studio, browse A House Divided ad-free, unlock supporter cosmetics and supporter chat, put your name on the supporter wall, and get the Margin of Victory Complete Collection."
    },
    {
      "id": "supporter-plus",
      "name": "Supporter+",
      "priceCents": 999,
      "interval": "month",
      "currency": "usd",
      "grants": ["corporate-warfare", "ahd-singleplayer", "sandbox", "complete"],
      "description": "everything in Supporter plus all paid access to every Lakeside game: Corporate Warfare, A House Divided single-player and sandbox, every Margin of Victory pack, and anything we add later."
    },
    {
      "id": "champion",
      "name": "Champion",
      "priceCents": 2000,
      "interval": "month",
      "currency": "usd",
      "grants": ["corporate-warfare", "ahd-singleplayer", "sandbox", "complete"],
      "description": "the same access as Supporter+, the biggest way to back the studio, with its own place on the supporter wall."
    }
  ],
  "subscriptionsAvailable": true,
  "tiersNote": "Store subscriptions and Patreon tiers are the same tiers; join either way."
};
