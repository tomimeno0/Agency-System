import { Role } from "@prisma/client";

export const ROLE_ORDER: Role[] = [Role.EDITOR, Role.ADMIN, Role.OWNER];

export function isAtLeastRole(current: Role, required: Role): boolean {
  return ROLE_ORDER.indexOf(current) >= ROLE_ORDER.indexOf(required);
}

export function roleToApi(role: Role): "owner" | "admin" | "editor" {
  if (role === Role.OWNER) return "owner";
  if (role === Role.ADMIN) return "admin";
  return "editor";
}
