import { prisma } from "@server/lib/prisma";
import type { Company, SocialAccount } from "@prisma/client";

export type CompanyWithSocial = Company & {
  socialAccounts: SocialAccount[];
};

export const companyRepository = {
  findByUserId(userId: string): Promise<Company | null> {
    return prisma.company.findUnique({ where: { userId } });
  },

  findByUserIdWithSocial(userId: string): Promise<CompanyWithSocial | null> {
    return prisma.company.findUnique({
      where: { userId },
      include: { socialAccounts: true },
    });
  },

  upsert(
    userId: string,
    data: {
      name: string;
      description?: string | null;
      sector?: string | null;
      objective?: string | null;
      tone?: string;
      colors?: string | null;
    },
  ): Promise<Company> {
    return prisma.company.upsert({
      where: { userId },
      update: data,
      create: { userId, ...data },
    });
  },

  updateLogo(userId: string, logoUrl: string): Promise<Company> {
    return prisma.company.update({
      where: { userId },
      data: { logoUrl },
    });
  },
};
