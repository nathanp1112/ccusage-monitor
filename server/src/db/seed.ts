import { db, members } from './index.js';
import { generateApiKey } from '../lib/api-key.js';

async function seed() {
  console.log('Seeding database...');

  // Create admin user
  const adminApiKey = generateApiKey();
  const [admin] = await db
    .insert(members)
    .values({
      name: 'Admin User',
      email: 'admin@example.com',
      role: 'admin',
      apiKey: adminApiKey,
      passwordHash: 'admin123', // TODO: Use proper bcrypt hash
    })
    .returning();

  console.log('Created admin user:');
  console.log(`  Email: ${admin.email}`);
  console.log(`  API Key: ${adminApiKey}`);
  console.log('');

  // Create sample members
  const members_data = [
    { name: 'Alice Chen', email: 'alice@example.com' },
    { name: 'Bob Smith', email: 'bob@example.com' },
    { name: 'Charlie Brown', email: 'charlie@example.com' },
  ];

  console.log('Created member users:');
  for (const m of members_data) {
    const apiKey = generateApiKey();
    const [member] = await db
      .insert(members)
      .values({
        name: m.name,
        email: m.email,
        role: 'member',
        apiKey,
      })
      .returning();

    console.log(`  ${member.name} (${member.email})`);
    console.log(`    API Key: ${apiKey}`);
  }

  console.log('');
  console.log('Seeding complete!');
  process.exit(0);
}

seed().catch((error) => {
  console.error('Seeding failed:', error);
  process.exit(1);
});
