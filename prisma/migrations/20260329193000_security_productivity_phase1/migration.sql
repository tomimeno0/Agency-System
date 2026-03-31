ALTER TABLE "User"
ADD COLUMN IF NOT EXISTS "sessionVersion" INTEGER NOT NULL DEFAULT 1;

CREATE TABLE IF NOT EXISTS "TwoFactorChallenge" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "emailSnapshot" TEXT NOT NULL,
  "codeHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "maxAttempts" INTEGER NOT NULL DEFAULT 5,
  "resendCount" INTEGER NOT NULL DEFAULT 0,
  "verifiedAt" TIMESTAMP(3),
  "usedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TwoFactorChallenge_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "TwoFactorChallenge_userId_createdAt_idx"
  ON "TwoFactorChallenge"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "TwoFactorChallenge_expiresAt_idx"
  ON "TwoFactorChallenge"("expiresAt");

ALTER TABLE "TwoFactorChallenge"
  ADD CONSTRAINT "TwoFactorChallenge_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "TaskChangeLog" (
  "id" TEXT NOT NULL,
  "taskId" TEXT NOT NULL,
  "changedById" TEXT NOT NULL,
  "beforeJson" JSONB NOT NULL,
  "afterJson" JSONB NOT NULL,
  "changedFields" TEXT[] NOT NULL,
  "requiresAck" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TaskChangeLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "TaskChangeLog_taskId_createdAt_idx"
  ON "TaskChangeLog"("taskId", "createdAt");

ALTER TABLE "TaskChangeLog"
  ADD CONSTRAINT "TaskChangeLog_taskId_fkey"
  FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TaskChangeLog"
  ADD CONSTRAINT "TaskChangeLog_changedById_fkey"
  FOREIGN KEY ("changedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "TaskChangeAck" (
  "id" TEXT NOT NULL,
  "changeLogId" TEXT NOT NULL,
  "editorId" TEXT NOT NULL,
  "acknowledgedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TaskChangeAck_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "TaskChangeAck_changeLogId_editorId_key"
  ON "TaskChangeAck"("changeLogId", "editorId");
CREATE INDEX IF NOT EXISTS "TaskChangeAck_editorId_acknowledgedAt_idx"
  ON "TaskChangeAck"("editorId", "acknowledgedAt");

ALTER TABLE "TaskChangeAck"
  ADD CONSTRAINT "TaskChangeAck_changeLogId_fkey"
  FOREIGN KEY ("changeLogId") REFERENCES "TaskChangeLog"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TaskChangeAck"
  ADD CONSTRAINT "TaskChangeAck_editorId_fkey"
  FOREIGN KEY ("editorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
