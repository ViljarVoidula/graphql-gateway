import { MigrationInterface, QueryRunner } from 'typeorm';

export class ChangeAuditSessionIdType1762400000001 implements MigrationInterface {
  name = 'ChangeAuditSessionIdType1762400000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Drop dependent materialized view before altering the column type
    await queryRunner.query('DROP MATERIALIZED VIEW IF EXISTS mv_session_application_daily_usage');

    // Ensure column exists before altering
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'audit_logs' AND column_name = 'sessionId'
        ) THEN
          ALTER TABLE "audit_logs"
            ALTER COLUMN "sessionId" TYPE varchar(128)
            USING "sessionId"::text;
        END IF;
      END$$;
    `);

    // Recreate materialized view and indexes (same definition as in AddAuditBrinAndSessionMV)
    await queryRunner.query(`CREATE MATERIALIZED VIEW IF NOT EXISTS mv_session_application_daily_usage AS
      SELECT 
        COALESCE("sessionId"::text, 'none') AS session_id,
        COALESCE("applicationId"::text, 'none') AS application_id,
        date_trunc('day', "createdAt")::date AS usage_date,
        COUNT(*) AS request_count,
        COUNT(*) FILTER (WHERE success = false) AS error_count,
        COUNT(DISTINCT (metadata->>'operationName')) AS distinct_operations,
        MIN("createdAt") AS first_seen_at,
        MAX("createdAt") AS last_seen_at
      FROM audit_logs
      WHERE "eventType" = 'api_request'
      GROUP BY 1,2,3`);

    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS mv_session_app_daily_usage_session_date_idx ON mv_session_application_daily_usage (session_id, usage_date DESC)'
    );
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS mv_session_app_daily_usage_app_date_idx ON mv_session_application_daily_usage (application_id, usage_date DESC)'
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop MV first as it depends on the column
    await queryRunner.query('DROP MATERIALIZED VIEW IF EXISTS mv_session_application_daily_usage');

    // Revert back to uuid if needed; invalid UUID strings will become NULL safely
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'audit_logs' AND column_name = 'sessionId'
        ) THEN
          ALTER TABLE "audit_logs"
            ALTER COLUMN "sessionId" TYPE uuid
            USING (
              CASE
                WHEN "sessionId" ~* '^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'
                THEN "sessionId"::uuid
                ELSE NULL
              END
            );
        END IF;
      END$$;
    `);

    // Recreate MV (definition works for either uuid or varchar sessionId due to ::text cast)
    await queryRunner.query(`CREATE MATERIALIZED VIEW IF NOT EXISTS mv_session_application_daily_usage AS
      SELECT 
        COALESCE("sessionId"::text, 'none') AS session_id,
        COALESCE("applicationId"::text, 'none') AS application_id,
        date_trunc('day', "createdAt")::date AS usage_date,
        COUNT(*) AS request_count,
        COUNT(*) FILTER (WHERE success = false) AS error_count,
        COUNT(DISTINCT (metadata->>'operationName')) AS distinct_operations,
        MIN("createdAt") AS first_seen_at,
        MAX("createdAt") AS last_seen_at
      FROM audit_logs
      WHERE "eventType" = 'api_request'
      GROUP BY 1,2,3`);

    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS mv_session_app_daily_usage_session_date_idx ON mv_session_application_daily_usage (session_id, usage_date DESC)'
    );
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS mv_session_app_daily_usage_app_date_idx ON mv_session_application_daily_usage (application_id, usage_date DESC)'
    );
  }
}
