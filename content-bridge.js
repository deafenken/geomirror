/* GeoMirror — isolated-world bridge.
 *
 * Runs in the isolated world (has chrome.* access) at document_start. It reads
 * the chosen override from storage and publishes it onto <html data-geomirror>,
 * where the MAIN-world injector can read it. MAIN-world scripts cannot access
 * chrome.storage, so this bridge is the only way to pass the coordinate across.
 *
 * It re-publishes on storage changes, so open pages pick up refreshes and
 * enable/disable toggles live.
 */
(function () {
  const root = document.documentElement;
  if (!root) return;

  function publish() {
    chrome.storage.local.get(['override', 'settings'], (data) => {
      const s = data.settings || {};
      const o = data.override;
      const enabled = s.enabled !== false;
      const payload = {
        enabled,
        lat: o ? o.lat : null,
        lon: o ? o.lon : null,
        acc: o ? o.acc : (s.accuracyM || 30),
        ts: o ? o.ts : 0,
      };
      root.setAttribute('data-geomirror', JSON.stringify(payload));
    });
  }

  publish();
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && (changes.override || changes.settings)) publish();
  });
})();
