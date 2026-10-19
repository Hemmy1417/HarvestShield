/**
 * The insured points on a plain equirectangular world: a graticule, the
 * equator and tropics, and one marker per product, sized by live policies.
 * No map tiles and no third-party script: the coordinates are the product's
 * own, as the contract stores them.
 */
import Link from "next/link";

import { productName, triggerShort } from "@/lib/present";
import type { Product } from "@/lib/types";

const W = 1000, H = 500;
const px = (lon: number) => ((lon + 180) / 360) * W;
const py = (lat: number) => ((90 - lat) / 180) * H;

export function RiskMap({ products }: { products: Product[] }) {
  return (
    <div className="flex flex-col gap-4">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full rounded-[12px] bg-lagoon-soft" role="img"
        aria-label={`A world map with ${products.length} insured points.`}>
        {Array.from({ length: 11 }, (_, i) => i * 36 - 180).map((lon) => (
          <line key={`m${lon}`} x1={px(lon)} x2={px(lon)} y1={0} y2={H} stroke="rgba(255,255,255,0.07)" />
        ))}
        {[-60, -30, 0, 30, 60].map((lat) => (
          <line key={`p${lat}`} x1={0} x2={W} y1={py(lat)} y2={py(lat)} stroke={lat === 0 ? "rgba(255,255,255,0.25)" : "rgba(255,255,255,0.07)"} />
        ))}
        {[23.44, -23.44].map((lat) => (
          <line key={`t${lat}`} x1={0} x2={W} y1={py(lat)} y2={py(lat)} stroke="rgba(231,164,60,0.35)" strokeDasharray="4 6" />
        ))}
        <text x={8} y={py(0) - 6} fontSize="12" fill="rgba(255,255,255,0.55)">Equator</text>
        <text x={8} y={py(23.44) - 6} fontSize="12" fill="rgba(231,164,60,0.7)">Tropic of Cancer</text>
        <text x={8} y={py(-23.44) - 6} fontSize="12" fill="rgba(231,164,60,0.7)">Tropic of Capricorn</text>
        {products.map((p) => {
          const x = px(Number(p.lon)), y = py(Number(p.lat));
          return (
            <g key={p.product_id}>
              <circle cx={x} cy={y} r={8 + Math.min(14, p.active * 3)} fill="none" stroke="#e7a43c" strokeWidth="2" opacity="0.7" />
              <circle cx={x} cy={y} r={5} fill={p.trigger === "RAIN_BELOW" ? "#e7a43c" : "#d4c7ff"} />
            </g>
          );
        })}
      </svg>
      {products.length ? (
        <ul className="grid gap-2 md:grid-cols-2">
          {products.slice(0, 6).map((p) => (
            <li key={p.product_id}>
              <Link href={`/products/${p.product_id}`} className="flex items-center justify-between gap-3 rounded-[10px] bg-lagoon-soft px-4 py-2.5 text-[14px] text-paper no-underline hover:bg-[#1a6667]">
                <span>{p.crop}, {p.region}</span>
                <span className="text-paper/70">{triggerShort(p.trigger)} · {productName(p.product_id)}</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : <p className="text-[14px] text-paper/70">No product has been published yet.</p>}
    </div>
  );
}
