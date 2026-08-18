export type UserRole = 'CUSTOMER' | 'ADMIN';
export type AccountType = 'RETAIL' | 'WHOLESALE';
export type WholesaleStatus =
  | 'NOT_REQUESTED'
  | 'PENDING'
  | 'APPROVED'
  | 'REJECTED';

export interface AuthUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  accountType: AccountType;
  wholesaleStatus: WholesaleStatus;
}

export interface AuthResponse {
  user: Omit<AuthUser, 'wholesaleStatus'>;
  accessToken: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface RegisterInput {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
}
