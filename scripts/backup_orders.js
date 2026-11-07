import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function backup() {
  const { data: orders, error: oErr } = await supabase.from('orders').select('*');
  const { data: items, error: iErr } = await supabase.from('order_items').select('*');
  const { data: history, error: hErr } = await supabase.from('order_status_history').select('*');

  if (oErr || iErr) {
    console.error('Erreur sauvegarde:', oErr || iErr);
    process.exit(1);
  }

  const backupDir = path.resolve('database/backups');
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupFile = path.join(backupDir, `orders_backup_${timestamp}.json`);

  fs.writeFileSync(
    backupFile,
    JSON.stringify({ timestamp: new Date().toISOString(), orders, items, history }, null, 2),
    'utf8'
  );

  console.log(`Sauvegarde effectuée avec succès dans : ${backupFile}`);
  console.log(`- ${orders.length} commandes sauvegardées`);
  console.log(`- ${items.length} lignes d'articles sauvegardées`);
}

backup();
