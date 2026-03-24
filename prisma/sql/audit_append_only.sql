-- Run this after your initial Prisma migration to enforce append-only behavior.

CREATE OR REPLACE FUNCTION forbid_audit_log_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'AuditLog is append-only. Operation % is not allowed.', TG_OP;
END;
$$;

DROP TRIGGER IF EXISTS audit_log_no_update_delete ON "AuditLog";

CREATE TRIGGER audit_log_no_update_delete
BEFORE UPDATE OR DELETE ON "AuditLog"
FOR EACH ROW
EXECUTE FUNCTION forbid_audit_log_mutation();
