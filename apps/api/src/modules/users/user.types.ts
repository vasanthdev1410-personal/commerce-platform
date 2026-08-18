import type {
  AccountType,
  UserRole,
  WholesaleStatus,
} from '../../generated/prisma/enums';

export interface SafeUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  accountType: AccountType;
  wholesaleStatus: WholesaleStatus;
  isActive: boolean;
}

export interface PublicAuthUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  accountType: AccountType;
}
