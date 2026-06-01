import express from "express";
import path from "path";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

app.use(express.json());

// Initialize Gemini API securely using the recommended SDK and options
let aiInstance: GoogleGenAI | null = null;

function getGeminiClient(): GoogleGenAI {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is not defined");
  }
  if (!aiInstance) {
    aiInstance = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });
  }
  return aiInstance;
}

// AI Copilot Endpoint - Processes questions with full context
app.post("/api/ai/copilot", async (req, res) => {
  try {
    const { prompt, context } = req.body;
    
    if (!prompt) {
      return res.status(400).json({ error: "No prompt provided" });
    }

    if (!process.env.GEMINI_API_KEY) {
      return res.json({ 
        text: "আসসালামু আলাইকুম! রিয়েল-টাইম AI স্মার্ট ফিচার সক্রিয় করার জন্য অনুগ্রহ করে অ্যাপটির Settings > Secrets প্যানেলে আপনার `GEMINI_API_KEY` প্রদান করুন। (Please save your GEMINI_API_KEY in Settings > Secrets to enable live intelligence!)" 
      });
    }

    // Format organization context details beautifully for the AI's understanding
    const systemPrompt = `You are the AI Smart Copilot & Financial Analyst for "নাছিরেরটেক সমাজ কল্যাণ সংস্থা (Nashirertek Social Welfare Association - NSWO)".
You communicate in Bengali (as primary language) but can use English where natural, showing an polite, respectful, and professional Islamic elegant tone.

Here is the LIVE database context of our organization to answer the user query:
- Total Registered Members: ${context?.membersCount ?? 0}
- Active Members: ${context?.activeMembersCount ?? 0}
- Total Dues Calculation: ৳${context?.totalDue ?? 0}
- Total Collections (Income): ৳${context?.totalCollection ?? 0}
- Total Expenses: ৳${context?.totalExpenses ?? 0}
- Net Cash Balance: ৳${context?.currentBalance ?? 0}

Recent Members with Overdue Balances:
${(context?.dueMembers || []).slice(0, 15).map((m: any) => `- Member ID: ${m.memberId}, Name: ${m.name}, Phone: ${m.phone}, Dues: ৳${m.dueAmount}`).join("\n") || "No members currently have outstanding dues."}

Recent Payments Collected:
${(context?.recentPayments || []).slice(0, 10).map((p: any) => `- Name: ${p.name}, Amount: ৳${p.amount}, Date: ${p.date}`).join("\n") || "No collections made yet."}

Recent Expenses Recorded:
${(context?.recentExpenses || []).slice(0, 10).map((e: any) => `- Description: ${e.description}, Amount: ৳${e.amount}, Category: ${e.category || 'General'}, Date: ${e.date}`).join("\n") || "No expenses recorded yet."}

Capability Guidance:
- Due Prediction: Analyze payment histories, count of dues, and highlight who is likely to miss their next contribution or suggest outreach timelines.
- Smart Report: Synthesize collections, cash flows, and write elegant structured corporate/charitable summaries.
- Auto Notice: Generate announcements/SMS alerts for outstanding balances or upcoming events in professional Bengali.
- Member Search: Filter or discuss any registered member details.
- Donation Analysis: Share trends of sponsors, donor contributions, and advisory feedback.
- Expense Suggestion: Offer optimal budgeting advisory, pinpoint high costs, or propose cost-savings.

Please write clean, Markdown-formatted Bengali responses. Use gold-standard bullet formatting, tables, or bold markings so the user is impressed with the premium analytical precision.`;

    const client = getGeminiClient();
    const response = await client.models.generateContent({
      model: "gemini-3.5-flash",
      contents: prompt,
      config: {
        systemInstruction: systemPrompt,
        temperature: 0.7,
      }
    });

    res.json({ text: response.text });
  } catch (error: any) {
    console.error("Gemini API Error:", error);
    res.status(500).json({ error: error?.message || "Internal server error" });
  }
});

// API health check
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", uptime: process.uptime() });
});

// Configure Vite middleware or static paths
async function setupServer() {
  const isDev = process.env.NODE_ENV === "development";

  if (isDev) {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`NSWO Server running on http://localhost:${PORT} in ${process.env.NODE_ENV || 'production'} mode`);
  });
}

setupServer();
