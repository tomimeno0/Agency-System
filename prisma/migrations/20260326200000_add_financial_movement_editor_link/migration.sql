-- AlterTable
ALTER TABLE "FinancialMovement"
ADD COLUMN IF NOT EXISTS "editorId" TEXT;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "FinancialMovement_editorId_idx" ON "FinancialMovement"("editorId");

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'FinancialMovement_editorId_fkey'
  ) THEN
    ALTER TABLE "FinancialMovement"
    ADD CONSTRAINT "FinancialMovement_editorId_fkey"
    FOREIGN KEY ("editorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
