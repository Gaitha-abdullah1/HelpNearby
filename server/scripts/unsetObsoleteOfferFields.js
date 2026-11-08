import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import mongoose from "mongoose";

const FIELDS = ["offerVolunteerId", "offerStartedAt", "offerExpiresAt", "assignmentExhausted"];
const serverDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run");
const apply = args.has("--apply");

if (args.size !== 1 || (!dryRun && !apply)) {
  console.error("Usage: node scripts/unsetObsoleteOfferFields.js --dry-run");
  console.error("       node scripts/unsetObsoleteOfferFields.js --apply");
  process.exit(1);
}

dotenv.config({ path: path.join(serverDirectory, ".env") });
const uri = String(process.env.MONGODB_URI || "").replace(/^"|"$/g, "");
if (!uri) {
  console.error("Missing MONGODB_URI.");
  process.exit(1);
}

const filter = { $or: FIELDS.map((field) => ({ [field]: { $exists: true } })) };
const unset = Object.fromEntries(FIELDS.map((field) => [field, ""]));

await mongoose.connect(uri, { serverSelectionTimeoutMS: 12000 });
try {
  const collection = mongoose.connection.db.collection("helprequests");
  const affected = await collection.countDocuments(filter);
  let modified = 0;
  if (apply) {
    const result = await collection.updateMany(filter, { $unset: unset });
    modified = result.modifiedCount;
  }
  console.log(`mode: ${dryRun ? "dry-run" : "apply"}`);
  console.log(`affected: ${affected}`);
  console.log(`modified: ${modified}`);
} finally {
  await mongoose.disconnect();
}
