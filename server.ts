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
    const modelsToTry = [
      "gemini-3.5-flash",
      "gemini-3.1-flash-lite",
      "gemini-flash-latest"
    ];

    let response = null;
    let lastError = null;

    for (const modelName of modelsToTry) {
      try {
        console.log(`[Copilot] Attempting content generation with model: ${modelName}`);
        const attempt = await client.models.generateContent({
          model: modelName,
          contents: prompt,
          config: {
            systemInstruction: systemPrompt,
            temperature: 0.7,
          }
        });
        if (attempt && attempt.text) {
          response = attempt;
          console.log(`[Copilot] Successfully generated content with model: ${modelName}`);
          break;
        }
      } catch (err: any) {
        console.error(`[Copilot] Error for model ${modelName}:`, err?.message || err);
        lastError = err;
      }
    }

    if (!response) {
      let friendlyError = "দুঃখিত, গুগল জেমিনি এআই সার্ভার এই মুহূর্তে অতিরিক্ত চাপ (high demand) অনুভব করছে। অনুগ্রহ করে একটু পরে আবার চেষ্টা করুন। (The AI service is currently experiencing high demand. Please try again in a few moments!)";
      
      if (lastError) {
        let rawMessage = "";
        if (typeof lastError === "string") {
          rawMessage = lastError;
        } else if (lastError && typeof lastError === "object") {
          rawMessage = lastError.message || lastError.error?.message || JSON.stringify(lastError);
        }

        try {
          const cleanedJsonStr = rawMessage.includes("Error for model") 
            ? rawMessage.substring(rawMessage.indexOf("{")) 
            : rawMessage;
          const parsed = JSON.parse(cleanedJsonStr);
          if (parsed?.error?.message) {
            rawMessage = parsed.error.message;
          } else if (parsed?.message) {
            rawMessage = parsed.message;
          }
        } catch (e) {
          // Keep rawMessage as is if not valid JSON
        }

        const lowerRaw = rawMessage.toLowerCase();
        if (lowerRaw.includes("503") || lowerRaw.includes("demand") || lowerRaw.includes("unavailable") || lowerRaw.includes("resource_exhausted") || lowerRaw.includes("quota")) {
          friendlyError = "দুঃখিত, গুগল জেমিনি এআই সার্ভারে উচ্চ চাহিদার কারণে সাময়িক বিভ্রাট বা কোটা শেষ হয়েছে। আমাদের অটো-ফেলওভার সিস্টেম অন্য মডেলগুলোও চেষ্টা করেছে কিন্তু সবগুলোই অতিরিক্ত চাপের সম্মুখীন হচ্ছে। অনুগ্রহ করে ৩০ সেকেন্ড পর আবার চেষ্টা করুন।";
        } else if (lowerRaw.includes("api_key") || lowerRaw.includes("api key") || lowerRaw.includes("invalid key") || lowerRaw.includes("key not found")) {
          friendlyError = "আসসালামু আলাইকুম! লাইভ এআই ফিচার সক্রিয় করার জন্য অনুগ্রহ করে Settings > Secrets প্যানেলে সঠিক `GEMINI_API_KEY` প্রদান করুন।";
        } else {
          // Clean up the error structure
          friendlyError = `গুগল এআই সার্ভিস রেসপন্স: ${rawMessage.replace(/\{[^\}]*\}/g, "").trim() || rawMessage}`;
        }
      }
      return res.status(503).json({ error: friendlyError });
    }

    res.json({ text: response.text });
  } catch (error: any) {
    console.error("Gemini API Error:", error);
    let outerErrorMsg = error?.message || "Internal server error";
    try {
      const parsed = JSON.parse(outerErrorMsg);
      if (parsed?.error?.message) {
        outerErrorMsg = parsed.error.message;
      }
    } catch {}
    res.status(500).json({ error: outerErrorMsg.replace(/\{[^\}]*\}/g, "").trim() || outerErrorMsg });
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
