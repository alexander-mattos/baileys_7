# Release

Steps to create a release:

1. Bump version in `package.json`.
2. Run `npm ci && npm run build`.
3. Commit changes and push tag: `git tag -a vX.Y.Z -m "release X.Y.Z" && git push origin vX.Y.Z`.
