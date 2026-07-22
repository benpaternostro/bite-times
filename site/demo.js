const PRESETS = [
  { name: "Sydney", lat: -33.8568, lon: 151.2153 },
  { name: "Tokyo", lat: 35.6762, lon: 139.6503 },
  { name: "London", lat: 51.5072, lon: -0.1276 },
  { name: "San Francisco", lat: 37.7749, lon: -122.4194 },
];

function normalizeLon(lon) {
  return ((lon + 180) % 360 + 360) % 360 - 180;
}

// Replaced with real calculation + rendering in Task 3.
function selectPoint(lat, lon, name) {
  console.log("selected:", name || "(custom)", lat, lon);
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

// Select Sydney by default so the map isn't empty on load.
markSelected(PRESETS[0].lat, PRESETS[0].lon);
selectPoint(PRESETS[0].lat, PRESETS[0].lon, PRESETS[0].name);
