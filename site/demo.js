import { saveLocation, loadLocation } from "./storage.js";

const PRESETS = [
  { name: "Sydney", lat: -33.8568, lon: 151.2153 },
  { name: "Tokyo", lat: 35.6762, lon: 139.6503 },
  { name: "London", lat: 51.5072, lon: -0.1276 },
  { name: "San Francisco", lat: 37.7749, lon: -122.4194 },
];

const outputEl = document.getElementById("output");

function normalizeLon(lon) {
  return ((lon + 180) % 360 + 360) % 360 - 180;
}

// Shifts a UTC ISO instant by offsetHours and formats the result's UTC
// wall-clock time. Must use timeZone: "UTC" here — the shift was already
// applied manually via epoch milliseconds, so re-reading with the visitor's
// own local timezone would double-shift it.
function shiftedTimeLabel(isoString, offsetHours) {
  const instant = new Date(isoString).getTime() + offsetHours * 3600 * 1000;
  return new Date(instant).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  });
}

// sunRise/sunSet/moonRise/moonSet are bare "HH:MM" UTC strings with no ISO
// field of their own — reconstruct one from the separate "YYYYMMDD" date
// field so the same shift logic can apply. Empty string means the event
// doesn't occur that day (polar regions).
function shiftedHHMM(dateYYYYMMDD, hhmm, offsetHours) {
  if (!hhmm) return "—";
  const iso = `${dateYYYYMMDD.slice(0, 4)}-${dateYYYYMMDD.slice(4, 6)}-${dateYYYYMMDD.slice(6, 8)}T${hhmm}:00Z`;
  return shiftedTimeLabel(iso, offsetHours);
}

// Declared ahead of the map setup (and the bite-times import below) because
// selectPoint's guard reads it on every click, including clicks that land
// before the import has settled.
let calculateSolunarPeriods = null;

// Tracks the most recently selected point so the output panel can be
// refreshed with real data once the bite-times import resolves, without
// forcing the view back to the first preset if the visitor already clicked
// elsewhere while the import was still in flight.
let currentSelection = null;

function selectPoint(lat, lon, name) {
  currentSelection = { lat, lon, name };
  if (!calculateSolunarPeriods) {
    outputEl.innerHTML = `<p class="output-error">Couldn't load the calculator — try refreshing.</p>`;
    return;
  }

  const data = calculateSolunarPeriods(lat, lon, new Date());
  const offsetHours = Math.round(lon / 15);
  const period = (p) =>
    `${shiftedTimeLabel(p.startISO, offsetHours)}–${shiftedTimeLabel(p.endISO, offsetHours)}`;
  const filled = Math.round(data.dayRating);

  outputEl.innerHTML = `
    <p class="output-loc">${name ? name.toUpperCase() + " · " : ""}${lat.toFixed(2)}°, ${lon.toFixed(2)}°</p>
    <p class="output-rating">${"★".repeat(filled)}${"☆".repeat(5 - filled)} ${data.dayRating} <span>${data.dayRatingLabel}</span></p>
    <div class="output-grid">
      <div><b>Moon phase</b>${data.moonPhase} ${data.moonIllumination}%</div>
      <div><b>Tide</b>${data.tideType} (${data.tideStrength})</div>
      <div><b>Sun</b>${shiftedHHMM(data.date, data.sunRise, offsetHours)} → ${shiftedHHMM(data.date, data.sunSet, offsetHours)}</div>
      <div><b>Moon</b>${shiftedHHMM(data.date, data.moonRise, offsetHours)} → ${shiftedHHMM(data.date, data.moonSet, offsetHours)}</div>
      <div><b>Major</b>${data.majorPeriods.map(period).join(", ")}</div>
      <div><b>Minor</b>${data.minorPeriods.map(period).join(", ")}</div>
    </div>
    <p class="output-note">Times are approximate local time, estimated from longitude — not real timezone boundaries or daylight saving.</p>
  `;

  saveLocation({ lat, lon, name });
}

const map = L.map("map", { worldCopyJump: true }).setView([20, 10], 2);

L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
  attribution:
    '&copy; <a href="https://carto.com/attributions">CARTO</a>, &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  subdomains: "abcd",
  maxZoom: 19,
}).addTo(map);

const goldIcon = L.divIcon({
  className: "",
  html: '<div class="pin pin-gold"></div>',
  iconSize: [14, 14],
  iconAnchor: [7, 14],
});
const redIcon = L.divIcon({
  className: "",
  html: '<div class="pin pin-red"></div>',
  iconSize: [16, 16],
  iconAnchor: [8, 16],
});

let selectedMarker = null;
function markSelected(lat, lon) {
  if (selectedMarker) map.removeLayer(selectedMarker);
  selectedMarker = L.marker([lat, lon], { icon: redIcon }).addTo(map);
}

// Used to jump to a location the visitor didn't navigate to themselves
// (search results, geolocation, restoring a saved spot) — unlike preset/
// map clicks, the map view needs to move since the point may be far from
// wherever the map currently happens to be centered.
function goToPoint(lat, lon, name) {
  map.setView([lat, lon], 9);
  markSelected(lat, lon);
  selectPoint(lat, lon, name);
}

PRESETS.forEach((p) => {
  L.marker([p.lat, p.lon], { icon: goldIcon })
    .addTo(map)
    .bindPopup(p.name)
    .on("click", () => {
      markSelected(p.lat, p.lon);
      selectPoint(p.lat, p.lon, p.name);
    });
});

map.on("click", (e) => {
  const lon = normalizeLon(e.latlng.lng);
  markSelected(e.latlng.lat, lon);
  selectPoint(e.latlng.lat, lon);
});

const savedLocation = loadLocation();
if (savedLocation) {
  goToPoint(savedLocation.lat, savedLocation.lon, savedLocation.name);
} else {
  markSelected(PRESETS[0].lat, PRESETS[0].lon);
  selectPoint(PRESETS[0].lat, PRESETS[0].lon, PRESETS[0].name);
}

// Loaded after the map is fully interactive so a slow or hanging esm.sh
// request never blocks the map from rendering. Pinned to the version this
// page's rendering code was written against (dayRating, tideStrength, etc.),
// matching the version pin already used for Leaflet above.
try {
  ({ calculateSolunarPeriods } = await import("https://esm.sh/bite-times@1.1.0"));
  // The import may resolve after the visitor has already clicked around
  // (or after the initial PRESETS[0] render above showed the error state
  // because it ran before the import even started) — refresh whatever is
  // currently selected now that real data is available.
  if (currentSelection) {
    selectPoint(currentSelection.lat, currentSelection.lon, currentSelection.name);
  }
} catch (err) {
  console.error("Failed to load bite-times calculator:", err);
}
