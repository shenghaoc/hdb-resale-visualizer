import { rowToBlockSummary, townFilenameToCanonical, type BlockRow } from '../functions/_lib/d1';

type DataWindow = { minMonth: string; maxMonth: string };

function esc(input: string): string { return input.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;'); }
function fmtMoney(n?: number | null): string { return typeof n === 'number' ? new Intl.NumberFormat('en-SG',{style:'currency',currency:'SGD',maximumFractionDigits:0}).format(n) : 'N/A'; }
export function mapBlockToOgProps(block: ReturnType<typeof rowToBlockSummary>, dataWindow: DataWindow) {
  const walk = block.nearestMrt && typeof block.nearestMrt === 'object' && 'walkingTimeSeconds' in block.nearestMrt ? Math.round((((block.nearestMrt as { walkingTimeSeconds?: number }).walkingTimeSeconds) ?? 0) / 60) : null;
  return { eyebrow:block.town, title:`${block.block} ${block.streetName}`, median:fmtMoney(block.medianPrice), psm:block.pricePerSqmMedian?fmtMoney(block.pricePerSqmMedian):'N/A', lease:String(block.leaseCommenceRange?.[0]??'N/A'), walk:walk?`${walk} min`:'N/A', window:`${dataWindow.minMonth} → ${dataWindow.maxMonth}` };
}
async function meta(env: Env){const row=await env.DB.prepare('SELECT json FROM manifest WHERE id = 1').first<{json:string}>(); const p=row?JSON.parse(row.json) as {generatedAt?:string;dataWindow?:DataWindow}:{}; return {v:p.generatedAt??'unknown',w:p.dataWindow??{minMonth:'N/A',maxMonth:'N/A'}};}

export async function handleBlockOg(request: Request, env: Env, addressKey: string): Promise<Response> {
  const { v, w } = await meta(env);
  const key = new Request(`${new URL(request.url).origin}/__og-cache/block/${addressKey}?v=${encodeURIComponent(v)}`);
  const hit = await caches.default.match(key); if (hit) return hit;
  const row = await env.DB.prepare('SELECT * FROM blocks WHERE address_key = ?').bind(addressKey).first<BlockRow>(); if (!row) return Response.redirect(`${new URL(request.url).origin}/og-card.png`,302);
  const p = mapBlockToOgProps(rowToBlockSummary(row), w);
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='1200' height='630'><rect width='1200' height='630' fill='#0f172a'/><text x='48' y='80' fill='#94a3b8' font-size='30'>${esc(p.eyebrow)}</text><text x='48' y='180' fill='#e2e8f0' font-size='64'>${esc(p.title)}</text><text x='48' y='300' fill='#f8fafc' font-size='82'>${esc(p.median)}</text><text x='48' y='380' fill='#94a3b8' font-size='28'>$/SQM: ${esc(p.psm)} · LEASE: ${esc(p.lease)} · MRT WALK: ${esc(p.walk)}</text><text x='48' y='590' fill='#94a3b8' font-size='24'>HDB Resale Explorer · Data window ${esc(p.window)}</text></svg>`;
  const res = new Response(svg,{headers:{'content-type':'image/svg+xml; charset=utf-8','cache-control':'public, max-age=31536000, immutable'}}); await caches.default.put(key,res.clone()); return res;
}

export async function handleCompareOg(request: Request, env: Env, townA: string, townB: string): Promise<Response> {
  const aTown=townFilenameToCanonical(townA), bTown=townFilenameToCanonical(townB); const {v}=await meta(env);
  const key=new Request(`${new URL(request.url).origin}/__og-cache/compare/${townA}/${townB}?v=${encodeURIComponent(v)}`); const hit=await caches.default.match(key); if(hit) return hit;
  const rows=await env.DB.prepare('SELECT town, median_price, transaction_count FROM blocks WHERE town IN (?, ?)').bind(aTown,bTown).all<{town:string;median_price:number;transaction_count:number}>();
  const t=rows.results??[]; if(!t.length) return Response.redirect(`${new URL(request.url).origin}/og-card.png`,302);
  const tx=(town:string)=>t.filter(r=>r.town===town).reduce((n,r)=>n+r.transaction_count,0);
  const med=(town:string)=>{const a=t.filter(r=>r.town===town).map(r=>r.median_price).sort((x,y)=>x-y); return a[Math.floor(a.length/2)]??null;};
  const mA=med(aTown),mB=med(bTown); if(mA===null||mB===null)return Response.redirect(`${new URL(request.url).origin}/og-card.png`,302);
  const svg=`<svg xmlns='http://www.w3.org/2000/svg' width='1200' height='630'><rect width='1200' height='630' fill='#111827'/><text x='48' y='72' fill='#cbd5e1' font-size='32'>Town Comparison</text><text x='48' y='130' fill='white' font-size='40'>${esc(aTown)}</text><text x='48' y='200' fill='white' font-size='56'>${esc(fmtMoney(mA))}</text><text x='48' y='250' fill='#cbd5e1' font-size='30'>Transactions: ${tx(aTown)}</text><text x='648' y='130' fill='white' font-size='40'>${esc(bTown)}</text><text x='648' y='200' fill='white' font-size='56'>${esc(fmtMoney(mB))}</text><text x='648' y='250' fill='#cbd5e1' font-size='30'>Transactions: ${tx(bTown)}</text><text x='48' y='580' fill='#cbd5e1' font-size='36'>Delta: ${esc(fmtMoney(mA-mB))}</text></svg>`;
  const res=new Response(svg,{headers:{'content-type':'image/svg+xml; charset=utf-8','cache-control':'public, max-age=31536000, immutable'}}); await caches.default.put(key,res.clone()); return res;
}
