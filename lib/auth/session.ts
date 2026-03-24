import { Role } from "@prisma/client";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/options";
import { forbidden, unauthorized } from "@/lib/http/errors";

export type SessionUser = {
  id: string;
  role: Role;
  email?: string | null;
  name?: string | null;
};

export async function requireSessionUser(): Promise<SessionUser> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || !session.user.role) {
    unauthorized();
  }

  return {
    id: session.user.id,
    role: session.user.role,
    email: session.user.email,
    name: session.user.name,
  };
}

export function requireRole(user: SessionUser, allowed: Role[]): void {
  if (!allowed.includes(user.role)) {
    forbidden();
  }
}

export function requireOwnership(user: SessionUser, ownerId: string): void {
  if (user.role === Role.OWNER || user.role === Role.ADMIN) {
    return;
  }

  if (user.id !== ownerId) {
    forbidden("Resource is only accessible to its owner");
  }
}
