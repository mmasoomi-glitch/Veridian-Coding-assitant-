// PDR (Product Design Requirements) generator + store.
//
// Turns a one-line product idea into a structured spec via the local LLM
// (ai/providers.chatJSON), persists each result to a small JSON store at
// process.cwd(), and can render any PDR back out as a clean markdown doc.
//
// All store I/O is try/catch and never throws — the only thing that may
// reject is generatePdr(), which surfaces a clear Error when no AI provider
// is configured (so the UI can tell the owner what to set).

import fs from "fs";
import path from "path";
import { chatJSON } from "../ai/providers";
import { writeJsonAtomic } from "../lib/atomic";

const FILE = path.join(process.cwd(), "pdr-store.json");

export interface Pdr {
  id: string;
  ts: string;
  idea: string;
  title: string;
  overview: string;
  problem: string;
  goals: string[];
  nonGoals: string[];
  users: string[];
  requirements: { title: string; detail: string; priority: "P0" | "P1" | "P2" }[];
  milestones: string[];
  risks: string[];
  openQuestions: string[];
}

// ---- store -----------------------------------------------------------------

function read(): Pdr[] {
  try {
    const raw = JSON.parse(fs.readFileSync(FILE, "utf8"));
    return Array.isArray(raw) ? (raw as Pdr[]) : [];
  } catch {
    return [];
  }
}

function write(list: Pdr[]): void {
  try {
    writeJsonAtomic(FILE, list);
  } catch (e) {
    console.error("pdr-store write failed:", e);
  }
}

export function savePdr(p: Pdr): void {
  try {
    const list = read();
    const i = list.findIndex((x) => x.id === p.id);
    if (i >= 0) list[i] = p;
    else list.unshift(p); // newest first
    write(list);
  } catch (e) {
    console.error("savePdr failed:", e);
  }
}

export function listPdrs(): Pdr[] {
  return read();
}

export function getPdr(id: string): Pdr | null {
  try {
    return read().find((x) => x.id === id) || null;
  } catch {
    return null;
  }
}

// ---- generation ------------------------------------------------------------

const SYSTEM = `You are a senior product manager and staff engineer who writes crisp Product Design Requirements (PDR) documents.

Given a single product idea, produce a complete, concrete PDR. Respond with ONLY a single valid json object (no prose, no code fences, no markdown) that EXACTLY matches this schema:

{
  "title": string,              // short product name / headline
  "overview": string,           // 2-4 sentence executive summary
  "problem": string,            // the core problem being solved
  "goals": string[],            // measurable goals this product should achieve
  "nonGoals": string[],         // explicitly out of scope
  "users": string[],            // target user segments / personas
  "requirements": [             // concrete functional requirements
    { "title": string, "detail": string, "priority": "P0" | "P1" | "P2" }
  ],
  "milestones": string[],       // ordered delivery milestones
  "risks": string[],            // key risks / unknowns
  "openQuestions": string[]     // questions that still need answers
}

Rules:
- Output strictly valid json, nothing else.
- Ground EVERYTHING only in the provided idea — do not invent an unrelated product. If the idea is thin, infer the most reasonable concrete interpretation.
- Be concrete and concise: short, specific bullet strings, no filler.
- "priority" must be exactly one of "P0", "P1", or "P2" (P0 = must-have for launch).
- Provide at least 3 requirements and at least 2 entries for goals, users, milestones, and risks.`;

export async function generatePdr(idea: string): Promise<Pdr> {
  const clean = (idea || "").trim();
  if (!clean) throw new Error("Cannot generate a PDR from an empty idea.");

  const raw = await chatJSON({
    system: SYSTEM,
    user: `Product idea:\n"""${clean}"""\n\nProduce the PDR as json now.`,
    json: true,
    temperature: 0.4,
    maxTokens: 2048
  });

  const arr = (v: any): string[] => (Array.isArray(v) ? v.map((x) => String(x)).filter(Boolean) : []);
  const prio = (v: any): "P0" | "P1" | "P2" => (v === "P0" || v === "P1" || v === "P2" ? v : "P1");

  const pdr: Pdr = {
    id: `${Date.now()}`,
    ts: new Date().toISOString(),
    idea: clean,
    title: String(raw?.title || clean.slice(0, 80)),
    overview: String(raw?.overview || ""),
    problem: String(raw?.problem || ""),
    goals: arr(raw?.goals),
    nonGoals: arr(raw?.nonGoals),
    users: arr(raw?.users),
    requirements: Array.isArray(raw?.requirements)
      ? raw.requirements.map((r: any) => ({
          title: String(r?.title || ""),
          detail: String(r?.detail || ""),
          priority: prio(r?.priority)
        }))
      : [],
    milestones: arr(raw?.milestones),
    risks: arr(raw?.risks),
    openQuestions: arr(raw?.openQuestions)
  };

  savePdr(pdr);
  return pdr;
}

// ---- markdown --------------------------------------------------------------

export function pdrToMarkdown(p: Pdr): string {
  const bullets = (xs: string[]) => (xs.length ? xs.map((x) => `- ${x}`).join("\n") : "_None._");
  const reqs = p.requirements.length
    ? p.requirements.map((r) => `- **[${r.priority}] ${r.title}** — ${r.detail}`).join("\n")
    : "_None._";

  return `# ${p.title}

> ${p.overview}

_Generated ${p.ts} from idea: "${p.idea}"_

## Problem
${p.problem || "_Not specified._"}

## Goals
${bullets(p.goals)}

## Non-Goals
${bullets(p.nonGoals)}

## Target Users
${bullets(p.users)}

## Requirements
${reqs}

## Milestones
${bullets(p.milestones)}

## Risks
${bullets(p.risks)}

## Open Questions
${bullets(p.openQuestions)}
`;
}
