const STORAGE_KEY = "bite-times:last-location";

export function saveLocation({ lat, lon, name }) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ lat, lon, name }));
  } catch {
    // localStorage can throw (private browsing, disabled storage, quota) —
    // persistence is a nice-to-have, fail silently.
  }
}

export function loadLocation() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed.lat !== "number" || typeof parsed.lon !== "number") return null;
    return parsed;
  } catch {
    return null;
  }
}
