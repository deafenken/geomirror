/* GeoMirror — MAIN-world injector.
 *
 * Runs in the page's main world at document_start, before page scripts, so the
 * override is visible to them. It replaces navigator.geolocation with a fake
 * that returns the chosen residential coordinate (mirroring the exit IP), and
 * reports the geolocation permission as granted so pre-checking pages proceed.
 *
 * The coordinate arrives asynchronously via <html data-geomirror> (written by
 * the isolated bridge). Because getCurrentPosition is callback-based, we simply
 * hold callbacks until the data is ready — invisible to pages.
 */
(function () {
  const HTML = document.documentElement;
  if (!HTML) return;

  // Capture the real Geolocation before shadowing (used when the override is off).
  let realGeo = null;
  try { realGeo = navigator.geolocation; } catch (_) {}

  let cache = null;
  let readyResolve;
  const ready = new Promise((r) => { readyResolve = r; });

  function loadFromDOM() {
    const attr = HTML.getAttribute('data-geomirror');
    if (!attr) return;
    let next = null;
    try { next = JSON.parse(attr); } catch (_) { return; }
    if (next && next.lat != null && next.lon != null) {
      cache = next;
      if (readyResolve) { readyResolve(); readyResolve = null; }
    }
  }
  loadFromDOM();

  const watchHandlers = {};
  let watchCounter = 0;

  function buildPosition() {
    const jitter = (Math.random() - 0.5) * 8; // a few meters of per-call variance
    return {
      coords: {
        latitude: cache.lat,
        longitude: cache.lon,
        accuracy: Math.max(1, cache.acc + jitter),
        altitude: null,
        altitudeAccuracy: null,
        heading: null,
        speed: null,
      },
      timestamp: Date.now(),
    };
  }

  function isDisabled() { return cache && cache.enabled === false; }

  function getCurrentPosition(success, error, options) {
    if (typeof success !== 'function') {
      throw new TypeError("Failed to execute 'getCurrentPosition' on 'Geolocation': 1 argument required");
    }
    // When disabled, delegate to the real Geolocation (may trigger the OS prompt).
    if (isDisabled() && realGeo) {
      try { return realGeo.getCurrentPosition(success, error, options); } catch (_) {}
    }
    ready.then(() => {
      if (isDisabled() && realGeo) {
        try { return realGeo.getCurrentPosition(success, error, options); } catch (_) {}
      }
      if (!cache) {
        if (typeof error === 'function') error({ code: 2, message: 'Position unavailable' });
        return;
      }
      success(buildPosition());
    });
  }

  function watchPosition(success, error, options) {
    if (typeof success !== 'function') {
      throw new TypeError("Failed to execute 'watchPosition' on 'Geolocation': 1 argument required");
    }
    getCurrentPosition(success, error, options);
    const id = ++watchCounter;
    watchHandlers[id] = () => { if (!isDisabled() && cache) success(buildPosition()); };
    return id;
  }

  function clearWatch(id) { delete watchHandlers[id]; }

  const fake = { getCurrentPosition, watchPosition, clearWatch };

  // Shadow navigator.geolocation. Defining an own accessor on the instance
  // hides the prototype getter, as trusted by Location Guard and similar tools.
  try {
    Object.defineProperty(navigator, 'geolocation', { configurable: true, get: () => fake });
  } catch (_) {
    try { navigator.geolocation = fake; } catch (__) {}
  }

  // Report geolocation permission as granted (pages that pre-check via the
  // Permissions API would otherwise never call getCurrentPosition).
  try {
    if (navigator.permissions && navigator.permissions.query) {
      const orig = navigator.permissions.query.bind(navigator.permissions);
      navigator.permissions.query = function (desc) {
        if (desc && desc.name === 'geolocation') {
          return Promise.resolve({ state: 'granted', onchange: null });
        }
        return orig(desc);
      };
    }
  } catch (_) {}

  // Live updates: when the bridge publishes new coords (refresh / toggle),
  // refresh cache and re-fire active watches.
  const obs = new MutationObserver(() => {
    loadFromDOM();
    Object.keys(watchHandlers).forEach((id) => { try { watchHandlers[id](); } catch (_) {} });
  });
  obs.observe(HTML, { attributes: true, attributeFilter: ['data-geomirror'] });

  // Safety net: if the bridge never publishes (e.g. extension disabled), don't
  // keep pending callbacks hanging forever.
  setTimeout(() => { if (readyResolve) { readyResolve(); readyResolve = null; } }, 12000);
})();
