import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import MicrosoftEntraID from "next-auth/providers/microsoft-entra-id";
import type { Role } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { resolveAccess } from "@/lib/access";
import { lockoutFor, verifyPassword } from "@/lib/password";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      email: string;
      name?: string | null;
      image?: string | null;
      role: Role;
      vendorId: string | null;
      vendorName: string | null;
      mustChangePassword: boolean;
    };
  }
}

/**
 * Sessions are JWT rather than database rows.
 *
 * Not a preference: the Credentials provider cannot use adapter sessions, so
 * signing in with a password requires this. The adapter is still here for the
 * Microsoft path and for user records generally.
 *
 * Role and vendor are read from the database on every request rather than
 * trusted from the token, so revoking access or changing a role takes effect
 * immediately instead of when the token happens to expire.
 */
const providers = [
  Credentials({
    name: "Email and password",
    credentials: {
      email: { label: "Email", type: "email" },
      password: { label: "Password", type: "password" },
    },
    async authorize(credentials) {
      const email = String(credentials?.email ?? "").trim().toLowerCase();
      const password = String(credentials?.password ?? "");
      if (!email || !password) return null;

      const user = await prisma.user.findUnique({ where: { email } });

      // Same failure for a wrong password, an unknown address and an account
      // with no password set, so the form cannot be used to discover who has
      // an account here.
      if (!user?.passwordHash || !user.isActive) return null;

      if (user.lockedUntil && user.lockedUntil > new Date()) return null;

      const ok = await verifyPassword(password, user.passwordHash);

      if (!ok) {
        const failedLoginCount = user.failedLoginCount + 1;
        await prisma.user.update({
          where: { id: user.id },
          data: { failedLoginCount, lockedUntil: lockoutFor(failedLoginCount) },
        });
        return null;
      }

      // Access is re-checked at sign-in, not only at account creation, so a
      // vendor that has been deactivated cannot keep using an old password.
      const decision = await resolveAccess(email);
      if (!decision.allowed) return null;

      await prisma.user.update({
        where: { id: user.id },
        data: {
          failedLoginCount: 0,
          lockedUntil: null,
          lastLoginAt: new Date(),
          role: decision.role,
          vendorId: decision.vendorId,
        },
      });

      return { id: user.id, email: user.email, name: user.name };
    },
  }),
];

if (process.env.AUTH_MICROSOFT_ENTRA_ID_ID) {
  providers.push(
    MicrosoftEntraID({
      clientId: process.env.AUTH_MICROSOFT_ENTRA_ID_ID,
      clientSecret: process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET,
      issuer: process.env.AUTH_MICROSOFT_ENTRA_ID_ISSUER,
    }) as never,
  );
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt", maxAge: 60 * 60 * 12 },
  pages: { signIn: "/login", error: "/login" },
  providers,

  callbacks: {
    async signIn({ user, account }) {
      const email = user.email?.toLowerCase();
      if (!email) return false;

      // The credentials provider has already decided; anything else is checked here.
      if (account?.provider === "credentials") return true;

      const decision = await resolveAccess(email);
      if (!decision.allowed) return `/login?error=${encodeURIComponent(decision.reason)}`;

      // A Microsoft sign-in creates the record on first use, since Entra has
      // already established who they are. No password is set: they carry on
      // using Microsoft.
      await prisma.user.upsert({
        where: { email },
        create: {
          email,
          name: user.name,
          role: decision.role,
          vendorId: decision.vendorId,
          mustChangePassword: false,
          emailVerified: new Date(),
        },
        update: { role: decision.role, vendorId: decision.vendorId, lastLoginAt: new Date() },
      });
      return true;
    },

    async jwt({ token, user }) {
      if (user?.email) token.email = user.email;
      return token;
    },

    async session({ session, token }) {
      const email = String(token.email ?? "").toLowerCase();
      if (!email) return session;

      const record = await prisma.user.findUnique({
        where: { email },
        select: {
          id: true,
          role: true,
          vendorId: true,
          isActive: true,
          mustChangePassword: true,
          vendor: { select: { name: true } },
        },
      });

      // A deactivated account keeps a valid token until it expires, so the
      // check has to happen here rather than only at sign-in.
      if (!record?.isActive) {
        return { ...session, user: { ...session.user, id: "", role: "VENDOR" as Role, vendorId: null } };
      }

      session.user.id = record.id;
      session.user.email = email;
      session.user.role = record.role;
      session.user.vendorId = record.vendorId;
      session.user.vendorName = record.vendor?.name ?? null;
      session.user.mustChangePassword = record.mustChangePassword;
      return session;
    },
  },
});
