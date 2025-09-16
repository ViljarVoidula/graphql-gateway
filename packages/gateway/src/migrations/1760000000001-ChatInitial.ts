import { MigrationInterface, QueryRunner } from 'typeorm';

export class ChatInitial1760000000001 implements MigrationInterface {
  name = 'ChatInitial1760000000001';
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS chat_threads (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        created_at timestamptz DEFAULT now()
      );
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS chat_messages (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        thread_id uuid REFERENCES chat_threads(id) ON DELETE CASCADE,
        role varchar(8) NOT NULL,
        content text NOT NULL,
        citations jsonb,
        created_at timestamptz DEFAULT now()
      );
    `);
    // In case the table existed without the foreign key column (legacy dev schema), add it
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name='chat_messages' AND column_name='thread_id'
        ) THEN
          ALTER TABLE chat_messages ADD COLUMN thread_id uuid REFERENCES chat_threads(id) ON DELETE CASCADE;
        END IF;
      END$$;
    `);
    await queryRunner.query('CREATE INDEX IF NOT EXISTS chat_messages_thread_idx ON chat_messages(thread_id);');
  }
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS chat_messages');
    await queryRunner.query('DROP TABLE IF EXISTS chat_threads');
  }
}
