# GeoMirror

> Make your browser's HTML5 location match your visible IP — automatically, on every page.

When you browse through a proxy or VPN, websites see your **exit IP** in one
country while `navigator.geolocation` (powered by macOS/Windows location services
and Wi-Fi scanning) still reports your **real physical location**. That mismatch
is one of the most common ways sites detect that you're behind a proxy.

GeoMirror fixes it. It detects where your **exit IP** is, picks a real residential
street nearby, and feeds that coordinate to `navigator.geolocation` — so the
location your browser reports always matches the IP that websites see. It updates
itself when your proxy node changes, requires no account, and is fully auditable.

[中文说明](./README.zh-CN.md) · [Privacy policy](./PRIVACY.md)

---

## How it works

```
   your proxy/VPN              Chrome
        │                         │
        ▼                         ▼
  exit IP (e.g. LA) ──► GeoMirror background worker
                          │
            ┌─────────────┼──────────────┐
            ▼             ▼              ▼
      IP geolocation  Overpass API   BigDataCloud
      (exit location) (residential    (display address)
            │         roads nearby)         │
            └────► pick a point on a ◄──────┘
                   residential street
                          │
                          ▼
            stored override coordinate
                          │
        content script injects into navigator.geolocation
                          │
                          ▼
        page sees: LA residential street, matching your IP
```

1. **Detect the exit IP's location.** The background worker queries a chain of
   free HTTPS geolocation services (with fallback), going through Chrome's
   network stack — so it sees the same IP websites see.
2. **Pick a residential street nearby.** It queries OpenStreetMap's Overpass API
   for `highway=residential` ways within ~2.5 km of the exit location and samples
   a point on a random one. This avoids landing on parks, POIs, or city centers.
3. **Override `navigator.geolocation`.** A content script running in the page's
   main world (at `document_start`, before page scripts) replaces
   `navigator.geolocation` so every site gets the chosen coordinate. It also
   reports the geolocation permission as `granted`.
4. **Stay in sync.** It refreshes on a schedule (default 6h), on browser launch,
   and on demand, so the reported location tracks your current exit IP.

## Install

### Option A — load unpacked (recommended for now)

1. Download or clone this repository.
2. (Optional) Generate icons: `python3 tools/gen-icons.py`. Prebuilt icons are
   included, so you can skip this unless you changed the design.
3. Open `chrome://extensions`, enable **Developer mode** (top-right).
4. Click **Load unpacked** and select the `geomirror` folder.
5. Pin GeoMirror and open its popup to confirm it shows your exit IP and a
   matching reported location.

### Option B — Chrome Web Store

A store listing is planned once the project is reviewed. Until then, use Option A.

## Verify it works

Open [`https://browserleaks.com/geo`](https://browserleaks.com/geo) with GeoMirror
on. The **HTML5 geolocation** result and the **IP-based** result should both point
to the same city (your exit IP's city), and the HTML5 result should land on a
residential street rather than a landmark.

## Settings

- **Enable / disable** — master toggle. When disabled, calls fall through to your
  real `navigator.geolocation`.
- **Reported accuracy (m)** — the `coords.accuracy` reported to pages. GPS-like
  by default (30 m).
- **Auto-refresh interval (minutes)** — how often to re-detect the exit IP.
- **ipinfo.io token (optional)** — improves fallback reliability if you have a
  (free) token. Not required.

## Why each permission

| Permission | Why |
| --- | --- |
| `storage` | Save your settings and the computed override locally. |
| `alarms` | Schedule periodic refreshes. |
| `<all_urls>` content script | Override `navigator.geolocation` on every site. This is unavoidable for a geolocation tool and the only page-level thing the extension does. |
| `host_permissions` (8 API hosts) | Contact the IP/geolocation/Overpass/reverse-geocode services. Listed explicitly in the manifest. |

See [PRIVACY.md](./PRIVACY.md) for the full data-flow breakdown.

## Limitations

- Cannot inject into `chrome://`, the Chrome Web Store, or other privileged
  pages (Chrome restriction). Those pages generally don't use geolocation anyway.
- IP geolocation is approximate (city-level). The override is a real street
  within ~a few km of the exit IP's reported center — close enough to match at
  city granularity, which is what consistency checks compare.
- If every IP provider is rate-limited or blocked by your proxy node, refresh
  will report an error and the last good override is kept. Try again shortly.
- This improves **consistency** between IP and geolocation. It is not, and cannot
  be, a complete anti-fingerprinting solution on its own.

## Development

Project layout:

```
geomirror/
├── manifest.json        # MV3 manifest
├── background.js        # service worker: detect → pick → store
├── lib/
│   ├── geo.js           # math + Overpass residential selection
│   └── providers.js     # IP + reverse-geocode provider chain
├── content-inject.js    # MAIN-world: overrides navigator.geolocation
├── content-bridge.js    # ISOLATED-world: passes coords from storage to page
├── popup.{html,css,js}  # UI
├── tools/gen-icons.py   # regenerate icons
└── icons/               # 16/48/128 PNGs
```

Quick checks:

```bash
python3 tools/gen-icons.py          # regenerate icons
node --check background.js          # syntax-check any JS file
node -e "const g=require('./lib/geo.js'); console.log(g.jitterCoord(34.05,-118.24,400,1800))"
```

After changing any file, reload the extension on `chrome://extensions` (the
circular-arrow icon) to apply it.

## Contributing

Pull requests welcome. Please keep the permission surface minimal and the
"no telemetry, no page content reading" guarantees in `PRIVACY.md` intact.

## License

[MIT](./LICENSE)
