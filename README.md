# iVJ 2

iVJ is a browser-based visual performance mixer designed separately for touch-first iPhone use and desktop VJ sessions.

**Live app:** https://santismo.github.io/iVJ/

## What changed in version 2

- Responsive mobile and desktop workspaces
- Two live decks with independent queues and an equal-power crossfader
- Smooth, cut, and dip-to-black transitions
- Auto VJ with hidden-deck preloading, random order, and repeat protection
- **Describe My Set:** free keyless prompt planning that creates multiple visual searches and builds complementary Deck A/B queues
- Invidious search and playlist loading with provider fallbacks
- YouTube video/playlist URLs and local video files
- Scene presets, adjustable color treatment, scanlines, vignette, noise, and Auto FX
- Microphone or audio-file reactivity with pulse, color movement, and beat preparation
- Saved sessions plus JSON import/export
- Installable PWA shell, screen wake lock, performance mode, fullscreen, and desktop shortcuts

The original single-file mixer is preserved at [`legacy.html`](./legacy.html).

## Describe My Set

Try a direction such as:

> Grainy 1980s commercials, empty malls, neon night driving, purple and green, dreamy at first then increasingly chaotic, no talking heads.

iVJ extracts subjects, era, texture, mood, motion, colors, pacing, and exclusions. It creates several video searches, ranks the candidates, and lets you approve the clips before splitting them across both decks.

The default planner is intentionally keyless and runs inside the browser. An optional AI planner proxy URL can be configured in **Setup**. That proxy may use Gemini or another model, but API credentials must stay on the server and must never be committed to this public repository or embedded in the page.

Expected proxy request:

```json
{
  "task": "plan-vj-video-searches",
  "prompt": "user description",
  "responseShape": {
    "queries": ["string"],
    "exclusions": ["string"],
    "suggestedScene": "Clean | Dream | VHS | Neon | Acid | Noir | Mono",
    "suggestedInterval": "number",
    "summary": "string"
  }
}
```

Expected response:

```json
{
  "queries": ["1980s strange commercials VHS archive footage"],
  "exclusions": ["talking heads"],
  "suggestedScene": "VHS",
  "suggestedInterval": 14,
  "summary": "VHS treatment · fast pacing"
}
```

## Controls

- `1` / `2`: advance Deck A / B
- `←` / `→`: move the crossfader
- `Space`: toggle Auto VJ
- `R`: roll a scene
- `B`: blackout
- `F`: fullscreen

YouTube embeds are muted so browsers can autoplay them. Use the Audio panel to analyze a song or microphone input separately.

## Structure

```text
index.html
styles/app.css
src/main.js
src/core/
src/discovery/
src/ui/
assets/
manifest.webmanifest
sw.js
legacy.html
```

No build process or package installation is required. Serve the repository with any static server or GitHub Pages.
