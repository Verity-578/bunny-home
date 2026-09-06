import 'dotenv/config';
import path from 'node:path';

import { SupabaseStore } from './db/supabaseStore.js';

const supabaseUrl = process.env.SUPABASE_URL?.trim();
const supabaseKey = process.env.SUPABASE_KEY?.trim();

export const storage = supabaseUrl && supabaseKey
  ? new SupabaseStore(supabaseUrl, supabaseKey)
  : await createLocalStore();

async function createLocalStore() {
  const { SqliteStore } = await import('./db/sqliteStore.js');
  return new SqliteStore(
    process.env.DATABASE_PATH
      ? path.resolve(process.env.DATABASE_PATH)
      : path.join(process.cwd(), 'data', 'bunny-home.db'),
  );
}
