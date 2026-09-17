import { spawn } from "node:child_process";

/**
 * Startup wrapper for hosts that build and run in separate places.
 *
 * Applies the schema, then starts the server. Kept out of the build because a
 * build machine has no business reaching the production database, and because
 * a build that needs it will happily succeed against nothing and leave you
 * with an empty schema.
 *
 * A failed schema push does not stop the server. A running app with a stale
 * schema gives you a readable error on one page; an app that will not boot
 * gives you nothing to look at.
 */

function run(command, args) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { stdio: "inherit", shell: process.platform === "win32" });
    child.on("exit", (code) => resolve(code ?? 1));
    child.on("error", () => resolve(1));
  });
}

const port = process.env.PORT ?? "8080";

if (process.env.SKIP_DB_PUSH === "true") {
  console.log("[start] SKIP_DB_PUSH is set, leaving the schema alone");
} else if (!process.env.DATABASE_URL) {
  console.warn("[start] DATABASE_URL is not set. Starting anyway, but nothing will work.");
} else {
  console.log("[start] applying the Prisma schema");
  const code = await run("npx", ["prisma", "db", "push", "--skip-generate", "--accept-data-loss"]);
  if (code !== 0) {
    console.error(
      "[start] the schema push failed. Starting the server anyway so the logs and pages are reachable.",
    );
  }
}

console.log(`[start] starting Next.js on port ${port}`);
const server = await run("npx", ["next", "start", "--port", port]);
process.exit(server);
