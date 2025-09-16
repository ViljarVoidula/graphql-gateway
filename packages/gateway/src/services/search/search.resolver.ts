import { Arg, Field, ObjectType, Query, Resolver } from 'type-graphql';
import { Service } from 'typedi';
import { dataSource } from '../../db/datasource';

@ObjectType()
class SearchResult {
  @Field()
  docSlug!: string;
  @Field({ nullable: true })
  anchor?: string;
  @Field()
  snippet!: string;
  @Field()
  score!: number;
}

@Service()
@Resolver()
export class DocsSearchResolver {
  @Query(() => [SearchResult])
  async docsSearch(@Arg('q') q: string): Promise<SearchResult[]> {
    if (!q.trim()) return [];
    // Fallback lexical search over docs_embedding_chunks content_text
    const rows = await dataSource.query(
      `SELECT doc_slug, anchor, substr(content_text,1,180) snippet
       FROM docs_embedding_chunks
       WHERE content_text ILIKE $1
       ORDER BY updated_at DESC
       LIMIT 10`,
      ['%' + q + '%']
    );
    return rows.map((r: any, i: number) => ({
      docSlug: r.doc_slug,
      anchor: r.anchor,
      snippet: r.snippet,
      score: 1 - i * 0.05
    }));
  }
}
