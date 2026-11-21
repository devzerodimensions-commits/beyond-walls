/**
 * Compiles the server one file at a time, without type-checking it.
 *
 * For the production image only. Type-checking is verification, and it is run
 * in full before every commit (`npm run build` and `npm run typecheck`, both
 * unchanged). Building the image has a different job -- turning the source into
 * JavaScript -- and doing the verification again there is what stopped the
 * site deploying.
 *
 * The image is built inside a 1 GiB memory budget that it shares with the
 * running shop and its database. Type-checking the server loads 941 files --
 * mostly Prisma's generated client -- to check 15,500 lines, and needs a heap of
 * 384 MB to finish: roughly 480 MB of real memory, against about 600 MB free.
 * Node cannot see that budget, only the host's 24 GB, so it let the heap grow
 * lazily until the kernel killed the build. The old container kept serving and
 * nothing said the new code had not shipped.
 *
 * This uses TypeScript's own per-file emitter, ts.transpileModule -- the same
 * output `tsc` produces -- with the project's own compiler options. That is
 * only equivalent to a full build for code that is safe to compile one file at
 * a time, which `isolatedModules` in tsconfig.json now enforces: anything that
 * is not (a type re-exported without `export type`, a const enum used across
 * files) fails the ordinary typecheck before it can get here.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const configPath = path.join(root, 'tsconfig.json');

const read = ts.readConfigFile(configPath, ts.sys.readFile);
if (read.error) {
  console.error(ts.flattenDiagnosticMessageText(read.error.messageText, '\n'));
  process.exit(1);
}
const parsed = ts.parseJsonConfigFileContent(read.config, ts.sys, root);
const options = parsed.options;
const srcDir = path.resolve(root, options.rootDir ?? 'src');
const outDir = path.resolve(root, options.outDir ?? 'dist');

/* A clean output, so a module removed from the source cannot linger in dist. */
fs.rmSync(outDir, { recursive: true, force: true });

let count = 0;
for (const file of parsed.fileNames) {
  if (file.endsWith('.d.ts')) continue;
  const source = fs.readFileSync(file, 'utf8');
  const relative = path.relative(srcDir, file).replace(/\.ts$/, '.js');
  const target = path.join(outDir, relative);

  const result = ts.transpileModule(source, {
    compilerOptions: options,
    fileName: file,
    reportDiagnostics: true,
  });

  const problems = (result.diagnostics ?? []).filter((d) => d.category === ts.DiagnosticCategory.Error);
  if (problems.length) {
    for (const d of problems) {
      console.error(`${path.relative(root, file)}: ${ts.flattenDiagnosticMessageText(d.messageText, '\n')}`);
    }
    process.exit(1);
  }

  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, result.outputText);
  if (result.sourceMapText) fs.writeFileSync(`${target}.map`, result.sourceMapText);
  count += 1;
}

console.log(`transpiled ${count} files into ${path.relative(process.cwd(), outDir) || outDir}`);
