require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = process.env.PORT || 5000;
const SHEET_ID = '1LE52K4tA60_-Ekd0TEF9gc2zMyq1tP5SOAC1zru8A6k';
const REPORT_CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRhYcd2eba30rLXPA3OHxVcHYKVpUK9RweS5WD7g-IFM46AUsI6zSu6YESkPxmbg9xyj4gs7UUgL13a/pub?gid=857310602&single=true&output=csv';

app.use(cors());
app.use(express.json({ limit: '20mb' }));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

const hasSupabase = process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY;
const supabase = hasSupabase
  ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)
  : null;

// Helper to fetch all rows from a Supabase table (bypasses 1000-row limit)
async function fetchAllTableRows(tableName) {
  let allRows = [];
  let from = 0;
  const step = 1000;
  while (true) {
    const { data, error } = await supabase
      .from(tableName)
      .select('*')
      .range(from, from + step - 1)
      .order('id', { ascending: true });
    if (error) throw error;
    if (!data || data.length === 0) break;
    allRows = allRows.concat(data);
    if (data.length < step) break;
    from += step;
  }
  return allRows;
}

app.get('/', (req, res) => {
  res.json({
    status: 'OK',
    message: 'Colgate Smile Corner API (With Separate outlet_targets Table)',
    databaseConnected: Boolean(supabase),
  });
});

// GET ALL OUTLETS + AUTOMATICALLY MERGE TARGET VS ACHIEVEMENT FROM outlet_targets TABLE
app.get('/api/outlets', async (req, res) => {
  if (!supabase) return res.json([]);
  try {
    const [outlets, targets] = await Promise.all([
      fetchAllTableRows('outlets'),
      fetchAllTableRows('outlet_targets').catch(() => [])
    ]);

    const targetMap = new Map();
    (targets || []).forEach(t => {
      if (t.shop_code) {
        targetMap.set(String(t.shop_code).toUpperCase().trim(), t);
      }
    });

    const merged = outlets.map(o => {
      const code = String(o.shop_code || '').toUpperCase().trim();
      const t = targetMap.get(code);
      return {
        ...o,
        target_month: t ? t.month : 'Current',
        enrolled: t && t.enrolled != null ? t.enrolled : (o.enrolled || 'Y'),
        target: t && t.target != null ? t.target : (o.target || '0'),
        tot_stt: t && t.tot_stt != null ? t.tot_stt : (o.tot_stt || '0'),
        ach: t && t.ach != null ? t.ach : (o.ach || '0%'),
        balance: t && t.balance != null ? t.balance : (o.balance || '0'),
        eligible: t && t.eligible != null ? t.eligible : (o.eligible || 'N'),
        payout: t && t.payout != null ? t.payout : (o.payout || '0'),
      };
    });

    res.json(merged);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET ALL ROWS FROM outlet_targets TABLE DIRECTLY
app.get('/api/targets', async (req, res) => {
  if (!supabase) return res.json([]);
  try {
    const rows = await fetchAllTableRows('outlet_targets');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// MANUAL BULK UPLOAD TO outlet_targets TABLE (From Admin Panel CSV Upload)
app.post('/api/targets/bulk', async (req, res) => {
  if (!supabase) return res.status(400).json({ error: 'Supabase not connected' });
  try {
    const items = Array.isArray(req.body.items) ? req.body.items : [];
    if (items.length === 0) {
      return res.status(400).json({ error: 'No target rows found in upload' });
    }

    const targetMap = new Map();
    items.forEach(item => {
      const rawCode = String(item.shop_code || item.code || item['Outlet Code'] || '').toUpperCase().replace(/\s+/g, '');
      if (!rawCode || rawCode === 'SHOP_CODE' || rawCode === 'OUTLETCODE') return;

      const targetNum = parseFloat(String(item.target ?? item.Target ?? '0').replace(/,/g, '')) || 0;
      const achNum = parseFloat(String(item.tot_stt ?? item.achieve ?? item.Achieve ?? item['TOT STT'] ?? '0').replace(/,/g, '')) || 0;

      // Auto-calculate ACH % and Balance if not provided in CSV
      let achPct = item.ach ?? item['ACH %'] ?? item['Ach%'] ?? '';
      if (!achPct && targetNum > 0) {
        achPct = Math.round((achNum / targetNum) * 100) + '%';
      } else if (!achPct) {
        achPct = '0%';
      }

      let balanceVal = item.balance ?? item.Balance ?? '';
      if (balanceVal === '' || balanceVal == null) {
        balanceVal = String(Math.max(0, Math.round(targetNum - achNum)));
      }

      let eligibleVal = item.eligible ?? item.Eligible ?? '';
      if (!eligibleVal) {
        eligibleVal = (targetNum > 0 && achNum >= targetNum) ? 'Y' : 'N';
      }

      targetMap.set(rawCode, {
        shop_code: rawCode,
        month: String(item.month ?? item.Month ?? 'Current').trim(),
        enrolled: String(item.enrolled ?? item.Enrolled ?? 'Y').trim(),
        target: String(item.target ?? item.Target ?? targetNum).trim(),
        tot_stt: String(item.tot_stt ?? item.achieve ?? item.Achieve ?? item['TOT STT'] ?? achNum).trim(),
        ach: String(achPct).trim(),
        balance: String(balanceVal).trim(),
        eligible: String(eligibleVal).trim(),
        payout: String(item.payout ?? item.Payout ?? '0').trim(),
        updated_at: new Date().toISOString()
      });
    });

    const cleanRows = Array.from(targetMap.values());
    let uploaded = 0;
    for (let i = 0; i < cleanRows.length; i += 500) {
      const chunk = cleanRows.slice(i, i + 500);
      const { error } = await supabase
        .from('outlet_targets')
        .upsert(chunk, { onConflict: 'shop_code' });
      if (error) throw error;
      uploaded += chunk.length;
    }

    res.json({ success: true, uploadedCount: uploaded });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
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

    if (lat && lng) {
      await supabase.from('outlets').update({ lat, lng }).eq('shop_code', shopCode);
    }

    res.json({ success: true, imageUrl, submission: insertedRow ? insertedRow[0] : null });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

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