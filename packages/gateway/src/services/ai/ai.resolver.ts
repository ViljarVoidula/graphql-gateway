import OpenAI from 'openai';
import {
  Arg,
  Ctx,
  Directive,
  Field,
  InputType,
  Int,
  Mutation,
  ObjectType,
  Query,
  registerEnumType,
  Resolver,
} from 'type-graphql';
import { Container, Service } from 'typedi';
import { dataSource } from '../../db/datasource';
import { DocDocument } from '../../entities/docs/document.entity';
import { DocRevision } from '../../entities/docs/revision.entity';
import {
  Service as ServiceEntity,
  ServiceStatus,
} from '../../entities/service.entity';
import { Setting } from '../../entities/setting.entity';
import {
  decryptSecret,
  EncryptedPayload,
  encryptSecret,
} from '../../utils/crypto';
import { compileMDX } from '../docs/mdx-compile';
import { chunkAndStoreRevision } from '../docs/revision-chunking';
import { GatewayMessagePublisher, MessageSeverity } from '../subscriptions';

enum AIProvider {
  OPENAI = 'OPENAI',
}
registerEnumType(AIProvider, { name: 'AIProvider' });

enum AIAssistMode {
  APPEND = 'APPEND',
  REPLACE = 'REPLACE',
  SECTION = 'SECTION',
}
registerEnumType(AIAssistMode, { name: 'AIAssistMode' });

enum AIStyle {
  CONCISE = 'CONCISE',
  TUTORIAL = 'TUTORIAL',
  REFERENCE = 'REFERENCE',
  MARKETING = 'MARKETING',
}
registerEnumType(AIStyle, { name: 'AIStyle' });

@ObjectType()
class ThemeTokenSuggestion {
  @Field()
  name!: string;
  @Field()
  value!: string;
  @Field(() => Int, { nullable: true })
  confidence?: number; // 0..100 optional
}

@ObjectType()
class ThemeImportResult {
  @Field(() => [ThemeTokenSuggestion])
  tokens!: ThemeTokenSuggestion[];
  @Field({ nullable: true })
  note?: string;
  @Field()
  usedLLM!: boolean;
  @Field(() => [String], { nullable: true })
  palette?: string[]; // best-effort extracted colors
}

@ObjectType()
class AIDocsConfig {
  @Field(() => AIProvider)
  provider!: AIProvider;
  @Field({ nullable: true })
  baseUrl?: string;
  @Field({ nullable: true })
  model?: string;
  @Field()
  apiKeySet!: boolean; // never return the key itself
}

@InputType()
class SetAIDocsConfigInput {
  @Field(() => AIProvider)
  provider!: AIProvider;
  @Field({ nullable: true })
  baseUrl?: string;
  @Field({ nullable: true })
  model?: string;
  @Field({ nullable: true })
  apiKey?: string; // optional update
}

@InputType()
class GenerateDocsOptions {
  @Field({ nullable: true })
  publish?: boolean;
  @Field(() => [String], { nullable: true })
  serviceIds?: string[]; // when omitted, generate for all services
}

@ObjectType()
class GenerateDocsResult {
  @Field(() => Int)
  created!: number;
  @Field(() => Int)
  updated!: number;
}

@InputType()
class AIDocAssistInput {
  @Field()
  instruction!: string; // what to generate or improve
  @Field(() => AIAssistMode, { nullable: true })
  mode?: AIAssistMode; // append or replace (advisory for tone/length)
  @Field(() => AIStyle, { nullable: true })
  style?: AIStyle; // writing style hint
  @Field({ nullable: true })
  title?: string; // document title
  @Field({ nullable: true })
  currentMdx?: string; // current content (optional but improves quality)
  @Field({ nullable: true })
  sdl?: string; // GraphQL SDL context if relevant
  @Field(() => Int, { nullable: true })
  maxTokens?: number;
}

@ObjectType()
class AIDocAssistResult {
  @Field()
  snippet!: string; // MDX fragment (no frontmatter)
  @Field()
  usedLLM!: boolean;
  @Field({ nullable: true })
  note?: string;
}

type SecretPayload = {
  provider: 'OPENAI';
  baseUrl?: string;
  model?: string;
  secret?: EncryptedPayload; // encrypted api key
};

@Service()
@Resolver()
export class AIResolver {
  private settingRepo = dataSource.getRepository(Setting);
  private serviceRepo = dataSource.getRepository(ServiceEntity);
  private docRepo = dataSource.getRepository(DocDocument);
  private revRepo = dataSource.getRepository(DocRevision);
  private CONFIG_KEY = 'ai.openai.config';
  private THEME_TOKENS = [
    'color-primary',
    'color-primary-hover',
    'color-primary-light',
    'color-secondary',
    'color-success',
    'color-warning',
    'color-error',
    'color-text-primary',
    'color-text-secondary',
    'color-text-muted',
    'color-text-inverse',
    'color-background',
    'color-background-secondary',
    'color-background-tertiary',
    'color-background-code',
    'color-code-bg',
    'color-code-text',
    'color-border',
    'color-border-light',
    'color-border-dark',
    'font-family-sans',
    'font-family-mono',
    'font-size-base',
    'line-height-normal',
    'border-radius-md',
    'shadow-sm',
  ];

  @Query(() => AIDocsConfig)
  @Directive('@authz(rules: ["isAdmin"])')
  async aiDocsConfig(): Promise<AIDocsConfig> {
    const row = await this.settingRepo.findOne({
      where: { key: this.CONFIG_KEY },
    });
    let payload: SecretPayload | null = row?.jsonValue || null;
    // env fallbacks if not set
    const envKey = process.env.OPENAI_API_KEY;
    const envBase = process.env.OPENAI_BASE_URL;
    const envModel = process.env.OPENAI_MODEL;
    return {
      provider: AIProvider.OPENAI,
      baseUrl: payload?.baseUrl || envBase || undefined,
      model: payload?.model || envModel || undefined,
      apiKeySet: !!(payload?.secret || envKey),
    };
  }

  @Mutation(() => Boolean)
  @Directive('@authz(rules: ["isAdmin"])')
  async setAIDocsConfig(
    @Arg('input') input: SetAIDocsConfigInput
  ): Promise<boolean> {
    if (input.provider !== AIProvider.OPENAI)
      throw new Error('Only OpenAI provider supported for now');
    const row =
      (await this.settingRepo.findOne({ where: { key: this.CONFIG_KEY } })) ||
      this.settingRepo.create({ key: this.CONFIG_KEY, valueType: 'json' });
    const current: SecretPayload = (row.jsonValue as any) || {
      provider: 'OPENAI',
    };
    if (typeof input.baseUrl === 'string') current.baseUrl = input.baseUrl;
    if (typeof input.model === 'string') current.model = input.model;
    if (typeof input.apiKey === 'string' && input.apiKey.length > 0) {
      current.secret = encryptSecret(input.apiKey);
    }
    row.valueType = 'json';
    row.jsonValue = current;
    row.stringValue = null;
    row.numberValue = null;
    row.boolValue = null;
    await this.settingRepo.save(row);
    return true;
  }

  @Mutation(() => GenerateDocsResult)
  @Directive('@authz(rules: ["isAdmin"])')
  async generateDocsFromSDL(
    @Arg('options', () => GenerateDocsOptions, { nullable: true })
    options: GenerateDocsOptions | null,
    @Ctx() ctx: any
  ): Promise<GenerateDocsResult> {
    // Get publisher for real-time notifications
    const publisher = Container.get(GatewayMessagePublisher);

    // Collect only ACTIVE services (SDL kept updated by loader)
    let services = await this.serviceRepo.find({
      where: { status: ServiceStatus.ACTIVE },
    });
    if (options?.serviceIds?.length)
      services = services.filter((s) => options!.serviceIds!.includes(s.id));
    const publish = !!options?.publish;

    // Notify generation process started
    await publisher.publishSystemBroadcast(
      `Started generating documentation for ${services.length} service${services.length === 1 ? '' : 's'}`,
      MessageSeverity.INFO
    );

    // Send detailed notification for admin users
    await publisher.publishGatewayMessage({
      topic: 'system/docs-generation',
      type: 'generation_started',
      severity: MessageSeverity.INFO,
      payload: {
        totalServices: services.length,
        serviceNames: services.map((s) => s.name),
        publishMode: publish,
        timestamp: new Date().toISOString(),
      },
    });

    let created = 0;
    let updated = 0;
    const startTime = Date.now();

    // Load AI config (if available)
    const cfgRow = await this.settingRepo.findOne({
      where: { key: this.CONFIG_KEY },
    });
    const payload: SecretPayload | null = (cfgRow?.jsonValue as any) || null;
    const envKey = process.env.OPENAI_API_KEY;
    const decryptedKey = payload?.secret ? safeDecrypt(payload.secret) : null;
    const apiKey = decryptedKey || envKey || null;
    const baseUrl =
      payload?.baseUrl ||
      process.env.OPENAI_BASE_URL ||
      'https://api.openai.com/v1';
    const model = payload?.model || process.env.OPENAI_MODEL || 'gpt-5-mini';

    try {
      for (const [index, svc] of services.entries()) {
        // Notify individual service processing started
        await publisher.publishGatewayMessage({
          topic: 'system/docs-generation',
          type: 'service_processing',
          severity: MessageSeverity.INFO,
          payload: {
            serviceName: svc.name,
            serviceId: svc.id,
            progress: {
              current: index + 1,
              total: services.length,
              percentage: Math.round(((index + 1) / services.length) * 100),
            },
            timestamp: new Date().toISOString(),
          },
        });

        // Determine slug and existing doc
        const slug = `api-${slugify(svc.name || svc.id)}`;
        let doc = await this.docRepo.findOne({
          where: { slug },
          relations: { revisions: true },
        });
        const sdl =
          svc.sdl || findServiceSDLFromLoader(ctx?.schemaLoader, svc.url) || '';
        // Try LLM enrichment if configured, else fallback to static seed
        let mdx: string;
        if (apiKey) {
          try {
            console.debug(
              `[AIDocs] Generating with OpenAI for service="${svc.name}" model=${model} baseUrl=${baseUrl}`
            );
            mdx = await maybeGenerateWithLLM({
              name: svc.name,
              description: svc.description,
              sdl,
              apiKey,
              baseUrl,
              model,
            });
          } catch (err: any) {
            console.warn(
              `[AIDocs] OpenAI generation failed for service="${svc.name}": ${err?.message || err}. Falling back.`
            );
            mdx = buildSeedDocMDX(svc.name, svc.description, sdl);
          }
        } else {
          console.warn(
            `[AIDocs] No OpenAI API key available; using fallback for service="${svc.name}".`
          );
          mdx = buildSeedDocMDX(svc.name, svc.description, sdl);
        }
        // Normalize to guarantee required frontmatter keys
        mdx = ensureFrontmatter(mdx, {
          title: `${svc.name} API`,
          category: 'APIs',
        });
        if (!doc) {
          // create new doc
          doc = this.docRepo.create({
            slug,
            title: `${svc.name} API`,
            tags: [],
            status: 'ACTIVE',
          });
          await this.docRepo.save(doc);
          const compiled = await compileMDX(mdx);
          const rev = this.revRepo.create({
            document: { id: doc.id } as any,
            version: 1,
            state: publish ? 'PUBLISHED' : 'DRAFT',
            mdxRaw: mdx,
            frontmatterJson: compiled.frontmatter || {
              title: `${svc.name} API`,
              category: 'APIs',
            },
            headings: compiled.headings || [],
            createdBy: 'system',
            publishedAt: publish ? new Date() : null,
          });
          await this.revRepo.save(rev);
          if (publish) {
            // Partial update for doc primaryRevisionId
            await this.docRepo.update(
              { id: doc.id },
              { primaryRevisionId: rev.id }
            );
            await chunkAndStoreRevision(rev, doc.slug);
          }
          created++;

          // Notify successful creation
          await publisher.publishGatewayMessage({
            topic: 'system/docs-generation',
            type: 'service_completed',
            severity: MessageSeverity.INFO,
            payload: {
              serviceName: svc.name,
              serviceId: svc.id,
              action: 'created',
              slug,
              published: publish,
              timestamp: new Date().toISOString(),
            },
          });
        } else {
          // update draft or create new draft version with content
          const latest = [...(doc.revisions || [])].sort(
            (a, b) => b.version - a.version
          )[0];
          const compiled = await compileMDX(mdx);
          const rev = this.revRepo.create({
            document: { id: doc.id } as any,
            version: (latest?.version || 0) + 1,
            state: publish ? 'PUBLISHED' : 'DRAFT',
            mdxRaw: mdx,
            frontmatterJson: compiled.frontmatter || {
              title: `${svc.name} API`,
              category: 'APIs',
            },
            headings: compiled.headings || [],
            createdBy: 'system',
            publishedAt: publish ? new Date() : null,
          });
          await this.revRepo.save(rev);
          if (publish) {
            await this.docRepo.update(
              { id: doc.id },
              { primaryRevisionId: rev.id }
            );
            await chunkAndStoreRevision(rev, doc.slug);
          }
          updated++;

          // Notify successful update
          await publisher.publishGatewayMessage({
            topic: 'system/docs-generation',
            type: 'service_completed',
            severity: MessageSeverity.INFO,
            payload: {
              serviceName: svc.name,
              serviceId: svc.id,
              action: 'updated',
              slug,
              version: (latest?.version || 0) + 1,
              published: publish,
              timestamp: new Date().toISOString(),
            },
          });
        }
      }

      // Notify generation process completed
      const totalProcessed = created + updated;
      await publisher.publishSystemBroadcast(
        `Documentation generation completed: ${created} created, ${updated} updated`,
        MessageSeverity.INFO
      );

      // Send detailed completion notification
      await publisher.publishGatewayMessage({
        topic: 'system/docs-generation',
        type: 'generation_completed',
        severity: MessageSeverity.INFO,
        payload: {
          summary: {
            totalServices: services.length,
            created,
            updated,
            totalProcessed,
          },
          publishMode: publish,
          duration: `${Date.now() - startTime}ms`,
          timestamp: new Date().toISOString(),
        },
      });

      return { created, updated };
    } catch (error) {
      // Notify generation process failed
      await publisher.publishSystemBroadcast(
        `Documentation generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        MessageSeverity.ERROR
      );

      await publisher.publishGatewayMessage({
        topic: 'system/docs-generation',
        type: 'generation_failed',
        severity: MessageSeverity.ERROR,
        payload: {
          error: error instanceof Error ? error.message : 'Unknown error',
          servicesProcessed: created + updated,
          totalServices: services.length,
          duration: `${Date.now() - startTime}ms`,
          timestamp: new Date().toISOString(),
        },
      });

      throw error; // Re-throw to maintain API contract
    }
  }

  @Mutation(() => AIDocAssistResult)
  @Directive('@authz(rules: ["isAdmin"])')
  async aiDocAssist(
    @Arg('input') input: AIDocAssistInput
  ): Promise<AIDocAssistResult> {
    const cfgRow = await this.settingRepo.findOne({
      where: { key: this.CONFIG_KEY },
    });
    const payload: SecretPayload | null = (cfgRow?.jsonValue as any) || null;
    const envKey = process.env.OPENAI_API_KEY;
    const decryptedKey = payload?.secret ? safeDecrypt(payload.secret) : null;
    const apiKey = decryptedKey || envKey || null;
    const baseUrl =
      payload?.baseUrl ||
      process.env.OPENAI_BASE_URL ||
      'https://api.openai.com/v1';
    const model = payload?.model || process.env.OPENAI_MODEL || 'gpt-5-mini';

    // If no key, provide a basic heuristic fallback snippet
    if (!apiKey) {
      const snippet = buildAssistFallback(input);
      return {
        snippet,
        usedLLM: false,
        note: 'No OpenAI key configured; returned heuristic snippet.',
      };
    }

    try {
      const snippet = await maybeAssistWithLLM({
        apiKey,
        baseUrl,
        model,
        instruction: input.instruction,
        mode: input.mode || AIAssistMode.APPEND,
        style: input.style || null,
        title: input.title || '',
        currentMdx: input.currentMdx || '',
        sdl: input.sdl || '',
        maxTokens:
          input.maxTokens && input.maxTokens > 0 ? input.maxTokens : undefined,
      });
      return { snippet, usedLLM: true };
    } catch (err: any) {
      console.warn(`[AIDocs] aiDocAssist failed: ${err?.message || err}`);
      const snippet = buildAssistFallback(input);
      return {
        snippet,
        usedLLM: false,
        note: 'LLM request failed; returned heuristic snippet.',
      };
    }
  }

  // --- Theme Import APIs ---

  @Mutation(() => ThemeImportResult)
  @Directive('@authz(rules: ["isAdmin"])')
  async aiImportThemeFromUrl(
    @Arg('url') url: string
  ): Promise<ThemeImportResult> {
    // Basic URL validation and safety checks
    if (!/^https?:\/\//i.test(url))
      throw new Error('Only http(s) URLs are allowed');
    const { apiKey, baseUrl, model } = await this.getAIConfig();

    let html = '';
    try {
      html = await fetchWithTimeout(url, 10000);
    } catch (e: any) {
      throw new Error(`Failed to fetch URL: ${e?.message || e}`);
    }

    const { cssText, linksFetched } = await collectCssFromHtml(
      html,
      url,
      3,
      10000,
      200_000
    );
    const palette = extractColorPalette(cssText);

    // Heuristic extraction first
    const heuristicTokens = extractTokensHeuristically(
      cssText,
      this.THEME_TOKENS
    );

    // If AI available, try to map with LLM, then refine for UX/contrast
    if (apiKey) {
      try {
        const llmTokens = await suggestTokensWithLLM({
          cssText,
          palette,
          apiKey,
          baseUrl,
          model,
          knownTokens: this.THEME_TOKENS,
        });
        if (llmTokens && llmTokens.length) {
          const refined = refineTokensForUX(llmTokens, palette);
          return {
            tokens: refined.tokens,
            usedLLM: true,
            palette,
            note: `Parsed ${linksFetched} stylesheet(s). ${refined.note}`,
          };
        }
      } catch (err: any) {
        // fall back silently
      }
    }
    const refined = refineTokensForUX(heuristicTokens, palette);
    return {
      tokens: refined.tokens,
      usedLLM: false,
      palette,
      note: `Heuristic mapping from ${linksFetched} stylesheet(s). ${refined.note}`,
    };
  }

  @Mutation(() => ThemeImportResult)
  @Directive('@authz(rules: ["isAdmin"])')
  async aiImportThemeFromImage(
    @Arg('imageUrl', { nullable: true }) imageUrl?: string,
    @Arg('imageBase64', { nullable: true }) imageBase64?: string
  ): Promise<ThemeImportResult> {
    const { apiKey, baseUrl, model } = await this.getAIConfig();
    if (!apiKey) {
      return {
        tokens: [],
        usedLLM: false,
        note: 'No OpenAI key configured; cannot analyze image.',
      };
    }
    if (!imageUrl && !imageBase64)
      throw new Error('Provide imageUrl or imageBase64');

    const tokens = await suggestTokensFromImageLLM({
      imageUrl,
      imageBase64,
      apiKey,
      baseUrl,
      model,
      knownTokens: this.THEME_TOKENS,
    });
    const refined = refineTokensForUX(tokens, null);
    return { tokens: refined.tokens, usedLLM: true, note: refined.note };
  }

  // Utility to expose config
  private async getAIConfig() {
    const cfgRow = await this.settingRepo.findOne({
      where: { key: this.CONFIG_KEY },
    });
    const payload: SecretPayload | null = (cfgRow?.jsonValue as any) || null;
    const envKey = process.env.OPENAI_API_KEY;
    const decryptedKey = payload?.secret ? safeDecrypt(payload.secret) : null;
    const apiKey = decryptedKey || envKey || null;
    const baseUrl =
      payload?.baseUrl ||
      process.env.OPENAI_BASE_URL ||
      'https://api.openai.com/v1';
    const model = payload?.model || process.env.OPENAI_MODEL || 'gpt-5-mini';
    return { apiKey, baseUrl, model };
  }
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 64);
}

function findServiceSDLFromLoader(loader: any, url: string): string | null {
  try {
    const arr =
      (loader?.loadedEndpoints as Array<{ url: string; sdl: string }>) || [];
    const match = arr.find((e) => e.url === url);
    return match?.sdl || null;
  } catch {
    return null;
  }
}

function buildSeedDocMDX(
  name: string,
  description: string | undefined,
  sdl: string
): string {
  const ops = extractOperationFields(sdl);
  const title = `${name} API`;
  const short =
    description || 'A concise, developer-friendly API for your application.';
  const qFirst = ops.query[0];
  const sampleQuery = createSampleQuery(qFirst);
  const sampleCurl = createCurlForQuery(sampleQuery);

  let body =
    `---\n` +
    `title: "${title.replace(/"/g, '\\"')}"\n` +
    `category: "APIs"\n` +
    `description: "${short.replace(/"/g, '\\"')}"\n` +
    `tags: ["graphql", "api", "quickstart"]\n` +
    `---\n\n`;

  body += `# ${title}\n\n`;
  body += `${short}\n\n`;

  body += `## Highlights\n\n`;
  const highlights: string[] = [];
  if (ops.query.length)
    highlights.push(
      `Fast access to ${ops.query.length} query operation${ops.query.length === 1 ? '' : 's'}`
    );
  if (ops.mutation.length)
    highlights.push(
      `Mutation support for write operations (${ops.mutation.length}+ endpoints)`
    );
  highlights.push('Standards-based GraphQL schema and tooling');
  highlights.push('Copy/paste friendly examples');
  body +=
    (highlights.map((h) => `- ${h}`).join('\n') ||
      '- Simple and productive developer experience') + '\n\n';

  body += `## Quickstart\n\n`;
  body += '```graphql\n' + sampleQuery + '\n```\n\n';
  body += '```bash\n' + sampleCurl + '\n```\n\n';

  body += `## Integration Guides\n\n`;
  body += buildIntegrationGuides(sampleQuery) + '\n\n';

  body += `## Core Operations\n\n`;
  if (ops.query.length) {
    body +=
      `### Queries\n\n` +
      ops.query
        .slice(0, 15)
        .map((f) => `- \`${f}\` — retrieves data`)
        .join('\n') +
      '\n\n';
  }
  if (ops.mutation.length) {
    body +=
      `### Mutations\n\n` +
      ops.mutation
        .slice(0, 15)
        .map((f) => `- \`${f}\` — modifies data`)
        .join('\n') +
      '\n\n';
  }

  body += `## Examples\n\n`;
  const richerQuery = createSampleQuery(qFirst, true);
  body += '```graphql\n' + richerQuery + '\n```\n\n';

  body += `## Tips\n\n`;
  body += `- Use GraphiQL to explore and prototype queries\n`;
  body += `- Select only the fields you need to keep responses small\n`;
  body += `- Check the errors array for actionable messages\n\n`;

  body += `## Next Steps\n\n`;
  body += `- Add authentication headers if your deployment requires it\n`;
  body += `- Create a draft in the editor and tailor this page with domain knowledge\n\n`;

  body += `> This page was auto-seeded from the service schema. Enhance it with real examples and deeper guides.`;
  return body;
}

function extractOperationFields(sdl: string): {
  query: string[];
  mutation: string[];
} {
  const q: string[] = [];
  const m: string[] = [];
  // naive regex to capture field names in type Query/Mutation blocks
  const queryMatch = sdl.match(/type\s+Query\s*\{([\s\S]*?)\}/);
  if (queryMatch) {
    const lines = queryMatch[1].split('\n');
    for (const line of lines) {
      const t = line.trim();
      const mParen = t.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*\(/);
      const mNoParen = t.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*:\s*/);
      const name = (mParen && mParen[1]) || (mNoParen && mNoParen[1]);
      if (name) q.push(name);
    }
  }
  const mutationMatch = sdl.match(/type\s+Mutation\s*\{([\s\S]*?)\}/);
  if (mutationMatch) {
    const lines = mutationMatch[1].split('\n');
    for (const line of lines) {
      const t = line.trim();
      const mParen = t.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*\(/);
      const mNoParen = t.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*:\s*/);
      const name = (mParen && mParen[1]) || (mNoParen && mNoParen[1]);
      if (name) m.push(name);
    }
  }
  return { query: q.slice(0, 30), mutation: m.slice(0, 30) };
}

// Ensure MDX starts with a valid frontmatter containing at least title and category
function ensureFrontmatter(
  mdx: string,
  defaults: { title: string; category: string }
): string {
  const hasFM = /^---\n[\s\S]*?\n---/m.test(mdx);
  if (!hasFM) {
    return (
      `---\n` +
      `title: "${defaults.title.replace(/"/g, '\\"')}"\n` +
      `category: "${defaults.category}"\n` +
      `---\n\n` +
      mdx
    );
  }
  // If frontmatter exists, ensure required keys by patching minimal missing ones
  const parts = mdx.split(/^---\n|\n---\n/m);
  if (parts.length >= 3) {
    let yaml = parts[1];
    if (!/\btitle\s*:\s*/.test(yaml))
      yaml = `title: "${defaults.title.replace(/"/g, '\\"')}"\n` + yaml;
    if (!/\bcategory\s*:\s*/.test(yaml))
      yaml = `category: "${defaults.category}"\n` + yaml;
    return `---\n${yaml}\n---\n` + parts.slice(2).join('\n---\n');
  }
  return mdx;
}

function createSampleQuery(opName?: string, withVariables = false): string {
  if (!opName) {
    return `query Example {\n  __typename\n}`;
  }
  if (!withVariables) {
    return `query Example {\n  ${opName} {\n    __typename\n  }\n}`;
  }
  return `query Example($limit: Int) {\n  ${opName}(limit: $limit) {\n    __typename\n  }\n}`;
}

function createCurlForQuery(query: string): string {
  return (
    `curl -X POST $GRAPHQL_URL \\
  -H 'Content-Type: application/json' \\
  -d '{"query":"` +
    query.replace(/\n/g, ' ').replace(/"/g, '\\"') +
    `"}'`
  );
}

function buildIntegrationGuides(query: string): string {
  const qBacktickSafe = query.replace(/`/g, '\\`');
  const qOneLine = query.replace(/\n/g, ' ').replace(/"/g, '\\"');
  const qOneLinePHP = query
    .replace(/\n/g, ' ')
    .replace(/"/g, '\\"')
    .replace(/'/g, "\\'");

  const ts = [
    '### TypeScript (fetch)',
    '```ts',
    'const url = process.env.GRAPHQL_URL ?? "https://your-api/graphql";',
    'const query = `' + qBacktickSafe + '`;',
    'const res = await fetch(url, {',
    '  method: "POST",',
    '  headers: { "Content-Type": "application/json" },',
    '  body: JSON.stringify({ query })',
    '});',
    'const json = await res.json();',
    'console.log(json);',
    '```',
  ].join('\n');

  const py = [
    '### Python (requests)',
    '```python',
    'import os, requests',
    'url = os.getenv("GRAPHQL_URL", "https://your-api/graphql")',
    'query = """',
    query,
    '"""',
    'resp = requests.post(url, json={"query": query})',
    'print(resp.json())',
    '```',
  ].join('\n');

  const java = [
    '### Java (HttpClient)',
    '```java',
    'import java.net.http.*;',
    'import java.net.URI;',
    'String url = System.getenv().getOrDefault("GRAPHQL_URL", "https://your-api/graphql");',
    'String query = "' + qOneLine + '";',
    'String body = String.format("{\\\"query\\\":\\\"%s\\\"}", query);',
    'HttpClient client = HttpClient.newHttpClient();',
    'HttpRequest request = HttpRequest.newBuilder(URI.create(url))',
    '    .header("Content-Type", "application/json")',
    '    .POST(HttpRequest.BodyPublishers.ofString(body))',
    '    .build();',
    'HttpResponse<String> response = client.send(request, HttpResponse.BodyHandlers.ofString());',
    'System.out.println(response.body());',
    '```',
  ].join('\n');

  const php = [
    '### PHP (cURL)',
    '```php',
    '<?php',
    '$url = getenv("GRAPHQL_URL") ?: "https://your-api/graphql";',
    "$query = '" + qOneLinePHP + "';",
    '$ch = curl_init($url);',
    'curl_setopt_array($ch, [',
    '  CURLOPT_RETURNTRANSFER => true,',
    '  CURLOPT_HTTPHEADER => ["Content-Type: application/json"],',
    '  CURLOPT_POST => true,',
    '  CURLOPT_POSTFIELDS => json_encode(["query" => $query]),',
    ']);',
    '$response = curl_exec($ch);',
    'curl_close($ch);',
    'echo $response, PHP_EOL;',
    '```',
  ].join('\n');

  return [ts, '', py, '', java, '', php].join('\n');
}

function safeDecrypt(secret: EncryptedPayload): string | null {
  try {
    return decryptSecret(secret);
  } catch {
    return null;
  }
}

async function maybeGenerateWithLLM(args: {
  name: string;
  description?: string;
  sdl: string;
  apiKey: string | null;
  baseUrl: string;
  model: string;
}): Promise<string> {
  if (!args.apiKey) throw new Error('missing api key');
  // Compose an engaging system/user prompt to produce MDX with frontmatter and examples
  const system = `You are an expert technical writer. Generate engaging, accurate developer docs in MDX with a YAML frontmatter block.
Rules:
- Output only valid MDX (no surrounding explanations).
- Frontmatter must include: title, category. Prefer also description and tags if meaningful.
- Keep it concise and scannable but ensure useful detail (max ~1500 words).
- Use headings, bullet lists, and fenced code blocks with appropriate languages (graphql, bash).
- Avoid placeholders like TODO; provide realistic examples based on the schema.
- Include integration guides for TypeScript (fetch), Python (requests), Java (HttpClient), and PHP (cURL).
- Use $GRAPHQL_URL as the endpoint placeholder in code samples.
- If the schema has no operations, produce a minimal page stating that.
- Do not invent fields not present in the SDL.`;

  const user = `Service: ${args.name}
Description: ${args.description || 'N/A'}
GraphQL SDL (truncated):
${truncate(args.sdl, 6000)}

Task: Produce an MDX page for the ${args.name} API.
Requirements:
- Frontmatter: title: "${args.name} API", category: "APIs". Optionally include description and tags.
- Sections:
  1) Overview: 2–4 sentences summarizing capabilities and use cases.
  2) Highlights: 3–5 bullets focusing on key benefits.
  3) Quickstart: one minimal GraphQL query and a matching curl request.
  3b) Integration Guides: short code samples to call the GraphQL endpoint using TypeScript (fetch), Python (requests), Java (HttpClient), and PHP (cURL).
  4) Core Operations: list up to 10 Query fields and up to 10 Mutation fields (if present).
  5) Examples: a slightly richer query using variables when appropriate.
  6) Tips: 3 bullets of best practices.
  7) Next Steps: 2–3 bullets guiding the reader.
- Be accurate to the SDL. If Mutations don’t exist, omit that subsection.
- Keep code blocks copy/paste friendly.`;

  const client = new OpenAI({
    apiKey: args.apiKey,
    baseURL: args.baseUrl?.replace(/\/$/, ''),
  });
  let completion;
  try {
    completion = await client.chat.completions.create({
      model: args.model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    });
  } catch (err: any) {
    const msg = err?.message || '';
    const isTempUnsupported =
      /Unsupported value: 'temperature'|param\s*=\s*'temperature'/i.test(msg);
    if (isTempUnsupported) {
      // Retry without temperature for models/providers that only accept defaults
      completion = await client.chat.completions.create({
        model: args.model,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      });
    } else {
      throw err;
    }
  }

  const text = completion?.choices?.[0]?.message?.content || '';
  if (!/^---[\s\S]*?---/m.test(text)) {
    // ensure a minimal frontmatter exists
    return buildSeedDocMDX(args.name, args.description, args.sdl);
  }
  return text;
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) + '\n…' : s;
}

// Removed manual fetch fallback in favor of OpenAI SDK

async function maybeAssistWithLLM(args: {
  apiKey: string;
  baseUrl: string;
  model: string;
  instruction: string;
  mode: AIAssistMode;
  style: AIStyle | null;
  title: string;
  currentMdx: string;
  sdl: string;
  maxTokens?: number;
}): Promise<string> {
  const system = `You are an expert technical writer and editor for MDX documentation. Respond ONLY with an MDX fragment (no frontmatter). Ensure valid fenced code blocks and headings.`;

  const modeHint =
    args.mode === AIAssistMode.REPLACE
      ? 'Rewrite the entire page with improved structure and clarity.'
      : args.mode === AIAssistMode.SECTION
        ? 'Improve and rewrite ONLY the provided selection. Keep it self-contained and ready to paste back in place.'
        : 'Create a concise section to append to the existing document.';

  const styleHint = args.style
    ? `Adopt a ${args.style.toLowerCase()} style.`
    : 'Adopt a neutral, developer-friendly style.';

  const user = `Title: ${args.title || 'Untitled'}
Instruction: ${args.instruction}

Context (existing MDX, may be empty):
---
${truncate(args.currentMdx || '', 7000)}
---

GraphQL SDL (optional):
---
${truncate(args.sdl || '', 4000)}
---

Output requirements:
- Produce MDX FRAGMENT ONLY (no frontmatter).
- Keep code blocks valid and labeled (graphql, bash, typescript, python, java, php, json).
- Prefer short headings (##) and bullet lists where helpful.
- ${modeHint}
- ${styleHint}
- Keep it self-contained so it can be pasted into the doc.`;

  const client = new OpenAI({
    apiKey: args.apiKey,
    baseURL: args.baseUrl?.replace(/\/$/, ''),
  });
  let completion;
  try {
    completion = await client.chat.completions.create({
      model: args.model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      temperature: 0.25,
      max_tokens: args.maxTokens,
    } as any);
  } catch (err: any) {
    const msg = err?.message || '';
    const isTempUnsupported =
      /Unsupported value: 'temperature'|param\s*=\s*'temperature'/i.test(msg);
    const req: any = {
      model: args.model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    };
    if (args.maxTokens) req.max_tokens = args.maxTokens;
    if (isTempUnsupported)
      completion = await client.chat.completions.create(req);
    else throw err;
  }

  let text = completion?.choices?.[0]?.message?.content || '';
  text = stripFrontmatter(text).trim();
  // Guardrail: limit size and ensure code fences balanced basic check
  text = truncate(text, 8000);
  if (!areFencesBalanced(text)) {
    // add closing fence if clearly missing
    text += '\n```\n';
  }
  return text;
}

function stripFrontmatter(mdx: string): string {
  if (/^---\n[\s\S]*?\n---/m.test(mdx)) {
    return mdx.replace(/^---\n[\s\S]*?\n---\n?/, '');
  }
  return mdx;
}

function areFencesBalanced(s: string): boolean {
  const matches = s.match(/```/g);
  if (!matches) return true;
  return matches.length % 2 === 0;
}

function buildAssistFallback(input: AIDocAssistInput): string {
  const goal = input.instruction.toLowerCase();
  if (goal.includes('outline')) {
    return [
      '## Overview',
      '',
      '- What this covers',
      '- Who it is for',
      '',
      '## Quickstart',
      '',
      '1. Configure the endpoint',
      '2. Run a sample query',
      '3. Handle responses',
      '',
      '## Examples',
      '',
      '```graphql',
      'query Example {',
      '  __typename',
      '}',
      '```',
    ].join('\n');
  }
  if (goal.includes('faq')) {
    return [
      '## FAQ',
      '',
      '**How do I authenticate?**',
      '',
      'Send an Authorization header with your token.',
      '',
      '**How do I find available fields?**',
      '',
      'Open GraphiQL and inspect the schema or introspection.',
      '',
    ].join('\n');
  }
  if (goal.includes('integrat')) {
    return [
      '## Integration Guides',
      '',
      'See examples for TypeScript, Python, Java, and PHP.',
      '',
      buildIntegrationGuides(createSampleQuery('example')),
    ].join('\n');
  }
  // default improvement tip
  return [
    '## Improvements',
    '',
    '- Clarify the purpose of each section.',
    '- Add a minimal Quickstart with a single request and response.',
    '- Provide 2–3 realistic examples with code.',
    '',
  ].join('\n');
}

// --- Helpers for Theme Import ---

async function fetchWithTimeout(
  url: string,
  timeoutMs: number
): Promise<string> {
  const ctl = new AbortController();
  const to = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctl.signal } as any);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    return text;
  } finally {
    clearTimeout(to);
  }
}

function absolutizeUrl(baseUrl: string, maybeRelative: string): string {
  try {
    return new URL(maybeRelative, baseUrl).toString();
  } catch {
    return maybeRelative;
  }
}

async function collectCssFromHtml(
  html: string,
  baseUrl: string,
  maxLinks: number,
  timeoutMs: number,
  maxTotalBytes: number
): Promise<{ cssText: string; linksFetched: number }> {
  const linkHrefs = Array.from(
    html.matchAll(/<link[^>]+rel=["']stylesheet["'][^>]*>/gi)
  )
    .map((m) => {
      const tag = m[0];
      const href = /href=["']([^"']+)["']/i.exec(tag)?.[1];
      return href ? absolutizeUrl(baseUrl, href) : null;
    })
    .filter(Boolean) as string[];
  const inlineStyles = Array.from(
    html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)
  ).map((m) => m[1]);
  let cssText = inlineStyles.join('\n/* inline */\n');
  let fetched = 0;
  for (const href of linkHrefs.slice(0, maxLinks)) {
    try {
      const text = await fetchWithTimeout(href, timeoutMs);
      cssText += '\n/* ' + href + ' */\n' + text;
      fetched++;
      if (cssText.length > maxTotalBytes) break;
    } catch {
      // skip
    }
  }
  return { cssText, linksFetched: fetched };
}

function extractColorPalette(cssText: string): string[] {
  const colors = new Map<string, number>();
  const regexes = [
    /#(?:[0-9a-fA-F]{3}){1,2}\b/g,
    /rgba?\([^\)]+\)/g,
    /hsla?\([^\)]+\)/g,
  ];
  for (const rx of regexes) {
    const matches = cssText.match(rx) || [];
    for (const c of matches) {
      const rgb = parseCssColorToRgb(c);
      const key = rgb ? rgbToHex(rgb) : c; // normalize to hex when possible
      colors.set(key, (colors.get(key) || 0) + 1);
    }
  }
  return Array.from(colors.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([c]) => c);
}

function extractTokensHeuristically(
  cssText: string,
  knownTokens: string[]
): ThemeTokenSuggestion[] {
  const map: Record<string, string> = {};
  // Parse variables from :root and various theme selectors (light, dark, auto)
  const blocks = Array.from(
    cssText.matchAll(
      /(?::root|\[data-theme=['"](?:light|dark|auto)['"]\]|\.theme-(?:light|dark)|\.(?:light|dark))\s*{([\s\S]*?)}/g
    )
  ).map((m) => m[1]);
  for (const body of blocks) {
    const lines = body.split(/;\n?|\n/);
    for (const line of lines) {
      const m = line.match(/--([A-Za-z0-9_-]+):\s*([^;\n]+)\s*/);
      if (m) map[m[1]] = m[2].trim();
    }
  }
  const suggestions: ThemeTokenSuggestion[] = [];
  for (const name of knownTokens) {
    // direct name match
    if (map[name]) suggestions.push({ name, value: map[name], confidence: 95 });
  }
  // Heuristic for common aliases and typical CSS var names
  const aliases: Array<[string, string[]]> = [
    ['color-primary', ['color-primary', 'primary', 'brand', 'accent']],
    ['color-secondary', ['color-secondary', 'secondary']],
    ['color-success', ['success', 'green']],
    ['color-warning', ['warning', 'amber', 'orange', 'yellow']],
    ['color-error', ['error', 'danger', 'red']],
    [
      'color-background',
      ['background', 'bg', 'surface', 'body-bg', 'page-bg', 'main-bg'],
    ],
    [
      'color-text-primary',
      ['text', 'foreground', 'fg', 'body', 'on-background'],
    ],
    ['color-text-inverse', ['on-primary', 'inverse', 'text-on-primary']],
    ['color-border', ['border', 'divider']],
    ['font-family-sans', ['font-sans', 'font-family', 'fontbase']],
    ['font-family-mono', ['font-mono', 'monospace']],
    ['font-size-base', ['font-size-base', 'font-size']],
    ['line-height-normal', ['line-height', 'leading']],
  ];
  for (const [target, keys] of aliases) {
    if (suggestions.find((s) => s.name === target)) continue;
    for (const k of keys) {
      const key = Object.keys(map).find((m) => m.toLowerCase().includes(k));
      if (key) {
        suggestions.push({ name: target, value: map[key], confidence: 70 });
        break;
      }
    }
  }
  return dedupeByName(suggestions);
}

// Heuristic to determine if source assets indicate a dark theme.
function detectSourceDark(cssText: string, palette: string[]): boolean {
  // Look for dark theme markers
  const darkMarkers = /(theme-dark|data-theme="dark"|\.dark\b)/i.test(cssText);
  // Extract common background-like vars
  const bgCandidates: string[] = [];
  for (const m of cssText.matchAll(
    /--[A-Za-z0-9_-]*(background|bg|surface)[A-Za-z0-9_-]*:\s*([^;\n]+)/gi
  )) {
    const val = m[2].trim();
    bgCandidates.push(val);
  }
  // Combine with palette for sampling
  const sample = [...bgCandidates.slice(0, 6), ...palette.slice(0, 6)];
  let darkCount = 0;
  let total = 0;
  for (const c of sample) {
    const rgb = parseCssColorToRgb(c);
    if (!rgb) continue;
    total++;
    const lum = luminance(rgb);
    if (lum < 0.45) darkCount++;
  }
  if (darkMarkers && darkCount === 0) return true; // explicit marker overrides
  return total > 0 ? darkCount / total > 0.5 : false;
}

function dedupeByName(items: ThemeTokenSuggestion[]): ThemeTokenSuggestion[] {
  const seen = new Set<string>();
  const out: ThemeTokenSuggestion[] = [];
  for (const it of items) {
    if (seen.has(it.name)) continue;
    seen.add(it.name);
    out.push(it);
  }
  return out;
}

async function suggestTokensWithLLM(args: {
  cssText: string;
  palette: string[];
  apiKey: string;
  baseUrl: string;
  model: string;
  knownTokens: string[];
}): Promise<ThemeTokenSuggestion[]> {
  const client = new OpenAI({
    apiKey: args.apiKey,
    baseURL: args.baseUrl?.replace(/\/$/, ''),
  });
  // Detect whether the source assets suggest a dark theme so we hint the model.
  const sourceLikelyDark = detectSourceDark(args.cssText, args.palette);
  const system = `You are a senior UI theming specialist.
Your job: extract or synthesize a modern, readable, accessible theme for a documentation website.

Hard requirements:
- Output ALL requested tokens. If the source CSS doesn't define some, choose excellent modern defaults.
- Ensure WCAG AA contrast (≥ 4.5:1) for body text on backgrounds and inverse text on primary surfaces.
- Use 6-digit hex for all color values (e.g., #2563eb). Do not output rgb()/hsl() unless impossible.
- Derive variants:
  - color-primary-hover: slightly darker than color-primary on light themes; slightly lighter on dark themes.
  - color-primary-light: a subtle tinted background using the primary hue.
- Choose light or dark based ONLY on the source signals: if base/background colors are predominantly dark (average luminance < 0.45) or explicit dark backgrounds are present, produce a true dark theme (dark backgrounds with light text). Otherwise produce a light theme. Never override a clearly dark source with a light one.
- Provide opinionated, modern defaults for typography, radius and shadows:
  - font-family-sans: Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell, Noto Sans, Helvetica Neue, Arial, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol"
  - font-family-mono: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "DejaVu Sans Mono", "Courier New", monospace
  - font-size-base: 16px
  - line-height-normal: 1.6
  - border-radius-md: 8px
  - shadow-sm: 0 1px 2px rgba(0,0,0,0.08)

Token semantics (names must match exactly):
- color-primary, color-primary-hover, color-primary-light, color-secondary,
- color-success, color-warning, color-error,
- color-text-primary, color-text-secondary, color-text-muted, color-text-inverse,
- color-background, color-background-secondary, color-background-tertiary, color-background-code,
- color-border, color-border-light, color-border-dark,
- font-family-sans, font-family-mono, font-size-base, line-height-normal, border-radius-md, shadow-sm.

Return ONLY compact JSON with this shape: {"tokens":[{"name":"token","value":"css-color-or-value","confidence":0-100}...]}.`;
  const user = `Known theme tokens: ${args.knownTokens.join(', ')}\nSourceLikelyDark: ${sourceLikelyDark}\n\nCSS (truncated):\n${truncate(args.cssText, 16000)}\n\nPalette candidates: ${args.palette.join(', ')}\n\nGoal: deliver a modern, accessible theme with strong hierarchy and comfortable reading. If SourceLikelyDark is true, output a DARK theme.`;
  const resp = await client.chat.completions.create({
    model: args.model,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ] as any,
  } as any);
  const text = resp?.choices?.[0]?.message?.content || '';
  const json = safeJson(text);
  const tokens = (json?.tokens as any[]) || [];
  return tokens
    .filter(
      (t) => t && typeof t.name === 'string' && typeof t.value === 'string'
    )
    .map((t) => ({
      name: t.name,
      value: t.value,
      confidence: clampInt(t.confidence, 0, 100),
    }))
    .filter((t) => args.knownTokens.includes(t.name));
}

async function suggestTokensFromImageLLM(args: {
  imageUrl?: string;
  imageBase64?: string;
  apiKey: string;
  baseUrl: string;
  model: string;
  knownTokens: string[];
}): Promise<ThemeTokenSuggestion[]> {
  const client = new OpenAI({
    apiKey: args.apiKey,
    baseURL: args.baseUrl?.replace(/\/$/, ''),
  });
  const system = `You are a senior UI theming specialist.
From the provided image (screenshot/marketing page), infer brand colors and map them to the given theme tokens with excellent UX.
Ensure WCAG AA contrast for text/background and inverse text on primary surfaces. Provide sensible hover/light variants.
Prefer hex colors.
Return ONLY JSON: {"tokens":[{"name":"token","value":"css-color","confidence":0-100}...]}.`;
  const content: any[] = [
    {
      type: 'text',
      text: 'Analyze this image and output JSON mapping to the tokens listed.',
    },
  ];
  if (args.imageUrl)
    content.push({ type: 'image_url', image_url: { url: args.imageUrl } });
  else if (args.imageBase64)
    content.push({
      type: 'image_url',
      image_url: { url: `data:image/png;base64,${args.imageBase64}` },
    });
  const user = `Tokens: ${args.knownTokens.join(', ')}\nGoal: deliver a nice, accessible UI theme with strong contrast and clear hierarchy.`;
  const resp = await client.chat.completions.create({
    model: args.model,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content },
    ] as any,
  } as any);
  const text = resp?.choices?.[0]?.message?.content || '';
  const json = safeJson(text);
  const tokens = (json?.tokens as any[]) || [];
  return tokens
    .filter(
      (t) => t && typeof t.name === 'string' && typeof t.value === 'string'
    )
    .map((t) => ({
      name: t.name,
      value: t.value,
      confidence: clampInt(t.confidence, 0, 100),
    }))
    .filter((t) => args.knownTokens.includes(t.name));
}

// --- UX refinement helpers ---
type RGB = { r: number; g: number; b: number };

function hexNormalize(hex: string): string | null {
  const m = hex.trim().match(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/);
  if (!m) return null;
  let h = m[1].toLowerCase();
  if (h.length === 3)
    h = h
      .split('')
      .map((c) => c + c)
      .join('');
  return `#${h}`;
}

function rgbToHex(rgb: RGB): string {
  const c = (n: number) =>
    Math.max(0, Math.min(255, Math.round(n)))
      .toString(16)
      .padStart(2, '0');
  return `#${c(rgb.r)}${c(rgb.g)}${c(rgb.b)}`;
}

function hslToRgb(h: number, s: number, l: number): RGB {
  const C = (1 - Math.abs(2 * l - 1)) * s;
  const X = C * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - C / 2;
  let r = 0,
    g = 0,
    b = 0;
  if (h < 60) {
    r = C;
    g = X;
    b = 0;
  } else if (h < 120) {
    r = X;
    g = C;
    b = 0;
  } else if (h < 180) {
    r = 0;
    g = C;
    b = X;
  } else if (h < 240) {
    r = 0;
    g = X;
    b = C;
  } else if (h < 300) {
    r = X;
    g = 0;
    b = C;
  } else {
    r = C;
    g = 0;
    b = X;
  }
  return { r: (r + m) * 255, g: (g + m) * 255, b: (b + m) * 255 };
}

function parseCssColorToRgb(input: string): RGB | null {
  const hex = hexNormalize(input);
  if (hex) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return { r, g, b };
  }
  const rgb = input.match(/^rgba?\(([^)]+)\)/i);
  if (rgb) {
    const parts = rgb[1].split(',').map((s) => parseFloat(s.trim()));
    if (parts.length >= 3 && parts.every((n) => Number.isFinite(n)))
      return { r: parts[0], g: parts[1], b: parts[2] };
  }
  const hsl = input.match(/^hsla?\(([^)]+)\)/i);
  if (hsl) {
    const parts = hsl[1].split(',').map((s) => s.trim());
    const h = parseFloat(parts[0]);
    const s = parseFloat(parts[1].replace('%', '')) / 100;
    const l = parseFloat(parts[2].replace('%', '')) / 100;
    const rgbVal = hslToRgb(h, s, l);
    return rgbVal;
  }
  return null;
}

function luminance(rgb: RGB): number {
  const toLin = (c: number) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * toLin(rgb.r) + 0.7152 * toLin(rgb.g) + 0.0722 * toLin(rgb.b);
}

function contrastRatioHex(c1: string, c2: string): number {
  const r1 = parseCssColorToRgb(c1);
  const r2 = parseCssColorToRgb(c2);
  if (!r1 || !r2) return 1;
  const L1 = luminance(r1) + 0.05;
  const L2 = luminance(r2) + 0.05;
  return L1 > L2 ? L1 / L2 : L2 / L1;
}

function lightenDarkenHex(hex: string, amt: number): string {
  const h = hexNormalize(hex) || '#000000';
  const r = Math.max(0, Math.min(255, parseInt(h.slice(1, 3), 16) + amt));
  const g = Math.max(0, Math.min(255, parseInt(h.slice(3, 5), 16) + amt));
  const b = Math.max(0, Math.min(255, parseInt(h.slice(5, 7), 16) + amt));
  return rgbToHex({ r, g, b });
}

function ensureContrastHex(
  fg: string,
  bg: string,
  minRatio = 4.5
): { color: string; adjusted: boolean } {
  let color = hexNormalize(fg) || fg;
  const bgHex = hexNormalize(bg) || bg;
  if (contrastRatioHex(color, bgHex) >= minRatio)
    return { color, adjusted: false };
  // Try darkening and lightening progressively
  let adjusted = false;
  for (let step = 0; step < 12; step++) {
    const amt = (step + 1) * 10;
    const darker = lightenDarkenHex(color, -amt);
    if (contrastRatioHex(darker, bgHex) >= minRatio) {
      color = darker;
      adjusted = true;
      break;
    }
    const lighter = lightenDarkenHex(color, amt);
    if (contrastRatioHex(lighter, bgHex) >= minRatio) {
      color = lighter;
      adjusted = true;
      break;
    }
  }
  return { color, adjusted };
}

function pickBackgroundFromPalette(palette?: string[]): string | null {
  if (!palette || !palette.length) return null;
  const rgbs = palette
    .map((p) => parseCssColorToRgb(p))
    .filter(Boolean) as RGB[];
  if (!rgbs.length) return null;
  const avg = rgbs.reduce((a, b) => ({
    r: a.r + b.r,
    g: a.g + b.g,
    b: a.b + b.b,
  })) as any;
  avg.r /= rgbs.length;
  avg.g /= rgbs.length;
  avg.b /= rgbs.length;
  const avgLum = luminance(avg);
  // If palette is generally bright, choose light background, else dark
  return avgLum > 0.6 ? '#ffffff' : '#0b1220';
}

function refineTokensForUX(
  base: ThemeTokenSuggestion[],
  palette?: string[] | null,
  minContrast = 4.5
): { tokens: ThemeTokenSuggestion[]; note: string } {
  const map = new Map(base.map((t) => [t.name, t.value]));

  // Ensure background first - preserve imported background if available
  if (!map.get('color-background')) {
    // Check if we have a background from the imported theme first
    const importedBg = base.find((t) => t.name === 'color-background')?.value;
    const bg =
      importedBg ||
      pickBackgroundFromPalette(palette || undefined) ||
      '#ffffff';
    map.set('color-background', bg);
  }
  const bgHex = (() => {
    const rgb = parseCssColorToRgb(map.get('color-background')!);
    return rgb
      ? rgbToHex(rgb)
      : hexNormalize(map.get('color-background')!) ||
          map.get('color-background')!;
  })();
  map.set('color-background', bgHex);

  // Primary body text
  if (!map.get('color-text-primary')) {
    const defaultText =
      contrastRatioHex('#111827', bgHex) >= minContrast ? '#111827' : '#f8fafc';
    const ensured = ensureContrastHex(defaultText, bgHex, minContrast);
    map.set('color-text-primary', ensured.color);
  } else {
    const ensured = ensureContrastHex(
      map.get('color-text-primary')!,
      bgHex,
      minContrast
    );
    map.set('color-text-primary', ensured.color);
  }

  // Secondary/muted text as toned versions but keep reasonable contrast
  const secondaryCandidate = lightenDarkenHex(
    map.get('color-text-primary')!,
    40
  );
  const secondaryEnsured = ensureContrastHex(secondaryCandidate, bgHex, 3.0);
  if (!map.get('color-text-secondary')) {
    map.set('color-text-secondary', secondaryEnsured.color);
  }
  const mutedCandidate = lightenDarkenHex(map.get('color-text-primary')!, 80);
  const mutedEnsured = ensureContrastHex(mutedCandidate, bgHex, 3.0);
  if (!map.get('color-text-muted')) {
    map.set('color-text-muted', mutedEnsured.color);
  }

  // Primary and related variants
  if (!map.get('color-primary')) {
    const p = (palette && palette[0]) || '#2563eb';
    map.set('color-primary', p);
  }
  // Coerce primary to hex when possible
  const primary = (() => {
    const rgb = parseCssColorToRgb(map.get('color-primary')!);
    return rgb
      ? rgbToHex(rgb)
      : hexNormalize(map.get('color-primary')!) || map.get('color-primary')!;
  })();
  map.set('color-primary', primary);
  if (!map.get('color-primary-hover')) {
    // Darken for hover by default
    map.set('color-primary-hover', lightenDarkenHex(primary, -20));
  }
  if (!map.get('color-primary-light')) {
    map.set('color-primary-light', lightenDarkenHex(primary, 60));
  }

  // Inverse text should contrast with primary surfaces
  const inv = map.get('color-text-inverse') || '#ffffff';
  const ensuredInv = ensureContrastHex(inv, primary, minContrast);
  map.set('color-text-inverse', ensuredInv.color);

  // Secondary color: choose far from primary in palette, else a modern teal
  if (!map.get('color-secondary')) {
    const sec = pickSecondaryFromPalette(primary, palette) || '#10b981';
    map.set('color-secondary', sec);
  }

  // Semantic colors with sufficient contrast
  const semBg = bgHex;
  if (!map.get('color-success')) {
    const c = ensureContrastHex('#16a34a', semBg, 3.0).color;
    map.set('color-success', c);
  }
  if (!map.get('color-warning')) {
    const c = ensureContrastHex('#f59e0b', semBg, 3.0).color;
    map.set('color-warning', c);
  }
  if (!map.get('color-error')) {
    const c = ensureContrastHex('#ef4444', semBg, 3.0).color;
    map.set('color-error', c);
  }

  // Panel/code/background variants defaults
  if (!map.get('color-background-secondary')) {
    map.set('color-background-secondary', lightenDarkenHex(bgHex, 8));
  }
  if (!map.get('color-background-tertiary')) {
    map.set('color-background-tertiary', lightenDarkenHex(bgHex, 16));
  }
  if (!map.get('color-background-code')) {
    const bgLum = luminance(parseCssColorToRgb(bgHex)!);
    if (bgLum > 0.5) {
      map.set('color-background-code', '#0f172a');
    } else {
      map.set('color-background-code', lightenDarkenHex(bgHex, 20));
    }
  }
  // Dedicated code block tokens (prefer dark background if overall theme is light)
  if (!map.get('color-code-bg')) {
    const bgLum = luminance(parseCssColorToRgb(bgHex)!);
    const baseCode = bgLum > 0.5 ? '#0f172a' : lightenDarkenHex(bgHex, 20);
    map.set('color-code-bg', baseCode);
  }
  if (!map.get('color-code-text')) {
    const codeBg = map.get('color-code-bg')!;
    const codeLum = luminance(parseCssColorToRgb(codeBg)!);
    const target = codeLum < 0.35 ? '#e2e8f0' : '#1e293b';
    const ensured = ensureContrastHex(target, codeBg, 4.5);
    map.set('color-code-text', ensured.color);
  }

  // Borders
  if (!map.get('color-border'))
    map.set('color-border', lightenDarkenHex(bgHex, 30));
  if (!map.get('color-border-light'))
    map.set('color-border-light', lightenDarkenHex(bgHex, 45));
  if (!map.get('color-border-dark'))
    map.set('color-border-dark', lightenDarkenHex(bgHex, 15));

  // Typography and shape defaults
  if (!map.get('font-family-sans'))
    map.set(
      'font-family-sans',
      'Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell, Noto Sans, Helvetica Neue, Arial, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol"'
    );
  if (!map.get('font-family-mono'))
    map.set(
      'font-family-mono',
      'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "DejaVu Sans Mono", "Courier New", monospace'
    );
  if (!map.get('font-size-base')) map.set('font-size-base', '16px');
  if (!map.get('line-height-normal')) map.set('line-height-normal', '1.6');
  if (!map.get('border-radius-md')) map.set('border-radius-md', '8px');
  if (!map.get('shadow-sm')) map.set('shadow-sm', '0 1px 2px rgba(0,0,0,0.08)');

  // Ensure all color-* tokens are 6-digit hex where possible
  const normalizedMap = new Map<string, string>();
  for (const [name, value] of map.entries()) {
    if (name.startsWith('color-')) {
      const rgb = parseCssColorToRgb(value);
      const hex = rgb ? rgbToHex(rgb) : hexNormalize(value) || value;
      normalizedMap.set(name, hex);
    } else {
      normalizedMap.set(name, value);
    }
  }

  // Output tokens in a stable order (known tokens first)
  const out: ThemeTokenSuggestion[] = [];
  const known = [
    'color-primary',
    'color-primary-hover',
    'color-primary-light',
    'color-secondary',
    'color-success',
    'color-warning',
    'color-error',
    'color-text-primary',
    'color-text-secondary',
    'color-text-muted',
    'color-text-inverse',
    'color-background',
    'color-background-secondary',
    'color-background-tertiary',
    'color-background-code',
    'color-code-bg',
    'color-code-text',
    'color-border',
    'color-border-light',
    'color-border-dark',
    'font-family-sans',
    'font-family-mono',
    'font-size-base',
    'line-height-normal',
    'border-radius-md',
    'shadow-sm',
  ];
  for (const key of known) {
    const v = normalizedMap.get(key);
    if (v) out.push({ name: key, value: v });
  }
  for (const [k, v] of normalizedMap.entries()) {
    if (!known.includes(k)) out.push({ name: k, value: v });
  }
  return { tokens: out, note: 'Adjusted for contrast and UX (WCAG AA).' };
}

function safeJson(text: string): any | null {
  try {
    // If not pure JSON, try to extract code fence
    const fence = text.match(/```\w*\n([\s\S]*?)```/);
    const raw = fence ? fence[1] : text;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function clampInt(n: any, min: number, max: number): number | undefined {
  const v = Number.isFinite(n) ? Math.floor(n) : undefined;
  if (typeof v === 'number') return Math.max(min, Math.min(max, v));
  return undefined;
}

// --- Additional palette helpers ---
function colorDistanceHex(a: string, b: string): number {
  const ra = parseCssColorToRgb(a);
  const rb = parseCssColorToRgb(b);
  if (!ra || !rb) return 0;
  const dr = ra.r - rb.r;
  const dg = ra.g - rb.g;
  const db = ra.b - rb.b;
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

function pickSecondaryFromPalette(
  primary: string,
  palette?: string[] | null
): string | null {
  if (!palette || palette.length < 2) return null;
  // Choose the color farthest from primary to ensure clear differentiation
  const normalizedPrimary = hexNormalize(primary) || primary;
  let best: { color: string; dist: number } | null = null;
  for (const c of palette) {
    const dist = colorDistanceHex(normalizedPrimary, c);
    if (!best || dist > best.dist) best = { color: c, dist };
  }
  return best
    ? parseCssColorToRgb(best.color)
      ? rgbToHex(parseCssColorToRgb(best.color)!)
      : hexNormalize(best.color) || best.color
    : null;
}
