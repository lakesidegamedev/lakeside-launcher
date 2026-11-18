# Developer changelog

## 0.8.0

Coverage starts at tag `v0.7.6` and ends with the `v0.8.0` release commit.

- Rebuilt Home around a manually selected feature and static event announcements. Existing feeds still resolve game actions, art and event availability. The Library gallery preserves filtering, search and launch actions.
- Desktop activity uses a local checkpointed ledger shared by native and embedded web editions of the same game. Overlapping instances count once. Native child exit and embedded window destruction settle the session.
- AHD achievement reads use the existing launcher session through the account service. Results remain account-scoped and refresh on game-page entry, focus or demand.
- Native games can write a versioned achievement snapshot through the launch environment. See [Launcher achievements](achievements.md) for the contract and storage behavior.
- Updated browser smoke coverage for the story selector, countdown removal and game gallery. Desktop bundles use the same signed update feed on all four supported platform keys.
