import {
  IsString,
  IsNotEmpty,
  IsUUID,
  IsArray,
  ValidateNested,
  IsOptional,
} from 'class-validator';
import { Type } from 'class-transformer';

/** A single wrapped key entry for provisioning a group data key to a member. */
export class WrappedKeyEntryDto {
  @IsUUID('4', { message: 'userId must be a valid UUID v4' })
  @IsNotEmpty({ message: 'userId is required' })
  userId!: string;

  @IsString({ message: 'wrappedKey must be a string' })
  @IsNotEmpty({ message: 'wrappedKey is required' })
  wrappedKey!: string;
}

/** Request body for provisioning group data keys for one or more members. */
export class ProvisionGroupKeysDto {
  @IsArray({ message: 'keys must be an array' })
  @ValidateNested({ each: true })
  @Type(() => WrappedKeyEntryDto)
  keys!: WrappedKeyEntryDto[];
}

/** Response for a single user's wrapped group key. */
export interface WrappedGroupKeyResponse {
  groupId: string;
  userId: string;
  wrappedKey: string;
}
