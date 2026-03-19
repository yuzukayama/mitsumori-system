"use client";

import { useState } from "react";

export function CopyButton({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <button
      onClick={handleCopy}
      className="rounded border px-2 py-1 text-[10px] transition-colors hover:bg-muted"
      title={url}
    >
      {copied ? "✓ コピー済" : "URLをコピー"}
    </button>
  );
}
