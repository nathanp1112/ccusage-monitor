#!/usr/bin/env node
// Local prototype: summarize a member's prompts for a given UTC date using the
// local `claude` CLI (non-interactive). For JIT stage. Feeds into the future
// Lambda admin endpoint — once the summarization prompt produces useful output
// here, we port the same logic to `lambda-server/src/routes/admin.ts` and swap
// the CLI call for the Anthropic SDK.
//
// Pipeline:
//   S3 download → filter by UTC date → deterministic detectors (secrets, loops,
//   tickets/PRs, slash-commands, URL taxonomy) → dedup prompt bodies → build
//   analysis input (detector findings as ground truth + dedup'd prompt list) →
//   pipe to claude -p → save summary + a structured findings.json sidecar.
//
// Usage:
//   node scripts/summarize-prompts.mjs --member-id <id> --date YYYY-MM-DD \
//       [--stage jit] [--file <path>] [--out <path>] [--model <name>]
//
// If --file is omitted, downloads `prompts/{memberId}/{YYYY}-{MM}.json` from
// s3://ccusage-data-{stage} using AWS profile 2026-pik.

import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const args = parseArgs(process.argv.slice(2));
if (!args["member-id"] || !args.date) {
  console.error(
    "Usage: node scripts/summarize-prompts.mjs --member-id <id> --date YYYY-MM-DD [--stage jit] [--file <path>] [--out <path>] [--model <name>]",
  );
  process.exit(1);
}

const memberId = args["member-id"];
const date = args.date;
const stage = args.stage || "jit";
const model = args.model || null;
const [year, month] = date.split("-");
const bucket = `ccusage-data-${stage}`;
const s3Key = `prompts/${memberId}/${year}-${month}.json`;

const workDir = "/tmp/prompt-summary";
mkdirSync(workDir, { recursive: true });
const localFile =
  args.file || join(workDir, `${memberId}-${year}-${month}.json`);
const outPath =
  args.out || join(workDir, `summary-${memberId}-${date}.md`);
const findingsPath = join(
  workDir,
  `findings-${memberId}-${date}.json`,
);

if (!args.file && !existsSync(localFile)) {
  console.error(`Downloading s3://${bucket}/${s3Key} → ${localFile}`);
  const cp = spawnSync(
    "aws",
    [
      "s3",
      "cp",
      `s3://${bucket}/${s3Key}`,
      localFile,
      "--profile",
      "2026-pik",
    ],
    { stdio: "inherit" },
  );
  if (cp.status !== 0) {
    console.error("aws s3 cp failed");
    process.exit(cp.status ?? 1);
  }
}

const raw = JSON.parse(readFileSync(localFile, "utf-8"));
const all = raw.prompts || [];
const dayPrompts = all.filter((p) => (p.timestamp || "").startsWith(date));
console.error(
  `Loaded ${all.length} prompts for ${year}-${month}; ${dayPrompts.length} on ${date}`,
);
if (dayPrompts.length === 0) {
  console.error("No prompts for that date. Nothing to summarize.");
  process.exit(0);
}

// ─── Deterministic detectors ────────────────────────────────────────────────
// These run before the LLM. Findings are fed into the prompt as ground truth
// and also written to findings-*.json for downstream aggregation.

const SECRET_PATTERNS = [
  {
    id: "jwt",
    severity: "high",
    // JWT header.payload.signature — two base64url blocks prefixed "eyJ".
    re: /eyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]+/g,
    label: "JWT token",
  },
  {
    id: "auth_header",
    severity: "high",
    re: /Authorization:\s*Bearer\s+[A-Za-z0-9._-]{20,}/gi,
    label: "Authorization: Bearer header",
  },
  {
    id: "cookie_header",
    severity: "med",
    re: /(?:-H\s+['"]?Cookie:|Cookie:\s)[^'"\n]{20,}/gi,
    label: "Cookie header dump",
  },
  {
    id: "aws_akid",
    severity: "high",
    re: /\b(AKIA|ASIA)[0-9A-Z]{16}\b/g,
    label: "AWS access key id",
  },
  {
    id: "gh_token",
    severity: "high",
    re: /\b(ghp_|gho_|ghu_|ghs_|github_pat_)[A-Za-z0-9_]{20,}/g,
    label: "GitHub token",
  },
  {
    id: "slack_token",
    severity: "high",
    re: /\bxox[baprs]-[A-Za-z0-9-]{10,}/g,
    label: "Slack token",
  },
  {
    id: "anthropic_key",
    severity: "high",
    re: /\bsk-ant-[A-Za-z0-9_-]{20,}/g,
    label: "Anthropic API key",
  },
  {
    id: "openai_key",
    severity: "high",
    re: /\bsk-(proj-)?[A-Za-z0-9_-]{20,}/g,
    label: "OpenAI-style key",
  },
  {
    id: "db_url_with_pass",
    severity: "high",
    re: /\b(postgres(?:ql)?|mysql|mongodb(?:\+srv)?):\/\/[^:\s]+:[^@\s]+@[^\s'"]+/gi,
    label: "DB connection string with password",
  },
  {
    id: "inline_password",
    severity: "med",
    re: /\b(PGPASSWORD|DATABASE_PASSWORD|DB_PASSWORD|MYSQL_PWD|REDIS_PASSWORD)\s*=\s*\S{3,}/g,
    label: "Inline password env var",
  },
  {
    id: "private_key_block",
    severity: "high",
    re: /-----BEGIN (RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY( BLOCK)?-----/g,
    label: "Private key block",
  },
  {
    id: "credentials_file_mention",
    severity: "med",
    re: /\b(credentials\/[\w.-]+\.ya?ml|\.env(?:\.\w+)?|application\.ya?ml|secrets\.ya?ml|kubeconfig)\b/gi,
    label: "Credentials / env file mention",
  },
];

const TICKET_RE = /\b([A-Z]{2,8}-\d{2,6})\b/g;
const PR_RE = /(?:pull\/|#)(\d{2,6})\b/g;
const SLASH_RE = /(^|\s)(\/[a-zA-Z][\w:-]*)(?=\s|$)/g;
const URL_RE = /https?:\/\/[^\s'"<>)]+/gi;

const stripLocalCmd = (s) =>
  s.replace(/<local-command[^>]*>[\s\S]*?<\/local-command[^>]*>/g, "");

function classifyUrl(u) {
  try {
    const { hostname } = new URL(u);
    const h = hostname.toLowerCase();
    if (
      h === "localhost" ||
      h.startsWith("127.") ||
      h.startsWith("192.168.") ||
      h.startsWith("10.") ||
      h.endsWith(".local")
    )
      return "localhost";
    if (/(^|[.-])(staging|stg|dev|test|preview|uat|qa)([.-]|$)/.test(h))
      return "staging";
    if (
      /(jitera|mitaden)\.(com|dev|app|io|co|jp)$/i.test(h) &&
      !/staging|stg|dev|test|preview|uat|qa/.test(h)
    )
      return "production";
    return "third_party";
  } catch {
    return "invalid";
  }
}

const secretsFound = []; // { patternId, label, severity, promptUuid, ts, sampleHash, count }
const urlBuckets = { localhost: 0, staging: 0, production: 0, third_party: 0, invalid: 0 };
const ticketCounts = new Map();
const prCounts = new Map();
const slashCounts = new Map();
let shipNearCredentials = false;

for (const p of dayPrompts) {
  const body = stripLocalCmd(p.content || "");
  if (!body) continue;

  for (const pat of SECRET_PATTERNS) {
    const matches = body.match(pat.re);
    if (matches && matches.length) {
      const sample = matches[0];
      const hash = createHash("sha256").update(sample).digest("hex").slice(0, 12);
      secretsFound.push({
        patternId: pat.id,
        label: pat.label,
        severity: pat.severity,
        promptUuid: p.uuid,
        ts: p.timestamp,
        cwd: p.cwd || "",
        sampleHash: hash,
        sampleLen: sample.length,
        count: matches.length,
      });
    }
  }

  for (const m of body.matchAll(TICKET_RE))
    ticketCounts.set(m[1], (ticketCounts.get(m[1]) || 0) + 1);
  for (const m of body.matchAll(PR_RE))
    prCounts.set(m[1], (prCounts.get(m[1]) || 0) + 1);
  for (const m of body.matchAll(SLASH_RE))
    slashCounts.set(m[2], (slashCounts.get(m[2]) || 0) + 1);
  for (const m of body.matchAll(URL_RE))
    urlBuckets[classifyUrl(m[0])] = (urlBuckets[classifyUrl(m[0])] || 0) + 1;

  // Heuristic: credentials file edited AND /ship appears within the same
  // prompt body, OR a credentials mention in the last 3 prompts before a
  // /ship. We approximate with "same prompt contains both" for now.
  if (
    /(credentials\/[\w.-]+\.ya?ml|\.env\b|secrets\.ya?ml)/i.test(body) &&
    /\/ship\b/.test(body)
  ) {
    shipNearCredentials = true;
  }
}

// ─── Dedup + automation/loop fingerprinting ────────────────────────────────
const byContent = new Map();
for (const p of dayPrompts) {
  const key = (p.content || "").trim();
  if (!key) continue;
  const entry = byContent.get(key) || {
    count: 0,
    firstTs: p.timestamp,
    lastTs: p.timestamp,
    projects: new Set(),
    timestamps: [],
  };
  entry.count += 1;
  if (p.timestamp < entry.firstTs) entry.firstTs = p.timestamp;
  if (p.timestamp > entry.lastTs) entry.lastTs = p.timestamp;
  const proj = p.cwd || p.projectPath || "";
  if (proj) entry.projects.add(proj);
  entry.timestamps.push(p.timestamp);
  byContent.set(key, entry);
}

const unique = [...byContent.entries()]
  .map(([content, meta]) => ({
    content,
    ...meta,
    projects: [...meta.projects],
  }))
  .sort((a, b) => b.count - a.count);

// Automation fingerprint: a distinct prompt counts as a loop if it fires
// often enough at a regular cadence. Robust to pauses (user walks away) by
// checking the fraction of gaps near the median rather than mean/std.
function detectLoop(entry) {
  if (entry.count < 10) return null;
  const sorted = [...entry.timestamps].sort();
  const gaps = [];
  for (let i = 1; i < sorted.length; i++) {
    gaps.push(
      (new Date(sorted[i]).getTime() - new Date(sorted[i - 1]).getTime()) /
        1000,
    );
  }
  if (!gaps.length) return null;
  const sortedGaps = [...gaps].sort((a, b) => a - b);
  const median = sortedGaps[Math.floor(sortedGaps.length / 2)];
  if (median > 600) return null;

  // ≥60% of gaps within [0.5×, 2×] median = regular cadence.
  const nearCadence = gaps.filter(
    (g) => g >= median * 0.5 && g <= median * 2,
  ).length;
  if (nearCadence / gaps.length < 0.6) return null;

  return {
    count: entry.count,
    cadenceSec: Math.round(median),
    regularityPct: Math.round((nearCadence / gaps.length) * 100),
    start: sorted[0],
    end: sorted[sorted.length - 1],
    sigSha: createHash("sha256")
      .update(entry.content)
      .digest("hex")
      .slice(0, 12),
  };
}

const loops = unique
  .map((u) => ({ entry: u, loop: detectLoop(u) }))
  .filter((x) => x.loop);

const automatedCount = loops.reduce((s, l) => s + l.entry.count, 0);
const handsOnCount = dayPrompts.length - automatedCount;

console.error(
  `After dedup: ${unique.length} distinct prompts (from ${dayPrompts.length} total).`,
);
console.error(
  `Detected ${loops.length} automation loops: ${automatedCount} prompts; ${handsOnCount} hands-on.`,
);
console.error(`Secret findings: ${secretsFound.length}`);

// ─── Structured findings sidecar ───────────────────────────────────────────
const findings = {
  memberId,
  date,
  stage,
  stats: {
    totalPrompts: dayPrompts.length,
    distinctPrompts: unique.length,
    automatedPrompts: automatedCount,
    handsOnPrompts: handsOnCount,
  },
  workingHours: {
    firstPromptTs: dayPrompts.reduce(
      (m, p) => (!m || p.timestamp < m ? p.timestamp : m),
      null,
    ),
    lastPromptTs: dayPrompts.reduce(
      (m, p) => (!m || p.timestamp > m ? p.timestamp : m),
      null,
    ),
  },
  topProjects: [...new Map(
    dayPrompts.reduce((acc, p) => {
      const k = p.cwd || p.projectPath || "(unknown)";
      acc.push([k, (acc.find(([x]) => x === k)?.[1] || 0) + 1]);
      return acc;
    }, []),
  )]
    .map(([path, count]) => ({ path, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10),
  automationLoops: loops.map(({ entry, loop }) => ({
    ...loop,
    projects: entry.projects,
    snippet: entry.content.slice(0, 200),
  })),
  secrets: secretsFound,
  tickets: [...ticketCounts.entries()]
    .map(([id, count]) => ({ id, count }))
    .sort((a, b) => b.count - a.count),
  prs: [...prCounts.entries()]
    .map(([n, count]) => ({ n, count }))
    .sort((a, b) => b.count - a.count),
  slashCommands: [...slashCounts.entries()]
    .map(([cmd, count]) => ({ cmd, count }))
    .sort((a, b) => b.count - a.count),
  urlMix: urlBuckets,
  heuristics: { shipNearCredentials },
};
writeFileSync(findingsPath, JSON.stringify(findings, null, 2));
console.error(`Wrote findings sidecar → ${findingsPath}`);

// ─── Build LLM analysis input ──────────────────────────────────────────────
const MAX_PROMPT_CHARS = 1500;
const lines = [];
lines.push(`# Prompts from member ${memberId} on ${date}`);
lines.push("");
lines.push("## Deterministic detector findings (ground truth — trust these over your own pattern-spotting)");
lines.push("");
lines.push(
  `- Total prompts: ${findings.stats.totalPrompts} | distinct: ${findings.stats.distinctPrompts} | automated: ${findings.stats.automatedPrompts} | hands-on: ${findings.stats.handsOnPrompts}`,
);
lines.push(
  `- Working span: ${findings.workingHours.firstPromptTs} → ${findings.workingHours.lastPromptTs}`,
);
lines.push("- Top projects:");
for (const p of findings.topProjects)
  lines.push(`  - ${p.count} × ${p.path}`);
if (findings.automationLoops.length) {
  lines.push("- **Automation loops detected:**");
  for (const l of findings.automationLoops)
    lines.push(
      `  - ${l.count}× every ~${l.cadenceSec}s, ${l.start} → ${l.end}, projects: ${l.projects.join(", ") || "—"}, snippet: ${JSON.stringify(l.snippet.slice(0, 120))}`,
    );
} else {
  lines.push("- Automation loops detected: none");
}
if (findings.secrets.length) {
  lines.push("- **SECRET / CREDENTIAL findings (report these in Red flags, severity-tagged):**");
  for (const s of findings.secrets)
    lines.push(
      `  - [${s.severity.toUpperCase()}] ${s.label} × ${s.count} in prompt ${s.promptUuid} at ${s.ts} (sample sha256:${s.sampleHash}, len=${s.sampleLen})`,
    );
} else {
  lines.push("- Secret / credential findings: none");
}
lines.push(
  `- URL mix: prod=${findings.urlMix.production || 0}, staging=${findings.urlMix.staging || 0}, localhost=${findings.urlMix.localhost || 0}, third-party=${findings.urlMix.third_party || 0}`,
);
if (findings.heuristics.shipNearCredentials)
  lines.push("- **HEURISTIC:** credentials/env file mention co-occurs with /ship in same prompt.");
if (findings.tickets.length)
  lines.push(
    `- Tickets referenced: ${findings.tickets.slice(0, 15).map((t) => `${t.id}(×${t.count})`).join(", ")}`,
  );
if (findings.prs.length)
  lines.push(
    `- PR numbers referenced: ${findings.prs.slice(0, 15).map((p) => `#${p.n}(×${p.count})`).join(", ")}`,
  );
if (findings.slashCommands.length)
  lines.push(
    `- Slash-command mix: ${findings.slashCommands.slice(0, 15).map((s) => `${s.cmd}(×${s.count})`).join(", ")}`,
  );
lines.push("");
lines.push("## Distinct prompts (highest frequency first)");
lines.push("");
for (let i = 0; i < unique.length; i++) {
  const u = unique[i];
  const body =
    u.content.length > MAX_PROMPT_CHARS
      ? u.content.slice(0, MAX_PROMPT_CHARS) + " …[truncated]"
      : u.content;
  lines.push(`### #${i + 1} — ${u.count}× — ${u.firstTs} → ${u.lastTs}`);
  if (u.projects.length) lines.push(`_projects: ${u.projects.join(", ")}_`);
  lines.push("");
  lines.push("```");
  lines.push(body);
  lines.push("```");
  lines.push("");
}

const analysisInput = lines.join("\n");
const inputFile = join(workDir, `input-${memberId}-${date}.md`);
writeFileSync(inputFile, analysisInput);
console.error(
  `Wrote analysis input: ${inputFile} (${analysisInput.length} chars)`,
);

const instruction = `You are analysing one engineer's full day of Claude Code prompts. The deterministic detectors above already extracted ground truth: prompt counts, automation loops, secret findings, tickets/PRs, URL mix. **Use those numbers exactly — do not recount or second-guess them.** Your job is the qualitative layer on top.

Output format (Markdown, under ~400 words):

1. **Headline** — one sentence: what did this person mostly work on today?

2. **Main themes (3–6 bullets)** — group hands-on prompts (not the automation loops) into themes. Each bullet: what they were trying to do, which project(s), and rough volume. Cite ticket/PR IDs from the detector output where relevant.

3. **Notable one-offs** — standout prompts (tricky debugging, architectural questions, security-sensitive ops). Quote short fragments.

4. **Automation summary** — just restate what the detector found in one tight paragraph. Do NOT recount percentages; use the detector's numbers. Focus on *risk/brand impact* (where is the loop posting? how long did it run unsupervised?) not volume.

5. **Red flags — structured.** For each flag output a line: \`[severity] category — one-sentence description — evidence pointer\`. Severity ∈ {low, med, high}. Categories: secret, destructive-op, off-task, repeated-failure, policy. **Include every detector secret finding here, one line per finding, severity as given.** Omit this section entirely if nothing to report.

6. **Working-hours note** — one line: span from first to last prompt, and whether the pattern looks like focused blocks vs. a long unsupervised loop.

Rules:
- Do NOT pad. If a section is empty, omit it.
- Do NOT re-describe the FriDee loop every day if it's the same signature; just say "same loop as prior days" if obvious.
- Be blunt. A team lead is reading 30 of these.

--- PROMPT DATA BELOW ---
`;

const fullPrompt = instruction + "\n" + analysisInput;
console.error(
  `Invoking claude CLI (prompt length: ${fullPrompt.length} chars)…`,
);

const claudeArgs = ["-p", "--output-format", "text"];
if (model) claudeArgs.push("--model", model);

const child = spawn("claude", claudeArgs, {
  stdio: ["pipe", "pipe", "inherit"],
});
let summary = "";
child.stdout.on("data", (chunk) => {
  summary += chunk.toString();
  process.stdout.write(chunk);
});
child.on("close", (code) => {
  if (code !== 0) {
    console.error(`\nclaude CLI exited ${code}`);
    process.exit(code ?? 1);
  }
  writeFileSync(outPath, summary);
  console.error(`\n\nSaved summary → ${outPath}`);
  console.error(`Saved findings → ${findingsPath}`);
});
child.stdin.write(fullPrompt);
child.stdin.end();

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (!next || next.startsWith("--")) {
        out[key] = true;
      } else {
        out[key] = next;
        i++;
      }
    }
  }
  return out;
}
