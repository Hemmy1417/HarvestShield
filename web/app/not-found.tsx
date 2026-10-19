import { LinkButton } from "@/components/bits";

export default function NotFound() {
  return (
    <div className="rounded-card border border-mist bg-paper p-8">
      <p className="h-lg">Nothing grows here</p>
      <p className="mt-2 max-w-[50ch] text-[17px]">That page does not exist.</p>
      <div className="mt-6 flex gap-3">
        <LinkButton href="/cover">Buy cover</LinkButton>
        <LinkButton href="/" variant="secondary">Home</LinkButton>
      </div>
    </div>
  );
}
