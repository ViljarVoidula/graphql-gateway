// Compatibility wrapper for stitching directives transformer.
// Ensures a stable function type even if multiple @graphql-tools versions are present.
import type { SubschemaConfig } from '@graphql-tools/delegate';
import { stitchingDirectives } from '@graphql-tools/stitching-directives';

export function getStitchingDirectivesTransformer() {
  const { stitchingDirectivesTransformer } = stitchingDirectives();
  // Cast through unknown to bridge potential multiple installed versions of @graphql-tools/delegate
  return stitchingDirectivesTransformer as unknown as (cfg: SubschemaConfig) => SubschemaConfig;
}
