import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // Create sample users
  const users = await Promise.all([
    prisma.users.upsert({
      where: { email: "alice@example.com" },
      update: {},
      create: { email: "alice@example.com", name: "Alice", plan_tier: "starter" },
    }),
    prisma.users.upsert({
      where: { email: "bob@example.com" },
      update: {},
      create: { email: "bob@example.com", name: "Bob", plan_tier: "pro" },
    }),
  ]);

  const alice = users[0];
  console.log(`Seeding events for user: ${alice.email} (id=${alice.id})`);

  // Generate 14 days of realistic usage for Alice
  const now = new Date();
  const events: {
    user_id: number;
    date_key: string;
    request_id: string;
    status: string;
    reserved_at: Date;
    committed_at: Date | null;
  }[] = [];

  for (let i = 13; i >= 0; i--) {
    const day = new Date(now);
    day.setUTCDate(day.getUTCDate() - i);
    const date_key = day.toISOString().slice(0, 10);

    // Random committed turns: 5–25
    const committed = Math.floor(Math.random() * 20) + 5;
    for (let t = 0; t < committed; t++) {
      const reserved_at = new Date(day);
      reserved_at.setUTCHours(8 + Math.floor(t / 3), t * 3, 0, 0);
      const committed_at = new Date(reserved_at.getTime() + 30_000);
      events.push({
        user_id: alice.id,
        date_key,
        request_id: `req-${date_key}-${t}`,
        status: "committed",
        reserved_at,
        committed_at,
      });
    }

    // A few active reservations for today only
    if (i === 0) {
      for (let r = 0; r < 3; r++) {
        events.push({
          user_id: alice.id,
          date_key,
          request_id: `req-${date_key}-res-${r}`,
          status: "reserved",
          reserved_at: new Date(Date.now() - r * 60_000), // within last 3 min
          committed_at: null,
        });
      }
    }
  }

  await prisma.daily_usage_events.createMany({ data: events });
  console.log(`Created ${events.length} events.`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
