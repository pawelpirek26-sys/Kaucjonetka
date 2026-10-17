import type { Db } from './types';

// Append-only list; index + 1 is the schema version stored in PRAGMA user_version.
const MIGRATIONS: string[] = [
  `
  create table stores_cache (
    id            integer primary key,          -- public.stores.id on the server
    name          text,
    brand         text,
    lat           real not null,
    lon           real not null,
    street        text,
    housenumber   text,
    city          text,
    machine_count integer not null default 0,
    machine_id    integer,
    updated_at    text not null
  );

  create table coupons (
    id            text primary key,             -- uuid, same id as the cloud backup
    amount_grosze integer not null check (amount_grosze >= 0),
    issued_on     text,
    expires_on    text,                         -- last day the coupon can be redeemed
    barcode       text,
    barcode_type  text,
    store_id      integer references stores_cache (id),
    status        text not null default 'active' check (status in ('active', 'redeemed', 'expired')),
    redeemed_at   text,
    note          text,
    photo_uri     text,                         -- local file
    photo_path    text,                         -- object path in the backup bucket
    ocr_text      text,
    created_at    text not null,
    updated_at    text not null,
    deleted_at    text,
    dirty         integer not null default 1,   -- changed since the last backup push
    synced_at     text
  );
  create index coupons_status_idx on coupons (status, expires_on);
  create index coupons_store_idx on coupons (store_id);

  create table kv (
    key   text primary key,
    value text not null
  );

  create table geofence_state (
    store_id                 integer primary key,
    entered_at               text,
    pending_notification_id  text,
    last_notified_at         text,
    prev_notified_at         text,
    last_exit_prompt_at      text
  );
  `,
];

export const SCHEMA_VERSION = MIGRATIONS.length;

export async function migrate(db: Db): Promise<void> {
  await db.execAsync('pragma journal_mode = wal; pragma foreign_keys = on;');
  const row = await db.getFirstAsync<{ user_version: number }>('pragma user_version');
  const current = row?.user_version ?? 0;
  for (let v = current; v < MIGRATIONS.length; v++) {
    await db.withTransactionAsync(async () => {
      await db.execAsync(MIGRATIONS[v]);
      await db.execAsync(`pragma user_version = ${v + 1}`);
    });
  }
}
