import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const db = new PrismaClient();

async function main() {
  console.log("Seeding database...");

  // 1. Create Super Admin
  const superAdminEmail = process.env.SUPER_ADMIN_EMAIL || "admin@tikalo.com";
  const superAdminPassword = await bcrypt.hash("123456", 10);

  const superAdmin = await db.user.upsert({
    where: { email: superAdminEmail },
    update: {},
    create: {
      email: superAdminEmail,
      name: "Super Admin",
      password: superAdminPassword,
      role: "SUPER_ADMIN",
    },
  });
  console.log(`  Super Admin: ${superAdmin.email}`);

  // 2. Create demo agency
  const agency = await db.agency.upsert({
    where: { slug: "demo-agency" },
    update: {},
    create: {
      name: "Demo Travel Agency",
      email: "demo@agency.com",
      slug: "demo-agency",
      primaryColor: "#1a2d5a",
      secondaryColor: "#f0f2f5",
      contactPhone: "+213 555 0100",
      contactEmail: "contact@demo-agency.com",
      contactWebsite: "https://demo-agency.com",
      addressLine1: "123 Demo Street",
      addressLine2: "Algiers, Algeria",
    },
  });
  console.log(`  Agency: ${agency.name} (${agency.slug})`);

  // 3. Create agency admin
  const agencyAdminPassword = await bcrypt.hash("123456", 10);
  const agencyAdmin = await db.user.upsert({
    where: { email: "admin@demo-agency.com" },
    update: {},
    create: {
      email: "admin@demo-agency.com",
      name: "Agency Admin",
      password: agencyAdminPassword,
      role: "AGENCY_ADMIN",
      agencyId: agency.id,
    },
  });
  console.log(`  Agency Admin: ${agencyAdmin.email}`);

  console.log("\nSeed complete! Login credentials:");
  console.log(`  Super Admin:  ${superAdminEmail} / 123456`);
  console.log(`  Agency Admin: admin@demo-agency.com / 123456`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
