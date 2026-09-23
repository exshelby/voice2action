import "dotenv/config";

import { randomUUID } from "node:crypto";
import process from "node:process";

import pg from "pg";

import {
  hashOperatorPassword,
  isValidOperatorUsername,
  normalizeOperatorUsername,
  validateOperatorPassword,
} from "../lib/operator-password.mjs";
import { isOperatorRole, normalizeOperatorRole, operatorRoleLabel } from "../lib/operator-roles.mjs";

function readHidden(label) {
  if (!process.stdin.isTTY || typeof process.stdin.setRawMode !== "function") {
    throw new Error("An interactive terminal is required to enter the operator password safely.");
  }

  return new Promise((resolve, reject) => {
    let value = "";

    function finish(error) {
      process.stdin.off("data", onData);
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdout.write("\n");
      if (error) reject(error);
      else resolve(value);
    }

    function onData(chunk) {
      for (const character of String(chunk)) {
        if (character === "\u0003") {
          finish(new Error("Operator creation cancelled."));
          return;
        }
        if (character === "\r" || character === "\n") {
          finish();
          return;
        }
        if (character === "\u007f" || character === "\b") {
          if (value) {
            value = value.slice(0, -1);
            process.stdout.write("\b \b");
          }
          continue;
        }
        if (character >= " ") {
          value += character;
          process.stdout.write("*");
        }
      }
    }

    process.stdout.write(label);
    process.stdin.setEncoding("utf8");
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.on("data", onData);
  });
}

async function main() {
  const username = normalizeOperatorUsername(process.argv[2]);
  const displayName = String(process.argv[3] ?? "").replace(/\s+/g, " ").trim();
  const role = normalizeOperatorRole(process.argv[4] ?? "OPERATOR");

  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not configured.");
  }
  if (!isValidOperatorUsername(username)) {
    throw new Error("Username must be 3-64 lowercase letters, numbers, dots, underscores, or hyphens.");
  }
  if (displayName.length < 2 || displayName.length > 100) {
    throw new Error("Display name must contain between 2 and 100 characters.");
  }
  if (!isOperatorRole(role)) {
    throw new Error("Role must be OPERATOR, MANAGER, or ADMIN.");
  }

  const password = await readHidden("Password (12+ characters): ");
  validateOperatorPassword(password);
  const confirmation = await readHidden("Confirm password: ");

  if (password !== confirmation) {
    throw new Error("Passwords did not match.");
  }

  const passwordHash = await hashOperatorPassword(password);
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  try {
    const created = await client.query(
      `INSERT INTO operator (id, username, display_name, password_hash, role, updated_at)
       VALUES ($1, $2, $3, $4, $5::operator_role, NOW())
       ON CONFLICT (username) DO NOTHING
       RETURNING id`,
      [randomUUID(), username, displayName, passwordHash, role],
    );

    if (created.rowCount !== 1) {
      throw new Error(`Operator ${username} already exists.`);
    }

    console.log(`Created local ${operatorRoleLabel(role).toLowerCase()} ${displayName} (@${username}).`);
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error("Operator could not be created:", error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
