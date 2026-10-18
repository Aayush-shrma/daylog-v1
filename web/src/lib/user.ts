import type { TweetAuthor } from "@/features/result/ResultCard";
import type { UserOut } from "@/types";

function initialsFrom(source: string): string {
  const parts = source.trim().split(/[\s._-]+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function tweetAuthor(user: UserOut): TweetAuthor {
  const local = user.email.split("@")[0] ?? user.email;
  const display = user.name?.trim();
  return {
    name: display && display.length > 0 ? display : local,
    handle: `@${local}`,
    initials: initialsFrom(display && display.length > 0 ? display : local),
  };
}
