import { readFile, writeFile } from 'node:fs/promises';

const databaseId = process.env.DEKO_D1_DATABASE_ID;
if (!/^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(databaseId ?? '')) {
  console.error('Set DEKO_D1_DATABASE_ID to the ID of your Cloudflare D1 database named deko-dad.');
  process.exit(1);
}

const config = JSON.parse(await readFile(new URL('../wrangler.json', import.meta.url), 'utf8'));
config.d1_databases[0].database_id = databaseId;
config.keep_vars = true;
await writeFile(new URL('../wrangler.generated.json', import.meta.url), JSON.stringify(config, null, 2) + '\n');
