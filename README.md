# Kaucjomat

Portfel kuponów kaucyjnych z przypomnieniem przy sklepie, mapą punktów zwrotu i zgłaszaniem awarii automatów.

- **Aplikacja:** Expo SDK 57 (React Native 0.86, TypeScript, Expo Router), dev build + EAS.
- **Na urządzeniu:** `expo-sqlite` (portfel), `expo-camera` (zdjęcie i kod kreskowy), ML Kit Text Recognition (`@infinitered/react-native-mlkit-text-recognition`, OCR na urządzeniu), `expo-location` + `expo-task-manager` (geofencing), `expo-notifications` (lokalne powiadomienia), `@maplibre/maplibre-react-native` z kaflami OpenFreeMap.
- **Backend:** Supabase: Postgres + PostGIS, Auth (magic link, Google, Apple), Storage, Edge Functions, pg_cron + pg_net, Vault.

## Struktura

```
src/app/                 ekrany (Expo Router): portfel, mapa, ustawienia, kupon, punkt, zgłoszenie
src/lib/db/              SQLite: migracje i repozytoria (kupony, cache sklepów, ustawienia, stan geofence)
src/lib/ocr/             parser tekstu kuponu + OCR/kod kreskowy ze zdjęcia
src/lib/geofence/        plan regionów, polityka wejścia/wyjścia, task w tle, menedżer
src/lib/notifications/   kanały, akcje, przypomnienia o ważności
src/lib/sync/            opcjonalna kopia zapasowa w Supabase
src/lib/api.ts           RPC Supabase + komunikaty błędów po polsku
supabase/migrations/     schemat, RLS, RPC, triggery, import OSM, cron
supabase/functions/      Edge Function import-osm (+ kod współdzielony z testami)
supabase/tests/database/ testy pgTAP
tests/                   fixture Overpass, atrapa Overpass, testy integracyjne
```

## Uruchomienie lokalne

Wymagania: Node 22, Docker, Android Studio lub Xcode (dev build; Expo Go nie zadziała z ML Kit, MapLibre ani geofencingiem).

```bash
npm install
npx supabase start                 # lokalny stack: Postgres+PostGIS, Auth, Storage, Edge Functions
npm run db:reset                   # migracje od zera
cp .env.example .env               # wpisz API_URL i PUBLISHABLE_KEY z `npx supabase status`
cp supabase/functions/.env.example supabase/functions/.env   # sekret importu (lokalnie)
npx expo run:android               # lub: npx eas-cli build --profile development
```

Na fizycznym telefonie `EXPO_PUBLIC_SUPABASE_URL` musi wskazywać adres komputera w sieci LAN (nie `127.0.0.1`).

## Testy i weryfikacja

| Polecenie | Co sprawdza |
| --- | --- |
| `npm test` | Jest: parser OCR, kwoty/daty, repozytoria SQLite (na `node:sqlite`), geofencing (plan, polityka, przepływ zdarzeń), przypomnienia, dane mapy, parser Overpass |
| `npm run db:test` | pgTAP: schemat, GiST, RLS kuponów i profili, RPC (200 m, limity), trigger statusu, wygaszanie po 6 h, import OSM |
| `npm run test:integration` | prawdziwy kod aplikacji kontra lokalny Supabase: kopia zapasowa (2 urządzenia), mapa z filtrami, zgłoszenia i potwierdzenia |
| `npm run typecheck`, `npm run lint` | TypeScript, ESLint (eslint-config-expo) |
| `npx expo export`, `npx expo prebuild --no-install` | bundle Metro i generowanie projektów natywnych |

Import OSM end-to-end lokalnie (bez dostępu do Overpass): `node tests/mock-overpass.mjs tests/fixtures/overpass-sample.json`, w `supabase/functions/.env` ustaw `OVERPASS_URL=http://host.docker.internal:54399/api/interpreter` (zapytanie wysyła kontener bazy przez pg_net), a potem `curl -X POST http://127.0.0.1:54321/functions/v1/import-osm -H "x-import-secret: $OSM_IMPORT_SECRET" -d '{"region":"PL-MZ","wait":true}'`.

## Wdrożenie na nowy projekt Supabase

Najszybciej: `npx supabase login`, potem `scripts/deploy-supabase.sh <project-ref>` (bez Dockera). Skrypt robi kroki 1–3 i wypisuje SQL do kroku 4. Ręcznie:

1. Utwórz projekt (region `eu-central-1`) i powiąż go: `npx supabase link --project-ref <ref>`.
2. Migracje: `npx supabase db push`.
3. Funkcja importu i jej sekret:
   ```bash
   npx supabase functions deploy import-osm --no-verify-jwt
   npx supabase secrets set OSM_IMPORT_SECRET=$(openssl rand -hex 24)
   ```
4. Sekrety dla crona (SQL editor, wartości tylko w Vault, nie w repo):
   ```sql
   select vault.create_secret('https://<ref>.supabase.co/functions/v1', 'kaucjomat_functions_url');
   select vault.create_secret('<ten sam OSM_IMPORT_SECRET>', 'kaucjomat_osm_import_secret');
   ```
   pg_cron co 5 min między 01:00 a 03:55 UTC uruchamia import kolejnego województwa, którego dane są starsze niż 6 dni. Każde województwo odświeża się więc raz w tygodniu, a błędy są ponawiane po 30 min. Pierwszy import możesz wywołać od razu: `select public.osm_import_next_region();` (raz na województwo). Stan importu: `select * from osm_import_regions;`.
5. Auth → URL Configuration: dodaj `kaucjomat://auth/callback` do Redirect URLs. Providers: Google (OAuth client z Google Cloud) i Apple (Services ID + klucz z Apple Developer). W produkcji własny SMTP dla magic linków.
6. Zmienne aplikacji w EAS (to klucz publikowalny, ale i tak trzymamy go poza repo):
   ```bash
   npx eas-cli env:create --name EXPO_PUBLIC_SUPABASE_URL --value https://<ref>.supabase.co --environment production
   npx eas-cli env:create --name EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY --value sb_publishable_... --environment production
   ```

## Najważniejsze decyzje

- **Portfel lokalnie.** Kupony są w SQLite. Kopia w Supabase (tabela `coupons` i prywatny bucket `coupon-photos`) działa tylko po zalogowaniu i włączeniu backupu. Synchronizacja: wypychanie zmian z flagą „dirty”, pobieranie po `updated_at`, rozstrzyganie konfliktów po czasie klienta, usunięcia przez tombstone.
- **Geofencing tylko opt-in.** Wymaga ekranu wyjaśniającego, a aplikacja działa bez niego. Monitorujemy 20 najbliższych sklepów z aktywnymi kuponami (na iOS 19, bo system pozwala na 20 regionów, a jeden zajmuje region odświeżania). Wyjście z regionu odświeżania przelicza listę bez ciągłego śledzenia lokalizacji. **Dwell:** przy wejściu planowane jest powiadomienie za 60–120 s, a wyjście przed tym czasem je anuluje. Do tego cooldown 12 h na sklep, godziny ciszy i pytanie po wyjściu ze sklepu z automatem.
- **Status automatu.** Liczy się najnowsze zgłoszenie, którego społeczność nie obaliła (1 + „nadal” − „już nie” > 0). Jest świeże przez 6 h od zgłoszenia lub ostatniego „nadal”, potem pinezka szarzeje. Kolory: `ok` zielony; `queue` i `rejects` żółty; `full`, `no_print` i `off` czerwony. Tabelę `machine_status` zapisują wyłącznie triggery.
- **Zgłoszenia** przechodzą przez RPC `report_machine` i `vote_report`: promień 200 m, 10 zgłoszeń i 30 potwierdzeń na godzinę, blokada duplikatów i głosowania na własne zgłoszenie. Brakujący automat w znanym sklepie (`submit_point`) trafia na mapę automatycznie, gdy zgłoszą go 2 różne osoby w ciągu 30 dni. Pozostałe zgłoszenia, w tym sklepy, które już mają automat, czekają na moderację (`review_point_submission`, service role).
- **Import OSM:** `shop=supermarket|convenience` z `brand` oraz `vending=bottle_return` lub `recycling_type=reverse_vending_machine`, dzielony na 16 województw. Zapytanie buduje i parsuje Edge Function, ale samo żądanie HTTP wysyła baza przez pg_net (`osm_overpass_request`/`osm_overpass_response`), bo overpass-api.de odrzuca IP Edge Functions. Serwery Overpass: `OVERPASS_URL` (lista po przecinku, domyślnie overpass-api.de, potem overpass.private.coffee), 429/5xx ponawiane raz. Automat jest przypisywany do najbliższego sklepu w promieniu 150 m (supermarkety mają 50 m przewagi). Punkty niewidziane przez 15 dni są ukrywane.

## Prywatność

Lokalizacja nie jest zapisywana na serwerze. Przy zgłoszeniu wysyłana jest jednorazowo, a w bazie zostaje tylko odległość od automatu. OCR działa na urządzeniu.

## Licencje danych

Sklepy i automaty: © współtwórcy [OpenStreetMap](https://www.openstreetmap.org/copyright), ODbL 1.0. Mapa: [OpenFreeMap](https://openfreemap.org), © OpenMapTiles, dane OSM. Atrybucja jest widoczna na mapie, na karcie punktu i w ustawieniach.
