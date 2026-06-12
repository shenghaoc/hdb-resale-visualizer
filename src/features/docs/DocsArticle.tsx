import type { AnchorHTMLAttributes, MouseEvent } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { isDocsPath, navigate } from "./docsRouter";

function MarkdownLink({ href = "", children, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement>) {
  // Internal guide links navigate client-side; everything else opens in a new
  // tab. Only http(s) and in-app paths are allowed — anything unexpected is
  // rendered as plain text.
  if (isDocsPath(href)) {
    const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      navigate(href);
    };
    return (
      <a {...rest} href={href} onClick={handleClick}>
        {children}
      </a>
    );
  }
  if (/^https?:\/\//.test(href)) {
    return (
      <a {...rest} href={href} target="_blank" rel="noopener noreferrer">
        {children}
      </a>
    );
  }
  return <span>{children}</span>;
}

type DocsArticleProps = {
  content: string;
};

export function DocsArticle({ content }: DocsArticleProps) {
  return (
    <article className="guide-prose max-w-none text-sm text-foreground">
      <Markdown remarkPlugins={[remarkGfm]} components={{ a: MarkdownLink }}>
        {content}
      </Markdown>
    </article>
  );
}
