# iVJ 2

iVJ is a touch-first iPhone and desktop visual performance mixer that runs as a static website.

**Live app:** https://santismo.github.io/iVJ/

## Version 2.1

- Clean video display with no labels or app controls over the output
- Two muted YouTube/local-video decks with independent queues
- 13 built-in visual clips and four ready-to-mix curated banks
- Optional larger online playlists and custom YouTube video/playlist URLs
- Separate sequential **Next** and no-repeat **Random** controls on each deck
- Random Both, New Random, and Global Roll performance actions
- YouTube IFrame API playback with muted autoplay, manual Play Both, stall recovery, embed-error skipping, and resume-on-return
- Equal-power crossfader, cuts, transitions, blend modes, and Auto VJ
- Advanced output processing: mirror X/Y, RGB shift, trails/echo, edge detection, neon outline, turbulence warp, scanlines, grain, vignette, zoom, rotation, and geometry overlays
- 13 effect scenes including Mirror Tunnel, Kaleido Acid, RGB Ghost, Dream Trails, Neon Edges, Warp Drive, VHS Smear, and Chrome Split
- Saved sessions, JSON import/export, PWA shell, wake lock, fullscreen, and clean performance mode

The visual finder and audio-reactive panel were removed in 2.1 so the interface stays focused on decks, playlists, mixing, and live effects. The original single-file mixer remains available at [`legacy.html`](./legacy.html).

## Playback behavior

YouTube embeds are muted so mobile browsers can autoplay them. If iOS pauses an embed, tap **Play both** or tap the clean display. The player retries a stalled deck and automatically advances when an embed is unavailable. Every built-in deck has multiple clips, so **Next** always advances instead of reloading a one-item queue.

## Controls

- `1` / `2`: next clip on Deck A / B
- `Q` / `W`: random clip on Deck A / B
- `←` / `→`: move the crossfader
- `Space`: toggle Auto VJ
- `R`: roll an FX scene
- `G`: global random roll
- `B`: blackout
- `F`: fullscreen

## Structure

```text
index.html
styles/app.css
src/main.js
src/data/playlists.js
src/core/store.js
src/core/mixer.js
src/core/effects.js
src/discovery/invidious-source.js
src/ui/render.js
assets/
manifest.webmanifest
sw.js
legacy.html
```

No build process is required. Serve the repository with any static server or GitHub Pages. Run `npm run check` for syntax, UI ID, playlist, URL parser, and FX coverage checks.
