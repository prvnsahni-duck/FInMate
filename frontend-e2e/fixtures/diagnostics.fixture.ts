import { test as baseTest } from '@playwright/test';
import fs from 'fs';
import path from 'path';

type DiagnosticsFixtures = {
  captureDiagnostics: void;
};

export const test = baseTest.extend<DiagnosticsFixtures>({
  captureDiagnostics: [
    async ({ page, context }, use, testInfo) => {
      const consoleLogs: string[] = [];
      const pageErrors: string[] = [];
      const network: Array<Record<string, unknown>> = [];

      page.on('console', (msg) =>
        consoleLogs.push(
          `${new Date().toISOString()} ${msg.type()}: ${msg.text()}`,
        ),
      );
      page.on('pageerror', (error) =>
        pageErrors.push(`${new Date().toISOString()} ${String(error)}`),
      );
      page.on('requestfailed', (request) =>
        network.push({
          type: 'requestfailed',
          method: request.method(),
          url: request.url(),
          failure: request.failure(),
          postData: request.postData(),
        }),
      );
      page.on('response', async (response) => {
        if (response.status() < 400) return;
        network.push({
          type: 'response',
          method: response.request().method(),
          url: response.url(),
          status: response.status(),
          statusText: response.statusText(),
          requestBody: response.request().postData(),
          responseBody: await response.text().catch(() => '<unavailable>'),
        });
      });

      await context.tracing
        .start({ screenshots: true, snapshots: true, sources: true })
        .catch(() => undefined);
      await use();

      if (testInfo.status === 'passed') {
        await context.tracing.stop().catch(() => undefined);
        return;
      }

      const out = testInfo.outputPath('diagnostics');
      fs.mkdirSync(out, { recursive: true });

      const screenshotPath = path.join(out, 'screenshot.png');
      await page
        .screenshot({ path: screenshotPath, fullPage: true })
        .catch(() => undefined);
      await testInfo
        .attach('failure screenshot', {
          path: screenshotPath,
          contentType: 'image/png',
        })
        .catch(() => undefined);

      const dom = await page.content().catch(() => '<dom unavailable>');
      await attachText(testInfo, out, 'dom.html', dom, 'text/html');
      await attachText(
        testInfo,
        out,
        'console.txt',
        consoleLogs.join('\n'),
        'text/plain',
      );
      await attachText(
        testInfo,
        out,
        'page-errors.txt',
        pageErrors.join('\n'),
        'text/plain',
      );
      await attachText(
        testInfo,
        out,
        'network.json',
        JSON.stringify(network, null, 2),
        'application/json',
      );
      await attachText(testInfo, out, 'url.txt', page.url(), 'text/plain');

      const storage = await page
        .evaluate(() =>
          JSON.stringify(
            {
              localStorage: { ...localStorage },
              sessionStorage: { ...sessionStorage },
            },
            null,
            2,
          ),
        )
        .catch(() => '{}');
      await attachText(
        testInfo,
        out,
        'storage.json',
        storage,
        'application/json',
      );

      const cookies = await context.cookies().catch(() => []);
      await attachText(
        testInfo,
        out,
        'cookies.json',
        JSON.stringify(cookies, null, 2),
        'application/json',
      );

      const tracePath = path.join(out, 'trace.zip');
      await context.tracing.stop({ path: tracePath }).catch(() => undefined);
      await testInfo
        .attach('trace', { path: tracePath, contentType: 'application/zip' })
        .catch(() => undefined);
    },
    { auto: true },
  ],
});

async function attachText(
  testInfo: any,
  directory: string,
  name: string,
  body: string,
  contentType: string,
) {
  const filePath = path.join(directory, name);
  fs.writeFileSync(filePath, body);
  await testInfo
    .attach(name, { path: filePath, contentType })
    .catch(() => undefined);
}

export { expect } from '@playwright/test';
