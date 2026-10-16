-- AlterEnum
-- Kept alone: a new enum value cannot be used in the transaction that adds it.
ALTER TYPE "AccountKind" ADD VALUE 'DIVISION_ADMIN';
