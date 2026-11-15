require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

function cleanVal(val) {
  if (val === undefined || val === null) return '';
  let s = String(val).trim();
  while ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    s = s.slice(1, -1).trim();
  }
  if (s === '""' || s === "''" || s === 'null' || s === 'undefined') return '';
  return s;
}

app.get('/', (req, res) => {
  res.json({ status: 'Colgate Smile Corner API running 100% on Supabase' });
});

// 1. DYNAMIC SETTINGS (Single Source of Truth in Supabase settings table)
app.get('/api/settings', async (req, res) => {
  try {
    const { data, error } = await supabase.from('settings').select('*');
    if (error) throw error;

    const map = {};
    (data || []).forEach(r => {
      if (r.key) map[r.key] = cleanVal(r.value);
    });

    const noticeText = map.notice_text || map.global_notice || '';
    const noticeActive = (map.notice_active === 'true' && noticeText.length > 0) ? 'true' : 'false';
    const isUnlocked = map.gallery_access === 'unlocked' || map.gallery_unlocked === 'true';
    const galleryAccess = isUnlocked ? 'unlocked' : 'locked';

    const result = {
      notice_text: noticeText,
      global_notice: noticeActive === 'true' ? noticeText : '',
      notice_active: noticeActive,
      gallery_access: galleryAccess,
      gallery_unlocked: isUnlocked
    };

    res.json({ success: true, settings: result, ...result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/settings', async (req, res) => {
  try {
    const b = req.body || {};
    const now = new Date().toISOString();
    const updates = [];

    if (b.notice_text !== undefined || b.global_notice !== undefined) {
      const txt = cleanVal(b.notice_text !== undefined ? b.notice_text : b.global_notice);
      const act = b.notice_active !== undefined
        ? (String(b.notice_active) === 'true' && txt.length > 0 ? 'true' : 'false')
        : (txt.length > 0 ? 'true' : 'false');

      updates.push({ key: 'notice_text', value: txt, updated_at: now });
      updates.push({ key: 'global_notice', value: act === 'true' ? txt : '', updated_at: now });
      updates.push({ key: 'notice_active', value: act, updated_at: now });
    }

    if (b.gallery_access !== undefined || b.gallery_unlocked !== undefined) {
      const unlocked =
        cleanVal(b.gallery_access).toLowerCase() === 'unlocked' ||
        b.gallery_unlocked === true ||
        cleanVal(b.gallery_unlocked).toLowerCase() === 'true';

      updates.push({ key: 'gallery_access', value: unlocked ? 'unlocked' : 'locked', updated_at: now });
      updates.push({ key: 'gallery_unlocked', value: unlocked ? 'true' : 'false', updated_at: now });
    }

    if (updates.length > 0) {
      const { error } = await supabase.from('settings').upsert(updates, { onConflict: 'key' });
      if (error) throw error;
    }

    const { data } = await supabase.from('settings').select('*');
    const map = {};
    (data || []).forEach(r => { if (r.key) map[r.key] = cleanVal(r.value); });

    const noticeText = map.notice_text || '';
    const noticeActive = (map.notice_active === 'true' && noticeText.length > 0) ? 'true' : 'false';
    const isUnlocked = map.gallery_access === 'unlocked' || map.gallery_unlocked === 'true';

    const result = {
      notice_text: noticeText,
      global_notice: noticeActive === 'true' ? noticeText : '',
      notice_active: noticeActive,
      gallery_access: isUnlocked ? 'unlocked' : 'locked',
      gallery_unlocked: isUnlocked
    };

    res.json({ success: true, settings: result, ...result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 2. SYNC STATUS
app.get('/api/sync-outlets', async (req, res) => {
  try {
    const { data: outlets, error } = await supabase.from('outlets').select('*');
    if (error) throw error;
    const { data: targets } = await supabase.from('outlet_targets').select('*');
    res.json({
      success: true,
      totalSyncedOutlets: (outlets || []).length,
      totalTargetRows: (targets || []).length
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 3. GET OUTLETS + TARGETS
app.get(['/api/outlets', '/api/init-data'], async (req, res) => {
  try {
    const { data: outlets, error: err1 } = await supabase.from('outlets').select('*');
    if (err1) throw err1;

    const { data: targets } = await supabase.from('outlet_targets').select('*');
    const targetMap = {};
    (targets || []).forEach(t => {
      if (t.shop_code) targetMap[String(t.shop_code).trim()] = t;
    });

    const merged = (outlets || []).map(o => {
      const code = String(o.shop_code || '').trim();
      const t = targetMap[code] || {};
      return {
        ...o,
        enrolled: t.enrolled || o.enrolled || 'Yes',
        target: t.target ?? o.target ?? 0,
        tot_stt: t.tot_stt ?? o.tot_stt ?? 0,
        ach: t.ach ?? o.ach ?? 0,
        balance: t.balance ?? o.balance ?? 0,
        eligible: t.eligible || o.eligible || 'No',
        payout: t.payout ?? o.payout ?? 0
      };
    });

    res.json({ success: true, outlets: merged, data: merged });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 4. SUBMIT FORM + UPLOAD PHOTO TO SUPABASE BUCKET
app.post('/api/submit', upload.any(), async (req, res) => {
  try {
    const body = req.body || {};
    const shopCode = String(
      body.shop_code || body.shopCode || body.outlet_code || body.outletCode || body.code || 'outlet'
    ).trim().replace(/[^a-zA-Z0-9_-]/g, '');

    let imageUrl = body.image_url || body.imageUrl || '';

    const uploadedFile = (req.files && req.files.length > 0) ? req.files[0] : req.file;
    if (uploadedFile && uploadedFile.buffer) {
      const fileName = `${shopCode}_${Date.now()}.jpg`;
      const { error: upErr } = await supabase.storage
        .from('outlet-photos')
        .upload(fileName, uploadedFile.buffer, { contentType: uploadedFile.mimetype || 'image/jpeg', upsert: true });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from('outlet-photos').getPublicUrl(fileName);
      imageUrl = pub.publicUrl;
    } else {
      let rawBase64 = body.image || body.imageBase64 || body.imageData || body.photo || body.fileData || body.file || body.base64 || '';
      if (!rawBase64 || typeof rawBase64 !== 'string') {
        for (const key of Object.keys(body)) {
          const val = body[key];
          if (typeof val === 'string' && val.length > 500 && !val.startsWith('http')) {
            rawBase64 = val;
            break;
          }
        }
      }
      if (rawBase64 && typeof rawBase64 === 'string' && rawBase64.length > 100) {
        const base64Clean = rawBase64.replace(/^data:[^;]+;base64,/, '').replace(/\s/g, '');
        const buffer = Buffer.from(base64Clean, 'base64');
        const fileName = `${shopCode}_${Date.now()}.jpg`;
        const { error: upErr } = await supabase.storage
          .from('outlet-photos')
          .upload(fileName, buffer, { contentType: 'image/jpeg', upsert: true });
        if (upErr) throw upErr;
        const { data: pub } = supabase.storage.from('outlet-photos').getPublicUrl(fileName);
        imageUrl = pub.publicUrl;
      }
    }

    const rowData = {
      shop_code: String(body.shop_code || body.shopCode || body.outlet_code || shopCode).trim(),
      merch_name: body.merch_name || body.merchName || body.merchandiser || body.user_name || body.userName || '',
      role: body.role || 'merchandiser',
      unit: body.unit || '',
      area_name: body.area_name || body.areaName || body.zone || '',
      territory: body.territory || '',
      db_code: body.db_code || body.dbCode || '',
      distribution_name: body.distribution_name || body.distributionName || body.db_name || '',
      route_name: body.route_name || body.routeName || body.route || '',
      slab: body.slab || '',
      month: body.month || '',
      lat: body.lat ? parseFloat(body.lat) : (body.latitude ? parseFloat(body.latitude) : null),
      lng: body.lng ? parseFloat(body.lng) : (body.longitude ? parseFloat(body.longitude) : null),
      image_url: imageUrl
    };

    const { data: inserted, error: dbErr } = await supabase.from('submissions').insert([rowData]).select();
    if (dbErr) throw dbErr;

    res.json({ status: 'success', success: true, image_url: imageUrl, data: inserted });
  } catch (err) {
    res.status(500).json({ status: 'error', success: false, error: err.message });
  }
});

// 5. GET SUBMISSIONS
app.get('/api/submissions', async (req, res) => {
  try {
    const { data, error } = await supabase.from('submissions').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    res.json({ success: true, submissions: data || [], data: data || [] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 6. ADD OUTLET
app.post('/api/outlets', async (req, res) => {
  try {
    const b = req.body || {};
    const row = {
      unit: b.unit || '',
      zone: b.zone || b.area_name || '',
      territory: b.territory || '',
      db_code: b.db_code || '',
      db_name: b.db_name || b.distribution_name || '',
      route_code: b.route_code || '',
      route_name: b.route_name || '',
      shop_code: String(b.shop_code || '').trim(),
      shop_name: b.shop_name || '',
      slab: b.slab || '',
      merchandiser: b.merchandiser || b.merch_name || ''
    };
    const { data, error } = await supabase.from('outlets').upsert([row], { onConflict: 'shop_code' }).select();
    if (error) throw error;
    res.json({ status: 'success', success: true, data });
  } catch (err) {
    res.status(500).json({ status: 'error', success: false, error: err.message });
  }
});

// 7. UPLOAD TARGETS
app.post('/api/upload-targets', async (req, res) => {
  try {
    const rows = Array.isArray(req.body.rows) ? req.body.rows : [];
    if (!rows.length) return res.status(400).json({ success: false, error: 'No rows provided' });
    const formatted = rows
      .filter(r => r.shop_code || r.Shop_Code || r['Shop Code'])
      .map(r => ({
        shop_code: String(r.shop_code || r.Shop_Code || r['Shop Code']).trim(),
        month: String(r.month || r.Month || 'Current').trim(),
        enrolled: String(r.enrolled || r.Enrolled || 'Yes'),
        target: parseFloat(r.target || r.Target || 0) || 0,
        tot_stt: parseFloat(r.tot_stt || r['Tot STT'] || r.Tot_STT || 0) || 0,
        ach: parseFloat(r.ach || r['Ach %'] || r.Ach || 0) || 0,
        balance: parseFloat(r.balance || r.Balance || 0) || 0,
        eligible: String(r.eligible || r.Eligible || 'No'),
        payout: parseFloat(r.payout || r.Payout || 0) || 0
      }));
    const { error } = await supabase.from('outlet_targets').upsert(formatted, { onConflict: 'shop_code,month' });
    if (error) throw error;
    res.json({ success: true, count: formatted.length });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Server running on port ' + PORT));
