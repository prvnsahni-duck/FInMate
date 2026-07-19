const { spawn } = require('child_process');
const http = require('http');

function waitFor(url, timeout = 30000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    (function ping() {
      http
        .get(url, (res) => {
          res.resume();
          resolve(true);
        })
        .on('error', () => {
          if (Date.now() - start > timeout) return reject(new Error('timeout'));
          setTimeout(ping, 500);
        });
    })();
  });
}

function spawnCmd(cmd, args, env) {
  const p = spawn(cmd, args, {
    stdio: 'inherit',
    shell: true,
    env: Object.assign({}, process.env, env),
  });
  return p;
}

(async () => {
  try {
    console.log('Starting backend (APP_ENV=e2e)');
    const backend = spawnCmd('npx', ['nx', 'run', 'backend:serve'], {
      APP_ENV: 'e2e',
      NODE_ENV: 'e2e',
    });

    console.log('Waiting for backend health...');
    await waitFor('http://localhost:3000/api/v1/health', 45000);
    console.log('Backend healthy');

    console.log('Starting frontend (APP_ENV=e2e)');
    const frontend = spawnCmd('npx', ['nx', 'run', 'frontend:serve'], {
      APP_ENV: 'e2e',
      NODE_ENV: 'e2e',
    });

    console.log('Waiting for frontend...');
    await waitFor('http://localhost:4200', 45000);
    console.log('Frontend healthy');

    console.log('Running Playwright tests');
    const pw = spawnCmd(
      'npx',
      [
        'playwright',
        'test',
        '--reporter=list,html',
        '--output=dist/.playwright/frontend-e2e/test-output',
      ],
      { APP_ENV: 'e2e', NODE_ENV: 'e2e' },
    );

    pw.on('exit', (code) => {
      console.log('Playwright exited with', code);
      // kill frontend and backend
      try {
        frontend.kill();
      } catch (_e) {
        // process may already be gone — ignore
      }
      try {
        backend.kill();
      } catch (_e) {
        // process may already be gone — ignore
      }
      process.exit(code);
    });
  } catch (err) {
    console.error('E2E runner failed', err);
    process.exit(1);
  }
})();
