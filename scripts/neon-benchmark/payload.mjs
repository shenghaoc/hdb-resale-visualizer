// Bounded public bootstrap payload measurement. No transaction corpus or private data fetch.
import { connect, save } from "./common.mjs";
const { client } = await connect();
const records = [];
try {
  for (const [name, sql] of [
    ["all_blocks", "SELECT * FROM blocks ORDER BY median_price DESC,transaction_count DESC"],
    ["all_trends", "SELECT * FROM town_flat_type_trends ORDER BY town,flat_type,month"],
    [
      "suggest_dictionary",
      "SELECT address_key,town,block,street_name,postal_code FROM blocks ORDER BY address_key",
    ],
  ]) {
    const before = client.connection.stream.bytesRead,
      started = performance.now();
    const result = await client.query(sql);
    const record = {
      name,
      rows: result.rows.length,
      wireReceivedBytes: client.connection.stream.bytesRead - before,
      applicationJsonBytes: Buffer.byteLength(JSON.stringify(result.rows)),
      wallMs: performance.now() - started,
    };
    records.push(record);
    console.log(JSON.stringify(record));
  }
  save("runtime-payload", {
    at: new Date().toISOString(),
    records,
    note: "Current coherent isolated benchmark; row cardinalities match production. TLS stream counters are an egress proxy, not finalized Neon billing. Source bulk storage measured separately before synthetic preparations.",
  });
} finally {
  await client.end();
}
