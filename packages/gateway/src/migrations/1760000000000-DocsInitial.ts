import { MigrationInterface, QueryRunner } from 'typeorm';

export class DocsInitial1760000000000 implements MigrationInterface {
  name = 'DocsInitial1760000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS docs_categories (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        slug varchar(120) UNIQUE NOT NULL,
        name varchar(160) NOT NULL,
        order_index int DEFAULT 0,
        created_at timestamptz DEFAULT now(),
        updated_at timestamptz DEFAULT now()
      );
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS docs_documents (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        slug varchar(160) UNIQUE NOT NULL,
        title varchar(200) NOT NULL,
        category_id uuid REFERENCES docs_categories(id) ON DELETE SET NULL,
        tags text[] DEFAULT '{}',
        status varchar(32) DEFAULT 'ACTIVE',
        primary_revision_id uuid NULL,
        created_at timestamptz DEFAULT now(),
        updated_at timestamptz DEFAULT now()
      );
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS docs_document_revisions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        document_id uuid NOT NULL REFERENCES docs_documents(id) ON DELETE CASCADE,
        version int NOT NULL,
        state varchar(32) NOT NULL,
        mdx_raw text NOT NULL,
        frontmatter_json jsonb NULL,
        headings jsonb NULL,
        created_by varchar(64) NOT NULL,
        published_at timestamptz NULL,
        created_at timestamptz DEFAULT now(),
        updated_at timestamptz DEFAULT now()
      );
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS docs_embedding_chunks (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        doc_slug varchar(160) NOT NULL,
        anchor varchar(120),
        content_text text,
        meta jsonb,
        position int DEFAULT 0,
        source varchar(32) DEFAULT 'DOC',
        content_hash varchar(128),
        token_count int,
        embedding jsonb,
        created_at timestamptz DEFAULT now(),
        updated_at timestamptz DEFAULT now()
      );
    `);
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS docs_embedding_chunks_doc_slug_idx ON docs_embedding_chunks(doc_slug);'
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS docs_embedding_chunks');
    await queryRunner.query('DROP TABLE IF EXISTS docs_document_revisions');
    await queryRunner.query('DROP TABLE IF EXISTS docs_documents');
    await queryRunner.query('DROP TABLE IF EXISTS docs_categories');
  }
}
