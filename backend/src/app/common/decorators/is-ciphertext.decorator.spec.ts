import { validateSync } from 'class-validator';
import { IsCiphertext } from './is-ciphertext.decorator';

class TestDto {
  @IsCiphertext()
  field!: any;
}

describe('IsCiphertext Decorator', () => {
  it('accepts valid ciphertext string (two base64 segments separated by colon)', () => {
    const dto = new TestDto();

    // "hello" in base64: aGVsbG8=
    // "world" in base64: d29ybGQ=
    dto.field = 'aGVsbG8=:d29ybGQ=';

    const errors = validateSync(dto);
    expect(errors).toHaveLength(0);
  });

  it('rejects plaintext strings', () => {
    const dto = new TestDto();
    dto.field = 'plain-text-string';

    const errors = validateSync(dto);
    expect(errors).toHaveLength(1);
    expect(errors[0].constraints?.isCiphertext).toContain(
      'must be a valid zero-knowledge ciphertext',
    );
  });

  it('rejects non-string values', () => {
    const dto = new TestDto();
    dto.field = 12345;

    const errors = validateSync(dto);
    expect(errors).toHaveLength(1);
  });

  it('rejects string without exactly one colon', () => {
    const dto = new TestDto();
    dto.field = 'aGVsbG8=d29ybGQ='; // no colon

    const errors = validateSync(dto);
    expect(errors).toHaveLength(1);

    const dto2 = new TestDto();
    dto2.field = 'aGVsbG8=:d29ybGQ=:aGVsbG8='; // two colons

    const errors2 = validateSync(dto2);
    expect(errors2).toHaveLength(1);
  });

  it('rejects invalid base64 segments', () => {
    const dto = new TestDto();
    dto.field = 'invalid_base64_chars@#:d29ybGQ=';

    const errors = validateSync(dto);
    expect(errors).toHaveLength(1);
  });
});
