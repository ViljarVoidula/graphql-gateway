import fs from 'fs';
import { buildSchema, introspectionFromSchema, printSchema } from 'graphql';
import path from 'path';
import 'reflect-metadata';
import { dataSource } from '../src/db/datasource';
import { SchemaLoader } from '../src/SchemaLoader';
import { makeEndpointsSchema } from '../src/services/endpoints';
import { buildHMACExecutor } from '../src/utils/hmacExecutor';
import { getStitchingDirectivesTransformer } from '../src/utils/stitchingDirectivesCompat';

async function main() {
  const outDir = path.join(__dirname, '..', 'src', 'client', 'docs', 'generated');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  await dataSource.initialize();
  const loader = new SchemaLoader((endpoints) => {
    const subschemas: any[] = endpoints.map(({ sdl, url, useMsgPack }) => ({
      schema: buildSchema(sdl),
      executor: buildHMACExecutor({ endpoint: url, timeout: 5000, enableHMAC: true, useMsgPack: !!useMsgPack }),
      batch: true
    }));
    subschemas.push(makeEndpointsSchema(loader) as any);
    return require('@graphql-tools/stitch').stitchSchemas({
      subschemaConfigTransforms: [getStitchingDirectivesTransformer()],
      subschemas
    });
  }, []);
  await loader.reload();
  const schema = loader.schema!; // loader.reload() ensures schema is built

  // Introspection JSON
  const introspection = introspectionFromSchema(schema, { descriptions: true });
  const jsonPath = path.join(outDir, 'schema.json');
  fs.writeFileSync(jsonPath, JSON.stringify(introspection, null, 2));

  // SDL
  const sdl = printSchema(schema);
  const sdlPath = path.join(outDir, 'schema.graphql');
  fs.writeFileSync(sdlPath, sdl);

  // Integrity hash (simple)
  const hash = require('crypto').createHash('sha256').update(sdl).digest('hex');
  fs.writeFileSync(path.join(outDir, 'schema.hash'), hash);

  console.log(`Introspection written: ${jsonPath}`);
  console.log(`SDL written: ${sdlPath}`);
  console.log(`Hash: ${hash.substring(0, 12)}...`);
  await dataSource.destroy();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
