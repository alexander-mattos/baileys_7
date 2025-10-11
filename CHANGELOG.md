# Changelog

## Unreleased
- Replace p-queue usage with internal `SimpleQueue` to avoid ESM runtime issues
- Convert WAProto ESM -> CommonJS automatically in postbuild using esbuild JS API
- Add deployment scripts and docs
- Clean up package.json and move `esbuild` to dependencies
- Add .gitignore and housekeeping files
