# Launcher achievements

A House Divided unlocks come from the player's A House Divided account. The launcher uses its existing account session to request them when the game page opens, regains focus, or the player presses Refresh.

## Native game integration

Games own their achievement definitions and unlock rules. When the launcher starts a native game, it passes the absolute destination in `LAKESIDE_ACHIEVEMENTS_FILE`. If the variable is absent, keep game progress normally and skip the launcher export. Export the current snapshot on start and after unlocks, creating the parent directory and atomically replacing the file with a temporary file on the same filesystem. The game should keep the source of truth in its own save data, so it can recreate the snapshot whenever necessary.

```json
{
  "schema": 1,
  "achievements": [
    {
      "id": "first-city",
      "name": "First City",
      "description": "Found your first city.",
      "earnedAt": "2026-11-18T12:00:00Z"
    },
    {
      "id": "second-city",
      "name": "A Growing Region",
      "description": "Found a second city.",
      "earnedAt": null
    }
  ]
}
```

Use unique stable IDs containing ASCII letters, digits, and hyphens, up to 64 characters. Names are limited to 120 characters, descriptions to 500, and the whole UTF-8 file to 256 KiB. Use UTC ISO 8601 for earned dates and `null` for locked achievements. Only write data intended for display. Native snapshots and playtime are stored on the device under the current OS user. Playtime records time while the launcher can observe the game process or embedded window. Sessions opened independently in an external browser or outside the launcher are outside that measurement.
