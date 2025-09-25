// Use relative import to work with ts-node without path alias mapping issues
import {
  Arg,
  Field,
  ID,
  InputType,
  Mutation,
  ObjectType,
  Query,
  Resolver,
} from 'type-graphql';
import { Service } from 'typedi';
import { dataSource } from '../../db/datasource';
import { DocDocument } from '../../entities/docs/document.entity';
import { DocEmbeddingChunk } from '../../entities/docs/embedding-chunk.entity';
import { DocRevision } from '../../entities/docs/revision.entity';
import { compileMDX } from './mdx-compile';
import { chunkAndStoreRevision } from './revision-chunking';

@ObjectType()
class DocDTO {
  @Field(() => ID)
  id!: string;
  @Field()
  slug!: string;
  @Field()
  title!: string;
}

@ObjectType()
class DocRevisionDTO {
  @Field(() => ID)
  id!: string;
  @Field()
  version!: number;
  @Field()
  state!: string;
  @Field()
  mdxRaw!: string;
}

@InputType()
class CreateDocumentInput {
  @Field()
  slug!: string;
  @Field()
  title!: string;
  @Field()
  mdxRaw!: string;
}

@InputType()
class UpdateRevisionInput {
  @Field()
  revisionId!: string;
  @Field({ nullable: true })
  mdxRaw?: string;
  @Field({ nullable: true })
  title?: string;
}

@InputType()
class UpdateDocumentInput {
  @Field()
  documentId!: string;
  @Field({ nullable: true })
  title?: string;
  @Field({ nullable: true })
  slug?: string;
}

@ObjectType()
class PublishResult {
  @Field()
  documentId!: string;
  @Field()
  revisionId!: string;
  @Field()
  chunksCreated!: number;
}

@ObjectType()
class LatestRevisionDTO {
  @Field(() => ID)
  id!: string;
  @Field()
  version!: number;
  @Field()
  state!: string;
  @Field({ nullable: true })
  mdxRaw?: string;
  @Field({ nullable: true })
  updatedAt?: Date;
  @Field({ nullable: true })
  publishedAt?: Date;
}

@ObjectType()
class PublishedDocumentDTO {
  @Field(() => ID)
  id!: string;
  @Field()
  slug!: string;
  @Field()
  title!: string;
  @Field()
  mdxContent!: string;
  @Field({ nullable: true })
  description?: string;
  @Field({ nullable: true })
  category?: string;
  @Field()
  publishedAt!: Date;
  @Field()
  version!: number;
}

@ObjectType()
class DocumentWithLatestRevision {
  @Field(() => ID)
  id!: string;
  @Field()
  slug!: string;
  @Field()
  title!: string;
  @Field()
  status!: string;
  @Field({ nullable: true })
  latestRevision?: LatestRevisionDTO;
}

@Service()
@Resolver()
export class DocsAuthoringResolver {
  private docRepo = dataSource.getRepository(DocDocument);
  private revRepo = dataSource.getRepository(DocRevision);

  @Query(() => [DocDTO])
  async docs(): Promise<DocDTO[]> {
    const docs = await this.docRepo.find();
    return docs.map((d) => ({ id: d.id, slug: d.slug, title: d.title }));
  }

  @Query(() => [DocumentWithLatestRevision])
  async docsWithLatestRevision(): Promise<DocumentWithLatestRevision[]> {
    const docs = await this.docRepo.find({ relations: { revisions: true } });
    return docs.map((d) => {
      // Find latest revision by version
      const revs = d.revisions || [];
      const latest = revs.sort((a, b) => b.version - a.version)[0];
      return {
        id: d.id,
        slug: d.slug,
        title: d.title,
        status: d.status,
        latestRevision: latest
          ? {
              id: latest.id,
              version: latest.version,
              state: latest.state,
              mdxRaw: latest.mdxRaw,
              updatedAt: latest.updatedAt,
              publishedAt: latest.publishedAt,
            }
          : undefined,
      } as DocumentWithLatestRevision;
    });
  }

  @Query(() => [PublishedDocumentDTO])
  async publishedDocs(): Promise<PublishedDocumentDTO[]> {
    // Get all active documents with their published revisions
    const docs = await this.docRepo.find({
      where: { status: 'ACTIVE' },
      relations: { revisions: true },
    });

    const publishedDocs: PublishedDocumentDTO[] = [];

    for (const doc of docs) {
      // Find the published revision (either primary or latest published)
      let publishedRevision = null;

      if (doc.primaryRevisionId) {
        // Try to find the primary revision
        publishedRevision = doc.revisions.find(
          (r) => r.id === doc.primaryRevisionId
        );
      }

      // If no primary revision found, find the latest published revision
      if (!publishedRevision) {
        publishedRevision = doc.revisions
          .filter((r) => r.state === 'PUBLISHED')
          .sort((a, b) => b.version - a.version)[0];
      }

      if (publishedRevision && publishedRevision.state === 'PUBLISHED') {
        // Extract metadata from frontmatter
        const frontmatter = publishedRevision.frontmatterJson || {};

        publishedDocs.push({
          id: doc.id,
          slug: doc.slug,
          title: frontmatter.title || doc.title,
          mdxContent: publishedRevision.mdxRaw,
          description: frontmatter.description,
          category: frontmatter.category,
          publishedAt: publishedRevision.publishedAt || new Date(),
          version: publishedRevision.version,
        });
      }
    }

    // Sort by category, then by title
    return publishedDocs.sort((a, b) => {
      if (a.category !== b.category) {
        return (a.category || 'zzz').localeCompare(b.category || 'zzz');
      }
      return a.title.localeCompare(b.title);
    });
  }

  @Query(() => PublishedDocumentDTO, { nullable: true })
  async publishedDoc(
    @Arg('slug') slug: string
  ): Promise<PublishedDocumentDTO | null> {
    const doc = await this.docRepo.findOne({
      where: { slug, status: 'ACTIVE' },
      relations: { revisions: true },
    });

    if (!doc) return null;

    // Find the published revision
    let publishedRevision = null;

    if (doc.primaryRevisionId) {
      publishedRevision = doc.revisions.find(
        (r) => r.id === doc.primaryRevisionId
      );
    }

    if (!publishedRevision) {
      publishedRevision = doc.revisions
        .filter((r) => r.state === 'PUBLISHED')
        .sort((a, b) => b.version - a.version)[0];
    }

    if (!publishedRevision || publishedRevision.state !== 'PUBLISHED') {
      return null;
    }

    const frontmatter = publishedRevision.frontmatterJson || {};

    return {
      id: doc.id,
      slug: doc.slug,
      title: frontmatter.title || doc.title,
      mdxContent: publishedRevision.mdxRaw,
      description: frontmatter.description,
      category: frontmatter.category,
      publishedAt: publishedRevision.publishedAt || new Date(),
      version: publishedRevision.version,
    };
  }

  @Query(() => DocRevisionDTO, { nullable: true })
  async revision(@Arg('id') id: string): Promise<DocRevisionDTO | null> {
    const rev = await this.revRepo.findOne({ where: { id } });
    if (!rev) return null;
    return {
      id: rev.id,
      version: rev.version,
      state: rev.state,
      mdxRaw: rev.mdxRaw,
    };
  }

  @Query(() => String)
  mdxCompilerInfo(): string {
    // If this returns 'lightweight-v1' we know the new implementation (no remark) is active.
    return 'lightweight-v1';
  }

  @Mutation(() => DocRevisionDTO)
  async createDocument(
    @Arg('input') input: CreateDocumentInput
  ): Promise<DocRevisionDTO> {
    const existing = await this.docRepo.findOne({
      where: { slug: input.slug },
    });
    if (existing) throw new Error('Slug already exists');
    const compiled = await compileMDX(input.mdxRaw);
    const doc = this.docRepo.create({
      slug: input.slug,
      title: input.title,
      tags: [],
    });
    await this.docRepo.save(doc);
    const rev = this.revRepo.create({
      document: { id: doc.id } as any,
      version: 1,
      state: 'DRAFT',
      mdxRaw: input.mdxRaw,
      frontmatterJson: compiled.frontmatter,
      headings: compiled.headings,
      createdBy: 'system',
    });
    await this.revRepo.save(rev);
    return {
      id: rev.id,
      version: rev.version,
      state: rev.state,
      mdxRaw: rev.mdxRaw,
    };
  }

  @Mutation(() => DocRevisionDTO)
  async updateRevision(
    @Arg('input') input: UpdateRevisionInput
  ): Promise<DocRevisionDTO> {
    const rev = await this.revRepo.findOne({
      where: { id: input.revisionId },
      relations: { document: true },
    });
    if (!rev) throw new Error('Revision not found');
    if (input.mdxRaw) {
      const compiled = await compileMDX(input.mdxRaw);
      // Partial update to avoid touching relations
      await this.revRepo.update(
        { id: rev.id },
        {
          mdxRaw: input.mdxRaw,
          frontmatterJson: compiled.frontmatter,
          headings: compiled.headings,
        }
      );
      // Reflect changes locally for return value
      rev.mdxRaw = input.mdxRaw;
      rev.frontmatterJson = compiled.frontmatter as any;
      rev.headings = compiled.headings as any;
    }
    if (input.title) {
      rev.document.title = input.title;
      await this.docRepo.save(rev.document);
    }
    return {
      id: rev.id,
      version: rev.version,
      state: rev.state,
      mdxRaw: rev.mdxRaw,
    };
  }

  @Mutation(() => DocDTO)
  async updateDocument(
    @Arg('input') input: UpdateDocumentInput
  ): Promise<DocDTO> {
    const doc = await this.docRepo.findOne({ where: { id: input.documentId } });
    if (!doc) throw new Error('Document not found');

    // Update slug if provided and changed
    if (input.slug && input.slug !== doc.slug) {
      const exists = await this.docRepo.findOne({
        where: { slug: input.slug },
      });
      if (exists) throw new Error('Slug already exists');
      const oldSlug = doc.slug;
      doc.slug = input.slug;
      // Update embedding chunks to new slug
      try {
        const chunkRepo = dataSource.getRepository(DocEmbeddingChunk);
        await chunkRepo
          .createQueryBuilder()
          .update(DocEmbeddingChunk)
          .set({ docSlug: input.slug })
          .where('doc_slug = :oldSlug', { oldSlug })
          .execute();
      } catch {}
    }

    // Update title if provided
    if (
      typeof input.title === 'string' &&
      input.title.length > 0 &&
      input.title !== doc.title
    ) {
      doc.title = input.title;
    }

    await this.docRepo.save(doc);
    return { id: doc.id, slug: doc.slug, title: doc.title };
  }

  @Mutation(() => PublishResult)
  async publishRevision(
    @Arg('revisionId') revisionId: string
  ): Promise<PublishResult> {
    const rev = await this.revRepo.findOne({
      where: { id: revisionId },
      relations: { document: true },
    });
    if (!rev) throw new Error('Revision not found');
    const now = new Date();
    // Partial update to avoid touching relations
    await this.revRepo.update(
      { id: rev.id },
      { state: 'PUBLISHED', publishedAt: now }
    );
    await this.docRepo.update(
      { id: rev.document.id },
      { primaryRevisionId: rev.id }
    );
    const chunksCreated = await chunkAndStoreRevision(rev, rev.document.slug);
    return { documentId: rev.document.id, revisionId: rev.id, chunksCreated };
  }

  @Mutation(() => DocRevisionDTO)
  async createDraft(
    @Arg('documentId') documentId: string
  ): Promise<DocRevisionDTO> {
    const doc = await this.docRepo.findOne({
      where: { id: documentId },
      relations: { revisions: true },
    });
    if (!doc) throw new Error('Document not found');
    // If an existing DRAFT revision exists, return it instead of creating a new one
    const existingDraft = doc.revisions.find((r) => r.state === 'DRAFT');
    if (existingDraft) {
      return {
        id: existingDraft.id,
        version: existingDraft.version,
        state: existingDraft.state,
        mdxRaw: existingDraft.mdxRaw,
      };
    }
    const latest = doc.revisions.sort((a, b) => b.version - a.version)[0];
    const base = latest || null;
    const rev = this.revRepo.create({
      document: { id: doc.id } as any,
      version: (latest?.version || 0) + 1,
      state: 'DRAFT',
      mdxRaw:
        base?.mdxRaw ||
        '---\n' +
          `title: "${doc.title.replace(/"/g, '\"')}"` +
          '\n---\n\n# ' +
          doc.title +
          '\n',
      frontmatterJson: base?.frontmatterJson || { title: doc.title },
      headings: base?.headings || [],
      createdBy: 'system',
    });
    await this.revRepo.save(rev);
    return {
      id: rev.id,
      version: rev.version,
      state: rev.state,
      mdxRaw: rev.mdxRaw,
    };
  }

  @Mutation(() => DocDTO)
  async duplicateDocument(
    @Arg('documentId') documentId: string,
    @Arg('newSlug') newSlug: string
  ): Promise<DocDTO> {
    const existingSlug = await this.docRepo.findOne({
      where: { slug: newSlug },
    });
    if (existingSlug) throw new Error('newSlug already exists');
    const doc = await this.docRepo.findOne({
      where: { id: documentId },
      relations: { revisions: true },
    });
    if (!doc) throw new Error('Document not found');
    const latest = doc.revisions.sort((a, b) => b.version - a.version)[0];
    const copy = this.docRepo.create({
      slug: newSlug,
      title: doc.title + ' Copy',
      tags: [...doc.tags],
      status: 'ACTIVE',
    });
    await this.docRepo.save(copy);
    if (latest) {
      const newRev = this.revRepo.create({
        document: { id: copy.id } as any,
        version: 1,
        state: 'DRAFT',
        mdxRaw: latest.mdxRaw,
        frontmatterJson: latest.frontmatterJson,
        headings: latest.headings,
        createdBy: 'system',
      });
      await this.revRepo.save(newRev);
    }
    return { id: copy.id, slug: copy.slug, title: copy.title };
  }

  @Mutation(() => Boolean)
  async archiveDocument(
    @Arg('documentId') documentId: string
  ): Promise<boolean> {
    const doc = await this.docRepo.findOne({ where: { id: documentId } });
    if (!doc) throw new Error('Document not found');
    if (doc.status === 'ARCHIVED') return true;
    doc.status = 'ARCHIVED';
    await this.docRepo.save(doc);
    return true;
  }

  @Mutation(() => Boolean)
  async restoreDocument(
    @Arg('documentId') documentId: string
  ): Promise<boolean> {
    const doc = await this.docRepo.findOne({ where: { id: documentId } });
    if (!doc) throw new Error('Document not found');
    if (doc.status !== 'ARCHIVED') return true;
    doc.status = 'ACTIVE';
    await this.docRepo.save(doc);
    return true;
  }

  @Mutation(() => Boolean)
  async deleteDocument(
    @Arg('documentId') documentId: string
  ): Promise<boolean> {
    // Find the document first to obtain slug for cleanup
    const doc = await this.docRepo.findOne({ where: { id: documentId } });
    if (!doc) throw new Error('Document not found');

    // Delete embedding chunks for this document slug (best-effort)
    try {
      const chunkRepo = dataSource.getRepository(DocEmbeddingChunk);
      await chunkRepo.delete({ docSlug: doc.slug });
    } catch (e) {
      // Swallow errors to ensure hard delete proceeds
    }

    // Delete the document; revisions cascade via FK ON DELETE CASCADE
    await this.docRepo.delete({ id: documentId });
    return true;
  }

  @Query(() => [String])
  async validateDocsIntegrity(): Promise<string[]> {
    const errors: string[] = [];
    // Revisions missing document_id (should not exist)
    const raw = await dataSource.query(
      `SELECT id FROM docs_document_revisions WHERE document_id IS NULL LIMIT 50`
    );
    if (raw.length) {
      errors.push(
        `Revisions with NULL document_id: ${raw.map((r: any) => r.id).join(', ')}`
      );
    }
    // Documents pointing to non-existent primary revision
    const orphanPrimary = await dataSource.query(
      `SELECT d.id, d.primary_revision_id FROM docs_documents d
       LEFT JOIN docs_document_revisions r ON r.id = d.primary_revision_id
       WHERE d.primary_revision_id IS NOT NULL AND r.id IS NULL LIMIT 50`
    );
    if (orphanPrimary.length) {
      errors.push(
        `Docs with missing primary revision: ${orphanPrimary
          .map((r: any) => r.id + '->' + r.primary_revision_id)
          .join(', ')}`
      );
    }
    return errors;
  }
}
