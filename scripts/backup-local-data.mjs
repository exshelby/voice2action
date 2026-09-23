import "dotenv/config";

import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { cp, mkdir, readdir, stat, unlink, writeFile } from "node:fs/promises";
import { basename, join, relative, resolve } from "node:path";
import process from "node:process";
import { spawn } from "node:child_process";
import { pipeline } from "node:stream/promises";

const projectRoot = resolve(import.meta.dirname, "..");
const backupRoot = resolve(projectRoot, "backups");
const timestamp = new Date().toISOString().replaceAll(":", "-").replace(".", "-");
const destination = resolve(backupRoot, `voice2action-${timestamp}`);
const incompleteMarker = join(destination, "INCOMPLETE");
const databaseDump = join(destination, "database.dump");
const audioSource = resolve(projectRoot, "storage", "audio");
const audioDestination = join(destination, "audio");

if (!destination.startsWith(`${backupRoot}\\`) && !destination.startsWith(`${backupRoot}/`)) {
  throw new Error("Backup destination left the project backup directory.");
}

const databaseName = process.env.POSTGRES_DB || "voice2action";
const databaseUser = process.env.POSTGRES_USER || "voice2action";

async function dumpDatabase() {
  const output = createWriteStream(databaseDump, { flags: "wx" });
  const child = spawn(
    "docker",
    [
      "compose",
      "exec",
      "-T",
      "postgres",
      "pg_dump",
      "--username",
      databaseUser,
      "--dbname",
      databaseName,
      "--format=custom",
      "--no-owner",
      "--no-privileges",
    ],
    { cwd: projectRoot, stdio: ["ignore", "pipe", "pipe"] },
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
      else reject(new Error(`pg_dump exited with code ${code}: ${stderr.trim()}`));
    });
  });

  await Promise.all([pipeline(child.stdout, output), exit]);
}

async function fileHash(path) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}

async function filesUnder(root) {
  const entries = [];
  for (const directoryEntry of await readdir(root, { withFileTypes: true })) {
    const path = join(root, directoryEntry.name);
    if (directoryEntry.isDirectory()) entries.push(...(await filesUnder(path)));
    else if (directoryEntry.isFile()) entries.push(path);
  }
  return entries;
}

await mkdir(backupRoot, { recursive: true });
await mkdir(destination, { recursive: false });
await writeFile(incompleteMarker, "Backup creation is still in progress.\n", { flag: "wx" });

try {
  console.log(`Creating database dump in ${destination}...`);
  await dumpDatabase();

  try {
    await cp(audioSource, audioDestination, {
      recursive: true,
      errorOnExist: true,
      force: false,
    });
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    await mkdir(audioDestination);
  }

  const paths = [databaseDump, ...(await filesUnder(audioDestination))];
  const files = [];
  for (const path of paths) {
    const metadata = await stat(path);
    files.push({
      path: relative(destination, path).replaceAll("\\", "/"),
      bytes: metadata.size,
      sha256: await fileHash(path),
    });
  }

  const manifest = {
    formatVersion: 1,
    createdAt: new Date().toISOString(),
    database: { name: databaseName, dump: basename(databaseDump) },
    files,
  };

  await writeFile(
    join(destination, "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
    { flag: "wx" },
  );
  await unlink(incompleteMarker);

  console.log(`Backup completed and checksummed: ${destination}`);
  console.log("Store this directory on encrypted media separate from this computer.");
} catch (error) {
  console.error(`Backup is incomplete; ${incompleteMarker} was kept.`);
  throw error;
}
