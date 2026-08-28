-- Phase 8 admin operations indexes
CREATE INDEX IF NOT EXISTS "ImportBatch_createdAt_id_idx" ON "ImportBatch"("createdAt" DESC, "id" DESC);
CREATE INDEX IF NOT EXISTS "AuditEvent_action_result_actorAccountKind_occurredAt_id_idx" ON "AuditEvent"("action", "result", "actorAccountKind", "occurredAt" DESC, "id" DESC);
CREATE INDEX IF NOT EXISTS "AuditEvent_correlationId_occurredAt_idx" ON "AuditEvent"("correlationId", "occurredAt" DESC);
CREATE INDEX IF NOT EXISTS "Voice_severity_submittedAt_idx" ON "Voice"("severity", "submittedAt");
CREATE INDEX IF NOT EXISTS "Voice_title_displayId_idx" ON "Voice"("title", "displayId");
CREATE INDEX IF NOT EXISTS "UserAccount_username_displayName_idx" ON "UserAccount"("username", "displayName");
CREATE INDEX IF NOT EXISTS "UserAccount_createdAt_id_idx" ON "UserAccount"("createdAt" DESC, "id" DESC);
CREATE INDEX IF NOT EXISTS "OrganizationUnit_createdAt_id_idx" ON "OrganizationUnit"("createdAt" DESC, "id" DESC);
