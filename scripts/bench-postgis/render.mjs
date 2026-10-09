/**
 * Renders report.json from run.mjs as the Markdown tables used in docs/benchmarks. Every number in the output is copied
 * from the JSON; nothing is recomputed except the ratio columns.
 *
 *   node scripts/bench-postgis/render.mjs <report.json> > docs/benchmarks/<name>.md
 */
import { readFileSync } from "node:fs";

const report = JSON.parse(readFileSync(process.argv[2], "utf8"));
const ms = (value) =>
  value >= 100 ? value.toFixed(0) : value >= 10 ? value.toFixed(1) : value.toFixed(2);
const lines = [];
const out = (line = "") => lines.push(line);

const env = report.environment;
out("## Environment");
out();
out(`- Run at ${env.at} on ${env.machine} (${env.platform}), Node ${env.node}.`);
out(`- PostgreSQL ${env.versions}; ${env.pgbench}.`);
out(`- Server settings (defaults of the local cluster, not tuned): ${env.settings}.`);
out(
  `- ${report.seconds} s per scenario and client count after a 2 s discarded warm-up; clients ${report.concurrencies.join(" and ")}; protocol \`simple\`; pgbench on the same machine over loopback.`,
);

for (const [n, size] of Object.entries(report.sizes)) {
  out();
  out(`## ${Number(n).toLocaleString("en-US")} blocks`);
  out();
  out(
    `Built in ${size.buildSeconds} s; blocks, block points and POIs with their indexes occupy ${size.relationsMb} MB. The query reads the shipped SQL (\`NEARBY_SPATIAL_SQL\`) with a block-derived centre.`,
  );
  out();
  out(
    "| Scenario | Clients | Samples | p50 ms | p95 ms | p99 ms | max ms | TPS | Other sessions before/after | Attempts |",
  );
  out("| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |");
  for (const r of size.results) {
    out(
      `| ${r.scenario}${r.noise.noisy ? " ⚠" : ""} | ${r.clients} | ${r.n} | ${ms(r.p50)} | ${ms(r.p95)} | ${ms(r.p99)} | ${ms(r.max)} | ${Math.round(r.tps)} | ${r.noise.before}/${r.noise.after} | ${r.noise.attempts} |`,
    );
  }
  const s = size.strategy;
  out();
  out(
    `Candidate strategy for blocks at 1,500 m over ${s.centres} centres: exact \`ST_DWithin\` ${s.exact_ms_per_query} ms per query; the ${report.knnCandidates} nearest by the \`<->\` operator then exact filter and order ${s.knn_ms_per_query} ms per query; the KNN result differed from the exact one for ${s.differ} centres and returned fewer rows for ${s.knn_returned_fewer}.`,
  );
}
console.log(lines.join("\n"));
