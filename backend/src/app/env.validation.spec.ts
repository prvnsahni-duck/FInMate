import 'reflect-metadata';
import { validate } from './env.validation';

describe('env validation', () => {
  it('parses RATE_LIMIT_ENABLED=false as boolean false', () => {
    expect(validate({ RATE_LIMIT_ENABLED: 'false' }).RATE_LIMIT_ENABLED).toBe(
      false,
    );
  });

  it('parses RATE_LIMIT_ENABLED=true as boolean true', () => {
    expect(validate({ RATE_LIMIT_ENABLED: 'true' }).RATE_LIMIT_ENABLED).toBe(
      true,
    );
  });

  it('defaults RATE_LIMIT_ENABLED to true when missing', () => {
    expect(validate({}).RATE_LIMIT_ENABLED).toBe(true);
  });
});
