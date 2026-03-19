// ---------------------------------------------------------------------------
// GardenOS – Auth.js v5 Configuration
// ---------------------------------------------------------------------------
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/app/lib/db";

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,

  providers: [
    Credentials({
      name: "Adgangskode",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Adgangskode", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        const user = await prisma.user.findUnique({
          where: { email: (credentials.email as string).trim().toLowerCase() },
        });

        if (!user?.password) return null;

        // Normalize to NFC – macOS often sends NFD (a + combining ring)
        // which makes Danish chars like å/æ/ø fail bcrypt.compare
        const normalizedPw = (credentials.password as string).normalize("NFC");

        const valid = await bcrypt.compare(
          normalizedPw,
          user.password,
        );

        if (!valid) return null;

        // Record login: update lastLoginAt + activity log (fire-and-forget)
        const db = prisma as any;
        db.user.update({
          where: { id: user.id },
          data: { lastLoginAt: new Date() },
        }).catch(() => {/* ignore */});
        db.activityLog.create({
          data: { userId: user.id, action: "login" },
        }).catch(() => {/* ignore */});

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
        };
      },
    }),
  ],

  session: { strategy: "jwt" },

  pages: {
    signIn: "/login",
  },

  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = (user as { role?: string }).role ?? "user";
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        (session.user as { role?: string }).role = token.role as string;
      }
      return session;
    },
  },
});
