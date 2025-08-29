#!/usr/bin/env bash
set -euo pipefail
npx vercel pull --yes --environment=production
npx vercel build
npx vercel deploy --prebuilt --prod
