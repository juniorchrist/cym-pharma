import { spawn } from 'child_process';
import { runIntegrationTests } from './inventory_integration.js';

const TEST_PORT = 4005;

async function main() {
  console.log(`[Suite Runner] Démarrage du serveur Node.js sur le port ${TEST_PORT}...`);
  const server = spawn('node', ['server.js'], {
    env: { ...process.env, PORT: String(TEST_PORT), NODE_ENV: 'development' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  server.stdout.on('data', (d) => process.stdout.write(`[Server] ${d}`));
  server.stderr.on('data', (d) => process.stderr.write(`[Server Error] ${d}`));

  // Attendre 2 secondes que le serveur écoute
  await new Promise((resolve) => setTimeout(resolve, 2500));

  try {
    await runIntegrationTests(TEST_PORT);
    console.log('\n[Suite Runner] Tous les tests ont réussi.');
    process.exitCode = 0;
  } catch (err) {
    console.error('\n[Suite Runner] ÉCHEC des tests:', err);
    process.exitCode = 1;
  } finally {
    console.log('[Suite Runner] Arrêt du serveur...');
    server.kill();
  }
}

main();

