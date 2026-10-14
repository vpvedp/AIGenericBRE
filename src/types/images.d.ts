// Lets TypeScript understand image imports (import logo from "@/assets/x.png").
// Next.js normally adds this via next-env.d.ts, but that file is gitignored and
// only created by `next dev` / `next build` — so CI's typecheck didn't have it.
/// <reference types="next/image-types/global" />
