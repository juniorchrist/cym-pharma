// =============================================================================
// CYM Pharma — Module Inventaire & Stocks B2B (Routes Serveur)
// =============================================================================

import fs from 'fs';
import path from 'path';
import * as _XLSX from 'xlsx';

const XLSX = _XLSX.default || _XLSX;

export function setupInventoryRoutes(router, db, requireAdmin, send) {
  // ─── 1. PREVIEW DU FICHIER SERVEUR Classeur1.xlsx ───────────────────────────
  router.post('/admin/inventory/import/preview-server-file', async (req, res) => {
    const adminId = await requireAdmin(req, res);
    if (!adminId) return;

    const classeurPath = path.resolve(process.cwd(), 'Classeur1.xlsx');
    if (!fs.existsSync(classeurPath)) {
      return send(res, 404, { success: false, message: 'Fichier Classeur1.xlsx introuvable sur le serveur.' });
    }

    try {
      const wb = XLSX.readFile(classeurPath);
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rawData = XLSX.utils.sheet_to_json(sheet, { header: 1 });
      const rows = rawData.slice(3).filter((r) => r && r[0] && typeof r[0] === 'string' && r[0].trim());

      const seen = new Set();
      const previewRows = [];
      let duplicates = 0;
      let negative = 0;
      let zero_stock = 0;
      let valid = 0;

      rows.forEach((r, idx) => {
        const rawDes = String(r[0]).trim();
        const cleanDes = rawDes.toUpperCase().replace(/\s+/g, ' ');
        const opening = Number(r[1]) || 0;
        const current = Number(r[2]) || 0;

        const isDup = seen.has(cleanDes);
        seen.add(cleanDes);
        if (isDup) duplicates++;

        const isNeg = current < 0;
        if (isNeg) negative++;
        if (current === 0) zero_stock++;
        if (current > 0 && !isDup) valid++;

        let unitLabel = 'Unité';
        if (rawDes.includes('B/100')) unitLabel = 'Boîte de 100';
        else if (rawDes.includes('B/50')) unitLabel = 'Boîte de 50';
        else if (rawDes.includes('B/12')) unitLabel = 'Boîte de 12';
        else if (rawDes.includes('B/25')) unitLabel = 'Boîte de 25';
        else if (rawDes.includes('P/100')) unitLabel = 'Paquet de 100';
        else if (rawDes.includes('5L')) unitLabel = 'Bidon 5L';
        else if (rawDes.includes('1L')) unitLabel = 'Flacon 1L';

        previewRows.push({
          row_index: idx + 4,
          designation_raw: rawDes,
          designation_clean: cleanDes,
          unit_label: unitLabel,
          stock_opening: opening,
          stock_current: current,
          is_negative: isNeg,
          is_duplicate: isDup,
          is_tracked: current > 0,
          action: isNeg ? 'import_as_zero' : isDup ? 'skip' : 'import',
          note: isNeg
            ? 'Valeur négative (' + current + ') dans classeur -> initialisé à 0'
            : isDup
            ? 'Doublon détecté avec une ligne précédente'
            : undefined,
        });
      });

      const result = {
        total_rows: rows.length,
        valid,
        duplicates,
        negative,
        zero_stock,
        rows: previewRows,
      };

      send(res, 200, { success: true, data: result });
    } catch (err) {
      send(res, 500, { success: false, message: 'Erreur lecture XLSX: ' + err.message });
    }
  });

  // ─── 2. PREVIEW DU FICHIER UPLOADÉ PAR L'UTILISATEUR ────────────────────────
  router.post('/admin/inventory/import/preview', async (req, res) => {
    const adminId = await requireAdmin(req, res);
    if (!adminId) return;

    try {
      const rows = req.body?.rows || [];
      const seen = new Set();
      const previewRows = [];
      let duplicates = 0;
      let negative = 0;
      let zero_stock = 0;
      let valid = 0;

      rows.forEach((r, idx) => {
        const rawDes = String(r.designation || r.nom || r[0] || '').trim();
        if (!rawDes) return;
        const cleanDes = rawDes.toUpperCase().replace(/\s+/g, ' ');
        const current = Number(r.stock ?? r.stock_current ?? r.quantite ?? r[2] ?? 0);
        const opening = Number(r.stock_opening ?? r[1] ?? current);

        const isDup = seen.has(cleanDes);
        seen.add(cleanDes);
        if (isDup) duplicates++;

        const isNeg = current < 0;
        if (isNeg) negative++;
        if (current === 0) zero_stock++;
        if (current > 0 && !isDup) valid++;

        let unitLabel = r.unit || r.unite || 'Unité';
        if (unitLabel === 'Unité') {
          if (rawDes.includes('B/100')) unitLabel = 'Boîte de 100';
          else if (rawDes.includes('B/50')) unitLabel = 'Boîte de 50';
          else if (rawDes.includes('B/12')) unitLabel = 'Boîte de 12';
          else if (rawDes.includes('B/25')) unitLabel = 'Boîte de 25';
          else if (rawDes.includes('P/100')) unitLabel = 'Paquet de 100';
          else if (rawDes.includes('5L')) unitLabel = 'Bidon 5L';
          else if (rawDes.includes('1L')) unitLabel = 'Flacon 1L';
        }

        previewRows.push({
          row_index: idx + 1,
          designation_raw: rawDes,
          designation_clean: cleanDes,
          unit_label: unitLabel,
          stock_opening: opening,
          stock_current: current,
          is_negative: isNeg,
          is_duplicate: isDup,
          is_tracked: current > 0,
          action: isNeg ? 'import_as_zero' : isDup ? 'skip' : 'import',
          note: isNeg
            ? 'Valeur négative (' + current + ') initialisée à 0'
            : isDup
            ? 'Doublon détecté'
            : undefined,
        });
      });

      const result = {
        total_rows: previewRows.length,
        valid,
        duplicates,
        negative,
        zero_stock,
        rows: previewRows,
      };

      send(res, 200, { success: true, data: result });
    } catch (err) {
      send(res, 400, { success: false, message: err.message });
    }
  });

  // ─── 3. VALIDATION ET COMMIT DE L'IMPORTATION ───────────────────────────────
  router.post('/admin/inventory/import/commit', async (req, res) => {
    const adminId = await requireAdmin(req, res);
    if (!adminId) return;

    try {
      const rows = req.body?.rows || [];
      const movementDate = req.body?.movement_date || new Date().toISOString().split('T')[0];
      const periodId = req.body?.period_id || null;

      let importedCount = 0;
      let trackedCount = 0;
      let movementsCreated = 0;

      const { count: existingCount } = await db.from('inventory_items').select('*', { count: 'exact', head: true });
      let artSeq = (existingCount || 0) + 1;

      const itemsToUpsert = [];
      const movementsToInsert = [];
      const nowIso = new Date().toISOString();

      for (const r of rows) {
        if (r.action === 'skip') continue;

        const finalQty = r.action === 'import_as_zero' ? 0 : Math.max(0, Number(r.stock_current) || 0);
        const isTracked = !!r.is_tracked;
        const itemId = 'item_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
        const code = 'ART-' + String(artSeq).padStart(4, '0');
        artSeq++;

        itemsToUpsert.push({
          id: itemId,
          code,
          designation: r.designation_raw,
          designation_norm: r.designation_clean,
          unit_label: r.unit_label || 'Unité',
          product_id: null,
          min_stock: isTracked ? 5 : null,
          is_tracked: isTracked ? 1 : 0,
          qty_on_hand: finalQty,
          is_active: 1,
          created_at: nowIso,
          updated_at: nowIso,
        });
        importedCount++;
        if (isTracked) trackedCount++;

        if (finalQty > 0) {
          movementsToInsert.push({
            id: 'mvt_' + itemId + '_import',
            item_id: itemId,
            type: 'opening',
            quantity: finalQty,
            movement_date: movementDate,
            reason: r.note || 'Import initial Excel',
            order_id: null,
            order_item_id: null,
            period_id: periodId,
            created_by: 'Admin Import',
            created_at: nowIso,
          });
          movementsCreated++;
        }
      }

      const CHUNK_SIZE = 50;

      if (itemsToUpsert.length > 0) {
        for (let i = 0; i < itemsToUpsert.length; i += CHUNK_SIZE) {
          const chunk = itemsToUpsert.slice(i, i + CHUNK_SIZE);
          const { error: itemErr } = await db.from('inventory_items').upsert(chunk);
          if (itemErr) {
            console.error('[Inventory] Error upserting items to Supabase:', itemErr);
            return send(res, 500, { success: false, message: 'Erreur enregistrement Supabase: ' + itemErr.message });
          }
        }
      }

      if (movementsToInsert.length > 0) {
        for (let i = 0; i < movementsToInsert.length; i += CHUNK_SIZE) {
          const chunk = movementsToInsert.slice(i, i + CHUNK_SIZE);
          const { error: mvtErr } = await db.from('stock_movements').insert(chunk);
          if (mvtErr) {
            console.warn('[Inventory] Error inserting movements to Supabase:', mvtErr.message);
          }
        }
      }

      send(res, 200, {
        success: true,
        data: {
          imported_count: importedCount,
          tracked_count: trackedCount,
          movements_created: movementsCreated,
        },
        message: `${importedCount} article(s) importé(s) avec succès (${trackedCount} suivis, ${movementsCreated} mouvements créés).`,
      });
    } catch (err) {
      send(res, 400, { success: false, message: err.message });
    }
  });

  // ─── 4. STATISTIQUES GLOBALES DE L'INVENTAIRE ───────────────────────────────
  router.get('/admin/inventory/stats', async (req, res) => {
    const adminId = await requireAdmin(req, res);
    if (!adminId) return;

    try {
      const { data: items, error: itErr } = await db
        .from('inventory_items')
        .select('*')
        .neq('is_active', 0);

      if (itErr) throw itErr;

      const { data: periods } = await db
        .from('inventory_periods')
        .select('*')
        .in('status', ['open', 'counting'])
        .order('opened_at', { ascending: false })
        .limit(1);

      const openPeriod = periods?.[0] || null;

      let in_stock = 0;
      let low_stock = 0;
      let out_of_stock = 0;
      let negative = 0;
      let untracked = 0;
      let total_tracked = 0;

      for (const item of (items || [])) {
        const isTracked = Boolean(item.is_tracked);
        const qty = Number(item.qty_on_hand) || 0;
        const minStock = Number(item.min_stock) || 5;

        if (!isTracked) {
          untracked++;
        } else {
          total_tracked++;
          if (qty < 0) {
            negative++;
          } else if (qty === 0) {
            out_of_stock++;
          } else if (qty <= minStock) {
            low_stock++;
          } else {
            in_stock++;
          }
        }
      }

      send(res, 200, {
        success: true,
        data: {
          total_tracked,
          in_stock,
          low_stock,
          out_of_stock,
          negative,
          untracked,
          open_period: openPeriod,
        },
      });
    } catch (err) {
      send(res, 500, { success: false, message: err.message });
    }
  });

  // ─── 5. LISTE DES ARTICLES AVEC RECHERCHE ET FILTRES ───────────────────────
  router.get('/admin/inventory/items', async (req, res) => {
    const adminId = await requireAdmin(req, res);
    if (!adminId) return;

    try {
      const search = (req.query.search || '').toLowerCase().trim();
      const statusFilter = req.query.status || 'all';
      const isTrackedFilter = req.query.is_tracked;
      const page = Math.max(1, parseInt(req.query.page || '1', 10));
      const limit = Math.max(1, Math.min(200, parseInt(req.query.limit || '50', 10)));

      const { data: allItems, error } = await db
        .from('inventory_items')
        .select('*')
        .neq('is_active', 0)
        .order('code', { ascending: true });

      if (error) throw error;

      const itemsWithStatus = (allItems || []).map((item) => {
        const isTracked = Boolean(item.is_tracked);
        const qty = Number(item.qty_on_hand) || 0;
        const minStock = Number(item.min_stock) || 5;
        let status = 'in_stock';
        if (!isTracked) {
          status = 'untracked';
        } else if (qty < 0) {
          status = 'negative';
        } else if (qty === 0) {
          status = 'out_of_stock';
        } else if (qty <= minStock) {
          status = 'low_stock';
        }
        return {
          ...item,
          is_tracked: isTracked,
          is_active: Boolean(item.is_active),
          qty_on_hand: qty,
          status,
        };
      });

      let filtered = itemsWithStatus;

      if (search) {
        filtered = filtered.filter(
          (i) =>
            i.designation?.toLowerCase().includes(search) ||
            i.code?.toLowerCase().includes(search) ||
            i.unit_label?.toLowerCase().includes(search)
        );
      }

      if (statusFilter && statusFilter !== 'all') {
        filtered = filtered.filter((i) => i.status === statusFilter);
      }

      if (isTrackedFilter !== null && isTrackedFilter !== undefined && isTrackedFilter !== '') {
        const wantTracked = isTrackedFilter === 'true';
        filtered = filtered.filter((i) => i.is_tracked === wantTracked);
      }

      const total = filtered.length;
      const totalPages = Math.ceil(total / limit) || 1;
      const paginated = filtered.slice((page - 1) * limit, page * limit);

      send(res, 200, {
        success: true,
        data: {
          items: paginated,
          total,
          page,
          totalPages,
        },
      });
    } catch (err) {
      send(res, 500, { success: false, message: err.message });
    }
  });

  // ─── 6. DÉTAIL D'UN ARTICLE ─────────────────────────────────────────────────
  router.get('/admin/inventory/items/:id', async (req, res) => {
    const adminId = await requireAdmin(req, res);
    if (!adminId) return;

    try {
      const { data: item, error } = await db
        .from('inventory_items')
        .select('*')
        .eq('id', req.params.id)
        .maybeSingle();

      if (error || !item) {
        return send(res, 404, { success: false, message: 'Article introuvable.' });
      }
      send(res, 200, {
        success: true,
        data: {
          ...item,
          is_tracked: Boolean(item.is_tracked),
          is_active: Boolean(item.is_active),
        },
      });
    } catch (err) {
      send(res, 500, { success: false, message: err.message });
    }
  });

  // ─── 7. CRÉATION D'UN NOUVEL ARTICLE D'INVENTAIRE ───────────────────────────
  router.post('/admin/inventory/items', async (req, res) => {
    const adminId = await requireAdmin(req, res);
    if (!adminId) return;

    try {
      const { designation, code, unit_label, product_id, min_stock, is_tracked, initial_qty, opening_qty, opening_reason } = req.body;
      if (!designation) {
        return send(res, 400, { success: false, message: 'La désignation est obligatoire.' });
      }
      const cleanDes = designation.trim();
      const normDes = cleanDes.toUpperCase().replace(/\s+/g, ' ');

      let finalCode = (code || '').trim();
      if (!finalCode) {
        const { count } = await db.from('inventory_items').select('*', { count: 'exact', head: true });
        finalCode = 'ART-' + String((count || 0) + 1).padStart(4, '0');
      }

      const itemId = 'item_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
      const trackedBool = is_tracked !== undefined ? Boolean(is_tracked) : true;
      const startQty = Number(opening_qty ?? initial_qty) || 0;
      const startReason = opening_reason || 'Stock initial à la création';
      const nowIso = new Date().toISOString();

      const newItem = {
        id: itemId,
        code: finalCode,
        designation: cleanDes,
        designation_norm: normDes,
        unit_label: unit_label || 'Unité',
        product_id: product_id || null,
        min_stock: min_stock !== undefined && min_stock !== null ? Number(min_stock) : (trackedBool ? 5 : null),
        is_tracked: trackedBool ? 1 : 0,
        qty_on_hand: startQty,
        is_active: 1,
        created_at: nowIso,
        updated_at: nowIso,
      };

      const { error: insertErr } = await db.from('inventory_items').insert(newItem);
      if (insertErr) throw insertErr;

      if (startQty > 0) {
        await db.from('stock_movements').insert({
          id: 'mvt_' + itemId + '_init',
          item_id: itemId,
          type: 'opening',
          quantity: startQty,
          movement_date: nowIso.split('T')[0],
          reason: startReason,
          created_by: 'Admin',
          created_at: nowIso,
        });
      }

      send(res, 201, {
        success: true,
        data: {
          ...newItem,
          is_tracked: trackedBool,
          is_active: true,
        },
      });
    } catch (err) {
      send(res, 500, { success: false, message: err.message });
    }
  });

  // ─── 8. MODIFICATION D'UN ARTICLE D'INVENTAIRE ──────────────────────────────
  router.patch('/admin/inventory/items/:id', async (req, res) => {
    const adminId = await requireAdmin(req, res);
    if (!adminId) return;

    try {
      const updates = {};
      if (req.body.designation !== undefined) {
        updates.designation = req.body.designation.trim();
        updates.designation_norm = updates.designation.toUpperCase().replace(/\s+/g, ' ');
      }
      if (req.body.unit_label !== undefined) updates.unit_label = req.body.unit_label;
      if (req.body.min_stock !== undefined) updates.min_stock = req.body.min_stock;
      if (req.body.is_tracked !== undefined) updates.is_tracked = req.body.is_tracked ? 1 : 0;
      if (req.body.is_active !== undefined) updates.is_active = req.body.is_active ? 1 : 0;
      if (req.body.product_id !== undefined) updates.product_id = req.body.product_id;
      updates.updated_at = new Date().toISOString();

      const { data: updated, error } = await db
        .from('inventory_items')
        .update(updates)
        .eq('id', req.params.id)
        .select()
        .maybeSingle();

      if (error || !updated) {
        return send(res, 404, { success: false, message: 'Article introuvable ou erreur de mise à jour.' });
      }

      send(res, 200, {
        success: true,
        data: {
          ...updated,
          is_tracked: Boolean(updated.is_tracked),
          is_active: Boolean(updated.is_active),
        },
      });
    } catch (err) {
      send(res, 500, { success: false, message: err.message });
    }
  });

  // ─── 9. SUPPRESSION / DÉSACTIVATION D'UN ARTICLE ─────────────────────────────
  router.delete('/admin/inventory/items/:id', async (req, res) => {
    const adminId = await requireAdmin(req, res);
    if (!adminId) return;

    try {
      const { error } = await db.from('inventory_items').update({ is_active: 0 }).eq('id', req.params.id);
      if (error) throw error;
      send(res, 200, { success: true, message: 'Article désactivé avec succès.' });
    } catch (err) {
      send(res, 500, { success: false, message: err.message });
    }
  });

  // ─── 10. LISTE DES MOUVEMENTS DE STOCK ──────────────────────────────────────
  router.get('/admin/inventory/movements', async (req, res) => {
    const adminId = await requireAdmin(req, res);
    if (!adminId) return;

    try {
      const limit = Math.max(1, Math.min(200, parseInt(req.query.limit || '50', 10)));
      let query = db.from('stock_movements').select('*').order('created_at', { ascending: false }).limit(limit);

      if (req.query.item_id) {
        query = query.eq('item_id', req.query.item_id);
      }
      if (req.query.type) {
        query = query.eq('type', req.query.type);
      }

      const { data: mvts, error } = await query;
      if (error) throw error;

      const itemIds = [...new Set((mvts || []).map((m) => m.item_id).filter(Boolean))];
      let itemsMap = new Map();
      if (itemIds.length > 0) {
        const { data: items } = await db.from('inventory_items').select('id, designation, code, unit_label').in('id', itemIds);
        itemsMap = new Map((items || []).map((i) => [i.id, i]));
      }

      const movements = (mvts || []).map((m) => {
        const it = itemsMap.get(m.item_id);
        return {
          ...m,
          designation: it?.designation || 'Article',
          code: it?.code || '',
          unit_label: it?.unit_label || 'Unité',
        };
      });

      send(res, 200, { success: true, data: { movements, total: movements.length } });
    } catch (err) {
      send(res, 500, { success: false, message: err.message });
    }
  });

  // ─── 11. CRÉATION D'UN MOUVEMENT DE STOCK ───────────────────────────────────
  router.post('/admin/inventory/movements', async (req, res) => {
    const adminId = await requireAdmin(req, res);
    if (!adminId) return;

    try {
      const { item_id, type, quantity, movement_date, reason, order_id, order_item_id, period_id } = req.body;
      if (!item_id) return send(res, 400, { success: false, message: 'item_id est requis.' });

      const { data: item, error: itErr } = await db.from('inventory_items').select('*').eq('id', item_id).maybeSingle();
      if (itErr || !item) return send(res, 404, { success: false, message: 'Article introuvable.' });

      const qty = Number(quantity);
      if (isNaN(qty) || qty === 0) {
        return send(res, 400, { success: false, message: 'La quantité doit être un nombre non nul.' });
      }

      let delta = 0;
      if (type === 'purchase' || type === 'return' || type === 'opening') {
        delta = Math.abs(qty);
      } else if (type === 'sale_shop' || type === 'sale_online' || type === 'loss') {
        delta = -Math.abs(qty);
      } else if (type === 'adjustment' || type === 'count_correction') {
        delta = qty;
      }

      const newQty = (Number(item.qty_on_hand) || 0) + delta;
      const nowIso = new Date().toISOString();

      await db.from('inventory_items').update({ qty_on_hand: newQty, updated_at: nowIso }).eq('id', item_id);

      const mvtId = 'mvt_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
      const newMvt = {
        id: mvtId,
        item_id,
        type,
        quantity: Math.abs(qty),
        movement_date: movement_date || nowIso.split('T')[0],
        reason: reason || null,
        order_id: order_id || null,
        order_item_id: order_item_id || null,
        period_id: period_id || null,
        created_by: 'Admin',
        created_at: nowIso,
      };

      await db.from('stock_movements').insert(newMvt);

      send(res, 201, {
        success: true,
        data: {
          movement: newMvt,
          item: {
            ...item,
            qty_on_hand: newQty,
          },
        },
        message: 'Mouvement de stock enregistré avec succès.',
      });
    } catch (err) {
      send(res, 500, { success: false, message: err.message });
    }
  });

  // ─── 12. PÉRIODES D'INVENTAIRE ───────────────────────────────────────────────
  router.get('/admin/inventory/periods', async (req, res) => {
    const adminId = await requireAdmin(req, res);
    if (!adminId) return;

    try {
      const { data: periods, error } = await db
        .from('inventory_periods')
        .select('*')
        .order('year_month', { ascending: false });

      if (error) throw error;

      const { data: counts } = await db.from('inventory_counts').select('period_id, counted_qty, variance');

      const result = (periods || []).map((p) => {
        const pCounts = (counts || []).filter((c) => c.period_id === p.id);
        const counted_items = pCounts.filter((c) => c.counted_qty !== null && c.counted_qty !== undefined).length;
        const items_with_variance = pCounts.filter((c) => c.variance !== null && c.variance !== 0).length;

        return {
          ...p,
          total_items: pCounts.length,
          counted_items,
          items_with_variance,
        };
      });

      send(res, 200, { success: true, data: result });
    } catch (err) {
      send(res, 500, { success: false, message: err.message });
    }
  });

  // ─── 13. DÉMARRER UNE PÉRIODE D'INVENTAIRE ──────────────────────────────────
  router.post('/admin/inventory/periods/start', async (req, res) => {
    const adminId = await requireAdmin(req, res);
    if (!adminId) return;

    try {
      const year_month = req.body?.year_month || new Date().toISOString().slice(0, 7);

      const { data: existing } = await db.from('inventory_periods').select('*').eq('year_month', year_month).maybeSingle();
      if (existing && existing.status !== 'closed') {
        return send(res, 200, { success: true, data: existing, message: 'Période existante reprise.' });
      }

      const periodId = 'per_' + year_month.replace('-', '_');
      const newPeriod = {
        id: periodId,
        year_month,
        status: 'counting',
        opened_at: new Date().toISOString(),
        closed_at: null,
        closed_by: null,
      };

      await db.from('inventory_periods').upsert(newPeriod);

      const { data: items } = await db.from('inventory_items').select('*').neq('is_active', 0).eq('is_tracked', 1);

      if (items && items.length > 0) {
        const countEntries = items.map((it) => ({
          id: 'cnt_' + periodId + '_' + it.id,
          period_id: periodId,
          item_id: it.id,
          theoretical_qty: it.qty_on_hand || 0,
          counted_qty: null,
          variance: null,
          note: null,
          counted_by: null,
          counted_at: null,
          status: 'draft',
        }));

        for (let i = 0; i < countEntries.length; i += 50) {
          const chunk = countEntries.slice(i, i + 50);
          await db.from('inventory_counts').upsert(chunk);
        }
      }

      send(res, 201, { success: true, data: newPeriod, message: 'Nouvelle période démarrée pour ' + year_month });
    } catch (err) {
      send(res, 500, { success: false, message: err.message });
    }
  });

  // ─── 14. COMPTAGES D'UNE PÉRIODE ───────────────────────────────────────────
  router.get('/admin/inventory/periods/:id/counts', async (req, res) => {
    const adminId = await requireAdmin(req, res);
    if (!adminId) return;

    try {
      const periodId = req.params.id;
      const { data: period, error: perErr } = await db.from('inventory_periods').select('*').eq('id', periodId).maybeSingle();
      if (perErr || !period) return send(res, 404, { success: false, message: 'Période introuvable.' });

      const { data: counts, error: cntErr } = await db.from('inventory_counts').select('*').eq('period_id', periodId);
      if (cntErr) throw cntErr;

      const itemIds = [...new Set((counts || []).map((c) => c.item_id))];
      let itemsMap = new Map();
      if (itemIds.length > 0) {
        const { data: items } = await db.from('inventory_items').select('id, designation, code, unit_label').in('id', itemIds);
        itemsMap = new Map((items || []).map((i) => [i.id, i]));
      }

      const enriched = (counts || []).map((c) => {
        const it = itemsMap.get(c.item_id);
        return {
          ...c,
          designation: it?.designation || 'Article inconnu',
          unit_label: it?.unit_label || 'Unité',
          code: it?.code || '',
        };
      });

      send(res, 200, { success: true, data: { period, counts: enriched } });
    } catch (err) {
      send(res, 500, { success: false, message: err.message });
    }
  });

  // ─── 15. MISE À JOUR D'UN COMPTAGE ──────────────────────────────────────────
  router.put('/admin/inventory/periods/:id/counts/:itemId', async (req, res) => {
    const adminId = await requireAdmin(req, res);
    if (!adminId) return;

    try {
      const periodId = req.params.id;
      const itemId = req.params.itemId;

      const { data: period } = await db.from('inventory_periods').select('*').eq('id', periodId).maybeSingle();
      if (!period || period.status === 'closed') {
        return send(res, 400, { success: false, message: 'Période clôturée ou introuvable.' });
      }

      const { data: currentCount } = await db.from('inventory_counts').select('*').eq('period_id', periodId).eq('item_id', itemId).maybeSingle();
      const theoQty = currentCount?.theoretical_qty ?? 0;

      const updates = {};
      if (req.body.counted_qty !== undefined && req.body.counted_qty !== null) {
        const val = Number(req.body.counted_qty);
        updates.counted_qty = isNaN(val) ? null : val;
        updates.variance = updates.counted_qty !== null ? updates.counted_qty - theoQty : null;
        updates.status = 'validated';
        updates.counted_at = new Date().toISOString();
        updates.counted_by = 'Admin';
      }
      if (req.body.note !== undefined) updates.note = req.body.note;
      if (req.body.status !== undefined) updates.status = req.body.status;

      const countId = currentCount?.id || ('cnt_' + periodId + '_' + itemId);
      const { data: saved, error } = await db.from('inventory_counts').upsert({
        id: countId,
        period_id: periodId,
        item_id: itemId,
        theoretical_qty: theoQty,
        ...updates,
      }).select().maybeSingle();

      if (error) throw error;
      send(res, 200, { success: true, data: saved });
    } catch (err) {
      send(res, 500, { success: false, message: err.message });
    }
  });

  // ─── 16. CLÔTURE D'UNE PÉRIODE D'INVENTAIRE ─────────────────────────────────
  router.post('/admin/inventory/periods/:id/close', async (req, res) => {
    const adminId = await requireAdmin(req, res);
    if (!adminId) return;

    try {
      const periodId = req.params.id;
      const { data: period } = await db.from('inventory_periods').select('*').eq('id', periodId).maybeSingle();
      if (!period) return send(res, 404, { success: false, message: 'Période introuvable.' });
      if (period.status === 'closed') return send(res, 400, { success: false, message: 'Cette période est déjà clôturée.' });

      const { data: counts } = await db.from('inventory_counts').select('*').eq('period_id', periodId);
      let correctionsApplied = 0;
      const nowIso = new Date().toISOString();

      for (const c of (counts || [])) {
        if (c.counted_qty !== null && c.counted_qty !== undefined) {
          const variance = Number(c.variance) || (c.counted_qty - c.theoretical_qty);
          if (variance !== 0) {
            await db.from('stock_movements').insert({
              id: 'mvt_correc_' + periodId + '_' + c.item_id + '_' + Date.now(),
              item_id: c.item_id,
              type: 'count_correction',
              quantity: Math.abs(variance),
              movement_date: nowIso.split('T')[0],
              reason: `Ajustement inventaire ${period.year_month} (écart: ${variance > 0 ? '+' : ''}${variance})`,
              period_id: periodId,
              created_by: 'Admin Clôture',
              created_at: nowIso,
            });
            await db.from('inventory_items').update({ qty_on_hand: c.counted_qty, updated_at: nowIso }).eq('id', c.item_id);
            correctionsApplied++;
          }
        }
      }

      await db.from('inventory_periods').update({
        status: 'closed',
        closed_at: nowIso,
        closed_by: 'Administrateur Central',
      }).eq('id', periodId);

      send(res, 200, {
        success: true,
        data: { period: { ...period, status: 'closed', closed_at: nowIso }, corrections_applied: correctionsApplied },
        message: `Période ${period.year_month} clôturée avec succès. ${correctionsApplied} correction(s) appliquée(s).`,
      });
    } catch (err) {
      send(res, 500, { success: false, message: err.message });
    }
  });

  // ─── 17. EXPORT CSV D'UNE PÉRIODE ───────────────────────────────────────────
  router.get('/admin/inventory/periods/:id/export', async (req, res) => {
    const adminId = await requireAdmin(req, res);
    if (!adminId) return;

    try {
      const periodId = req.params.id;
      const { data: period } = await db.from('inventory_periods').select('*').eq('id', periodId).maybeSingle();
      if (!period) return send(res, 404, { success: false, message: 'Période introuvable.' });

      const { data: counts } = await db.from('inventory_counts').select('*').eq('period_id', periodId);
      const itemIds = [...new Set((counts || []).map((c) => c.item_id))];
      let itemsMap = new Map();
      if (itemIds.length > 0) {
        const { data: items } = await db.from('inventory_items').select('id, designation, code, unit_label').in('id', itemIds);
        itemsMap = new Map((items || []).map((i) => [i.id, i]));
      }

      let csv = '\uFEFFCode;Désignation;Unité;Stock Théorique;Stock Compté;Écart;Statut;Observation\r\n';
      for (const c of (counts || [])) {
        const it = itemsMap.get(c.item_id);
        const code = it?.code || '';
        const des = (it?.designation || '').replace(/;/g, ',');
        const unit = it?.unit_label || 'Unité';
        const theo = c.theoretical_qty ?? '';
        const counted = c.counted_qty ?? '';
        const variance = c.variance ?? '';
        const status = c.status || 'draft';
        const note = (c.note || '').replace(/;/g, ',');
        csv += `${code};${des};${unit};${theo};${counted};${variance};${status};${note}\r\n`;
      }

      res.status(200);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="inventaire_${period.year_month}.csv"`);
      res.end(csv);
    } catch (err) {
      send(res, 500, { success: false, message: err.message });
    }
  });

  // ─── 18. CONTRÔLE D'INTÉGRITÉ DU STOCK ──────────────────────────────────────
  router.get('/admin/inventory/integrity-check', async (req, res) => {
    const adminId = await requireAdmin(req, res);
    if (!adminId) return;

    try {
      const { data: items } = await db.from('inventory_items').select('id, designation, qty_on_hand');
      const { data: movements } = await db.from('stock_movements').select('item_id, type, quantity');

      const mvtsByItem = new Map();
      for (const m of (movements || [])) {
        let delta = 0;
        const qty = Number(m.quantity) || 0;
        if (m.type === 'purchase' || m.type === 'return' || m.type === 'opening') {
          delta = Math.abs(qty);
        } else if (m.type === 'sale_shop' || m.type === 'sale_online' || m.type === 'loss') {
          delta = -Math.abs(qty);
        } else if (m.type === 'adjustment' || m.type === 'count_correction') {
          delta = qty;
        }
        mvtsByItem.set(m.item_id, (mvtsByItem.get(m.item_id) || 0) + delta);
      }

      const discrepancies = [];
      for (const it of (items || [])) {
        const sum = mvtsByItem.get(it.id) || 0;
        const actual = Number(it.qty_on_hand) || 0;
        if (sum !== actual) {
          discrepancies.push({
            item_id: it.id,
            designation: it.designation,
            qty_on_hand: actual,
            sum_movements: sum,
            diff: actual - sum,
          });
        }
      }

      send(res, 200, {
        success: true,
        data: {
          checked_items: (items || []).length,
          discrepancies,
          is_healthy: discrepancies.length === 0,
        },
      });
    } catch (err) {
      send(res, 500, { success: false, message: err.message });
    }
  });
}

