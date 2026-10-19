"use client";

import { Loading, Problem } from "@/components/bits";
import { ProductCard } from "@/components/ProductCard";
import { CONTRACT_CONFIGURED } from "@/lib/config";
import { plural } from "@/lib/present";
import { listProducts } from "@/lib/read";
import { useChain } from "@/lib/useChain";

export default function Cover() {
  const list = useChain(CONTRACT_CONFIGURED ? "products.0.50" : null, (f) => listProducts(0, 50, f));
  const products = list.data?.products ?? [];
  const open = products.filter((p) => p.open && p.sold < p.capacity);
  const closed = products.filter((p) => !(p.open && p.sold < p.capacity));
  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="h-lg">Buy cover</h1>
        <p className="mt-2 max-w-[62ch] text-[17px]">
          Each product names a point, a rainfall threshold and a window. Pick one, pay the premium, and the payout is reserved for you.
        </p>
      </div>
      {!CONTRACT_CONFIGURED ? <Problem title="No deployment configured" /> : list.loading ? <Loading what="the products" /> : list.error ? (
        <Problem title="The chain did not answer">{list.error instanceof Error ? list.error.message : ""}</Problem>
      ) : (
        <>
          <p className="muted text-[15px]">{plural(open.length, "product")} open for sale.</p>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">{open.map((p) => <ProductCard key={p.product_id} p={p} />)}</div>
          {closed.length ? (
            <>
              <h2 className="h-md mt-6">Sold out or closed</h2>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">{closed.map((p) => <ProductCard key={p.product_id} p={p} />)}</div>
            </>
          ) : null}
          {products.length === 0 ? <p className="muted">No product has been published yet.</p> : null}
        </>
      )}
    </div>
  );
}
