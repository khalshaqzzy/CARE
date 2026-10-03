-- CreateEnum
CREATE TYPE "MessageKind" AS ENUM ('USER', 'SYSTEM');

-- AlterTable
ALTER TABLE "Message" ADD COLUMN "kind" "MessageKind" NOT NULL DEFAULT 'USER';
