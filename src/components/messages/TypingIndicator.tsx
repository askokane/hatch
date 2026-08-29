// Three pulsing dots in the same bubble shape a real message uses, so an
// incoming message lands where the indicator already was.
//
// The dots are decorative; the announcement is carried by the visually-hidden
// text, and the live region lives in the parent so it is not created and
// destroyed along with this element.
//
// `label` overrides the whole phrase, which is what a group chat needs: with more
// than one person at the keyboard the subject is plural ("Maya and Ali are
// typing…") and no amount of substituting a name into a fixed sentence gets the
// verb right. A two-person thread passes `name` and gets the sentence built here.
export function TypingIndicator({ name, label }: { name?: string; label?: string }) {
  const phrase = label ?? `${name} is typing…`;
  return (
    <li className="flex flex-col items-start">
      <div className="flex items-center gap-1 border border-hairline bg-paper px-3 py-2.5">
        <span className="sr-only">{phrase}</span>
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            aria-hidden
            className="typing-dot inline-block h-1.5 w-1.5 rounded-full bg-ink-muted"
            style={{ animationDelay: `${i * 160}ms` }}
          />
        ))}
      </div>
      <span className="mono mt-0.5 text-2xs text-ink-muted" aria-hidden>
        {phrase}
      </span>
    </li>
  );
}
