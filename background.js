/* GeoMirror — background service worker.
 *
 * Responsibilities:
 *  - Detect the exit-IP geolocation (through the user's proxy).
 *  - Pick a nearby residential street as the override coordinate.
 *  - Store the result so the content scripts can apply it to every page.
 *  - Refresh periodically (the proxy exit IP can change) and on demand.
 */
importScripts('lib/geo.js', 'lib/providers.js');

const DEFAULT_SETTINGS = {
  enabled: true,
  accuracyM: 30,          // reported accuracy in meters (GPS-like)
  refreshMinutes: 360,    // re-detect every 6h
  ipToken: '',            // optional ipinfo.io token for better fallback
};

const ALARM = 'refresh';

async function getSettings() {
  const { settings } = await chrome.storage.local.get('settings');
  return { ...DEFAULT_SETTINGS, ...(settings || {}) };
}

async function saveSettings(patch) {
  const next = { ...(await getSettings()), ...patch };
  await chrome.storage.local.set({ settings: next });
  return next;
}

async function patchState(patch) {
  const { state } = await chrome.storage.local.get('state');
  await chrome.storage.local.set({ state: { ...(state || {}), ...patch } });
}

async function refresh() {
  await patchState({ status: 'refreshing', lastError: null });
  const s = await getSettings();
  try {
    const ip = await IPLoc.getIPLocation(s.ipToken);
    if (!ip || ip.lat == null) throw new Error('All IP geolocation providers failed.');

    const pick = await GeoUtil.chooseResidential(ip.lat, ip.lon, {
      radius: 2500, limit: 150, timeoutMs: 12000,
    });
    const addr = await IPLoc.getDisplayAddress(pick.lat, pick.lon);
    const now = Date.now();

    const override = {
      lat: pick.lat, lon: pick.lon, acc: s.accuracyM,
      source: pick.source, road: pick.road || null,
      enabled: s.enabled, ts: now,
    };
    const state = {
      status: 'ok',
      ip: ip.ip, ipCity: ip.city, ipRegion: ip.region,
      ipCountry: ip.country, ipCountryCode: ip.countryCode,
      ipLat: ip.lat, ipLon: ip.lon, isp: ip.isp, provider: ip.provider,
      overrideLat: pick.lat, overrideLon: pick.lon,
      overrideSource: pick.source, overrideRoad: pick.road || null,
      overrideAddress: addr ? addr.text : '',
      lastUpdated: now, lastError: null,
    };
    await chrome.storage.local.set({ override, state });
  } catch (e) {
    await patchState({
      status: 'error',
      lastError: String((e && e.message) || e),
      lastUpdated: Date.now(),
    });
  }
}

async function ensureAlarm() {
  const s = await getSettings();
  await chrome.alarms.clear(ALARM);
  chrome.alarms.create(ALARM, { periodInMinutes: Math.max(1, s.refreshMinutes) });
}

chrome.runtime.onInstalled.addListener(async () => {
  const { settings } = await chrome.storage.local.get('settings');
  if (!settings) await chrome.storage.local.set({ settings: DEFAULT_SETTINGS });
  await ensureAlarm();
  await refresh();
});

chrome.runtime.onStartup.addListener(async () => {
  await ensureAlarm();
  const { state } = await chrome.storage.local.get('state');
  const s = await getSettings();
  const age = state && state.lastUpdated ? Date.now() - state.lastUpdated : Infinity;
  if (!state || age > s.refreshMinutes * 60000) await refresh();
});

chrome.alarms.onAlarm.addListener((a) => {
  if (a.name === ALARM) refresh();
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    if (msg && msg.type === 'REFRESH') {
      await refresh();
    } else if (msg && msg.type === 'SET_SETTINGS') {
      const next = await saveSettings(msg.patch || {});
      const { override } = await chrome.storage.local.get('override');
      if (override) {
        override.enabled = next.enabled;
        override.acc = next.accuracyM;
        await chrome.storage.local.set({ override });
      }
      if (msg.patch && 'refreshMinutes' in msg.patch) await ensureAlarm();
    }
    // Return a fresh snapshot for any message (covers GET_STATE too).
    const { state, override, settings } = await chrome.storage.local.get(['state', 'override', 'settings']);
    sendResponse({ state, override, settings: { ...DEFAULT_SETTINGS, ...(settings || {}) } });
  })();
  return true; // keep channel open for async sendResponse
});
