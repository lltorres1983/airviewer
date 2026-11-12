// Runs the actual migration/policies in an isolated PostgreSQL cluster.
// Only the auth.users/auth.uid platform boundary is reproduced locally.
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
const binaryDir = process.env.PG_BIN || "/usr/lib/postgresql/16/bin";
const directory = await mkdtemp(join(tmpdir(), "airviewer-db-test-"));
const data = join(directory, "data");
const env = {
  ...process.env,
  PGHOST: directory,
  PGPORT: "65432",
  PGUSER: "airviewer_test",
  PGDATABASE: "postgres",
};
function run(binary, args) {
  const result = spawnSync(join(binaryDir, binary), args, {
    env,
    encoding: "utf8",
  });
  if (result.status !== 0)
    throw new Error(
      `${binary}: ${result.error?.message || result.stderr || result.stdout}`,
    );
}
let started = false;
try {
  run("initdb", ["-D", data, "-A", "trust", "--no-locale", "-U", env.PGUSER]);
  run("pg_ctl", [
    "-D",
    data,
    "-l",
    join(directory, "postgres.log"),
    "-o",
    `-F -k ${directory} -p 65432 -h ''`,
    "-w",
    "start",
  ]);
  started = true;
  const bootstrap = join(directory, "bootstrap.sql");
  await writeFile(
    bootstrap,
    `
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin bypassrls;
    create schema auth;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth, public to anon, authenticated, service_role;
  `,
  );
  for (const file of [
    bootstrap,
    resolve("supabase/migrations/20261111000000_aircraft_favorites.sql"),
    resolve("supabase/tests/aircraft_favorites.sql"),
    resolve("supabase/migrations/20261112000000_home_radar.sql"),
    resolve("supabase/tests/home_radar.sql"),
  ])
    run("psql", ["-v", "ON_ERROR_STOP=1", "-q", "-f", file]);
  console.log(
    "Banco validado: favoritos e radar privados, permissões, validação e exclusão da conta.",
  );
} finally {
  if (started) run("pg_ctl", ["-D", data, "-m", "immediate", "-w", "stop"]);
  await rm(directory, { recursive: true, force: true });
}
