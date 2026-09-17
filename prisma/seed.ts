import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // Legal entities. Replace the codes with your real dataAreaIds.
  const entities = [
    { code: "hb01", name: "Huda Beauty FZ LLC", currency: "AED" },
    { code: "hb02", name: "Huda Beauty UK Ltd", currency: "GBP" },
    { code: "hbus", name: "Huda Beauty US Inc", currency: "USD" },
  ];

  for (const e of entities) {
    await prisma.legalEntity.upsert({ where: { code: e.code }, create: e, update: e });
  }

  // A sample vendor so you can test the domain mapping end to end.
  const vendor = await prisma.vendor.upsert({
    where: { code: "V-000001" },
    create: {
      code: "V-000001",
      name: "Sample Supplier Ltd",
      domains: ["samplesupplier.com"],
      source: "MANUAL",
    },
    update: {},
  });

  for (const e of entities) {
    const le = await prisma.legalEntity.findUniqueOrThrow({ where: { code: e.code } });
    await prisma.vendorLegalEntity.upsert({
      where: { vendorId_legalEntityId: { vendorId: vendor.id, legalEntityId: le.id } },
      create: { vendorId: vendor.id, legalEntityId: le.id },
      update: {},
    });
  }

  // Integration settings row. Credentials are entered in the admin UI, not here.
  await prisma.integrationSetting.upsert({
    where: { id: "default" },
    create: { id: "default", legalEntities: entities.map((e) => e.code) },
    update: {},
  });

  // Bootstrap the first administrator. Without this there is nobody who can
  // sign in, since accounts are no longer created on first sign-in.
  const adminEmail = (process.env.HB_ADMIN_EMAILS ?? "").split(",")[0]?.trim().toLowerCase();

  if (adminEmail && adminEmail.includes("@")) {
    const { hashPassword, generateTemporaryPassword } = await import("../src/lib/password");
    const existing = await prisma.user.findUnique({ where: { email: adminEmail } });

    if (existing?.passwordHash) {
      console.log(`Administrator ${adminEmail} already has a password. Left alone.`);
    } else {
      const password = generateTemporaryPassword();
      await prisma.user.upsert({
        where: { email: adminEmail },
        create: {
          email: adminEmail,
          role: "HB_ADMIN",
          passwordHash: await hashPassword(password),
          mustChangePassword: true,
        },
        update: {
          role: "HB_ADMIN",
          passwordHash: await hashPassword(password),
          mustChangePassword: true,
        },
      });
      console.log("");
      console.log("  Administrator account ready");
      console.log(`  Email:    ${adminEmail}`);
      console.log(`  Password: ${password}`);
      console.log("  You will be asked to change it as soon as you sign in.");
      console.log("");
    }
  } else {
    console.log("HB_ADMIN_EMAILS is not set, so no administrator was created.");
  }

  console.log("Seed complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
