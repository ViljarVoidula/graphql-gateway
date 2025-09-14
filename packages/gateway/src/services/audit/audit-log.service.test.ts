import assert from 'node:assert/strict';
import { test } from 'node:test';
import 'reflect-metadata';
import { AuditCategory, AuditEventType, AuditSeverity } from '../../entities/audit-log.entity';
import { describeWithDatabase } from '../../test/test-utils';
import { AuditLogService } from './audit-log.service';

describeWithDatabase('AuditLogService', () => {
  test('basic log', async () => {
    const svc = new AuditLogService();
    const result = await svc.log(AuditEventType.USER_LOGIN, {
      category: AuditCategory.AUTHENTICATION,
      severity: AuditSeverity.INFO,
      action: 'login',
      success: true,
      ipAddress: '127.0.0.1',
      userAgent: 'test-agent',
      resourceType: 'user',
      resourceId: 'dummy-user',
      riskScore: 5,
      tags: ['test']
    });
    assert.ok(result.id);
    assert.ok(result.correlationId);
  });

  test('logApiRequest severity/risk heuristics', async () => {
    const svc = new AuditLogService();
    const okReq = await svc.logApiRequest({
      serviceId: 'svc-1',
      serviceName: 'search',
      statusCode: 200,
      latencyMs: 120,
      httpMethod: 'POST',
      operationName: 'SearchProducts'
    });
    assert.equal(okReq.severity, AuditSeverity.INFO);
    const slowWarn = await svc.logApiRequest({
      serviceId: 'svc-1',
      serviceName: 'search',
      statusCode: 200,
      latencyMs: 3000,
      httpMethod: 'POST',
      operationName: 'SearchProducts'
    });
    assert.ok([AuditSeverity.MEDIUM, AuditSeverity.HIGH].includes(slowWarn.severity));
    const authFail = await svc.logApiRequest({
      serviceId: 'svc-1',
      serviceName: 'search',
      statusCode: 401,
      latencyMs: 50,
      httpMethod: 'POST',
      operationName: 'SearchProducts',
      success: false
    });
    assert.equal(authFail.severity, AuditSeverity.MEDIUM);
    const serverErr = await svc.logApiRequest({
      serviceId: 'svc-1',
      serviceName: 'search',
      statusCode: 503,
      latencyMs: 1200,
      httpMethod: 'POST',
      operationName: 'SearchProducts',
      success: false,
      errorClass: 'FetchError'
    });
    assert.equal(serverErr.severity, AuditSeverity.HIGH);
  });

  test('riskScore upper bound', async () => {
    const svc = new AuditLogService();
    const high = await svc.logApiRequest({
      serviceId: 'svc-1',
      serviceName: 'search',
      statusCode: 503,
      latencyMs: 9000,
      httpMethod: 'POST',
      success: false,
      errorClass: 'TimeoutError'
    });
    assert.ok(high.riskScore <= 100);
  });

  test('sessionId is persisted on api request log', async () => {
    const svc = new AuditLogService();
    const sessionId = 'sess-test-123';
    await svc.logApiRequest({
      serviceId: 'svc-2',
      serviceName: 'catalog',
      statusCode: 200,
      httpMethod: 'POST',
      operationName: 'ListItems',
      sessionId
    });
    // Force flush to persist
    await (svc as any).flush?.(true);
    const ds = (await import('../../db/datasource')).dataSource;
    const rows = await ds.query(`SELECT "sessionId" FROM audit_logs WHERE "sessionId" = $1 ORDER BY "createdAt" DESC LIMIT 1`, [
      sessionId
    ]);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].sessionId, sessionId);
  });
});
