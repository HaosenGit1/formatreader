#!/usr/bin/env bash
# Publish formatreader.com from this machine (uses your AWS CLI login).
#   npm run deploy
# Tests and the size budget must pass first. Versioned files (assets/) are cached
# for a year; the page itself is always revalidated, so updates show at once.
set -euo pipefail
cd "$(dirname "$0")/.."
BUCKET=$(node -p "require('./deploy.config.json').bucket")
DIST=$(node -p "require('./deploy.config.json').distributionId")
SITE=$(node -p "require('./deploy.config.json').site")

npm test
npm run build
npm run build:portable

# New versioned files first, so the page never points at missing files.
aws s3 sync dist/assets "s3://$BUCKET/assets" --cache-control "public, max-age=31536000, immutable" --only-show-errors
aws s3 sync dist "s3://$BUCKET" --exclude "assets/*" --exclude "FormatReader.html" --delete --cache-control "public, max-age=0, must-revalidate" --only-show-errors
# The portable single file (for computers without internet): saved, not shown.
aws s3 cp dist-portable/FormatReader.html "s3://$BUCKET/FormatReader.html" --content-type "text/html; charset=utf-8" --content-disposition 'attachment; filename="FormatReader.html"' --cache-control "public, max-age=0, must-revalidate" --only-show-errors
# Old versioned files are kept, so pages open during a deploy keep working.

aws cloudfront create-invalidation --distribution-id "$DIST" --paths "/" "/index.html" "/sw.js" "/manifest.json" "/FormatReader.html" --query 'Invalidation.Id' --output text >/dev/null
echo "Deployed to $SITE"
