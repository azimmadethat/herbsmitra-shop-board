/**
 * City and Metro Grouping for Shop Board Top Cities.
 * Maps satellite towns, suburbs, and variant spellings to canonical metro names.
 * Pure in-memory dictionary lookup: no external API and no paid geocoding.
 */

function cleanCity(raw) {
  if (!raw || typeof raw !== "string") return "";
  let s = raw.trim();
  if (!s) return "";
  // Strip a trailing Urban, Rural, Metro, District, or City word before matching
  return s.replace(/\s+(urban|rural|metro|district|city)$/i, "").trim();
}

const METRO_MAP = new Map();

function addMapping(canon, aliases) {
  for (const a of aliases) {
    METRO_MAP.set(a.toLowerCase().replace(/[\s\-_]+/g, " ").trim(), canon);
  }
}

// Mumbai Metro
addMapping("Mumbai", [
  "mumbai",
  "mumbai suburban",
  "thane",
  "navi mumbai",
  "new mumbai",
  "kalyan",
  "dombivli",
  "kalyan dombivli",
  "kalyan-dombivli",
  "vasai",
  "virar",
  "vasai virar",
  "vasai-virar",
  "mira bhayandar",
  "mira-bhayandar",
  "bhiwandi",
  "ulhasnagar",
  "panvel",
  "palghar",
  "badlapur",
  "ambernath",
]);

// Pune: its own metro, never Mumbai
addMapping("Pune", ["pune"]);

// Bengaluru
addMapping("Bengaluru", ["bengaluru", "bangalore"]);

// Hyderabad
addMapping("Hyderabad", [
  "hyderabad",
  "secunderabad",
  "medchal",
  "medchal malkajgiri",
  "medchal-malkajgiri",
  "malkajgiri",
  "rangareddy",
  "ranga reddy",
]);

// Guwahati
addMapping("Guwahati", ["guwahati", "kamrup"]);

// Delhi NCR
addMapping("Delhi", [
  "delhi",
  "new delhi",
  "gurgaon",
  "gurugram",
  "noida",
  "greater noida",
  "ghaziabad",
  "faridabad",
]);

// Specific cities keeping their own canonical names
for (const city of [
  "Chennai",
  "Kolkata",
  "Ahmedabad",
  "Surat",
  "Jaipur",
  "Indore",
  "Bhopal",
  "Lucknow",
  "Kanpur",
  "Varanasi",
  "Patna",
  "Ludhiana",
]) {
  addMapping(city, [city]);
}

function toTitleCase(s) {
  return s.replace(/\w\S*/g, txt => txt.charAt(0).toUpperCase() + txt.slice(1).toLowerCase());
}

/**
 * Returns canonical metro name for a given city string.
 * - Blank or empty input counts as "Others".
 * - A town not in the list counts under its own title-cased name.
 */
export function getMetro(city) {
  if (!city || typeof city !== "string" || !city.trim()) return "Others";
  const cleaned = cleanCity(city);
  if (!cleaned) return "Others";
  const normalizedKey = cleaned.toLowerCase().replace(/[\s\-_]+/g, " ").trim();
  if (METRO_MAP.has(normalizedKey)) {
    return METRO_MAP.get(normalizedKey);
  }
  return toTitleCase(cleaned);
}
