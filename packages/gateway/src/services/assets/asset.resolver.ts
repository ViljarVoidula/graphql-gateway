import { Arg, Directive, Field, Mutation, ObjectType, Query, Resolver } from 'type-graphql';
import { Service as Injectable } from 'typedi';
import { AssetService } from './asset.service';

@ObjectType()
class BrandingAssets {
  @Field({ nullable: true })
  heroImageUrl?: string | null;
  @Field({ nullable: true })
  faviconUrl?: string | null;
  @Field({ nullable: true })
  brandIconUrl?: string | null;
}

@Injectable()
@Resolver()
export class AssetResolver {
  constructor(private readonly assets: AssetService) {}

  @Query(() => BrandingAssets)
  async docsBrandingAssets(): Promise<BrandingAssets> {
    // URLs served by Koa routes
    const hero = await this.assets.get('public.docs.heroImage');
    const fav = await this.assets.get('public.docs.favicon');
    const brandIcon = await this.assets.get('public.docs.brandIcon');
    return {
      heroImageUrl: hero ? `/docs-assets/hero-image?ts=${hero.updatedAt.getTime()}` : null,
      faviconUrl: fav ? `/docs-assets/favicon?ts=${fav.updatedAt.getTime()}` : null,
      brandIconUrl: brandIcon ? `/docs-assets/brand-icon?ts=${brandIcon.updatedAt.getTime()}` : null
    };
  }

  @Mutation(() => Boolean)
  @Directive('@authz(rules: ["isAdmin"])')
  async setDocsHeroImage(
    @Arg('base64', () => String) base64: string,
    @Arg('contentType', () => String) contentType: string
  ): Promise<boolean> {
    const data = Buffer.from(base64, 'base64');
    const MAX_BYTES = Math.floor(4.8 * 1024 * 1024);
    if (data.length > MAX_BYTES) {
      throw new Error(`Hero image exceeds maximum size of 4.8 MB (received ${(data.length / 1024 / 1024).toFixed(2)} MB)`);
    }
    const allowed = new Set(['image/png', 'image/jpeg', 'image/webp']);
    if (!allowed.has(contentType)) {
      throw new Error('Unsupported content type for hero image. Allowed: PNG, JPEG, WEBP');
    }
    await this.assets.put('public.docs.heroImage', contentType, data);
    return true;
  }

  @Mutation(() => Boolean)
  @Directive('@authz(rules: ["isAdmin"])')
  async setDocsFavicon(
    @Arg('base64', () => String) base64: string,
    @Arg('contentType', () => String) contentType: string
  ): Promise<boolean> {
    const data = Buffer.from(base64, 'base64');
    const MAX_BYTES = Math.floor(4.8 * 1024 * 1024);
    if (data.length > MAX_BYTES) {
      throw new Error(`Favicon exceeds maximum size of 4.8 MB (received ${(data.length / 1024 / 1024).toFixed(2)} MB)`);
    }
    const allowed = new Set(['image/x-icon', 'image/vnd.microsoft.icon', 'image/png', 'image/svg+xml']);
    if (!allowed.has(contentType)) {
      throw new Error('Unsupported content type for favicon. Allowed: ICO, PNG, SVG');
    }
    await this.assets.put('public.docs.favicon', contentType, data);
    return true;
  }

  @Mutation(() => Boolean)
  @Directive('@authz(rules: ["isAdmin"])')
  async setBrandIcon(
    @Arg('base64', () => String) base64: string,
    @Arg('contentType', () => String) contentType: string
  ): Promise<boolean> {
    const data = Buffer.from(base64, 'base64');
    const MAX_BYTES = Math.floor(4.8 * 1024 * 1024);
    if (data.length > MAX_BYTES) {
      throw new Error(`Brand icon exceeds maximum size of 4.8 MB (received ${(data.length / 1024 / 1024).toFixed(2)} MB)`);
    }
    const allowed = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']);
    if (!allowed.has(contentType)) {
      throw new Error('Unsupported content type for brand icon. Allowed: PNG, JPEG, WEBP, SVG');
    }
    await this.assets.put('public.docs.brandIcon', contentType, data);
    return true;
  }
}
