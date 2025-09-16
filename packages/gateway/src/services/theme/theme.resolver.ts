import { Arg, Field, Mutation, ObjectType, Query, Resolver } from 'type-graphql';
import { Service } from 'typedi';
import { dataSource } from '../../db/datasource';
import { Setting } from '../../entities/setting.entity';

@ObjectType()
class ThemeToken {
  @Field()
  name!: string;
  @Field()
  value!: string;
}

@Service()
@Resolver()
export class ThemeResolver {
  private repo = dataSource.getRepository(Setting);

  @Query(() => [String])
  async themeTokens(): Promise<string[]> {
    // Using query builder to avoid driver-specific function param issues
    const rows = await this.repo
      .createQueryBuilder('s')
      .where('s.key LIKE :prefix', { prefix: 'docs.theme.token.%' })
      .getMany();
    return rows.map((r) => r.key.replace('docs.theme.token.', ''));
  }

  @Query(() => [ThemeToken])
  async themeTokensDetailed(): Promise<ThemeToken[]> {
    const rows = await this.repo
      .createQueryBuilder('s')
      .where('s.key LIKE :prefix', { prefix: 'docs.theme.token.%' })
      .getMany();
    return rows.map((r) => ({ name: r.key.replace('docs.theme.token.', ''), value: r.stringValue || '' }));
  }

  @Query(() => String)
  async docsThemePreviewHtml(): Promise<string> {
    // Lightweight HTML skeleton so the Admin UI can iframe it and live-inject CSS variables.
    return `<!DOCTYPE html><html><head><meta charset=\"utf-8\" /><title>Docs Theme Preview</title><link rel=\"stylesheet\" href=\"/docs-theme.css\" /></head><body style='margin:0;padding:1.5rem;font-family:var(--font-family-sans);background:var(--color-background);color:var(--color-text-primary)'><main style='max-width:820px;margin:0 auto;'>
    <h1 style='margin-top:0;color:var(--color-primary)'>Preview Heading</h1>
    <p>This live preview reflects current theme variables plus any unsaved overrides applied client-side.</p>
    <a href='#' style='color:var(--color-primary)'>Primary Link</a>
    <div style='margin:1rem 0;padding:1rem;border:1px solid var(--color-border);border-radius:var(--border-radius-md);background:var(--color-surface);'>
      <strong>Callout:</strong> Adjust tokens to see changes instantly.
    </div>
    <pre style='background:var(--color-code-bg);color:var(--color-code-text);padding:0.75rem;border-radius:var(--border-radius-sm);overflow:auto;'>const example = 'code block';</pre>
    <button style='background:var(--color-primary);color:var(--color-primary-foreground);border:none;padding:0.6rem 1rem;font-size:0.9rem;border-radius:var(--border-radius-sm);cursor:pointer;'>Primary Button</button>
    </main></body></html>`;
  }

  @Mutation(() => Boolean)
  async setThemeToken(@Arg('name') name: string, @Arg('value') value: string): Promise<boolean> {
    if (!/^[-a-z0-9]+$/.test(name)) throw new Error('Invalid token name');
    if (!/^#[0-9a-fA-F]{3,8}$/.test(value) && !/^[0-9.]+(px|rem|em|%)$/.test(value) && !/^[a-zA-Z0-9 ,'-]+$/.test(value))
      throw new Error('Invalid token value');
    let setting = await this.repo.findOne({ where: { key: `docs.theme.token.${name}` } });
    if (!setting) {
      setting = this.repo.create({ key: `docs.theme.token.${name}`, stringValue: value, valueType: 'string' });
    } else {
      setting.stringValue = value;
    }
    await this.repo.save(setting);
    return true;
  }
}
