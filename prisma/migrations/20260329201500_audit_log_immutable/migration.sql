DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_proc
    WHERE proname = 'prevent_audit_log_mutation'
  ) THEN
    CREATE FUNCTION prevent_audit_log_mutation()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $fn$
    BEGIN
      RAISE EXCEPTION 'AuditLog is append-only';
    END;
    $fn$;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'audit_log_no_update'
  ) THEN
    CREATE TRIGGER audit_log_no_update
    BEFORE UPDATE ON "AuditLog"
    FOR EACH ROW
    EXECUTE FUNCTION prevent_audit_log_mutation();
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'audit_log_no_delete'
  ) THEN
    CREATE TRIGGER audit_log_no_delete
    BEFORE DELETE ON "AuditLog"
    FOR EACH ROW
    EXECUTE FUNCTION prevent_audit_log_mutation();
  END IF;
END $$;
