import type { Request } from 'express';
import type { SafeUser } from '../users/user.types';

export interface AuthenticatedUser extends SafeUser {
  sessionId: string;
}

export interface AuthenticatedRequest extends Request {
  user: AuthenticatedUser;
}
