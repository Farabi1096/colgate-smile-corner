require("dotenv").config();
const express = require("express");
const cors = require("cors");
const multer = require("multer");
const jwt = require("jsonwebtoken");
const { createClient } = require("@supabase/supabase-js");

const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || "colgate_secret_key";
const ADMIN_PIN = process.env.ADMIN_PIN || "1234";

app.use(cors());
app.use(express.json({ limit: "15mb" }));

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

// Get Global Settings
app.get("/api/settings", async (req, res) => {
  if (!supabase) {
    return res.json({ maintenance_mode: false, global_notice: "", gallery_unlocked: false });
  }
  const { data, error } = await supabase.from("settings").select("*");
  if (error) return res.status(500).json({ error: error.message });
  const settings = {};
  (data || []).forEach((row) => {
    settings[row.key] = row.value === "true" ? true : row.value === "false" ? false : row.value;
  });
  res.json(settings);
});

// Update Global Settings (Maintenance, Notice, Gallery Lock)
app.patch("/api/admin/settings", async (req, res) => {
  const { key, value } = req.body;
  if (!supabase) return res.json({ success: true, key, value });
  const { error } = await supabase
    .from("settings")
    .upsert({ key, value: String(value) }, { onConflict: "key" });
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true, key, value });
});

// Save Submission & Upload Photo to Supabase Storage
app.post("/api/submissions", upload.single("photo"), async (req, res) => {
  try {
    const {
      shop_code,
      merch_name,
      role,
      unit,
      area_name,
      distribution_name,
      slab,
      month,
      lat,
      lng,
      photo_base64,
    } = req.body;

    if (!shop_code) return res.status(400).json({ error: "shop_code is required" });

    if (!supabase) {
      return res.json({
        success: true,
        message: "Received in Test Mode. Add SUPABASE_URL & SUPABASE_SERVICE_KEY on Render!",
      });
    }

    let imageUrl = null;
    let fileBuffer = null;

    if (req.file) {
      fileBuffer = req.file.buffer;
    } else if (photo_base64 && photo_base64.includes("base64,")) {
      const base64Data = photo_base64.split("base64,")[1];
      fileBuffer = Buffer.from(base64Data, "base64");
    }

    if (fileBuffer) {
      const cleanCode = String(shop_code).toUpperCase().replace(/[^A-Z0-9_-]/g, "");
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

    const { data: inserted, error: insertErr } = await supabase
      .from("submissions")
      .insert([
        {
          shop_code: String(shop_code).toUpperCase().trim(),
          merch_name: merch_name || "Field Team",
          role: role || "merchandiser",
          unit: unit || "DCC",
          area_name: area_name || "",
          distribution_name: distribution_name || "",
          slab: slab || "Regular",
          month: month || "",
          image_url: imageUrl,
          lat: parseFloat(lat) || null,
          lng: parseFloat(lng) || null,
        },
      ])
      .select()
      .single();

    if (insertErr) throw insertErr;

    res.json({ success: true, imageUrl, submission: inserted });
  } catch (err) {
    console.error("Submission error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Get All Uploaded Submissions & Photos from Supabase
app.get("/api/submissions", async (req, res) => {
  if (!supabase) return res.json([]);
  const { data, error } = await supabase
    .from("submissions")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) return res.status(500).json({ error: error.message });
  res.json(data || []);
});

app.listen(PORT, () => {
  console.log(`✅ API Server running on port ${PORT}`);
});
