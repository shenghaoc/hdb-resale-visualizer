import { useEffect, useRef } from "react";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/shared/lib/i18n";
import { useTheme } from "@/hooks/useTheme";
import { DOCS_SECTIONS, getDocsSection } from "./docsManifest";
import { DocsArticle } from "./DocsArticle";
import { DocsNav } from "./DocsNav";
import { DocsSearch } from "./DocsSearch";
import { navigate, slugFromPath, usePathname } from "./docsRouter";

/**
 * In-app user guide, served at /docs and /docs/<section>. Rendered instead of
 * the map shell while the pathname is under /docs; the app's own state stays
 * in the query string, so "Back to app" restores the previous view.
 */
export function DocsPage() {
  const { t } = useI18n();
  // Applies the stored/system theme class when the guide is loaded directly.
  useTheme();
  const pathname = usePathname();
  const slug = slugFromPath(pathname);
  const section = getDocsSection(slug);

  const contentRef = useRef<HTMLElement>(null);
  const previousSlugRef = useRef(slug);

  useEffect(() => {
    if (previousSlugRef.current === slug) return;
    previousSlugRef.current = slug;
    // Bring the newly selected article into view and hand focus to it so
    // keyboard and screen-reader users land on the content, not the nav.
    contentRef.current?.focus({ preventScroll: true });
    (document.scrollingElement ?? document.documentElement).scrollTop = 0;
  }, [slug]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <a
        href="#docs-content"
        className="sr-only focus-visible:not-sr-only focus-visible:fixed focus-visible:left-4 focus-visible:top-4 focus-visible:z-50 focus-visible:rounded-lg focus-visible:bg-primary focus-visible:px-4 focus-visible:py-2 focus-visible:text-sm focus-visible:font-bold focus-visible:text-primary-foreground focus-visible:shadow-lg"
      >
        {t("app.skipToContent")}
      </a>

      <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 sm:px-6">
          <Button type="button" variant="ghost" size="sm" onClick={() => navigate("/")}>
            <ArrowLeft data-icon className="size-4" aria-hidden="true" />
            {t("docs.backToApp")}
          </Button>
          {/* The rendered markdown supplies the page's h1, so the chrome title stays a span. */}
          <span className="text-sm font-bold uppercase tracking-widest">{t("guide.title")}</span>
          <div className="ml-auto w-full sm:w-auto">
            <DocsSearch t={t} />
          </div>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6 sm:px-6 lg:flex-row lg:gap-10">
        <aside className="lg:w-48 lg:shrink-0">
          <div className="lg:sticky lg:top-20">
            <DocsNav
              sections={DOCS_SECTIONS}
              activeSlug={section.slug}
              navLabel={t("docs.navLabel")}
            />
          </div>
        </aside>
        <main
          id="docs-content"
          ref={contentRef}
          tabIndex={-1}
          className="min-w-0 flex-1 pb-16 focus:outline-none"
        >
          <DocsArticle content={section.content} />
        </main>
      </div>
    </div>
  );
}
