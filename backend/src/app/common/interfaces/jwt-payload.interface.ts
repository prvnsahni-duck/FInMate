export interface JwtPayload {
  userId: string;
  email?: string;
  refreshId?: string;
  iat?: number;
  exp?: number;
}

