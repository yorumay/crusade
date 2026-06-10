# Crusade Sector Template

A static, JSON-driven campaign tracker for a Warhammer 40,000 Crusade campaign.

## What it includes
- `data/campaign.json` as the editable source of truth
- An interactive sector map rendered in SVG
- Faction, player, and army panels
- A world details panel with lore and history
- Spacelane connections between planets

## How to use
1. Edit `data/campaign.json`.
2. Replace the map styling or add your own sector art later.
3. Host the folder on GitHub Pages or any static web host.

## Notes
- The page reads data with `fetch()`, so open it through a web server, not `file://`.
- Planet control is calculated from the factions of the occupying players.
- If a world has one faction present, it shows that faction.
- If multiple factions are present, it shows `Contested`.
- If no players are present, it shows `Neutral`.

## Suggested next edits
- Add battle report entries after each game
- Add extra fields like supply routes, relics, or planetary effects
- Swap in your final sector artwork
- Add filters or a turn log if the campaign grows
