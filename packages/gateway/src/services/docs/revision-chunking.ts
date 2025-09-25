import crypto from 'crypto';
import { dataSource } from '../../db/datasource';
import { DocEmbeddingChunk } from '../../entities/docs/embedding-chunk.entity';
import { DocRevision } from '../../entities/docs/revision.entity';

export async function chunkAndStoreRevision(
  rev: DocRevision,
  docSlugOverride?: string
): Promise<number> {
  const repo = dataSource.getRepository(DocEmbeddingChunk);
  // Simple paragraph split for placeholder
  const paragraphs = rev.mdxRaw
    .split(/\n\n+/)
    .map((p) => p.trim())
    .filter(Boolean)
    .slice(0, 50);
  // Remove old chunks for this doc slug
  const docSlug = docSlugOverride || rev.document?.slug;
  if (!docSlug) {
    throw new Error('chunkAndStoreRevision: missing document slug');
  }
  await repo.delete({ docSlug });
  let pos = 0;
  for (const p of paragraphs) {
    const chunk = repo.create({
      docSlug,
      anchor: undefined,
      contentText: p.slice(0, 1000),
      position: pos++,
      source: 'DOC',
      contentHash: crypto.createHash('sha1').update(p).digest('hex'),
      tokenCount: Math.ceil(p.length / 4),
    });
    await repo.save(chunk);
  }
  return paragraphs.length;
}
