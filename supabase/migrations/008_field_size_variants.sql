-- Add futsal and 3v3 as valid field_size values. Soccer fields in the GTA
-- include both indoor futsal courts and small-side 3v3 boxes that didn't
-- fit the existing 5v5/7v7/11v11 enum. Additive change — no existing rows
-- need migration.
--
-- ALTER TYPE ... ADD VALUE must be its own transaction in Postgres, so do
-- not wrap this in BEGIN/COMMIT. Idempotent via `if not exists`.

alter type field_size add value if not exists 'futsal';
alter type field_size add value if not exists '3v3';
