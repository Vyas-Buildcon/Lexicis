import { createRouter } from '../http';
import { predictFutureCaseStrategy, answerStrategyQuestion } from '../services/ai/strategyPredictor';
import {
  translateMarathiToEnglishLegalNotice,
  translateEnglishToMarathiLegalNotice,
  convertDevanagariNumeralsToEnglish
} from '../services/ai/translation';

export const legalRoutes = createRouter();

// Legal Strategy Predictor API: Generate Future Legal Prediction & Strategy Plan
legalRoutes.post('/legal/predict-strategy', async (req, res) => {
  const { incidentType, userRole, incidentDetails, actionsTaken, userGoals, incidentDate, location } = req.body;
  if (!incidentDetails || !incidentDetails.trim()) {
    return res.status(400).json({ error: "incidentDetails explanation is required" });
  }

  try {
    const strategy = await predictFutureCaseStrategy({
      incidentType: incidentType || "Motor Vehicle Incident / Road Accident",
      userRole: userRole || "At Fault / Caused Incident",
      incidentDetails: incidentDetails.trim(),
      actionsTaken,
      userGoals,
      incidentDate: /^\d{4}-\d{2}-\d{2}$/.test(incidentDate || '') ? incidentDate : undefined,
      location: typeof location === 'string' && location.trim() ? location.trim().slice(0, 120) : undefined
    });
    res.json({ success: true, strategy });
  } catch (err: any) {
    console.error("Predict strategy API error:", err);
    res.status(500).json({ error: "Failed to generate legal prediction and strategy plan." });
  }
});

// Follow-up questions about a generated strategy
legalRoutes.post('/legal/strategy-chat', async (req, res) => {
  const { input, strategy, history, question } = req.body || {};
  if (!input?.incidentDetails || typeof question !== 'string' || !question.trim()) {
    return res.status(400).json({ error: "The incident and a question are required" });
  }
  try {
    const reply = await answerStrategyQuestion(
      input,
      strategy || {},
      Array.isArray(history) ? history.filter((m: any) => typeof m?.text === 'string') : [],
      question.trim().slice(0, 2000)
    );
    res.json({ reply });
  } catch (err: any) {
    console.error("Strategy chat error:", err);
    res.status(500).json({ error: "The AI advisor could not answer right now. Please try again." });
  }
});

// High-Precision Legal Notice Translation: Marathi to English
legalRoutes.post('/translate/marathi-to-english', async (req, res) => {
  const { text } = req.body || {};
  if (!text || typeof text !== 'string') {
    return res.status(400).json({ success: false, error: 'Notice text is required' });
  }

  try {
    const result = await translateMarathiToEnglishLegalNotice(text);
    res.json({ success: true, originalText: text, ...result });
  } catch (err: any) {
    console.error('[API] Marathi to English translation error:', err);
    res.status(500).json({
      success: false,
      error: err.message,
      translatedText: convertDevanagariNumeralsToEnglish(text)
    });
  }
});

// High-Precision Legal Notice Translation: English to Marathi
legalRoutes.post('/translate/english-to-marathi', async (req, res) => {
  const { text } = req.body || {};
  if (!text || typeof text !== 'string') {
    return res.status(400).json({ success: false, error: 'Notice text is required' });
  }

  try {
    const result = await translateEnglishToMarathiLegalNotice(text);
    res.json({ success: true, originalText: text, ...result });
  } catch (err: any) {
    console.error('[API] English to Marathi translation error:', err);
    res.status(500).json({
      success: false,
      error: err.message,
      translatedTextMr: text
    });
  }
});
