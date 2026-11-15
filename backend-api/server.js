require("dotenv").config();
const express = require("express");
const cors = require("cors");
const multer = require("multer");
const { createClient } = require("@supabase/supabase-js");

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json({ limit: "15mb" }));
app.use(express.urlencoded({ extended: true, limit: "15mb" }));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

const hasSupabase = process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY;
const supabase = hasSupabase
  ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)
  : null;

app.get("/", (req, res) => {
  res.json({
    status: "OK",
    message: "Colgate Smile Corner API is running!",
    supabaseConnected: Boolean(supabase),
  });
});

// POST /api/submissions -> Uploads image to bucket AND saves all form data to submissions table
app.post("/api/submissions", upload.single("photo"), async (req, res) => {
  try {
    if (!supabase) {
      return res.status(500).json({ error: "Supabase keys missing in Render Environment" });
    }

    const body = req.body || {};
    const rawCode = body.shop_code || body.sr_outlet || "UNKNOWN";
    const cleanCode = String(rawCode).toUpperCase().trim().replace(/[^A-Z0-9_-]/g, "") || "OUTLET";

    let imageUrl = null;
    let fileBuffer = null;

    if (req.file && req.file.buffer) {
      fileBuffer = req.file.buffer;
    } else if (body.photo_base64 && body.photo_base64.includes("base64,")) {
      fileBuffer = Buffer.from(body.photo_base64.split("base64,")[1], "base64");
    } else if (body.shop_image && body.shop_image.data && body.shop_image.data.includes("base64,")) {
      fileBuffer = Buffer.from(body.shop_image.data.split("base64,")[1], "base64");
    }

    if (fileBuffer) {
      const fileName = `${cleanCode}_${Date.now()}.jpg`;
      const { error: uploadErr } = await supabase.storage
        .from("outlet-photos")
        .upload(fileName, fileBuffer, { contentType: "image/jpeg", upsert: true });

      if (uploadErr) throw uploadErr;

      const { data: publicUrlData } = supabase.storage
        .from("outlet-photos")
        .getPublicUrl(fileName);
      imageUrl = publicUrlData.publicUrl;
    }

    const parsedLat = parseFloat(body.lat || body.latitude);
    const parsedLng = parseFloat(body.lng || body.longitude);

    const submissionRow = {
      shop_code: cleanCode,
      merch_name: body.merch_name || "Field Team",
      role: body.role || "merchandiser",
      unit: body.unit || body.outlet_type || "DCC",
      area_name: body.area_name || "",
      territory: body.territory || "",
      db_code: body.db_code || "",
      distribution_name: body.distribution_name || "",
      route_name: body.route_name || body.sr_route || "",
      slab: body.slab || "Regular",
      month: body.month || body.display_month || "",
      image_url: imageUrl,
      lat: !isNaN(parsedLat) ? parsedLat : null,
      lng: !isNaN(parsedLng) ? parsedLng : null,
    };

    const { data: insertedRow, error: insertErr } = await supabase
      .from("submissions")
      .insert([submissionRow])
      .select()
      .single();

    if (insertErr) {
      console.error("Supabase Table Insert Error:", insertErr);
      return res.status(500).json({ success: false, error: insertErr.message });
    }

    res.json({ success: true, imageUrl, submission: insertedRow });
  } catch (err) {
    console.error("Submission error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/submissions -> Returns all rows + syncs any older bucket photos into the table
app.get("/api/submissions", async (req, res) => {
  try {
    if (!supabase) return res.json([]);

    const { data: files } = await supabase.storage
      .from("outlet-photos")
      .list("", { limit: 100, sortBy: { column: "created_at", order: "desc" } });

    const { data: existingRows } = await supabase
      .from("submissions")
      .select("image_url")
      .limit(500);

    const existingUrls = new Set((existingRows || []).map((r) => r.image_url));

    if (files && files.length > 0) {
      for (const file of files) {
        if (!file.name || file.name === ".emptyFolderPlaceholder") continue;
        const { data: urlData } = supabase.storage.from("outlet-photos").getPublicUrl(file.name);
        const pubUrl = urlData.publicUrl;
        if (!existingUrls.has(pubUrl)) {
          const guessedCode = file.name.split("_")[0] || "OUTLET";
          await supabase.from("submissions").insert([
            {
              shop_code: guessedCode,
              merch_name: "Synced from Bucket",
              image_url: pubUrl,
              created_at: file.created_at || new Date().toISOString(),
            },
          ]);
        }
      }
    }

    const { data, error } = await supabase
      .from("submissions")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500);

    if (error) return res.status(500).json({ error: error.message });
    res.json(data || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// ==========================================
// 7. SYNC GOOGLE SHEET PJP OUTLETS TO SUPABASE
// ==========================================
app.get('/api/sync-outlets', async (req, res) => {
  if (!supabase) return res.status(400).json({ error: 'Supabase not connected' });
  try {
    const SHEET_ID = '1LE52K4tA60_-Ekd0TEF9gc2zMyq1tP5SOAC1zru8A6k';
    const url = 'https://docs.google.com/spreadsheets/d/' + SHEET_ID + '/gviz/tq?tqx=out:json&sheet=PJP';
    const response = await fetch(url);
    const text = await response.text();
    const jsonString = text.substring(text.indexOf('{'), text.lastIndexOf('}') + 1);
    const data = JSON.parse(jsonString);
    const rows = data.table.rows || [];

    const outletsToUpsert = [];
    const seenCodes = new Set();

    rows.forEach((row) => {
      const getVal = (idx) => (row.c && row.c[idx] && row.c[idx].v != null ? String(row.c[idx].v).trim() : '');
      const shop_code = getVal(5).toUpperCase();
      const townName = getVal(4);
      if (!shop_code || !townName || ['OUTLET CODE', 'CODE'].includes(shop_code)) return;
      if (seenCodes.has(shop_code)) return;
      seenCodes.add(shop_code);

      outletsToUpsert.push({
        shop_code,
        shop_name: getVal(6) || 'Unknown Outlet',
        region: getVal(0),
        zone: getVal(1),
        territory: getVal(2),
        db_code: getVal(3),
        db_name: townName,
        slab: getVal(7),
        route_code: getVal(8),
        route_name: getVal(9),
        visit_day: getVal(10),
        merchandiser: getVal(11),
        status: getVal(12) || 'Display',
        unit: getVal(13) || 'DCC'
      });
    });

    // Upsert in batches of 500
    let inserted = 0;
    for (let i = 0; i < outletsToUpsert.length; i += 500) {
      const batch = outletsToUpsert.slice(i, i + 500);
      const { error } = await supabase.from('outlets').upsert(batch, { onConflict: 'shop_code' });
      if (error) throw error;
      inserted += batch.length;
    }

    res.json({ success: true, totalSyncedOutlets: inserted });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`✅ API Server running on port ${PORT}`);
});
