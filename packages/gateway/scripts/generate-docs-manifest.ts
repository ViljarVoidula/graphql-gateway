import fs from 'fs';
import matter from 'gray-matter';
import path from 'path';

interface DocEntry {
  slug: string;
  title: string;
  description?: string;
  category?: string;
  order?: number;
  keywords?: string[];
  toc?: boolean;
  file: string;
}

const CONTENT_DIR = path.join(__dirname, '..', 'src', 'client', 'docs', 'content');
const OUTPUT = path.join(__dirname, '..', 'src', 'client', 'docs', 'manifest.json');

function walk(dir: string, fileList: string[] = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    if (e.isDirectory()) walk(path.join(dir, e.name), fileList);
    else if (e.name.endsWith('.mdx')) fileList.push(path.join(dir, e.name));
  }
  return fileList;
}

function buildSlug(file: string) {
  return file
    .replace(CONTENT_DIR, '')
    .replace(/\\/g, '/')
    .replace(/\/(index)?\.mdx?$/, '')
    .replace(/\.mdx$/, '')
    .replace(/^\//, '');
}

function main() {
  if (!fs.existsSync(CONTENT_DIR)) {
    console.warn('No docs content directory found, skipping manifest generation');
    return;
  }
  const files = walk(CONTENT_DIR);
  const docs: DocEntry[] = files.map((file) => {
    const raw = fs.readFileSync(file, 'utf8');
    const parsed = matter(raw);
    const data: any = parsed.data || {};
    return {
      slug: buildSlug(file) || path.basename(file, path.extname(file)),
      title: data.title || path.basename(file, path.extname(file)),
      description: data.description,
      category: data.category,
      order: typeof data.order === 'number' ? data.order : 9999,
      keywords: Array.isArray(data.keywords) ? data.keywords : [],
      toc: data.toc !== false && data.toc !== 'false',
      file: path.relative(path.join(__dirname, '..', 'src', 'client', 'docs'), file)
    };
  });

  docs.sort((a, b) => {
    const catA = a.category || 'ZZZ';
    const catB = b.category || 'ZZZ';
    if (catA !== catB) return catA.localeCompare(catB);
    const orderDiff = (a.order || 0) - (b.order || 0);
    if (orderDiff !== 0) return orderDiff;
    return a.title.localeCompare(b.title);
  });

  fs.writeFileSync(OUTPUT, JSON.stringify({ generatedAt: new Date().toISOString(), docs }, null, 2));
  console.log(`Docs manifest written: ${OUTPUT} (${docs.length} entries)`);
}

main();
