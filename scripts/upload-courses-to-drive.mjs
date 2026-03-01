import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import GoogleAuthManager from "../src/google-auth.mjs";

function ensureDir(p) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

function listMp4(dir) {
  try {
    return fs
      .readdirSync(dir)
      .filter((f) => /\.mp4$/i.test(f))
      .map((f) => ({ file: f, abs: path.join(dir, f) }));
  } catch {
    return [];
  }
}

function boolEnv(name) {
  const v = process.env[name];
  if (!v) return false;
  return ["1", "true", "yes", "y", "on"].includes(String(v).toLowerCase());
}

async function main() {
  const srcDir = String(process.env.RWC_VIDEO_SRC_DIR || process.env.COURSES_VIDEO_DIR || "").trim();
  const folderId = String(process.env.GOOGLE_DRIVE_COURSES_FOLDER_ID || "").trim();
  const outPath = path.resolve("site/realworldcerts/site-data/drive_videos.json");

  if (!srcDir) throw new Error("Missing RWC_VIDEO_SRC_DIR or COURSES_VIDEO_DIR");
  if (!folderId) throw new Error("Missing GOOGLE_DRIVE_COURSES_FOLDER_ID");

  const auth = new GoogleAuthManager();
  const ok = await auth.tryServiceAccountAuth();
  if (!ok) {
    const ready = await auth.authenticate();
    if (!ready) {
      process.exitCode = 2;
      return;
    }
  }

  const drive = await auth.getDriveService();
  const files = listMp4(srcDir);
  const results = [];
  for (const f of files) {
    const res = await drive.files.create({
      requestBody: {
        name: f.file,
        parents: [folderId],
      },
      media: {
        mimeType: "video/mp4",
        body: fs.createReadStream(f.abs),
      },
      fields: "id,name,webViewLink,webContentLink",
    });
    const item = res.data || {};
    if (boolEnv("GOOGLE_DRIVE_PUBLIC") && item.id) {
      await drive.permissions.create({
        fileId: item.id,
        requestBody: { role: "reader", type: "anyone" },
      });
    }
    results.push({
      name: item.name || f.file,
      id: item.id || null,
      webViewLink: item.webViewLink || null,
      webContentLink: item.webContentLink || null,
      source: f.abs,
    });
    console.log(JSON.stringify({ uploaded: f.file, id: item.id }));
  }

  ensureDir(path.dirname(outPath));
  fs.writeFileSync(outPath, JSON.stringify({ folderId, count: results.length, items: results }, null, 2));
  console.log(JSON.stringify({ outPath, folderId, count: results.length }));
}

main().catch((e) => {
  console.error(e?.message || String(e));
  process.exitCode = 1;
});

