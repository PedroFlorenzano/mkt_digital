import { prisma } from "@server/lib/prisma";
import type { AdPlatformCredential } from "@prisma/client";

export const credentialRepository = {
  findByCompanyAndPlatform(companyId: string, platform: string): Promise<AdPlatformCredential | null> {
    return prisma.adPlatformCredential.findUnique({
      where: { companyId_platform: { companyId, platform } },
    });
  },

  upsert(companyId: string, platform: string, data: { encryptedData: string }): Promise<AdPlatformCredential> {
    return prisma.adPlatformCredential.upsert({
      where: { companyId_platform: { companyId, platform } },
      create: { companyId, platform, encryptedData: data.encryptedData, isValid: false, validatedAt: null },
      update: { encryptedData: data.encryptedData, isValid: false, validatedAt: null },
    });
  },

  delete(companyId: string, platform: string): Promise<AdPlatformCredential> {
    return prisma.adPlatformCredential.delete({
      where: { companyId_platform: { companyId, platform } },
    });
  },

  markValid(companyId: string, platform: string): Promise<AdPlatformCredential> {
    return prisma.adPlatformCredential.update({
      where: { companyId_platform: { companyId, platform } },
      data: { isValid: true, validatedAt: new Date() },
    });
  },

  markInvalid(companyId: string, platform: string): Promise<AdPlatformCredential> {
    return prisma.adPlatformCredential.update({
      where: { companyId_platform: { companyId, platform } },
      data: { isValid: false },
    });
  },

  findValidByCompanyAndPlatform(companyId: string, platform: string) {
    return prisma.adPlatformCredential.findFirst({
      where: { companyId, platform, isValid: true },
      select: { id: true },
    });
  },
};
