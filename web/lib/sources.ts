/**
 * The dataset URLs a policy is read from, built exactly as the contract's
 * `_source_url` builds them (tests/sources.test.ts holds the two in step), so
 * anyone can fetch what the validators fetched.
 */
import type { Source } from "./types";

function addDays(isoDay: string, n: number): string {
  const d = new Date(`${isoDay}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function sourceUrl(source: Source, lat: string, lon: string, start: string, days: number): string {
  const end = addDays(start, days - 1);
  if (source === "OPEN_METEO") {
    return `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}&start_date=${start}`
      + `&end_date=${end}&daily=precipitation_sum&timezone=UTC`;
  }
  return "https://power.larc.nasa.gov/api/temporal/daily/point?parameters=PRECTOTCORR"
    + `&community=AG&longitude=${lon}&latitude=${lat}&start=${start.replace(/-/g, "")}&end=${end.replace(/-/g, "")}&format=JSON`;
}
