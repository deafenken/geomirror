/* GeoMirror — geo helpers & residential-point selection.
 *
 * Pure-ish utilities shared by the background service worker (via importScripts)
 * and by Node tests. No Chrome APIs here, so it stays unit-testable.
 */
(function () {
  'use strict';
  const root = (typeof self !== 'undefined') ? self
             : (typeof global !== 'undefined') ? global : this;
  const EARTH_R = 6371000; // meters

  /** Great-circle distance in meters between two lat/lon points. */
  function haversineMeters(lat1, lon1, lat2, lon2) {
    const rad = (d) => (d * Math.PI) / 180;
    const dLat = rad(lat2 - lat1), dLon = rad(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2 +
      Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
    return 2 * EARTH_R * Math.asin(Math.sqrt(Math.max(0, a)));
  }

  /** A random point minM..maxM meters away from (lat, lon) on a random bearing. */
  function jitterCoord(lat, lon, minM, maxM) {
    const brng = Math.random() * 2 * Math.PI;
    const dist = minM + Math.random() * (maxM - minM);
    const dLat = (dist * Math.cos(brng)) / 111111;
    const dLon = (dist * Math.sin(brng)) / (111111 * Math.cos((lat * Math.PI) / 180));
    return { lat: lat + dLat, lon: lon + dLon };
  }

  /** A random point along an OSM way geometry array [{lat,lon}, ...]. */
  function pickPointAlongGeometry(geom) {
    if (!geom || geom.length === 0) return null;
    if (geom.length === 1) return { lat: geom[0].lat, lon: geom[0].lon };
    const i = Math.floor(Math.random() * (geom.length - 1));
    const a = geom[i], b = geom[i + 1];
    const t = Math.random();
    return { lat: a.lat + (b.lat - a.lat) * t, lon: a.lon + (b.lon - a.lon) * t };
  }

  // Public Overpass endpoints, tried in order. Each is a free, CORS-enabled
  // instance of the OpenStreetMap Overpass API.
  const OVERPASS_ENDPOINTS = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
    'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
  ];

  /** Query Overpass for residential roads near a point. Returns way elements or null. */
  async function fetchOverpass(lat, lon, radius, limit, timeoutMs) {
    const data = new URLSearchParams({
      data: `[out:json][timeout:10];way(around:${radius},${lat},${lon})["highway"="residential"];out geom ${limit};`,
    }).toString();
    for (const ep of OVERPASS_ENDPOINTS) {
      try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), timeoutMs);
        const res = await fetch(ep, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: data,
          signal: ctrl.signal,
        });
        clearTimeout(timer);
        if (!res.ok) continue;
        const json = await res.json();
        const ways = (json.elements || []).filter(
          (e) => e.type === 'way' && Array.isArray(e.geometry) && e.geometry.length > 1);
        if (ways.length) return ways;
      } catch (_) { /* try next endpoint */ }
    }
    return null;
  }

  /**
   * Choose a residential coordinate near (ipLat, ipLon).
   * Strategy: query Overpass for nearby highway=residential ways and sample a
   * point on a random one; if that fails, fall back to a random offset.
   * Returns { lat, lon, source, road } where source ∈ 'overpass' | 'jitter'.
   */
  async function chooseResidential(ipLat, ipLon, opts = {}) {
    const radius = opts.radius || 2500;
    const limit = opts.limit || 150;
    const timeoutMs = opts.timeoutMs || 12000;
    const maxDistM = radius + 1500;
    try {
      const ways = await fetchOverpass(ipLat, ipLon, radius, limit, timeoutMs);
      if (ways) {
        for (let i = 0; i < 16; i++) {
          const way = ways[Math.floor(Math.random() * ways.length)];
          const pt = pickPointAlongGeometry(way.geometry);
          if (!pt) continue;
          if (haversineMeters(ipLat, ipLon, pt.lat, pt.lon) <= maxDistM) {
            return {
              lat: pt.lat, lon: pt.lon, source: 'overpass',
              road: (way.tags && (way.tags.name || way.tags.ref)) || null,
            };
          }
        }
      }
    } catch (_) { /* fall through to jitter */ }
    const j = jitterCoord(ipLat, ipLon, 400, 1800);
    return { lat: j.lat, lon: j.lon, source: 'jitter', road: null };
  }

  const GeoUtil = {
    haversineMeters, jitterCoord, pickPointAlongGeometry,
    fetchOverpass, chooseResidential, OVERPASS_ENDPOINTS,
  };
  root.GeoUtil = GeoUtil;
  if (typeof module !== 'undefined' && module.exports) module.exports = GeoUtil;
})();
