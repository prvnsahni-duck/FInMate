import { IsString, IsNotEmpty, MaxLength, IsOptional, IsEnum, IsUUID, IsInt } from 'class-validator';

export class CreateNoteDto {
  @IsString()
  @IsNotEmpty({ message: 'Note title is required' })
  @MaxLength(160, { message: 'Note title cannot exceed 160 characters' })
  title!: string;

  @IsString()
  @IsNotEmpty({ message: 'Note body is required' })
  body!: string;

  @IsEnum(['private', 'group'], { message: 'Invalid note visibility option' })
  @IsNotEmpty({ message: 'Note visibility option is required' })
  visibility!: 'private' | 'group';

  @IsUUID('4', { message: 'Group ID must be a valid UUID' })
  @IsOptional()
  groupId?: string;
}

export class UpdateNoteDto {
  @IsString()
  @IsOptional()
  @MaxLength(160, { message: 'Note title cannot exceed 160 characters' })
  title?: string;

  @IsString()
  @IsOptional()
  body?: string;

  @IsEnum(['private', 'group'], { message: 'Invalid note visibility option' })
  @IsOptional()
  visibility?: 'private' | 'group';

  @IsUUID('4', { message: 'Group ID must be a valid UUID' })
  @IsOptional()
  groupId?: string;

  @IsInt({ message: 'Version must be an integer' })
  @IsNotEmpty({ message: 'Version is required to resolve concurrent edits' })
  version!: number;
}
