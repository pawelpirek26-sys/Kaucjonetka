// Polish voivodeships used to split the weekly OSM import into small Overpass queries.
// `code` is the current ISO 3166-2 code; `legacyCode` is the pre-2018 numeric one, which
// some OSM boundary relations still carry. Keep in sync with public.osm_import_regions.
export type ImportRegion = { code: string; legacyCode: string; name: string };

export const IMPORT_REGIONS: readonly ImportRegion[] = [
  { code: 'PL-DS', legacyCode: 'PL-02', name: 'województwo dolnośląskie' },
  { code: 'PL-KP', legacyCode: 'PL-04', name: 'województwo kujawsko-pomorskie' },
  { code: 'PL-LU', legacyCode: 'PL-06', name: 'województwo lubelskie' },
  { code: 'PL-LB', legacyCode: 'PL-08', name: 'województwo lubuskie' },
  { code: 'PL-LD', legacyCode: 'PL-10', name: 'województwo łódzkie' },
  { code: 'PL-MA', legacyCode: 'PL-12', name: 'województwo małopolskie' },
  { code: 'PL-MZ', legacyCode: 'PL-14', name: 'województwo mazowieckie' },
  { code: 'PL-OP', legacyCode: 'PL-16', name: 'województwo opolskie' },
  { code: 'PL-PK', legacyCode: 'PL-18', name: 'województwo podkarpackie' },
  { code: 'PL-PD', legacyCode: 'PL-20', name: 'województwo podlaskie' },
  { code: 'PL-PM', legacyCode: 'PL-22', name: 'województwo pomorskie' },
  { code: 'PL-SL', legacyCode: 'PL-24', name: 'województwo śląskie' },
  { code: 'PL-SK', legacyCode: 'PL-26', name: 'województwo świętokrzyskie' },
  { code: 'PL-WN', legacyCode: 'PL-28', name: 'województwo warmińsko-mazurskie' },
  { code: 'PL-WP', legacyCode: 'PL-30', name: 'województwo wielkopolskie' },
  { code: 'PL-ZP', legacyCode: 'PL-32', name: 'województwo zachodniopomorskie' },
];

export function findRegion(code: string): ImportRegion | undefined {
  return IMPORT_REGIONS.find((r) => r.code === code);
}
