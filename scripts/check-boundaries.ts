import fs from "node:fs";
import path from "node:path";
import * as ts from "typescript";

const ROOT_DIR = process.cwd();
const SCRIPTS_DIR = path.join(ROOT_DIR, "scripts");
const SHARED_DIR = path.join(ROOT_DIR, "shared");
const SHARED_PRODUCT_DIR = path.join(ROOT_DIR, "shared", "product");
const SRC_DIR = path.join(ROOT_DIR, "src");
const ENTITIES_DIR = path.join(SRC_DIR, "entities");
const FEATURES_DIR = path.join(SRC_DIR, "features");
const SHARED_UI_DIR = path.join(SRC_DIR, "shared-ui");
const COMPONENTS_DIR = path.join(SRC_DIR, "components");
const HOOKS_DIR = path.join(SRC_DIR, "hooks");
const SRC_SHARED_LIB_DIR = path.join(SRC_DIR, "shared", "lib");
const TYPES_DIR = path.join(SRC_DIR, "types");
const SOURCE_EXTENSIONS = [".ts", ".tsx", ".mts", ".cts", ".js", ".mjs", ".cjs"] as const;
const INDEX_FILENAMES = SOURCE_EXTENSIONS.map((extension) => `index${extension}`);
const FORBIDDEN_RUNTIME_ALIASES = ["@/", "@shared/"] as const;
const FORBIDDEN_SHARED_PRODUCT_IMPORTS = ["react", "react-dom", "maplibre-gl"] as const;
const COMPONENTS_UI_DIR = path.join(SRC_DIR, "components", "ui");
const FORBIDDEN_ENTITY_PACKAGES = ["react", "react-dom", "maplibre-gl", "recharts"] as const;

/**
 * Local module trees an entity may depend on. Anything else under src/ is a
 * dependency-direction violation — entities stay domain-focused and framework-free.
 */
const ENTITY_ALLOWED_DIRS = [ENTITIES_DIR, SRC_SHARED_LIB_DIR, TYPES_DIR, SHARED_DIR] as const;
const ENTITY_ALLOWED_SUMMARY = "src/entities, src/shared/lib, src/types, and repository shared/";

/**
 * Local module trees a shared-ui module may depend on. This mirrors the
 * allowlist in .kiro/steering/structure.md — shared-ui is generic presentation
 * only, so anything outside these trees is a violation even if no specific rule
 * below names it.
 */
const SHARED_UI_ALLOWED_DIRS = [SHARED_UI_DIR, COMPONENTS_UI_DIR, SRC_SHARED_LIB_DIR] as const;
const SHARED_UI_ALLOWED_SUMMARY = "src/shared-ui, src/components/ui, and src/shared/lib";

const FORBIDDEN_SHARED_UI_DOMAIN_TYPES = [
  path.join(SRC_DIR, "types", "data.ts"),
  path.join(SRC_DIR, "types", "searchProfile.ts"),
  // Repository-level canonical HDB domain types, reachable via `@shared/data-types`.
  path.join(SHARED_DIR, "data-types.ts"),
] as const;

/** Match a package specifier and its subpaths (`react` also matches `react/jsx-runtime`). */
function matchesPackage(specifier: string, packageName: string): boolean {
  return specifier === packageName || specifier.startsWith(`${packageName}/`);
}

type Violation = {
  file: string;
  message: string;
};

type ModuleEdge = {
  specifier: string;
  isRuntime: boolean;
};

function toDisplayPath(filePath: string): string {
  return path.relative(ROOT_DIR, filePath).replaceAll(path.sep, "/");
}

function isInside(parentDir: string, childPath: string): boolean {
  const relative = path.relative(parentDir, childPath);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function collectSourceFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) {
    return [];
  }

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectSourceFiles(fullPath));
      continue;
    }

    if (entry.isFile() && SOURCE_EXTENSIONS.some((extension) => entry.name.endsWith(extension))) {
      files.push(fullPath);
    }
  }

  return files.sort();
}

function resolveCandidates(basePath: string): string | null {
  const candidates = [
    basePath,
    ...SOURCE_EXTENSIONS.map((extension) => `${basePath}${extension}`),
    ...INDEX_FILENAMES.map((fileName) => path.join(basePath, fileName)),
  ];

  return (
    candidates.find((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile()) ??
    null
  );
}

/** Resolve relative imports only (Node script / shared graphs). */
function resolveRelativeSourceFile(fromFile: string, specifier: string): string | null {
  if (!specifier.startsWith(".")) {
    return null;
  }

  return resolveCandidates(path.resolve(path.dirname(fromFile), specifier));
}

/**
 * Resolve frontend-style imports under src/:
 * relative paths, `@/` → src/, and `@shared/` → repository shared/.
 */
function resolveFrontendModule(fromFile: string, specifier: string): string | null {
  if (specifier.startsWith("@/")) {
    return resolveCandidates(path.join(SRC_DIR, specifier.slice(2)));
  }

  if (specifier.startsWith("@shared/")) {
    return resolveCandidates(path.join(SHARED_DIR, specifier.slice("@shared/".length)));
  }

  if (specifier.startsWith(".")) {
    return resolveCandidates(path.resolve(path.dirname(fromFile), specifier));
  }

  return null;
}

function isTypeOnlyImportDeclaration(node: ts.ImportDeclaration): boolean {
  if (!node.importClause) {
    // Side-effect import: `import "./foo"` — runtime.
    return false;
  }

  if (node.importClause.isTypeOnly) {
    return true;
  }

  // Default import is always a value import.
  if (node.importClause.name) {
    return false;
  }

  const { namedBindings } = node.importClause;
  if (!namedBindings) {
    return false;
  }

  if (ts.isNamespaceImport(namedBindings)) {
    return false;
  }

  if (ts.isNamedImports(namedBindings)) {
    // `import { type Foo }` is type-only; mixed value bindings are runtime.
    return (
      namedBindings.elements.length > 0 &&
      namedBindings.elements.every((element) => element.isTypeOnly)
    );
  }

  return false;
}

function isTypeOnlyExportDeclaration(node: ts.ExportDeclaration): boolean {
  if (node.isTypeOnly) {
    return true;
  }

  if (node.exportClause && ts.isNamedExports(node.exportClause)) {
    return (
      node.exportClause.elements.length > 0 &&
      node.exportClause.elements.every((element) => element.isTypeOnly)
    );
  }

  // `export * from` / `export * as ns from` re-export values at runtime.
  return false;
}

function getModuleEdges(sourceFile: ts.SourceFile): ModuleEdge[] {
  const edges: ModuleEdge[] = [];

  const visit = (node: ts.Node) => {
    if (
      ts.isImportDeclaration(node) &&
      node.moduleSpecifier &&
      ts.isStringLiteralLike(node.moduleSpecifier)
    ) {
      edges.push({
        specifier: node.moduleSpecifier.text,
        isRuntime: !isTypeOnlyImportDeclaration(node),
      });
    }

    if (
      ts.isExportDeclaration(node) &&
      node.moduleSpecifier &&
      ts.isStringLiteralLike(node.moduleSpecifier)
    ) {
      edges.push({
        specifier: node.moduleSpecifier.text,
        isRuntime: !isTypeOnlyExportDeclaration(node),
      });
    }

    if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments.length === 1
    ) {
      const [specifier] = node.arguments;
      if (specifier && ts.isStringLiteralLike(specifier)) {
        edges.push({ specifier: specifier.text, isRuntime: true });
      }
    }

    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === "require" &&
      node.arguments.length === 1
    ) {
      const [specifier] = node.arguments;
      if (specifier && ts.isStringLiteralLike(specifier)) {
        edges.push({ specifier: specifier.text, isRuntime: true });
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return edges;
}

/** Specifiers only (legacy helper used by script / shared-product walks). */
function getModuleSpecifiers(sourceFile: ts.SourceFile): string[] {
  return getModuleEdges(sourceFile).map((edge) => edge.specifier);
}

const visitedFiles = new Set<string>();
const violations: Violation[] = [];

function recordViolation(file: string, message: string): void {
  violations.push({ file: toDisplayPath(file), message });
}

function visitSourceFile(file: string): void {
  const normalizedFile = path.normalize(file);
  if (visitedFiles.has(normalizedFile)) {
    return;
  }
  visitedFiles.add(normalizedFile);

  if (isInside(SRC_DIR, normalizedFile)) {
    recordViolation(normalizedFile, "Node-executed scripts must not import from src/.");
    return;
  }

  if (!isInside(SCRIPTS_DIR, normalizedFile) && !isInside(SHARED_DIR, normalizedFile)) {
    return;
  }

  const sourceText = fs.readFileSync(normalizedFile, "utf8");
  const sourceFile = ts.createSourceFile(normalizedFile, sourceText, ts.ScriptTarget.Latest, true);

  for (const specifier of getModuleSpecifiers(sourceFile)) {
    const forbiddenAlias = FORBIDDEN_RUNTIME_ALIASES.find((alias) => specifier.startsWith(alias));
    if (forbiddenAlias) {
      recordViolation(
        normalizedFile,
        `Node-executed import graph cannot use Vite alias "${forbiddenAlias}" (${specifier}).`,
      );
      continue;
    }

    const resolvedFile = resolveRelativeSourceFile(normalizedFile, specifier);
    if (!resolvedFile) {
      continue;
    }

    if (isInside(SRC_DIR, resolvedFile)) {
      recordViolation(
        normalizedFile,
        `Node-executed import graph reaches src/ through "${specifier}" -> ${toDisplayPath(resolvedFile)}.`,
      );
      continue;
    }

    visitSourceFile(resolvedFile);
  }
}

for (const entryFile of collectSourceFiles(SCRIPTS_DIR)) {
  visitSourceFile(entryFile);
}

// ── shared/product boundary check ──────────────────────────────────────
// shared/product/** must not import from src/**, must not use Vite aliases,
// and must not import browser-only packages (react, maplibre-gl, etc.).

const sharedProductVisited = new Set<string>();

function checkSharedProductFile(file: string): void {
  const normalizedFile = path.normalize(file);
  if (sharedProductVisited.has(normalizedFile)) {
    return;
  }
  sharedProductVisited.add(normalizedFile);

  const sourceText = fs.readFileSync(normalizedFile, "utf8");
  const sourceFile = ts.createSourceFile(normalizedFile, sourceText, ts.ScriptTarget.Latest, true);

  for (const specifier of getModuleSpecifiers(sourceFile)) {
    const forbiddenAlias = FORBIDDEN_RUNTIME_ALIASES.find((alias) => specifier.startsWith(alias));
    if (forbiddenAlias) {
      recordViolation(
        normalizedFile,
        `shared/product must not use Vite alias "${forbiddenAlias}" (${specifier}). Use relative imports.`,
      );
      continue;
    }

    const forbiddenPkg = FORBIDDEN_SHARED_PRODUCT_IMPORTS.find((pkg) =>
      matchesPackage(specifier, pkg),
    );
    if (forbiddenPkg) {
      recordViolation(
        normalizedFile,
        `shared/product must not import browser-only package "${forbiddenPkg}".`,
      );
      continue;
    }

    const resolvedFile = resolveRelativeSourceFile(normalizedFile, specifier);
    if (!resolvedFile) {
      continue;
    }

    if (isInside(SRC_DIR, resolvedFile)) {
      recordViolation(
        normalizedFile,
        `shared/product must not import from src/ — "${specifier}" resolves to ${toDisplayPath(resolvedFile)}.`,
      );
      continue;
    }

    // Recursively check transitive shared imports
    if (isInside(SHARED_DIR, resolvedFile)) {
      checkSharedProductFile(resolvedFile);
    }
  }
}

if (fs.existsSync(SHARED_PRODUCT_DIR)) {
  for (const entryFile of collectSourceFiles(SHARED_PRODUCT_DIR)) {
    checkSharedProductFile(entryFile);
  }
}

// ── Frontend source architecture checks ────────────────────────────────

function parseSourceFile(file: string): ts.SourceFile {
  const sourceText = fs.readFileSync(file, "utf8");
  return ts.createSourceFile(file, sourceText, ts.ScriptTarget.Latest, true);
}

function checkEntityDirection(): void {
  for (const file of collectSourceFiles(ENTITIES_DIR)) {
    const sourceFile = parseSourceFile(file);
    for (const edge of getModuleEdges(sourceFile)) {
      const resolved = resolveFrontendModule(file, edge.specifier);
      if (!resolved) {
        // Bare specifier that didn't resolve locally — check if it's a
        // forbidden framework/UI package (entities must be React-free per
        // the design doc). Subpaths count: `react-dom/client` is still React.
        const forbiddenPkg = edge.isRuntime
          ? FORBIDDEN_ENTITY_PACKAGES.find((pkg) => matchesPackage(edge.specifier, pkg))
          : undefined;
        if (forbiddenPkg) {
          recordViolation(
            file,
            `entities must not import framework packages — "${edge.specifier}" is forbidden. Entities must be pure TypeScript with no React/map/chart dependencies.`,
          );
        }
        continue;
      }

      if (isInside(FEATURES_DIR, resolved)) {
        recordViolation(
          file,
          `entities must not import features — "${edge.specifier}" resolves to ${toDisplayPath(resolved)}.`,
        );
      } else if (isInside(SHARED_UI_DIR, resolved)) {
        recordViolation(
          file,
          `entities must not import shared-ui — "${edge.specifier}" resolves to ${toDisplayPath(resolved)}.`,
        );
      } else if (isInside(COMPONENTS_DIR, resolved)) {
        recordViolation(
          file,
          `entities must not import components — "${edge.specifier}" resolves to ${toDisplayPath(resolved)}.`,
        );
      } else if (isInside(HOOKS_DIR, resolved)) {
        recordViolation(
          file,
          `entities must not import hooks — "${edge.specifier}" resolves to ${toDisplayPath(resolved)}. React hooks are app orchestration, not domain logic.`,
        );
      } else if (!ENTITY_ALLOWED_DIRS.some((dir) => isInside(dir, resolved))) {
        recordViolation(
          file,
          `entities may only import ${ENTITY_ALLOWED_SUMMARY} — "${edge.specifier}" resolves to ${toDisplayPath(resolved)}.`,
        );
      }
    }
  }
}

function checkSharedUiDirection(): void {
  for (const file of collectSourceFiles(SHARED_UI_DIR)) {
    const sourceFile = parseSourceFile(file);
    for (const edge of getModuleEdges(sourceFile)) {
      const resolved = resolveFrontendModule(file, edge.specifier);
      if (!resolved) {
        continue;
      }

      const forbiddenDomainType = FORBIDDEN_SHARED_UI_DOMAIN_TYPES.find(
        (domainType) => path.normalize(domainType) === path.normalize(resolved),
      );

      if (isInside(FEATURES_DIR, resolved)) {
        recordViolation(
          file,
          `shared-ui must not import features — "${edge.specifier}" resolves to ${toDisplayPath(resolved)}.`,
        );
      } else if (isInside(ENTITIES_DIR, resolved)) {
        recordViolation(
          file,
          `shared-ui must not import entities — "${edge.specifier}" resolves to ${toDisplayPath(resolved)}.`,
        );
      } else if (isInside(COMPONENTS_DIR, resolved) && !isInside(COMPONENTS_UI_DIR, resolved)) {
        recordViolation(
          file,
          `shared-ui must not import non-UI components — "${edge.specifier}" resolves to ${toDisplayPath(resolved)}. Only src/components/ui is allowed.`,
        );
      } else if (forbiddenDomainType) {
        recordViolation(
          file,
          `shared-ui must not import HDB-domain types — "${edge.specifier}" resolves to ${toDisplayPath(resolved)}.`,
        );
      } else if (!SHARED_UI_ALLOWED_DIRS.some((dir) => isInside(dir, resolved))) {
        recordViolation(
          file,
          `shared-ui may only import ${SHARED_UI_ALLOWED_SUMMARY} — "${edge.specifier}" resolves to ${toDisplayPath(resolved)}.`,
        );
      }
    }
  }
}

/**
 * Build a runtime import graph for files under src/ and report cycles.
 * Type-only imports/exports are excluded. Dynamic import() and require() are
 * treated as runtime edges. `@shared/` edges that leave src/ are ignored for
 * cycle detection.
 */
function checkSrcRuntimeCycles(): number {
  const srcFiles = collectSourceFiles(SRC_DIR);
  const graph = new Map<string, string[]>();

  for (const file of srcFiles) {
    const normalizedFile = path.normalize(file);
    const sourceFile = parseSourceFile(normalizedFile);
    const targets = new Set<string>();

    for (const edge of getModuleEdges(sourceFile)) {
      if (!edge.isRuntime) {
        continue;
      }

      const resolved = resolveFrontendModule(normalizedFile, edge.specifier);
      if (!resolved) {
        continue;
      }

      const normalizedTarget = path.normalize(resolved);
      if (!isInside(SRC_DIR, normalizedTarget)) {
        continue;
      }

      targets.add(normalizedTarget);
    }

    graph.set(normalizedFile, [...targets].sort());
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();
  const stack: string[] = [];
  const reportedCycleKeys = new Set<string>();

  const visit = (node: string): void => {
    if (visited.has(node)) {
      return;
    }
    if (visiting.has(node)) {
      const cycleStart = stack.indexOf(node);
      if (cycleStart === -1) {
        return;
      }
      const cyclePath = [...stack.slice(cycleStart), node];
      const cycleKey = cyclePath.map(toDisplayPath).join(" -> ");
      if (!reportedCycleKeys.has(cycleKey)) {
        reportedCycleKeys.add(cycleKey);
        recordViolation(node, `Runtime source import cycle detected: ${cycleKey}.`);
      }
      return;
    }

    visiting.add(node);
    stack.push(node);

    for (const neighbor of graph.get(node) ?? []) {
      visit(neighbor);
    }

    stack.pop();
    visiting.delete(node);
    visited.add(node);
  };

  for (const file of [...graph.keys()].sort()) {
    visit(file);
  }

  return srcFiles.length;
}

checkEntityDirection();
checkSharedUiDirection();
const srcModuleCount = checkSrcRuntimeCycles();

if (violations.length > 0) {
  console.error("Boundary check failed:");
  for (const violation of violations) {
    console.error(`- ${violation.file}: ${violation.message}`);
  }
  process.exit(1);
}

console.log(
  `Boundary check passed (${visitedFiles.size} reachable local modules scanned; ${srcModuleCount} src modules architecture-checked).`,
);
