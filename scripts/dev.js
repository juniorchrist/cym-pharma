import { spawn } from 'child_process';
import http from 'http';

function checkHealth(url) {
  return new Promise((resolve) => {
    const req = http.get(url, (res) => {
      resolve(res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(1000, () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function start() {
  const isServerRunning = await checkHealth('http://127.0.0.1:4000/api/health');

  let serverProcess = null;
  if (!isServerRunning) {
    console.log('🚀 [CYM Dev] Démarrage du serveur API local (server.js sur le port 4000)...');
    serverProcess = spawn('node', ['server.js'], {
      stdio: 'inherit',
      shell: true,
    });

    let ready = false;
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 250));
      ready = await checkHealth('http://127.0.0.1:4000/api/health');
      if (ready) break;
    }

    if (ready) {
      console.log('✅ [CYM Dev] Serveur API local opérationnel sur http://localhost:4000');
    }
  } else {
    console.log('✅ [CYM Dev] Serveur API local déjà actif sur http://localhost:4000');
  }

  console.log('🌐 [CYM Dev] Démarrage de Vite sur http://localhost:3000 (proxy /api actif)...');
  const viteProcess = spawn('node', ['node_modules/vite/bin/vite.js', '--port=3000', '--host=0.0.0.0', ...process.argv.slice(2)], {
    stdio: 'inherit',
    shell: true,
  });

  const cleanup = () => {
    if (serverProcess) {
      try {
        serverProcess.kill();
      } catch {}
    }
    try {
      viteProcess.kill();
    } catch {}
    process.exit(0);
  };

  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);
  process.on('exit', cleanup);
}

start();
