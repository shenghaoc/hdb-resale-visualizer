import fs from "node:fs";
import path from "node:path";
import * as ts from "typescript";

const ROOT_DIR = process.cwd();
const SCRIPTS_DIR = path.join(ROOT_DIR, "scripts");
const SHARED_DIR = path.join(ROOT_DIR, "shared");
const SHARED_PRODUCT_DIR = path.join(ROOT_DIR, "shared", "product");
const SRC_DIR = path.join(ROOT_DIR, "src");
const SOURCE_EXTENSIONS = [".ts", ".tsx", ".mts", ".cts", ".js", ".mjs", ".cjs"] as const;
const INDEX_FILENAMES = SOURCE_EXTENSIONS.map((extension) => `index${extension}`);
const FORBIDDEN_RUNTIME_ALIASES = ["@/", "@shared/"] as const;
const FORBIDDEN_SHARED_PRODUCT_IMPORTS = ["react", "react-dom", "maplibre-gl"] as const;

type Violation = {
  file: string;
  message: string;
};

function toDisplayPath(filePath: string): string {
  return path.relative(ROOT_DIR, filePath).replaceAll(path.sep, "/");
}

function isInside(parentDir: string, childPath: string): boolean {
  const relative = path.relative(parentDir, childPath);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function collectScriptFiles(dir: string): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectScriptFiles(fullPath));
      continue;
    }

    if (entry.isFile() && SOURCE_EXTENSIONS.some((extension) => entry.name.endsWith(extension))) {
      files.push(fullPath);
    }
  }

  return files.sort();
}

function resolveSourceFile(fromFile: string, specifier: string): string | null {
  if (!specifier.startsWith(".")) {
    return null;
  }

  const basePath = path.resolve(path.dirname(fromFile), specifier);
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

function getModuleSpecifiers(sourceFile: ts.SourceFile): string[] {
  const specifiers: string[] = [];

  const visit = (node: ts.Node) => {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteralLike(node.moduleSpecifier)
    ) {
      specifiers.push(node.moduleSpecifier.text);
    }

    if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments.length === 1
    ) {
      const [specifier] = node.arguments;
      if (specifier && ts.isStringLiteralLike(specifier)) {
        specifiers.push(specifier.text);
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
        specifiers.push(specifier.text);
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return specifiers;
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

    const resolvedFile = resolveSourceFile(normalizedFile, specifier);
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

for (const entryFile of collectScriptFiles(SCRIPTS_DIR)) {
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

    const forbiddenPkg = FORBIDDEN_SHARED_PRODUCT_IMPORTS.find(
      (pkg) => specifier === pkg || specifier.startsWith(`${pkg}/`),
    );
    if (forbiddenPkg) {
      recordViolation(
        normalizedFile,
        `shared/product must not import browser-only package "${forbiddenPkg}".`,
      );
      continue;
    }

    const resolvedFile = resolveSourceFile(normalizedFile, specifier);
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
  for (const entryFile of collectScriptFiles(SHARED_PRODUCT_DIR)) {
    checkSharedProductFile(entryFile);
  }
}

if (violations.length > 0) {
  console.error("Script boundary check failed:");
  for (const violation of violations) {
    console.error(`- ${violation.file}: ${violation.message}`);
  }
  process.exit(1);
}

console.log(`Script boundary check passed (${visitedFiles.size} reachable local modules scanned).`);
