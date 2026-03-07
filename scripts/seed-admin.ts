// ---------------------------------------------------------------------------
// GardenOS – Seed Script: Create admin user
// ---------------------------------------------------------------------------
// Run: npx tsx scripts/seed-admin.ts
// ---------------------------------------------------------------------------
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
});
const prisma = new PrismaClient({ adapter });

async function main() {
  const email = process.env.ADMIN_EMAIL ?? "admin@gardenos.dk";
  const password = process.env.ADMIN_PASSWORD ?? "admin123!";

  // Check if admin already exists
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`✅ Admin user already exists: ${email}`);
    return;
  }

  const hashedPassword = await bcrypt.hash(password, 12);

  const admin = await prisma.user.create({
    data: {
      email,
      name: "Administrator",
      password: hashedPassword,
      role: "admin",
    },
  });

  console.log(`✅ Admin user created: ${admin.email} (id: ${admin.id})`);
  console.log(`   Log ind med: ${email} / ${password}`);
  console.log(`   ⚠️  Skift adgangskode efter første login!`);
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
