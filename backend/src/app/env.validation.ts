import { plainToInstance } from 'class-transformer';
import { IsBoolean, IsOptional, validateSync } from 'class-validator';

export class EnvironmentVariables {
  @IsOptional()
  @IsBoolean()
  RATE_LIMIT_ENABLED?: boolean;
}

export function validate(config: Record<string, unknown>) {
  // Safe default value if environment variable is missing
  if (
    config.RATE_LIMIT_ENABLED === undefined ||
    config.RATE_LIMIT_ENABLED === null ||
    config.RATE_LIMIT_ENABLED === ''
  ) {
    config.RATE_LIMIT_ENABLED = true;
  } else if (typeof config.RATE_LIMIT_ENABLED === 'string') {
    const normalized = config.RATE_LIMIT_ENABLED.trim().toLowerCase();
    if (normalized === 'true') {
      config.RATE_LIMIT_ENABLED = true;
    } else if (normalized === 'false') {
      config.RATE_LIMIT_ENABLED = false;
    }
  }

  const validatedConfig = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });

  const errors = validateSync(validatedConfig, {
    skipMissingProperties: false,
  });

  if (errors.length > 0) {
    throw new Error(`Environment validation failed: ${errors.toString()}`);
  }
  return validatedConfig;
}
