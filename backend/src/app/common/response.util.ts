export class SuccessResponse<T = any> {
  readonly success = true;
  public readonly data: T | Record<string, never>;

  constructor(
    public readonly message: string,
    data?: T,
  ) {
    this.data = (data !== undefined && data !== null) ? data : ({} as any);
  }
}
