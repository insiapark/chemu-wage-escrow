import { cp, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const frontend = fileURLToPath(new URL("../", import.meta.url));
const docs = resolve(frontend, "../docs");
const target = resolve(frontend, "public");
await mkdir(resolve(target, "assets/iso"), { recursive: true });
await mkdir(resolve(target, "reference"), { recursive: true });
for (const name of ["iso_03_clock_in.png", "iso_06_payday.png"]) {
  await cp(resolve(docs, "assets/iso", name), resolve(target, "assets/iso", name));
}
await cp(resolve(docs, "wireframe"), resolve(target, "reference/wireframe"), { recursive: true });
await cp(resolve(docs, "assets"), resolve(target, "reference/assets"), { recursive: true });
console.log("Prepared the team's existing illustrations and reference wireframes.");
