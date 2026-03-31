import { Role, UserStatus } from "@prisma/client";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: Role;
      status: UserStatus;
      sessionVersion?: number;
      name?: string | null;
      email?: string | null;
      image?: string | null;
    };
  }

  interface User {
    role: Role;
    status: UserStatus;
    sessionVersion?: number;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role?: Role;
    status?: UserStatus;
    sessionVersion?: number;
    invalidSession?: boolean;
  }
}
