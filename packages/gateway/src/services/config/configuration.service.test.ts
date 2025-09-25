import assert from 'node:assert';
import { after, before, beforeEach, describe, it } from 'node:test';
import { TestDatabaseManager } from '../../test/test-utils';
import { ConfigurationService } from './configuration.service';

// NOTE: This test relies on an initialized TypeORM dataSource in test environment.
// If dataSource is not initialized in the broader test suite bootstrap, this test may need adjustment/mocking.

describe.skip('ConfigurationService public documentation mode', () => {
  before(async () => {
    await TestDatabaseManager.setupDatabase();
  });

  after(async () => {
    await TestDatabaseManager.teardownDatabase();
  });

  beforeEach(async () => {
    await TestDatabaseManager.clearDatabase();
  });
  let service: ConfigurationService;

  beforeEach(async () => {
    // Ensure repository re-fetch (fresh instance)
    service = new ConfigurationService();
  });

  it('defaults to disabled when nothing set', async () => {
    const mode = await service.getPublicDocumentationMode();
    assert.strictEqual(mode, 'disabled');
  });

  it('respects legacy boolean setter and syncs mode', async () => {
    await service.setPublicDocumentationEnabled(true);
    const enabled = await service.isPublicDocumentationEnabled();
    assert.strictEqual(enabled, true);
    const mode = await service.getPublicDocumentationMode();
    assert.strictEqual(mode, 'enabled');
  });

  it('persists explicit mode changes', async () => {
    await service.setPublicDocumentationMode('preview');
    const mode = await service.getPublicDocumentationMode();
    assert.strictEqual(mode, 'preview');
    const enabled = await service.isPublicDocumentationEnabled();
    assert.strictEqual(enabled, false); // preview is not fully enabled
  });
});
