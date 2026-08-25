import type { Principal } from './policy.service';

export type AuthActor = Principal;

declare global {
  namespace Express {
    interface Request {
      actor?: AuthActor;
    }
  }
}
