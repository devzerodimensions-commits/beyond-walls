-- A packing-desk role: the order list, and printing an invoice or a receipt.
--
-- Postgres 12 and later allow ALTER TYPE ... ADD VALUE inside a transaction,
-- which is how Prisma runs a migration, provided the new value is not *used*
-- in the same transaction. Nothing below uses it, so this is safe; a later
-- migration or a running server is what will first write it.
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'PARCEL_MANAGER';
