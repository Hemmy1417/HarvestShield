import { PillLink } from "@/components/bits";

export default function NotFound() {
  return (
    <div className="rounded-card bg-limestone p-10">
      <p className="display type-heading-3xl">Nothing here</p>
      <p className="mt-3 max-w-[50ch] text-[17px]">That page does not exist. The leases are all one click away.</p>
      <div className="mt-6 flex gap-3">
        <PillLink href="/leases" variant="primary">Leases</PillLink>
        <PillLink href="/">Home</PillLink>
      </div>
    </div>
  );
}
