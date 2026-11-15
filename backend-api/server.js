require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = process.env.PORT || 5000;
const ADMIN_PIN = process.env.ADMIN_PIN || '1234';
const SHEET_ID = '1LE52K4tA60_-Ekd0TEF9gc2zMyq1tP5SOAC1zru8A6k';
const REPORT_CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRhYcd2eba30rLXPA3OHxVcHYKVpUK9RweS5WD7g-IFM46AUsI6zSu6YESkPxmbg9xyj4gs7UUgL13a/pub?gid=857310602&single=true&output=csv';

app.use(cors());
app.use(express.json({ limit: '15mb' }));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

const hasSupabase = process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY;
const supabase = hasSupabase
  ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)
  : null;

function parseCSV(str) {
  const arr = [];
  let quote = false, col = 0, row = 0;
  for (let c = 0; c < str.length; c++) {
    let cc = str[c], nc = str[c + 1];
    arr[row] = arr[row] || [];
    arr[row][col] = arr[row][col] || '';
    if (cc == '"' && quote && nc == '"') { arr[row][col] += cc; ++c; continue; }
    if (cc == '"') { quote = !quote; continue; }
    if (cc == ',' && !quote) { ++col; continue; }
    if (cc == '\r' && nc == '\n' && !quote) { ++row; col = 0; ++c; continue; }
    if (cc == '\n' && !quote) { ++row; col = 0; continue; }
    if (cc == '\r' && !quote) { ++row; col = 0; continue; }
    arr[row][col] += cc;
  }
  return arr;
}

app.get('/', (req, res) => {
  res.json({
    status: 'OK',
    message: 'Colgate Smile Corner API (100% Supabase Powered)',
    databaseConnected: Boolean(supabase),
  });
});

// ONE-TIME / ON-DEMAND SYNC FROM GOOGLE SHEET (PJP + Purchase Report Targets)
app.get('/api/sync-outlets', async (req, res) => {
  if (!supabase) return res.status(400).json({ error: 'Supabase not connected' });
  try {
    const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json&sheet=PJP&t=${Date.now()}`;
    const response = await fetch(url);
    const text = await response.text();
    const jsonString = text.substring(text.indexOf('{'), text.lastIndexOf('}') + 1);
    const data = JSON.parse(jsonString);
    const rows = data.table.rows || [];

    // Also fetch Purchase Update CSV to merge Target/Achieve/Payout into outlets
    const reportMap = new Map();
    try {
      const csvRes = await fetch(REPORT_CSV_URL);
      const csvText = await csvRes.text();
      const csvRows = parseCSV(csvText);
      for (let i = 1; i < csvRows.length; i++) {
        const r = csvRows[i];
        if (r && r.length > 4 && r[4]) {
          reportMap.set(r[4].trim().toUpperCase(), {
            enrolled: r[8] || 'Y',
            target: r[9] || '0',
            tot_stt: r[10] || '0',
            ach: r[11] || '0%',
            balance: r[12] || '0',
            eligible: r[13] || 'N',
            payout: r[16] || '0',
          });
        }
      }
    } catch (e) {
      console.warn('CSV sync skipped:', e.message);
    }

    const outletsMap = new Map();
    rows.forEach((row) => {
      const getVal = (idx) => (row.c && row.c[idx] && row.c[idx].v != null ? String(row.c[idx].v).trim() : '');
      const townName = getVal(4);
      const shopCode = getVal(5).toUpperCase().replace(/\s+/g, '');
      if (shopCode && townName && !['TOWN NAME', 'DB NAME', 'TOWN'].includes(townName.toUpperCase())) {
        const rep = reportMap.get(shopCode) || {};
        outletsMap.set(shopCode, {
          shop_code: shopCode,
          region: getVal(0),
          zone: getVal(1),
          territory: getVal(2),
          db_code: getVal(3),
          db_name: townName,
          shop_name: getVal(6),
          slab: getVal(7),
          route_code: getVal(8),
          route_name: getVal(9),
          visit_day: getVal(10),
          merchandiser: getVal(11),
          status: getVal(12) || 'Display',
          unit: getVal(13) || 'DCC',
          enrolled: rep.enrolled || 'Y',
          target: rep.target || '0',
          tot_stt: rep.tot_stt || '0',
          ach: rep.ach || '0%',
          balance: rep.balance || '0',
          eligible: rep.eligible || 'N',
          payout: rep.payout || '0',
        });
      }
    });

    const allOutlets = Array.from(outletsMap.values());
    let inserted = 0;
    for (let i = 0; i < allOutlets.length; i += 500) {
      const chunk = allOutlets.slice(i, i + 500);
      const { error } = await supabase.from('outlets').upsert(chunk, { onConflict: 'shop_code' });
      if (error) throw error;
      inserted += chunk.length;
    }

    res.json({ success: true, totalSyncedOutlets: inserted, reportsMerged: reportMap.size });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET ALL OUTLETS FROM SUPABASE (Supports up to 10,000 outlets)
app.get('/api/outlets', async (req, res) => {
  if (!supabase) return res.json([]);
  try {
    let allRows = [];
    let from = 0;
    const step = 1000;
    while (true) {
      const { data, error } = await supabase
        .from('outlets')
        .select('*')
        .range(from, from + step - 1)
        .order('id', { ascending: true });
      if (error) throw error;
      if (!data || data.length === 0) break;
      allRows = allRows.concat(data);
      if (data.length < step) break;
      from += step;
    }
    res.json(allRows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ADD NEW OUTLET DIRECTLY TO SUPABASE
app.post('/api/outlets', async (req, res) => {
  if (!supabase) return res.status(400).json({ error: 'Supabase not connected' });
  try {
    const { distCode, distName, routeCode, routeName, outletName, ownerName, contactNumber, slab, createdName } = req.body;
    const generatedCode = 'NEW-' + Date.now().toString().slice(-6);
    const { data, error } = await supabase.from('outlets').insert([{
      shop_code: generatedCode,
      shop_name: outletName,
      owner_name: ownerName || '',
      phone: contactNumber || '',
      db_code: distCode || '',
      db_name: distName || '',
      route_code: routeCode || '',
      route_name: routeName || '',
      slab: slab || 'Slab-1',
      merchandiser: createdName || '',
      created_by: createdName || '',
      status: 'Display',
      unit: 'DCC'
    }]).select();
    if (error) throw error;
    res.json({ success: true, outlet: data[0] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// SAVE PHOTO + SUBMISSION TO SUPABASE
app.post('/api/submissions', upload.single('photo'), async (req, res) => {
  try {
    if (!supabase) return res.status(400).json({ error: 'Supabase not connected' });

    const body = req.body || {};
    const shopCode = String(body.shop_code || 'UNKNOWN').toUpperCase().trim();
    let imageBuffer = null;

    if (req.file && req.file.buffer) {
      imageBuffer = req.file.buffer;
    } else if (body.shop_image && body.shop_image.data) {
      const base64Data = body.shop_image.data.replace(/^data:image\/\w+;base64,/, '');
      imageBuffer = Buffer.from(base64Data, 'base64');
    }

    let imageUrl = '';
    if (imageBuffer) {
      const fileName = `${shopCode}_${Date.now()}.jpg`;
      const { error: uploadErr } = await supabase.storage
        .from('outlet-photos')
        .upload(fileName, imageBuffer, { contentType: 'image/jpeg', upsert: true });
      if (uploadErr) throw uploadErr;
      const { data: publicUrlData } = supabase.storage.from('outlet-photos').getPublicUrl(fileName);
      imageUrl = publicUrlData.publicUrl;
    }

    const parsedLat = parseFloat(body.latitude || body.lat);
    const parsedLng = parseFloat(body.longitude || body.lng);
    const lat = !isNaN(parsedLat) ? parsedLat : null;
    const lng = !isNaN(parsedLng) ? parsedLng : null;

    const { data: insertedRow, error: insertErr } = await supabase
      .from('submissions')
      .insert([{
        shop_code: shopCode,
        merch_name: body.merch_name || body.role || 'Merchandiser',
        role: body.role || 'merchandiser',
        unit: body.outlet_type || body.unit || '',
        area_name: body.area_name || '',
        territory: body.territory || '',
        db_code: body.db_code || '',
        distribution_name: body.distribution_name || '',
        route_name: body.sr_route || body.route_name || '',
        slab: body.slab || '',
        month: body.display_month || body.month || '',
        image_url: imageUrl,
        lat,
        lng
      }])
      .select();

    if (insertErr) throw insertErr;

    // Also update outlet's latest GPS coordinates in outlets table
    if (lat && lng) {
      await supabase.from('outlets').update({ lat, lng }).eq('shop_code', shopCode);
    }

    res.json({ success: true, imageUrl, submission: insertedRow ? insertedRow[0] : null });
  } catch (err) {
    console.error('Submission error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET ALL SUBMISSIONS FROM SUPABASE
app.get('/api/submissions', async (req, res) => {
  if (!supabase) return res.json([]);
  const { data, error } = await supabase
    .from('submissions')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(2000);
  if (error) return res.status(500).json({ error: error.message });
  res.json(data || []);
});

// APP SETTINGS (Maintenance, Notice, Gallery Lock)
app.get('/api/settings', async (req, res) => {
  if (!supabase) return res.json({ maintenance_mode: false, global_notice: '', gallery_unlocked: false });
  const { data } = await supabase.from('settings').select('*');
  const settings = {};
  (data || []).forEach((r) => {
    settings[r.key] = r.value === 'true' ? true : r.value === 'false' ? false : r.value;
  });
  res.json(settings);
});

app.post('/api/settings', async (req, res) => {
  if (!supabase) return res.json({ success: true });
  const { key, value } = req.body;
  const { error } = await supabase
    .from('settings')
    .upsert({ key, value: String(value), updated_at: new Date().toISOString() }, { onConflict: 'key' });
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true, key, value });
});

app.listen(PORT, () => console.log(`✅ API Server running on port ${PORT}`));