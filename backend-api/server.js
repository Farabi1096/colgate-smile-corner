require("dotenv").config();
const express = require("express");
const cors = require("cors");
const multer = require("multer");
const { createClient } = require("@supabase/supabase-js");

const app = express();
const PORT = process.env.PORT || 5000;

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

// Save Submission & Upload Photo to Supabase Storage + Submissions Table
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
    if (!supabase) return res.status(500).json({ error: "Supabase keys missing on Render" });

    let imageUrl = null;
    let fileBuffer = null;

    if (req.file) {
      fileBuffer = req.file.buffer;
    } else if (photo_base64 && photo_base64.includes("base64,")) {
      const base64Data = photo_base64.split("base64,")[1];
      fileBuffer = Buffer.from(base64Data, "base64");
    }

    const cleanCode = String(shop_code).toUpperCase().trim().replace(/[^A-Z0-9_-]/g, "");

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

    const parsedLat = parseFloat(lat);
    const parsedLng = parseFloat(lng);

    const fullRow = {
      shop_code: cleanCode,
      merch_name: merch_name || "Field Team",
      role: role || "merchandiser",
      unit: unit || "DCC",
      area_name: area_name || "",
      distribution_name: distribution_name || "",
      slab: slab || "Regular",
      month: month || "",
      image_url: imageUrl,
      lat: !isNaN(parsedLat) ? parsedLat : null,
      lng: !isNaN(parsedLng) ? parsedLng : null,
    };

    // Try full insert first; if any extra column is missing, fall back to core columns
    let { data: inserted, error: insertErr } = await supabase
      .from("submissions")
      .insert([fullRow])
      .select()
      .single();

    if (insertErr) {
      console.warn("Full insert warning, retrying with core columns:", insertErr.message);
      const minimalRow = {
        shop_code: cleanCode,
        merch_name: merch_name || "Field Team",
        month: month || "",
        image_url: imageUrl,
        lat: !isNaN(parsedLat) ? parsedLat : null,
        lng: !isNaN(parsedLng) ? parsedLng : null,
      };
      const retry = await supabase.from("submissions").insert([minimalRow]).select().single();
      if (retry.error) throw retry.error;
      inserted = retry.data;
    }

    res.json({ success: true, imageUrl, submission: inserted });
  } catch (err) {
    console.error("Submission error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Get All Submissions (Also auto-imports any orphaned photos from outlet-photos bucket!)
app.get("/api/submissions", async (req, res) => {
  try {
    if (!supabase) return res.json([]);

    // 1. Check bucket for any photos that are not yet in the submissions table
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

    // 2. Return all rows from submissions table
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

app.listen(PORT, () => {
  console.log(`✅ API Server running on port ${PORT}`);
});
