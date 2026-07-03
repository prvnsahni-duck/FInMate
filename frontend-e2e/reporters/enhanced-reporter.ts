import type { Reporter, TestCase, TestResult } from '@playwright/test/reporter';

class EnhancedReporter implements Reporter {
  onTestEnd(test: TestCase, result: TestResult) {
    if (result.status === 'passed') return;

    const error = result.error?.message ?? 'No Playwright error message was provided.';
    const apiHint = error.match(/(GET|POST|PUT|PATCH|DELETE)\s+\S+\s+returned\s+\d+/)?.[0];
    const suggestion = apiHint
      ? 'API completed with an unexpected response. Check attached network.json before inspecting selectors.'
      : error.includes('Timeout')
        ? 'UI did not reach the expected business state. Check trace, DOM snapshot, and failed responses.'
        : 'Check trace, screenshot, console, and network attachments for the business failure context.';

    console.error(`\n[E2E Diagnostic] ${test.title}`);
    if (apiHint) console.error(`Failure reason: ${apiHint}`);
    console.error(`Suggested fix: ${suggestion}`);
  }
}

export default EnhancedReporter;
