import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  // Optional for offline generation/validation. Migrations require DIRECT_URL.
  datasource: { url: process.env.DIRECT_URL ?? '' },
});
