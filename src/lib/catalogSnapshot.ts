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
      "description": "Every country and every scenario in Margin of Victory, including scenarios added later.",
      "priceCents": 399,
      "currency": "usd"
    },
    {
      "id": "us-historical",
      "game": "electioneer",
      "name": "United States",
      "description": "Fifteen presidential races from 1960 to 2016, each with its real campaign events.",
      "priceCents": 99,
      "currency": "usd"
    },
    {
      "id": "uk-elections",
      "game": "electioneer",
      "name": "United Kingdom",
      "description": "Eighteen general elections from 1951 to 2024, hung parliaments and all.",
      "priceCents": 99,
      "currency": "usd"
    },
    {
      "id": "canada",
      "game": "electioneer",
      "name": "Canada",
      "description": "Four federal elections from 2015 to 2025.",
      "priceCents": 99,
      "currency": "usd"
    },
    {
      "id": "germany",
      "game": "electioneer",
      "name": "Germany",
      "description": "Three Bundestag elections from 2017 to 2025.",
      "priceCents": 99,
      "currency": "usd"
    },
    {
      "id": "france",
      "game": "electioneer",
      "name": "France",
      "description": "Four two-round presidential elections from 2012 to 2027.",
      "priceCents": 99,
      "currency": "usd"
    },
    {
      "id": "australia",
      "game": "electioneer",
      "name": "Australia",
      "description": "Three preferential-vote federal elections from 2019 to 2025.",
      "priceCents": 99,
      "currency": "usd"
    },
    {
      "id": "new-zealand",
      "game": "electioneer",
      "name": "New Zealand",
      "description": "Mixed-member proportional elections in Aotearoa, where a handful of seats decides who governs.",
      "priceCents": 99,
      "currency": "usd"
    },
    {
      "id": "india",
      "game": "electioneer",
      "name": "India",
      "description": "The world's largest election: coalition arithmetic across hundreds of millions of voters.",
      "priceCents": 99,
      "currency": "usd"
    },
    {
      "id": "japan",
      "game": "electioneer",
      "name": "Japan",
      "description": "Lower house elections where factions and coalition partners matter as much as the vote.",
      "priceCents": 99,
      "currency": "usd"
    },
    {
      "id": "brazil",
      "game": "electioneer",
      "name": "Brazil",
      "description": "Two-round presidential races in a fractured, many-party democracy.",
      "priceCents": 99,
      "currency": "usd"
    },
    {
      "id": "ireland",
      "game": "electioneer",
      "name": "Ireland",
      "description": "Single transferable vote elections where lower preferences decide the last seats.",
      "priceCents": 99,
      "currency": "usd"
    },
    {
      "id": "spain",
      "game": "electioneer",
      "name": "Spain",
      "description": "Regional parties and provincial seat quirks shape every road to a governing majority.",
      "priceCents": 99,
      "currency": "usd"
    },
    {
      "id": "italy",
      "game": "electioneer",
      "name": "Italy",
      "description": "Shifting electoral laws and fragile coalitions in a famously unstable parliament.",
      "priceCents": 99,
      "currency": "usd"
    },
    {
      "id": "mexico",
      "game": "electioneer",
      "name": "Mexico",
      "description": "Single-term presidential races and a congress split between districts and proportional lists.",
      "priceCents": 99,
      "currency": "usd"
    },
    {
      "id": "corporate-warfare",
      "game": "corporate-warfare",
      "name": "Corporate Warfare",
      "description": "The corporate strategy game. One purchase, yours to keep; also included with any supporter tier.",
      "priceCents": 1499,
      "currency": "usd"
    },
    {
      "id": "ahd-singleplayer",
      "game": "a-house-divided",
      "name": "A House Divided: Single-player",
      "description": "The single-player edition of A House Divided. One purchase, yours to keep; also included with any supporter tier.",
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
      "grants": [
        "corporate-warfare",
        "ahd-singleplayer"
      ]
    },
    {
      "id": "supporter-plus",
      "name": "Supporter+",
      "priceCents": 999,
      "interval": "month",
      "currency": "usd",
      "grants": [
        "corporate-warfare",
        "ahd-singleplayer",
        "sandbox",
        "complete"
      ]
    }
  ],
  "subscriptionsAvailable": true
};
