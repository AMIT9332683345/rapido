/**
 * Serial dependency installer for networks where npm's parallel fetch
 * fails with ERR_SSL_CIPHER_OPERATION_FAILED (TLS-intercepting ISP).
 * Reads package-lock.json, downloads each tarball one at a time with
 * retries, and extracts straight into node_modules.
 *
 * Usage: npm run fetch-deps   (run it 2-3 times; it resumes where it stopped)
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, win32 } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";

const STAGE = join(tmpdir(), "qoder-npm-stage");
const ATTEMPTS = Number(process.env.FETCH_ATTEMPTS || 15);
// ROOT lets the same script install a tool package elsewhere, e.g. a global
// tools folder, without touching this app's node_modules.
const root = process.env.ROOT_DIR || process.cwd();
const modules = join(root, "node_modules");

// Git Bash's tar reads "C:\..." as a remote host, so prefer Windows' own tar.
const WIN_TAR = "C:\\Windows\\System32\\tar.exe";
const TAR = existsSync(WIN_TAR) ? WIN_TAR : "tar";

function extract(tgz, dest) {
  const args = ["-xzf", tgz, "--strip-components=1", "-C", dest];
  execFileSync(TAR, process.platform === "win32" ? args : args.map(win32.toPosixPath ?? (p => p)), {
    stdio: "ignore",
  });
}

async function get(url) {
  let lastErr;
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    try {
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      if (!buf.length) throw new Error("empty body");
      return buf;
    } catch (e) {
      lastErr = e;
      await new Promise((r) => setTimeout(r, Math.min(250 * attempt, 2500)));
    }
  }
  throw lastErr;
}

function entries(lock) {
  const out = [];
  for (const [spec, node] of Object.entries(lock.packages || {})) {
    if (!spec || spec === "." || !node.resolved?.includes(".tgz")) continue;
    // Lockfile spec is already relative to the project root:
    // "node_modules/react" or "node_modules/next/node_modules/styled-jsx".
    const dest = join(root, spec);
    out.push({ spec, url: node.resolved, dest, node });
  }
  return out;
}

async function main() {
  mkdirSync(STAGE, { recursive: true });
  mkdirSync(modules, { recursive: true });

  const lockFile = join(root, "package-lock.json");
  if (!existsSync(lockFile)) {
    console.log("Building the dependency graph first...");
    execFileSync(
      "npm",
      ["install", "--package-lock-only", "--ignore-scripts", "--legacy-peer-deps", "--no-audit", "--no-fund"],
      { stdio: "inherit" }
    );
  }
  const lock = JSON.parse(readFileSync(lockFile, "utf8"));
  const all = entries(lock);
  console.log(`Graph has ${all.length} packages. Fetching serially...`);

  let ok = 0;
  let failed = 0;
  const failures = [];

  for (let i = 0; i < all.length; i++) {
    const { spec, url, dest, node } = all[i];
    const marker = join(dest, "package.json");
    if (existsSync(marker)) {
      ok++;
      continue;
    }

    // Validate the tarball against the lockfile integrity before extracting.
    const expected = node.integrity?.startsWith("sha512-")
      ? Buffer.from(node.integrity.slice(7), "base64")
      : null;

    let buf;
    try {
      buf = await get(url);
    } catch (e) {
      failed++;
      failures.push(`${spec}: ${e.message}`);
      console.log(`  ! ${spec} — giving up after ${ATTEMPTS} tries (${e.message})`);
      continue;
    }

    if (expected) {
      const crypto = await import("node:crypto");
      const actual = crypto.createHash("sha512").update(buf).digest();
      if (!actual.equals(expected)) {
        failed++;
        failures.push(`${spec}: corrupt download`);
        console.log(`  ! ${spec} — corrupt payload, will retry next run`);
        continue;
      }
    }

    const tmp = join(STAGE, spec.replace(/[\/@]/g, "_") + ".tgz");
    writeFileSync(tmp, buf);
    mkdirSync(dest, { recursive: true });
    extract(tmp, dest);
    rmSync(tmp, { force: true });
    ok++;
    if (ok % 10 === 0 || i === all.length - 1) {
      console.log(`  ${ok}/${all.length} installed (${(buf.length / 1024).toFixed(0)} kB — ${spec})`);
    }
  }

  console.log(`\nInstalled ${ok}/${all.length}, failed ${failed}.`);
  if (failures.length) {
    console.log("Re-run `npm run fetch-deps` to retry these:");
    failures.slice(0, 25).forEach((f) => console.log("  - " + f));
    process.exitCode = 2;
  } else {
    console.log("All dependencies present.");
  }
}

main().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
