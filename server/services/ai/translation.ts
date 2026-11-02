import { getAiClient, generateContentWithFallback } from './geminiClient';
/**
 * Converts Marathi Devanagari numerals (०१२३४५६७८९) to English Arabic digits (0123456789)
 */
export function convertDevanagariNumeralsToEnglish(input: string): string {
  if (!input) return '';
  const devanagariDigits = ['०', '१', '२', '३', '४', '५', '६', '७', '८', '९'];
  let res = input;
  devanagariDigits.forEach((d, idx) => {
    res = res.replaceAll(d, String(idx));
  });
  return res;
}

/**
 * Converts English Arabic digits (0123456789) to Marathi Devanagari numerals (०१२३४५६७८९)
 */
export function convertEnglishDigitsToDevanagari(input: string): string {
  if (!input) return '';
  const devanagariDigits = ['०', '१', '२', '३', '४', '५', '६', '७', '८', '९'];
  let res = input;
  devanagariDigits.forEach((d, idx) => {
    res = res.replaceAll(String(idx), d);
  });
  return res;
}

/**
 * High-accuracy Marathi -> English legal notice translator
 */
export async function translateMarathiToEnglishLegalNotice(marathiText: string): Promise<{
  translatedText: string;
  surveyNumbers: string;
  villageEn: string;
  cityEn: string;
  advocateNameEn: string;
  partyNamesEn: string;
  noticeTypeEn: string;
  objectionDays: string;
}> {
  const client = getAiClient();
  if (!client) {
    return {
      translatedText: convertDevanagariNumeralsToEnglish(marathiText),
      surveyNumbers: '',
      villageEn: '',
      cityEn: 'Pune',
      advocateNameEn: '',
      partyNamesEn: '',
      noticeTypeEn: 'Public Legal Notice',
      objectionDays: '7'
    };
  }

  const prompt = `You are a certified Senior Legal Translator and Property Conveyancing Specialist in Maharashtra Land Laws.
Translate the following Marathi legal public notice into professional, legally accurate English.

MARATHI NOTICE TEXT:
"""
${marathiText}
"""

ACCURACY RULES:
1. Do NOT fabricate, invent, or add anything not present in the original text.
2. Accurately translate and transliterate all names of parties (landowners, purchasers, sellers, applicants, banks).
3. Accurately convert Survey Numbers, Gat Numbers, CTS Numbers, Plot Numbers, Hissa Numbers from Devanagari to English digits (e.g. सर्व्हे नं. १०२/१/ब -> Survey No. 102/1/B).
4. Accurately translate Village/Mouje (मौजे -> Mouje), Taluka (तालुका -> Taluka), District (जिल्हा -> District).
5. Accurately translate Advocate name, address, contact phone, and legal qualifications (Adv., LL.B., etc.).
6. Extract the objection duration in days (e.g. 7 days, 14 days, 15 days).

Return STRICT JSON format:
{
  "translatedText": "Full professional English legal translation of the notice",
  "surveyNumbers": "Extracted Survey/Gat/CTS/Plot numbers in English digits (e.g. Survey No. 45/2, Gat No. 89)",
  "villageEn": "Village / Locality name in English (e.g. Mouje Balewadi, Mouje Wagholi)",
  "cityEn": "Taluka / District name in English (e.g. Taluka Haveli, Dist Pune)",
  "advocateNameEn": "Advocate name and contact in English",
  "partyNamesEn": "Parties / Client / Owner / Purchaser names in English",
  "noticeTypeEn": "Nature of notice in English (e.g. Title Search Notice, Public Auction Notice, Succession Notice)",
  "objectionDays": "Number of days given for raising objections (e.g. 7 or 14 or 15)"
}`;

  try {
    const response = await generateContentWithFallback(client, { contents: prompt }, 'gemini-3.1-flash-lite');
    const raw = response.text || '';
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    return {
      translatedText: raw,
      surveyNumbers: '',
      villageEn: '',
      cityEn: 'Pune',
      advocateNameEn: '',
      partyNamesEn: '',
      noticeTypeEn: 'Public Legal Notice',
      objectionDays: ''
    };
  } catch (err: any) {
    console.warn('[Translator] Marathi to English translation error:', err.message);
    return {
      translatedText: convertDevanagariNumeralsToEnglish(marathiText),
      surveyNumbers: '',
      villageEn: '',
      cityEn: 'Pune',
      advocateNameEn: '',
      partyNamesEn: '',
      noticeTypeEn: 'Public Legal Notice',
      objectionDays: ''
    };
  }
}

/**
 * High-accuracy English -> Marathi legal notice translator
 */
export async function translateEnglishToMarathiLegalNotice(englishText: string): Promise<{
  translatedTextMr: string;
  surveyNumbersMr: string;
  villageMr: string;
  cityMr: string;
  advocateNameMr: string;
  partyNamesMr: string;
  noticeTypeMr: string;
}> {
  const client = getAiClient();
  if (!client) {
    return {
      translatedTextMr: englishText,
      surveyNumbersMr: '',
      villageMr: '',
      cityMr: 'पुणे',
      advocateNameMr: '',
      partyNamesMr: '',
      noticeTypeMr: 'जाहीर नोटीस'
    };
  }

  const prompt = `You are a certified Senior Legal Translator specializing in Marathi Revenue & Court Conveyancing terminology.
Translate the following English legal notice into authentic, standard Devanagari Marathi as published in Maharashtra newspapers (उदा. दैनिक प्रभात / पुढारी).

ENGLISH LEGAL TEXT:
"""
${englishText}
"""

ACCURACY RULES:
1. Use standard Marathi legal terminology:
   - Title Search -> टायटल सर्च व शोध अहवाल
   - Public Notice -> जाहीर नोटीस
   - Survey No. -> सर्व्हे नं. / सर्वे क्र.
   - Gat No. -> गट नं.
   - CTS No. -> सी.टी.एस. नं.
   - Plot No. -> प्लॉट नं. / भूखंड क्र.
   - Mouje -> मौजे
   - Taluka -> तालुका
   - District -> जिल्हा
   - Advocate -> ॲडव्होकेट / वकील
   - Objection -> हरकती / आक्षेप
2. Accurately transcribe names and digits into Devanagari.
3. Do NOT hallucinate or alter any facts.

Return STRICT JSON format:
{
  "translatedTextMr": "Full authentic Marathi translation of the notice in Devanagari",
  "surveyNumbersMr": "Survey/Gat/CTS/Plot numbers in Devanagari (e.g. सर्व्हे नं. ४५/२, गट नं. ८९)",
  "villageMr": "Village / Locality name in Marathi (e.g. मौजे बाणेर)",
  "cityMr": "Taluka / District in Marathi (e.g. ता. हवेली, जि. पुणे)",
  "advocateNameMr": "Advocate name in Marathi (e.g. ॲड. ...)",
  "partyNamesMr": "Parties / Client / Owner names in Marathi",
  "noticeTypeMr": "Nature of notice in Marathi (e.g. टायटल सर्च नोटीस / जाहीर नोटीस)"
}`;

  try {
    const response = await generateContentWithFallback(client, { contents: prompt }, 'gemini-3.1-flash-lite');
    const raw = response.text || '';
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    return {
      translatedTextMr: raw,
      surveyNumbersMr: '',
      villageMr: '',
      cityMr: 'पुणे',
      advocateNameMr: '',
      partyNamesMr: '',
      noticeTypeMr: 'जाहीर नोटीस'
    };
  } catch (err: any) {
    console.warn('[Translator] English to Marathi translation error:', err.message);
    return {
      translatedTextMr: englishText,
      surveyNumbersMr: '',
      villageMr: '',
      cityMr: 'पुणे',
      advocateNameMr: '',
      partyNamesMr: '',
      noticeTypeMr: 'जाहीर नोटीस'
    };
  }
}
