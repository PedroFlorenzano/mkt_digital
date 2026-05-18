import { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import CredentialsProvider from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "./prisma";
import bcrypt from "bcryptjs";

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma) as NextAuthOptions["adapter"],
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Senha", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          throw new Error("Credenciais inválidas");
        }

        const user = await prisma.user.findUnique({
          where: { email: credentials.email },
        });

        if (!user || !user.password) {
          throw new Error("Usuário não encontrado");
        }

        const isValid = await bcrypt.compare(credentials.password, user.password);

        if (!isValid) {
          throw new Error("Senha incorreta");
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.image,
        };
      },
    }),
  ],
  session: {
    strategy: "jwt",
  },
  callbacks: {
    async jwt({ token, user, trigger, session }) {
      // First login: populate userId and force passage through company selector
      if (user) {
        token.id = user.id;
        token.activeCompanyId = undefined;
      }

      // Explicit update via useSession().update({ activeCompanyId })
      if (trigger === "update" && session != null) {
        if (session.activeCompanyId != null) {
          // Security invariant: verify ownership in DB before accepting the value.
          // This prevents a user from injecting another user's companyId via
          // a direct call to the NextAuth update endpoint.
          const company = await prisma.company.findFirst({
            where: { id: session.activeCompanyId, userId: token.id },
          });
          if (company != null) {
            token.activeCompanyId = session.activeCompanyId;
          }
          // else: invalid or unauthorized companyId — ignore silently,
          // keeping the previous activeCompanyId value (may be undefined)
        } else if (session.activeCompanyId === null) {
          // Explicit company logout (e.g., company was deleted)
          token.activeCompanyId = undefined;
        }
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id;
        session.user.activeCompanyId = token.activeCompanyId ?? undefined;
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
};
