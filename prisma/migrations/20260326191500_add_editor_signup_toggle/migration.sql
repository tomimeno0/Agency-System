-- AlterTable
ALTER TABLE "SystemConfig"
ADD COLUMN IF NOT EXISTS "editorSignupOpen" BOOLEAN NOT NULL DEFAULT true;