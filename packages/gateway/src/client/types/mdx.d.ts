declare module '*.mdx' {
  import { ComponentType } from 'react';
  export const frontmatter: Record<string, any>;
  const MDXComponent: ComponentType<any>;
  export default MDXComponent;
}
