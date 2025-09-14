import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds BRIN index for large time-series scan efficiency and (optional) materialized view for session/application daily usage.
 * Safe to run repeatedly due to IF NOT EXISTS guards (MV refresh left to application code / ops scheduling).
 */
export class AddAuditBrinAndSessionMV1760000002000 implements MigrationInterface {
  name = 'AddAuditBrinAndSessionMV1760000002000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // BRIN index suited for append-only chronological audit_logs growth
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS audit_logs_createdat_brin_idx ON audit_logs USING BRIN ("createdAt") WITH (pages_per_range = 16)'
    );

    // Materialized View (idempotent create). Using COALESCE placeholder for null session/application.
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
    await queryRunner.query('DROP INDEX IF EXISTS mv_session_app_daily_usage_app_date_idx');
    await queryRunner.query('DROP INDEX IF EXISTS mv_session_app_daily_usage_session_date_idx');
    await queryRunner.query('DROP MATERIALIZED VIEW IF EXISTS mv_session_application_daily_usage');
    await queryRunner.query('DROP INDEX IF EXISTS audit_logs_createdat_brin_idx');
  }
}
