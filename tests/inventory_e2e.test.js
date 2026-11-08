import { chromium } from 'playwright';
import { spawn } from 'child_process';
import * as XLSX from 'xlsx';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const FIXTURE_DIR = path.resolve(process.cwd(), 'tests', 'fixtures');
const FIXTURE_FILE = path.join(FIXTURE_DIR, 'test_upload_synthetique.xlsx');
const TEST_PORT = 4005;

async function runE2E() {
  console.log('=============================================================================');
  console.log('CYM PHARMA — TEST PLAYWRIGHT E2E (TÉLÉVERSEMENT EXCEL & APPARITION DES STOCKS)');
  console.log('=============================================================================');

  if (!fs.existsSync(FIXTURE_DIR)) {
    fs.mkdirSync(FIXTURE_DIR, { recursive: true });
  }

  // 1. Création du fichier Excel synthétique pour le test E2E
  const wb = XLSX.utils.book_new();
  const wsData = [
    ['DESIGNATION', 'STOCK INITIAL', 'STOCK EN COURS'],
    ['COMPRESSES DE GAZE 40X40 B/100', 80, 60],
    ['SPARADRAP MICROPOREUX 5CM P/10', 50, 40],
    ['SERINGUE 10ML 3P B/100', 150, 120],
  ];
  const ws = XLSX.utils.aoa_to_sheet(wsData);
  XLSX.utils.book_append_sheet(wb, ws, 'Feuille1');
  XLSX.writeFile(wb, FIXTURE_FILE);
  console.log(`[E2E] Fichier synthétique généré : ${FIXTURE_FILE}`);

  // 2. Acquisition d'une vraie session Admin Supabase
  console.log('[E2E] Génération de la session admin Supabase pour admin@cympharma.ci...');
  const sbClient = createClient(process.env.SUPABASE_URL, process.env.VITE_SUPABASE_PUBLISHABLE_KEY);
  const adminSb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const { data: linkData } = await adminSb.auth.admin.generateLink({
    type: 'magiclink',
    email: 'admin@cympharma.ci',
  });
  const { data: sessionData, error: sessionErr } = await sbClient.auth.verifyOtp({
    token_hash: linkData.properties.hashed_token,
    type: 'magiclink',
  });
  if (sessionErr || !sessionData.session) {
    throw new Error(`Impossible d'obtenir la session admin: ${sessionErr?.message}`);
  }
  console.log('[E2E] Session admin Supabase acquise avec succès.');

  // 3. Démarrage du serveur backend (port 4005)
  console.log(`[E2E] Démarrage du serveur API Node.js (port ${TEST_PORT})...`);
  const server = spawn('node', ['server.js'], {
    env: { ...process.env, PORT: String(TEST_PORT), NODE_ENV: 'development' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  server.stdout.on('data', (d) => process.stdout.write(`[Server] ${d}`));

  await new Promise((r) => setTimeout(r, 2500));

  let browser;
  try {
    console.log('[E2E] Lancement du navigateur Chromium (Microsoft Edge)...');
    browser = await chromium.launch({
      executablePath: fs.existsSync(EDGE_PATH) ? EDGE_PATH : undefined,
      headless: true,
    });

    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
    });

    const page = await context.newPage();
    page.on('console', msg => console.log('BROWSER:', msg.text()));
    page.on('response', res => {
      if (res.status() >= 400) console.log('RESPONSE ' + res.status() + ' ON ' + res.url());
      if (res.url().includes('inventory')) {
        console.log('INVENTORY API RESPONSE ' + res.status() + ' ON ' + res.url());
      }
    });

    // Configuration de la session Supabase et cym_* dans le localStorage
    await page.goto('http://127.0.0.1:3000/');
    await page.evaluate(({ session, apiUrl }) => {
      localStorage.setItem('cym_api_url', apiUrl);
      localStorage.setItem('cym_supabase_auth_token', JSON.stringify(session));
      localStorage.setItem('cym_auth_token', session.access_token);
      localStorage.setItem('cym_admin_access', 'true');
      localStorage.setItem('cym_user', JSON.stringify({
        id: session.user.id,
        email: session.user.email,
        role: 'admin',
        first_name: 'Direction',
        last_name: 'CYM Pharma',
        status: 'active',
        establishment_name: 'CYM Pharma SARL',
      }));
    }, { session: sessionData.session, apiUrl: `http://127.0.0.1:${TEST_PORT}/api` });

    console.log('[E2E] Navigation vers l\'espace Administration...');
    await page.goto('http://127.0.0.1:3000/admin');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(2000);

    // Clic sur l'onglet "Inventaire & Stocks"
    console.log('[E2E] Accès au module Inventaire & Stocks...');
    const inventoryNavBtn = page.locator('button:has-text("Inventaire")').first();
    await inventoryNavBtn.waitFor({ state: 'visible', timeout: 10000 });
    await inventoryNavBtn.click();
    await page.waitForTimeout(1000);

    // Clic sur l'onglet "Import Classeur"
    console.log('[E2E] Clic sur l\'onglet "Import Classeur"...');
    const importTabBtn = page.locator('button:has-text("Import Classeur")');
    await importTabBtn.waitFor({ state: 'visible', timeout: 5000 });
    await importTabBtn.click();
    await page.waitForTimeout(1000);

    // Téléversement du fichier synthétique
    console.log('[E2E] Téléversement du fichier synthétique via l\'input file...');
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(FIXTURE_FILE);

    // Attente de l'apparition de l'aperçu
    console.log('[E2E] Vérification de l\'analyse et de l\'aperçu...');
    await page.waitForSelector('text=Articles Détectés', { timeout: 15000 });
    const countBadge = await page.locator('text=Articles Détectés').locator('..').locator('.text-xl').textContent();
    console.log(`  -> Nombre d'articles détectés par l'aperçu : ${countBadge?.trim()}`);

    // Clic sur "Valider et Importer dans l'Inventaire"
    console.log('[E2E] Clic sur "Valider et Importer dans l\'Inventaire"...');
    const commitBtn = page.locator('button:has-text("Valider et Importer")');
    await commitBtn.click();

    // L'application enregistre le lot et bascule automatiquement sur l'onglet "Articles & Stocks"
    console.log('[E2E] Attente de la transition vers la vue des stocks...');
    await page.waitForSelector('table', { timeout: 15000 });
    await page.waitForTimeout(2000);

    // Capture d'écran après import
    const screenshotPath = path.resolve(process.cwd(), 'tests', 'fixtures', 'screenshot_apres_import.png');
    await page.screenshot({ path: screenshotPath });
    console.log(`[E2E] Capture d'écran enregistrée : ${screenshotPath}`);

    // Vérification de la présence des articles dans le tableau
    const tableText = await page.locator('table').textContent();
    const hasItem1 = tableText?.includes('COMPRESSES DE GAZE 40X40');
    const hasItem2 = tableText?.includes('SPARADRAP MICROPOREUX 5CM');
    const hasItem3 = tableText?.includes('SERINGUE 10ML 3P');

    console.log('  -> Article 1 (COMPRESSES DE GAZE 40X40) présent :', hasItem1 ? 'OUI ✓' : 'NON ✗');
    console.log('  -> Article 2 (SPARADRAP MICROPOREUX 5CM) présent :', hasItem2 ? 'OUI ✓' : 'NON ✗');
    console.log('  -> Article 3 (SERINGUE 10ML 3P) présent          :', hasItem3 ? 'OUI ✓' : 'NON ✗');

    if (!hasItem1 || !hasItem2 || !hasItem3) {
      throw new Error('Les articles téléversés ne sont pas tous apparus dans la liste de stock !');
    }

    const stockScreenshotPath = path.resolve(process.cwd(), 'tests', 'fixtures', 'screenshot_tableau_stock.png');
    await page.screenshot({ path: stockScreenshotPath });
    console.log(`[E2E] Capture du tableau des stocks : ${stockScreenshotPath}`);

    console.log('\n=============================================================================');
    console.log('TEST PLAYWRIGHT E2E VALIDÉ À 100% : IMPORT EXCEL ET APPARITION EN BASE RÉUSSIE !');
    console.log('=============================================================================');
  } catch (err) {
    console.error('\n[E2E Error]', err);
    process.exitCode = 1;
  } finally {
    if (browser) await browser.close();
    server.kill();

    // Nettoyage des articles de test dans Supabase
    try {
      const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
      await sb.from('inventory_items').delete().ilike('designation', '%COMPRESSES DE GAZE 40X40%');
      await sb.from('inventory_items').delete().ilike('designation', '%SPARADRAP MICROPOREUX 5CM%');
      await sb.from('inventory_items').delete().ilike('designation', '%SERINGUE 10ML 3P%');
      console.log('[E2E] Nettoyage Supabase des articles de test effectué.');
    } catch {}
  }
}

runE2E();
