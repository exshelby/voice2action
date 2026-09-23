import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { access, readFile, stat } from "node:fs/promises";
import { isAbsolute, resolve, sep } from "node:path";
import process from "node:process";
import { pipeline } from "node:stream/promises";

const requestedPath = process.argv[2];
if (!requestedPath) {
  throw new Error("Pass the backup directory: npm run backup:verify -- backups/<name>");
}

const backupDirectory = resolve(requestedPath);
await access(backupDirectory);

try {
  await access(resolve(backupDirectory, "INCOMPLETE"));
  throw new Error("This backup is marked INCOMPLETE and must not be restored.");
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}

const manifest = JSON.parse(await readFile(resolve(backupDirectory, "manifest.json"), "utf8"));
if (manifest.formatVersion !== 1 || !Array.isArray(manifest.files)) {
  throw new Error("The backup manifest format is not supported.");
}

function safeBackupPath(relativePath) {
  if (typeof relativePath !== "string" || isAbsolute(relativePath)) {
    throw new Error("The backup manifest contains an invalid file path.");
  }

  const path = resolve(backupDirectory, relativePath);
  if (!path.startsWith(`${backupDirectory}${sep}`)) {
    throw new Error("The backup manifest contains a path outside the backup directory.");
  }
  return path;
}

async function hashFile(path) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}

for (const file of manifest.files) {
  const path = safeBackupPath(file.path);
  const metadata = await stat(path);
  if (metadata.size !== file.bytes) throw new Error(`${file.path} has the wrong size.`);
  if ((await hashFile(path)) !== file.sha256) throw new Error(`${file.path} failed its SHA-256 check.`);
}

const databaseDump = safeBackupPath(manifest.database?.dump);
const child = spawn(
  "docker",
  ["compose", "exec", "-T", "postgres", "pg_restore", "--list"],
  { cwd: resolve(import.meta.dirname, ".."), stdio: ["pipe", "ignore", "pipe"] },
);

let stderr = "";
child.stderr.setEncoding("utf8");
child.stderr.on("data", (chunk) => {
  stderr += chunk;
});

const exit = new Promise((resolvePromise, reject) => {
  child.on("error", reject);
  child.on("close", (code) => {
    if (code === 0) resolvePromise();
    else reject(new Error(`pg_restore could not read the archive: ${stderr.trim()}`));
  });
});

await Promise.all([pipeline(createReadStream(databaseDump), child.stdin), exit]);
console.log(`Backup verified: ${backupDirectory}`);
