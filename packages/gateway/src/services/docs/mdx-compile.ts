import matter from 'gray-matter';
// Lightweight MDX metadata extraction (frontmatter + headings) without remark/unified.
// Removes dependency on ESM-only remark-parse to avoid require() of ESM errors under ts-node.

export interface CompiledMDXMeta {
  frontmatter: any;
  headings: { depth: number; value: string; slug: string }[];
}

export async function compileMDX(raw: string): Promise<CompiledMDXMeta> {
  const fm = matter(raw);
  const content = fm.content.replace(/\r\n?/g, '\n');
  const lines = content.split('\n');
  const headings: { depth: number; value: string; slug: string }[] = [];
  const slugify = (str: string) =>
    str
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .trim()
      .replace(/\s+/g, '-');
  let inFence = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('```')) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const m = /^(#{1,6})\s+(.*)$/.exec(trimmed);
    if (m) {
      const depth = m[1].length;
      if (depth <= 3) {
        const text = m[2].replace(/#+$/, '').trim();
        if (text) headings.push({ depth, value: text, slug: slugify(text) });
      }
    }
  }
  if (!fm.data.title) throw new Error('Frontmatter "title" is required');
  return { frontmatter: fm.data, headings };
}
