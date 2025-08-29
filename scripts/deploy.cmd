@echo off
npx vercel pull --yes --environment=production
npx vercel build
npx vercel deploy --prebuilt --prod
