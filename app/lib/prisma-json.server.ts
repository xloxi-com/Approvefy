import type { InputJsonValue } from "@prisma/client/runtime/library";

/** JSON columns on Prisma models — uses runtime library types (stable in IDE + tsc). */
export function toDbJson(value: unknown): InputJsonValue {
  return value as InputJsonValue;
}
