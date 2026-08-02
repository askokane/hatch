import Link from "next/link";
import { Avatar } from "@/components/ui/Avatar";
import { TagBadge } from "@/components/ui/TagBadge";
import { ConnectionStatus } from "@/components/ui/ConnectionStatus";
import { INTENT_LABELS } from "@/lib/constants";
import type { Relationship } from "@/lib/relationship";

export function PeopleCard({
  person,
  relationship,
}: {
  person: {
    handle: string;
    name: string;
    school: string;
    gradYear: number;
    basedIn: string;
    bio: string;
    avatarSeed: string;
    tags: { relation: string; tag: { id: string; label: string } }[];
    intents: { kind: string }[];
  };
  relationship: Relationship;
}) {
  const skills = person.tags.filter((t) => t.relation === "HAS").slice(0, 6);
  return (
    <article className="border border-hairline bg-white p-4">
      <Link href={`/u/${person.handle}`} className="flex items-start gap-3 hover:opacity-90">
        <Avatar seed={person.avatarSeed} size={40} />
        <div className="min-w-0">
          <h3 className="text-base font-600">{person.name}</h3>
          <p className="mono text-2xs text-ink-muted">
            @{person.handle} · {person.school} · &apos;{String(person.gradYear).slice(2)}
          </p>
          {person.basedIn && (
            <p className="mono text-2xs text-ink-muted">based in {person.basedIn}</p>
          )}
        </div>
      </Link>
      {person.bio && <p className="mt-2 line-clamp-2 text-sm text-ink-muted">{person.bio}</p>}
      <div className="mt-3 flex flex-wrap gap-1">
        {skills.map((t) => (
          <TagBadge key={t.tag.id} label={t.tag.label} />
        ))}
      </div>
      <div className="mt-3 flex items-center justify-between gap-2">
        {person.intents.length > 0 ? (
          <p className="mono text-2xs text-ink-muted">
            looking for: {person.intents.map((i) => INTENT_LABELS[i.kind]).join(", ")}
          </p>
        ) : (
          <span />
        )}
        <ConnectionStatus relationship={relationship} />
      </div>
    </article>
  );
}
