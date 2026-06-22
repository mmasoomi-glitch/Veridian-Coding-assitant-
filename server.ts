import express from "express";
import path from "path";
import fs from "fs";
import dotenv from "dotenv";
import { GoogleGenAI, Type } from "@google/genai";
import { createServer as createViteServer } from "vite";

dotenv.config();

const app = express();
const PORT = 3000;
const SESSION_DB_PATH = path.join(process.cwd(), "workspace-sessions.json");

// Middleware
app.use(express.json());

// Helper to read database
function readSessionDb() {
  try {
    if (fs.existsSync(SESSION_DB_PATH)) {
      const data = fs.readFileSync(SESSION_DB_PATH, "utf8");
      return JSON.parse(data);
    }
  } catch (error) {
    console.error("Error reading session database:", error);
  }
  return [];
}

// Helper to write database
function writeSessionDb(data: any) {
  try {
    fs.writeFileSync(SESSION_DB_PATH, JSON.stringify(data, null, 2), "utf8");
    return true;
  } catch (error) {
    console.error("Error writing session database:", error);
    return false;
  }
}

// Seed the database with some realistic initial sample sessions if empty
function maybeSeedDatabase() {
  const current = readSessionDb();
  if (current.length === 0) {
    const initialSeed = [
      {
        sessionId: "session-mira-102",
        folderPath: "D:\\MiraVPN",
        claudeSessionId: "claude-session-81c",
        activeTurn: "human",
        lastTimestamp: "2026-06-22T04:15:00Z",
        clipboardContent: "eyKey: 'v_prod_9921_xzz_k9'",
        completedTasks: [
          "Docker authentication flow completed",
          "Set up JSON Web Token signing middleware"
        ],
        pendingTasks: [
          "Fix VPN socket reconnection timeout errors",
          "Commit 14 stashed file changes in auth branch",
          "Push to develop remote branch"
        ],
        timeline: [
          {
            id: "ev-1",
            timestamp: "2026-06-22T03:00:00Z",
            type: "repo",
            title: "Opened Mira VPN",
            details: "Workspace loaded 'MiraVPN' in VS Code. Current branch: develop.",
            important: false
          },
          {
            id: "ev-2",
            timestamp: "2026-06-22T03:05:00Z",
            type: "terminal",
            title: "Started docker services",
            details: "Ran: `docker compose up -d vpn-auth` in powershell Terminal 1.",
            important: true
          },
          {
            id: "ev-3",
            timestamp: "2026-06-22T03:12:00Z",
            type: "browser",
            title: "Opened Claude Chat",
            details: "Switched to tab: 'Claude - Fix token payload verification error'.",
            important: false
          },
          {
            id: "ev-4",
            timestamp: "2026-06-22T03:25:00Z",
            type: "vscode",
            title: "Edited auth.service.ts",
            details: "Modified JWT expiration check. Switched file to secure-route.ts.",
            important: true
          },
          {
            id: "ev-5",
            timestamp: "2026-06-22T03:38:00Z",
            type: "clipboard",
            title: "Copied Production Secret Key",
            details: "Copied string: 'eyKey: 'v_prod_9921_xzz_k9''. Stat: Unpasted.",
            important: true
          },
          {
            id: "ev-6",
            timestamp: "2026-06-22T04:00:00Z",
            type: "desktop",
            title: "Switched to Desktop 3 (Research)",
            details: "Left main coding workspace to read network troubleshooting docs.",
            important: false
          }
        ]
      },
      {
        sessionId: "session-afaq-301",
        folderPath: "D:\\AFAQ-OS",
        claudeSessionId: "claude-session-2a4",
        activeTurn: "agent",
        lastTimestamp: "2026-06-21T18:30:00Z",
        clipboardContent: "https://github.com/afaqsubs/afaq-os/pull/44",
        completedTasks: [
          "Refactored memory register allocator",
          "Resolved kernel ring-buffer race condition"
        ],
        pendingTasks: [
          "Merge changes into master channel",
          "Start system integration testing on bootloader"
        ],
        timeline: [
          {
            id: "evt-a1",
            timestamp: "2026-06-21T17:00:00Z",
            type: "repo",
            title: "Booted AFAQ OS Environment",
            details: "Switched to Desktop 1 (AFAQ OS Development). Directory: D:\\AFAQ-OS",
            important: false
          },
          {
            id: "evt-a2",
            timestamp: "2026-06-21T17:45:00Z",
            type: "terminal",
            title: "Triggered build compiler",
            details: "Executed: `make build-all-iso` in CMD session.",
            important: true
          },
          {
            id: "evt-a3",
            timestamp: "2026-06-21T18:22:00Z",
            type: "vscode",
            title: "Fixed panic address mapping",
            details: "Altered alloc.h line 128 to match memory protection flags.",
            important: true
          }
        ]
      }
    ];
    writeSessionDb(initialSeed);
  }
}

// Run seed checks on setup
maybeSeedDatabase();

// --- API ROUTES ---

// 1. Fetch raw config metadata
app.get("/api/db-config", (req, res) => {
  res.json({
    dbPath: SESSION_DB_PATH,
    status: fs.existsSync(SESSION_DB_PATH) ? "active" : "failed",
    apiKeyConfigured: !!process.env.GEMINI_API_KEY
  });
});

// 2. Read database sessions list
app.get("/api/sessions", (req, res) => {
  const sessions = readSessionDb();
  res.json(sessions);
});

// 3. Save or update session
app.post("/api/sessions", (req, res) => {
  const newSessionList = req.body;
  if (Array.isArray(newSessionList)) {
    const success = writeSessionDb(newSessionList);
    if (success) {
      return res.json({ success: true, message: "Database saved successfully" });
    }
  }
  return res.status(400).json({ success: false, message: "Invalid session array payload" });
});

// 4. API to summarize workspace memory timeline using Gemini Model
app.post("/api/gemini/summarize", async (req, res) => {
  const { currentState, timelineLog, customResumeTask } = req.body;

  if (!process.env.GEMINI_API_KEY) {
    return res.status(503).json({
      error: "Gemini API key is missing. Please add GEMINI_API_KEY in the Secrets panel."
    });
  }

  try {
    const ai = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build"
        }
      }
    });

    const activeApp = currentState?.activeApp || "VS Code";
    const gitRepo = currentState?.gitRepo || "mira-vpn";
    const gitBranch = currentState?.gitBranch || "develop";
    const lastFile = currentState?.windowTitle || "auth.service.ts";
    const currentDesktop = currentState?.virtualDesktop || "Desktop 2 (Coding)";
    const clipboard = currentState?.clipboardContent || "None";
    const modifiedCount = currentState?.modifiedFiles?.length || 0;

    const timelineStr = Array.isArray(timelineLog) 
      ? timelineLog.map((ev: any) => `[${ev.timestamp}] (${ev.type}) ${ev.title}: ${ev.details}`).join("\n")
      : "No events recorded.";

    const systemPrompt = `You are the AI engine of "Veridian Workspace Memory" — a personalized second brain for ADHD/Autistic developers working across multiple desktops, terminals, and AI agents (like Claude Code/Cline).
The developer frequently context-switches, loses track of "Where was I?", and needs an instantly readable, high-contrast, non-verbal-overload BRIEF.

You must accept the recorded session state, files, and recent timelines, then synthesize an incredibly direct, concise, and smart "Where the hell was I?" overview.

Your response must be in strict JSON format matching this schema:
{
  "currentProject": "String (Short clean project name, e.g., Mira VPN)",
  "focus": "String (One precise action sentence, e.g. JWT Token verification logic)",
  "completed": ["Completed task item 1", "Completed task item 2"],
  "pending": ["Urgent next step 1", "Urgent next step 2", "Github commit remind"],
  "risks": ["Potential problems like: Uncommited changes for 3 hours, or Forgotten copied items in clipboard"]
}

Rules:
- Be highly descriptive yet short. Use exact repo names and file paths if present.
- Limit each array to 2-3 prioritized bullet items max (suitable for lockscreens or small cards).
- If modified file counts are high, remind them to commit.
- If they copied some secrets/API key but never pasted, mention it in risks.
- Focus on restoring full spatial and cognitive context.`;

    const userPrompt = `
Simulated Current State:
- Desktop: ${currentDesktop}
- App: ${activeApp} (Window: "${lastFile}")
- Git Repo: ${gitRepo} (Branch: "${gitBranch}")
- Active file modified count: ${modifiedCount}
- Copied to clipboard and unpasted: "${clipboard}"
- Additional context requested: ${customResumeTask || "None"}

Recorded Timeline History:
${timelineStr}
`;

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: userPrompt,
      config: {
        systemInstruction: systemPrompt,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          required: ["currentProject", "focus", "completed", "pending", "risks"],
          properties: {
            currentProject: { type: Type.STRING },
            focus: { type: Type.STRING },
            completed: {
              type: Type.ARRAY,
              items: { type: Type.STRING }
            },
            pending: {
              type: Type.ARRAY,
              items: { type: Type.STRING }
            },
            risks: {
              type: Type.ARRAY,
              items: { type: Type.STRING }
            }
          }
        }
      }
    });

    const parsedData = JSON.parse(response.text || "{}");
    res.json(parsedData);
  } catch (error: any) {
    console.error("Gemini context summary failure:", error);
    res.status(500).json({
      error: "Failed to generate AI context summary.",
      rawError: error?.message || String(error)
    });
  }
});

// 5. ElevenLabs Text-to-Speech v3 BYOK Proxy
app.post("/api/elevenlabs/tts", async (req, res) => {
  const { text, apiKey, voiceId, modelId } = req.body;

  // Prioritize request body custom key, then server env key
  const finalApiKey = apiKey || process.env.ELEVENLABS_API_KEY;
  const finalVoiceId = voiceId || "21m00Tcm4TlvDq8ikWAM"; // default: Rachel
  const finalModelId = modelId || "eleven_monolingual_v1";

  if (!finalApiKey) {
    return res.status(400).json({
      error: "ElevenLabs API key is missing. Please configuration your BYOK inside the Mobile Companion setting or verify your server configuration."
    });
  }

  try {
    const fetchResponse = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${finalVoiceId}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "xi-api-key": finalApiKey
      },
      body: JSON.stringify({
        text,
        model_id: finalModelId,
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75
        }
      })
    });

    if (!fetchResponse.ok) {
      const errorText = await fetchResponse.text();
      return res.status(fetchResponse.status).json({
        error: `ElevenLabs API answered with error status: ${fetchResponse.status}`,
        details: errorText
      });
    }

    // Set headers to stream binary audio directly back to the client browser
    res.setHeader("Content-Type", "audio/mpeg");
    const arrayBuffer = await fetchResponse.arrayBuffer();
    res.send(Buffer.from(arrayBuffer));
  } catch (error: any) {
    console.error("ElevenLabs proxy failed:", error);
    res.status(500).json({
      error: "Server ElevenLabs proxy failed to generate audio.",
      details: error?.message || String(error)
    });
  }
});

// --- EXPOSE VITE OR STATIC FILES ---

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    // Serve index.html for all client routes (React SPA)
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Veridian Server listening at http://localhost:${PORT}`);
    console.log(`Database store allocated at: ${SESSION_DB_PATH}`);
  });
}

startServer();
