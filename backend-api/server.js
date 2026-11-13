require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const jwt = require('jsonwebtoken');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'colgate_secret_key';
const ADMIN_PIN = process.env.ADMIN_PIN || '1234';

// Middleware
app.use(cors());
app.use(express.json());

// Multer setup for handling camera photo uploads in memory
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // Max 5MB per photo
});

// Initialize Supabase (only if keys are added in .env)
const hasSupabase = process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY;
const supabase = hasSupabase
  ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)
  : null;

// Helper: Calculate GPS distance in meters between two coordinates (Haversine)
function calculateDistanceMeters(lat1, lon1, lat2, lon2) {
  if (!lat1 || !lon1 || !lat2 || !lon2) return null;
  const R = 6371e3; // Earth radius in meters
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

// Auth Middleware
function verifyToken(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'Access denied. No token provided.' });
  const token = authHeader.split(' ')[1];
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (err) {
    res.status(403).json({ error: 'Invalid or expired token.' });
  }
}

function verifyAdmin(req, res, next) {
  verifyToken(req, res, () => {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required.' });
    }
    next();
  });
}

// ==========================================
// 1. HEALTH CHECK ROUTE
// ==========================================
app.get('/', (req, res) => {
  res.json({
    status: 'OK',
    message: 'Colgate Smile Corner API is running!',
    databaseConnected: Boolean(supabase),
  });
});

// ==========================================
// 2. PUBLIC SETTINGS (Maintenance, Notice, Gallery)
// ==========================================
app.get('/api/settings', async (req, res) => {
  if (!supabase) {
    return res.json({
      maintenance_mode: false,
      global_notice: '',
      gallery_unlocked: false,
    });
  }
  const { data, error } = await supabase.from('settings').select('*');
  if (error) return res.status(500).json({ error: error.message });

  const settings = {};
  data.forEach((row) => {
    settings[row.key] = row.value === 'true' ? true : row.value === 'false' ? false : row.value;
  });
  res.json(settings);
});

// ==========================================
// 3. AUTHENTICATION (Merchandiser, SR & Admin)
// ==========================================
app.post('/api/auth/login', async (req, res) => {
  const { role, merchName } = req.body;
  if (!role) return res.status(400).json({ error: 'Role is required' });

  const token = jwt.sign({ role, merchName: merchName || 'Sales Team' }, JWT_SECRET, {
    expiresIn: '24h',
  });
  res.json({ success: true, token, role, merchName });
});

app.post('/api/auth/admin', (req, res) => {
  const { pin } = req.body;
  if (pin !== ADMIN_PIN) {
    return res.status(401).json({ success: false, error: 'Incorrect PIN' });
  }
  const token = jwt.sign({ role: 'admin' }, JWT_SECRET, { expiresIn: '12h' });
  res.json({ success: true, token });
});

// ==========================================
// 4. OUTLETS & PJP FILTERS
// ==========================================
app.get('/api/outlets', async (req, res) => {
  if (!supabase) {
    // Sample test outlet so you can test before Supabase is connected
    return res.json([
      {
        shop_code: 'BDC1001',
        shop_name: 'Bismillah General Store',
        region: 'Dhaka North',
        territory: 'Gulshan',
        db_name: 'Gulshan Traders',
        route_name: 'Banani Bazar',
        visit_day: 'Saturday',
        slab: 'Slab-A',
        status: 'Display',
        unit: 'DCC',
        lat: 23.7937,
        lng: 90.4066,
      },
    ]);
  }

  const { unit, region, territory, db_name, route_name, visit_day, merchandiser } = req.query;
  let query = supabase.from('outlets').select('*');

  if (unit && unit !== 'ALL') query = query.eq('unit', unit);
  if (region) query = query.eq('region', region);
  if (territory) query = query.eq('territory', territory);
  if (db_name) query = query.eq('db_name', db_name);
  if (route_name) query = query.eq('route_name', route_name);
  if (visit_day) query = query.eq('visit_day', visit_day);
  if (merchandiser) query = query.eq('merchandiser', merchandiser);

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// ==========================================
// 5. PHOTO SUBMISSION + GPS VERIFICATION
// ==========================================
app.post('/api/submissions', upload.single('photo'), async (req, res) => {
  try {
    const { shop_code, merch_name, month, lat, lng } = req.body;
    if (!shop_code) return res.status(400).json({ error: 'Shop code is required' });

    if (!supabase) {
      return res.json({
        success: true,
        message: 'Test submission received (Connect Supabase in .env to save permanently)',
      });
    }

    let imageUrl = null;
    if (req.file) {
      const fileName = `${shop_code}_${Date.now()}.jpg`;
      const { error: uploadErr } = await supabase.storage
        .from('outlet-photos')
        .upload(fileName, req.file.buffer, { contentType: 'image/jpeg' });

      if (uploadErr) throw uploadErr;

      const { data: publicUrlData } = supabase.storage
        .from('outlet-photos')
        .getPublicUrl(fileName);
      imageUrl = publicUrlData.publicUrl;
    }

    // Check registered outlet location to calculate distance offset
    const { data: outlet } = await supabase
      .from('outlets')
      .select('lat, lng')
      .eq('shop_code', shop_code.toUpperCase())
      .single();

    const offsetMeters = outlet
      ? calculateDistanceMeters(outlet.lat, outlet.lng, parseFloat(lat), parseFloat(lng))
      : null;

    const { error: insertErr } = await supabase.from('submissions').insert([
      {
        shop_code: shop_code.toUpperCase(),
        merch_name: merch_name || 'Unknown',
        month,
        image_url: imageUrl,
        lat: parseFloat(lat) || null,
        lng: parseFloat(lng) || null,
        distance_offset_meters: offsetMeters,
      },
    ]);

    if (insertErr) throw insertErr;

    res.json({ success: true, imageUrl, offsetMeters });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==========================================
// 6. ADMIN DASHBOARD, LOCATIONS & CONTROLS
// ==========================================
app.get('/api/admin/dashboard', verifyAdmin, async (req, res) => {
  if (!supabase) {
    return res.json({ totalOutlets: 1, totalUploads: 0, displayOutlets: 1, regularOutlets: 0 });
  }

  const { data: outlets } = await supabase.from('outlets').select('status');
  const { count: uploadsCount } = await supabase
    .from('submissions')
    .select('*', { count: 'exact', head: true });

  const totalOutlets = outlets ? outlets.length : 0;
  const regularOutlets = outlets
    ? outlets.filter((o) => (o.status || '').toLowerCase().includes('regular')).length
    : 0;
  const displayOutlets = totalOutlets - regularOutlets;

  res.json({
    totalOutlets,
    totalUploads: uploadsCount || 0,
    displayOutlets,
    regularOutlets,
  });
});

app.get('/api/admin/locations', verifyAdmin, async (req, res) => {
  if (!supabase) return res.json([]);
  const { data, error } = await supabase
    .from('submissions')
    .select('*')
    .not('lat', 'is', null)
    .order('created_at', { ascending: false });

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.patch('/api/admin/settings', verifyAdmin, async (req, res) => {
  const { key, value } = req.body;
  if (!supabase) return res.json({ success: true, key, value });

  const { error } = await supabase
    .from('settings')
    .upsert({ key, value: String(value) }, { onConflict: 'key' });

  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true, key, value });
});

// Start Server
app.listen(PORT, () => {
  console.log(`✅ API Server running on http://localhost:${PORT}`);
  if (!supabase) {
    console.log('⚠️  Running in Test Mode (Add SUPABASE_URL & SUPABASE_SERVICE_KEY in .env when ready)');
  }
});