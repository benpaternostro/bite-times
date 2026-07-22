const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";

export async function searchPlace(query) {
  const url = `${NOMINATIM_URL}?format=jsonv2&q=${encodeURIComponent(query)}&limit=5`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Nominatim responded with ${response.status}`);
  }
  const results = await response.json();
  return results.map((r) => ({
    name: r.display_name,
    lat: Number(r.lat),
    lon: Number(r.lon),
  }));
}
