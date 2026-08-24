import type { Role } from '@prisma/client';

export type AuthActor = {
  accountId: string;
  sessionId: string;
  role: Role;
  username: string;
  employeeId: string | null;
  passwordRestricted: boolean;
};

declare global {
  namespace Express {
    interface Request {
      actor?: AuthActor;
    }
  }
}
