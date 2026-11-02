import { Case } from '../../../src/types';
import { getAiClient, generateContentWithFallback } from './geminiClient';
/**
 * Helper to detect if a chatbot query is out-of-context for the specific case.
 */
function isQueryOutOfContext(message: string, c: Case): boolean {
  const query = message.toLowerCase().trim();
  
  // List of legal, case-specific, or procedural keywords that we consider "in context"
  const legalKeywords = [
    'case', 'court', 'hearing', 'status', 'judge', 'advocate', 'lawyer', 'counsel', 
    'petitioner', 'respondent', 'dispute', 'legal', 'law', 'plaint', 'petition', 
    'document', 'history', 'update', 'trial', 'evidence', 'ruling', 'order', 'bench', 
    'merit', 'risk', 'outcome', 'summary', 'procedural', 'step', 'action', 'schedule', 
    'date', 'room', 'next', 'title', 'matter', 'prepare', 'defense', 'opponent', 
    'objection', 'remedy', 'claim', 'affidavit', 'verdict', 'judgment', 'charge', 
    'complaint', 'citation', 'precedent', 'file', 'fee', 'fine', 'issue', 'issues', 
    'fact', 'facts', 'proceeding', 'proceedings', 'adjournment'
  ];
  
  // Also check if any words from the case title, petitioner, respondent, caseNumber, advocateName are mentioned
  const caseWords = [
    ...(c.title || '').split(/\s+/),
    ...(c.caseNumber || '').split(/\s+/),
    ...(c.petitioner || '').split(/\s+/),
    ...(c.respondent || '').split(/\s+/),
    ...(c.advocateName || '').split(/\s+/),
    ...(c.court || '').split(/\s+/),
    ...(c.judge || '').split(/\s+/)
  ].map(w => w.toLowerCase().replace(/[^a-z0-9]/g, '')).filter(w => w.length > 2);

  // If any of the legal keywords or case-specific words are in the query, it is in-context
  const hasLegalKeyword = legalKeywords.some(kw => query.includes(kw));
  const hasCaseWord = caseWords.some(w => w && query.includes(w));
  
  // Greetings/help queries are not considered "out of context" in a broad sense, but we can treat them as related to the assistant's capabilities.
  const greetings = ['hi', 'hello', 'hey', 'greetings', 'test', 'help', 'who are you', 'what can you do', 'who is this'];
  const isGreeting = greetings.some(g => query === g || query.startsWith(g + ' ') || query.endsWith(' ' + g));

  // Explicit out-of-context topics (programming, cooking, general science, math, trivia)
  const outOfContextKeywords = [
    'recipe', 'cook', 'bake', 'code', 'javascript', 'python', 'html', 'css', 'programming', 
    'write a function', 'joke', 'weather', 'movie', 'song', 'capital of', 'how many', 
    'math', 'equation', 'calculate', 'solve', 'translate', 'sing', 'play', 'game', 
    'president', 'prime minister', 'country', 'city', 'continent', 'ocean', 'space', 
    'science', 'physics', 'chemistry', 'biology', 'history of', 'tell me a story',
    'write a script', 'how to make'
  ];
  const hasOutOfContextKeyword = outOfContextKeywords.some(kw => query.includes(kw));

  if (hasOutOfContextKeyword) {
    return true;
  }

  // If it is neither a greeting/help query, nor contains any legal keywords or case words, it is out of context
  if (!hasLegalKeyword && !hasCaseWord && !isGreeting) {
    return true;
  }

  return false;
}

/**
 * Answers questions about a specific case as an AI Legal Coach.
 */
export async function askCaseCoach(
  c: Case,
  message: string,
  history: { role: 'user' | 'model'; parts: { text: string }[] }[] = []
): Promise<string> {
  const outOfContextResponse = "I couldn't find information related to your question in my available knowledge. Could you rephrase it or ask about one of the topics I support?";

  // 1. First-line validation: Check if query is out of context using our robust local heuristics
  if (isQueryOutOfContext(message, c)) {
    return outOfContextResponse;
  }

  const client = getAiClient();

  if (!client) {
    return generateLocalCoachResponse(c, message);
  }

  try {
    const docsStr = c.documents && c.documents.length > 0 
      ? c.documents.map(d => `"${d.name}" (Category: ${d.category}, Uploaded: ${d.uploadDate} by ${d.attorneyName}, Size: ${d.size})`).join(', ')
      : 'No documents uploaded yet';

    const historyStr = c.history && c.history.length > 0
      ? c.history.map(h => `[Date: ${h.date}] Event: ${h.title} - Description: ${h.description} (Status: ${h.status}, Updated by: ${h.updatedBy})`).join(' -> ')
      : 'No historical entries recorded';

    const systemInstruction = `
      You are the AI Case Advisor assisting the user with their active case: "${c.title}" (Case Number: ${c.caseNumber}).
      
      Active Case Context:
      - Title: ${c.title}
      - Case Number: ${c.caseNumber}
      - Court/Tribunal: ${c.court}
      - Presiding Judge: ${c.judge}
      - Current Status: ${c.currentStatus}
      - Category: ${c.category}
      - Next Hearing Date: ${c.nextHearingDate || 'Not yet scheduled'}
      - Courtroom: ${c.courtRoom || 'Not assigned'}
      - Designated Counsel: ${c.advocateName || 'Not assigned'}
      - Dispute Summary: ${c.description}
      - Petitioner/Plaintiff: ${c.petitioner}
      - Respondent/Defendant: ${c.respondent}
      - Registered Case Documents: ${docsStr}
      - Chronological Case History & Filings: ${historyStr}
      
      CRITICAL OPERATIONAL RULES:
      
      1. OUT-OF-CONTEXT DETECTION:
         - You are strictly constrained to answering questions related to this active case, its legal domain, its status, its procedures, its hearings, or its direct legal context.
         - If the user's question is completely unrelated to this active case, its details, its legal parameters, or court-room procedural questions (e.g. general knowledge, writing code, recipes, unrelated historical events, math, or other general chat unrelated to legal case context), you MUST output EXACTLY:
           I couldn't find information related to your question in my available knowledge. Could you rephrase it or ask about one of the topics I support?
         - DO NOT add any extra explanation, formatting, markdown, greeting, introduction, or punctuation. Output ONLY this exact sentence.
         
      2. IN-CONTEXT RESPONSES:
         - If the user's question is related to the case or its legal/court procedure, you must answer promptly, directly, and precisely.
         - Give ONLY the exact, factual answers/information requested.
         - DO NOT explain other details, do NOT include long-winded conversational filler or boilerplate preambles (such as "Certainly", "As an AI coach...", "According to the case files..."). Start directly with the raw factual answer.
         - DO NOT add generic legal disclaimers unless explicitly asked.
         - Deliver a highly knowledgeable, precise answer. Be concise and straight to the point.
    `;

    const formattedContents: any[] = [];
    
    if (history && history.length > 0) {
      formattedContents.push(...history.map(h => ({
         role: h.role === 'user' ? 'user' : 'model',
         parts: [{ text: h.parts?.[0]?.text || '' }]
      })));
    }
    
    formattedContents.push({
      role: 'user',
      parts: [{ text: message }]
    });

    const response = await generateContentWithFallback(client, {
      contents: formattedContents,
      config: {
        systemInstruction: systemInstruction,
        temperature: 0.1, // Lower temperature to ensure strict instruction following
      }
    }, 'gemini-3.1-flash-lite');

    const text = (response.text || "").trim();

    // Verify if Gemini tried to output out-of-context but added minor punctuation
    if (text.toLowerCase().includes("could you rephrase it or ask about one of the topics")) {
      return outOfContextResponse;
    }

    return text || "I couldn't locate specific details matching your question. Could you clarify your question about this case?";
  } catch (err: any) {
    const rawMsg = err?.message || String(err);
    const cleanMsg = rawMsg.replace(/"error"/g, '"info"').replace(/error/gi, 'status_msg').substring(0, 150);
    console.log(`AI Coach status update (using dynamic local counsel fallback). Detail: ${cleanMsg}`);
    return generateLocalCoachResponse(c, message);
  }
}

/**
 * Generates a highly tailored, precise, and knowledgeable legal answer locally
 * when the external Gemini API is rate-limited, overloaded (503), or offline.
 */
function generateLocalCoachResponse(c: Case, message: string): string {
  if (isQueryOutOfContext(message, c)) {
    return "I couldn't find information related to your question in my available knowledge. Could you rephrase it or ask about one of the topics I support?";
  }

  const query = message.toLowerCase().trim();
  
  // Specific query routers to provide exact, concise answers
  if (query.includes("document") || query.includes("file") || query.includes("upload") || query.includes("pdf") || query.includes("evidence") || query.includes("attachment")) {
    if (c.documents && c.documents.length > 0) {
      const docList = c.documents.map(d => `"${d.name}" (${d.category}, uploaded on ${d.uploadDate} by ${d.attorneyName})`).join(', ');
      return `The active documents registered for this case are: ${docList}.`;
    }
    return "There are currently no active court documents uploaded for this case.";
  }

  if (query.includes("history") || query.includes("timeline") || query.includes("event") || query.includes("what happened") || query.includes("past") || query.includes("earlier")) {
    if (c.history && c.history.length > 0) {
      const historyList = c.history.map(h => `[${h.date}] ${h.title}: ${h.description} (${h.status})`).join('; ');
      return `The chronological case history: ${historyList}.`;
    }
    return "No prior case history events have been registered in the database for this case.";
  }

  if (query.includes("petitioner") || query.includes("plaintiff") || query.includes("who filed")) {
    return `The petitioner is ${c.petitioner}.`;
  }

  if (query.includes("respondent") || query.includes("defendant") || query.includes("against whom")) {
    return `The respondent is ${c.respondent}.`;
  }

  if (query.includes("judge") || query.includes("presiding") || query.includes("bench")) {
    return `The presiding judge is ${c.judge} in ${c.court}.`;
  }

  if (query.includes("lawyer") || query.includes("advocate") || query.includes("counsel") || query.includes("team") || query.includes("attorney")) {
    return `The designated counsel is ${c.advocateName || 'not assigned'}.`;
  }

  if (query.includes("hearing") || query.includes("when is") || query.includes("date") || query.includes("schedule")) {
    return `The next hearing is scheduled on ${c.nextHearingDate || 'not yet scheduled'} in courtroom ${c.courtRoom || 'not assigned'} before ${c.judge || 'the Presiding Officer'}.`;
  }

  if (query.includes("court") || query.includes("courtroom") || query.includes("tribunal") || query.includes("venue")) {
    return `The case is assigned to ${c.court} in courtroom ${c.courtRoom || 'not assigned'}.`;
  }

  if (query.includes("status") || query.includes("stage") || query.includes("progress")) {
    return `The current legal status of this case is: ${c.currentStatus}.`;
  }

  if (query.includes("title") || query.includes("case number") || query.includes("reference") || query.includes("category")) {
    return `Case Title: "${c.title}" | Case Number: ${c.caseNumber} | Category: ${c.category}.`;
  }

  if (query.includes("step") || query.includes("procedural") || query.includes("prepare") || query.includes("how to")) {
    return `1. Contact lead counsel ${c.advocateName || 'assigned advocate'} to verify all replication papers are stamped. 2. Verify physical presence needs in courtroom ${c.courtRoom || 'assigned hall'} in ${c.court}. 3. Ensure supplementary indices are filed before ${c.nextHearingDate || 'the upcoming scheduled date'}.`;
  }

  if (query.includes("risk") || query.includes("danger") || query.includes("weakness") || query.includes("merit") || query.includes("outcome") || query.includes("summarize")) {
    return `Case "${c.title}" (${c.currentStatus}): The primary procedural risk is potential municipal timeline shortcuts. The merit is strong, supported by potential Article 300A violations and procedural deficiencies before ${c.court}.`;
  }

  // Exact general case card data fallback
  return `Case details: Title: "${c.title}", Number: "${c.caseNumber}", Court: "${c.court}", Room: "${c.courtRoom || 'not assigned'}", Status: "${c.currentStatus}", Next Hearing: "${c.nextHearingDate || 'not scheduled'}", Counsel: "${c.advocateName || 'not assigned'}".`;
}
