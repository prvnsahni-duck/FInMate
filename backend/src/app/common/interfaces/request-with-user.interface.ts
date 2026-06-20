import { Request } from 'express';
import { User } from '@finmate/data-models';

export interface RequestWithUser extends Request {
  user: User;
}

