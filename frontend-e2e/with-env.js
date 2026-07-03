const { spawn } = require('child_process');

const env = Object.assign({}, process.env, { APP_ENV: 'e2e', NODE_ENV: 'e2e' });

const p = spawn('npx', ['nx', 'run', 'frontend-e2e:playwright'], { stdio: 'inherit', shell: true, env });

p.on('exit', (code) => process.exit(code));
