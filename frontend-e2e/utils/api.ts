import { Page, Response, expect } from '@playwright/test';

export type ApiWaitOptions = {
  method: string | RegExp;
  url: RegExp;
  status?: number | number[];
  action: () => Promise<unknown>;
  failureMessage: string;
};

export async function waitForPageApi<T = unknown>(
  page: Page,
  options: ApiWaitOptions,
): Promise<{ response: Response; body: T | string | null }> {
  const [response] = await Promise.all([
    page.waitForResponse(
      (resp) =>
        matchesMethod(resp.request().method(), options.method) &&
        options.url.test(resp.url()),
      {
        timeout: Number(process.env.E2E_API_TIMEOUT_MS ?? 30000),
      },
    ),
    options.action(),
  ]);

  const allowed = Array.isArray(options.status)
    ? options.status
    : options.status
      ? [options.status]
      : undefined;
  const body = await readBody(response);

  if (allowed && !allowed.includes(response.status())) {
    throw new Error(`${options.failureMessage}. ${options.method} ${response.url()} returned ${response.status()}.
Response: ${JSON.stringify(body, null, 2)}`);
  }

  return { response, body: body as T | string | null };
}

function matchesMethod(actual: string, expected: string | RegExp) {
  return typeof expected === 'string'
    ? actual === expected
    : expected.test(actual);
}

export async function readBody(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return await response.text().catch(() => null);
  }
}

export function expectSuccessfulStatus(
  response: Response,
  expected: number | number[],
  message: string,
) {
  const allowed = Array.isArray(expected) ? expected : [expected];
  expect(
    allowed,
    `${message}. Received ${response.status()} from ${response.url()}`,
  ).toContain(response.status());
}
