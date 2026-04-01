import { Role } from "@prisma/client";

export function normalizeRole(role: Role): Role {
  return role === Role.ADMIN ? Role.OWNER : role;
}

export const ROLE_ORDER: Role[] = [Role.EDITOR, Role.OWNER];

export function isAtLeastRole(current: Role, required: Role): boolean {
  return ROLE_ORDER.indexOf(normalizeRole(current)) >= ROLE_ORDER.indexOf(normalizeRole(required));
}

export function roleToApi(role: Role): "owner" | "admin" | "editor" {
  if (normalizeRole(role) === Role.OWNER) return "owner";
  return "editor";
}
