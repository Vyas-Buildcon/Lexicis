/**
 * Legal Strategy & Predictor: a pre-litigation plan for an incident the user
 * describes, grounded in current Indian law and in judgments on the same question.
 */
import { Case, StrategyRequestInput, FutureCaseStrategy, SimilarCase } from '../../../src/types';
import { getAiClient, generateContentWithFallback } from './geminiClient';
import { findPrecedentCandidates, rankPrecedents } from './precedentResearch';

// The Bharatiya Nyaya Sanhita, BNSS and BSA replaced the IPC, CrPC and Evidence Act from this date
const NEW_CRIMINAL_LAWS_FROM = '2024-07-01';
const MAX_JUDGMENTS = 6;

function lawRegimeNote(input: StrategyRequestInput): string {
  const date = input.incidentDate;
  if (!date) {
    return `Incident date not given. Offences committed on or after ${NEW_CRIMINAL_LAWS_FROM} fall under the Bharatiya Nyaya Sanhita (BNS), BNSS and Bharatiya Sakshya Adhiniyam; earlier ones under the IPC, CrPC and Indian Evidence Act. Cite the BNS section with the old IPC equivalent in brackets.`;
  }
  return date >= NEW_CRIMINAL_LAWS_FROM
    ? `The incident date (${date}) is on or after ${NEW_CRIMINAL_LAWS_FROM}: the BNS, BNSS and Bharatiya Sakshya Adhiniyam apply. Cite BNS/BNSS sections, with the old IPC/CrPC equivalent in brackets for reference.`
    : `The incident date (${date}) is before ${NEW_CRIMINAL_LAWS_FROM}: the IPC, CrPC and Indian Evidence Act govern the offence itself, while procedure from that date follows the BNSS. Cite IPC sections, with the BNS equivalent in brackets.`;
}

function describeIncident(input: StrategyRequestInput): string {
  return [
    `Incident type: ${input.incidentType}`,
    `User's role: ${input.userRole}`,
    input.incidentDate ? `Date of incident / notice: ${input.incidentDate}` : '',
    input.location ? `Location: ${input.location}` : '',
    `What happened: ${input.incidentDetails}`,
    `Actions taken so far: ${input.actionsTaken || 'None stated'}`,
    `User's goals: ${input.userGoals || 'Not stated'}`
  ].filter(Boolean).join('\n');
}

/** Finds judgments on the same legal question via Indian Kanoon; empty when unavailable. */
async function researchJudgments(input: StrategyRequestInput): Promise<SimilarCase[]> {
  const client = getAiClient();
  if (!client) return [];
  try {
    const response = await generateContentWithFallback(client, {
      contents: `From this Indian legal situation, write 3 short keyword search queries (3-7 words each, no names, no dates) that would find court judgments deciding the same legal question (name the statute or offence where relevant, e.g. "section 138 negotiable instruments compounding", "rash driving grievous hurt compensation"). Return JSON: {"queries": ["..."]}\n\n${describeIncident(input)}`,
      config: { responseMimeType: 'application/json', temperature: 0.1 }
    });
    const queries: string[] = (JSON.parse(response.text || '{}').queries || []).filter((q: unknown) => typeof q === 'string').slice(0, 3);
    if (queries.length === 0) return [];

    // Location decides which High Court is searched first
    const scope = { court: input.location || '', state: input.location || '', district: '', petitioner: '', title: '' } as unknown as Case;
    const candidates = await findPrecedentCandidates(scope, queries);
    const ranked = await rankPrecedents(describeIncident(input), candidates, MAX_JUDGMENTS);
    // Only judgments that actually bear on the question are worth showing here
    return ranked.filter(j => typeof j.similarity !== 'number' || j.similarity >= 40);
  } catch (e: any) {
    console.warn('[Strategy] Judgment research failed:', String(e?.message || e).slice(0, 160));
    return [];
  }
}

const RISK_LEVELS: FutureCaseStrategy['overallRiskLevel'][] = ['Low', 'Medium', 'High', 'Severe'];

function riskLevelFor(score: number): FutureCaseStrategy['overallRiskLevel'] {
  if (score >= 80) return 'Severe';
  if (score >= 60) return 'High';
  if (score >= 35) return 'Medium';
  return 'Low';
}

const arr = <T>(v: unknown): T[] => (Array.isArray(v) ? v as T[] : []);

/** Fills gaps and makes the numbers consistent (probabilities add up to 100, level matches score). */
function normalizeStrategy(raw: any): FutureCaseStrategy {
  const score = Math.max(0, Math.min(100, Math.round(Number(raw.riskScore) || 50)));
  const level = RISK_LEVELS.includes(raw.overallRiskLevel) ? raw.overallRiskLevel : riskLevelFor(score);

  const outcome = raw.predictedCaseOutcome || {};
  const parts = [outcome.probabilityOutofCourtSettlement, outcome.probabilityCivilFineOnly, outcome.probabilityCriminalTrial]
    .map((v: unknown) => Math.max(0, Number(v) || 0));
  const total = parts.reduce((a, b) => a + b, 0) || 1;
  const [settle, civil] = parts.map(p => Math.round((p / total) * 100));

  const guide = raw.outOfCourtSettlementGuide || {};
  return {
    incidentSummary: raw.incidentSummary || '',
    overallRiskLevel: level,
    riskScore: score,
    potentialLegalCharges: arr(raw.potentialLegalCharges),
    predictedCaseOutcome: {
      probabilityOutofCourtSettlement: settle,
      probabilityCivilFineOnly: civil,
      probabilityCriminalTrial: Math.max(0, 100 - settle - civil),
      likelyVerdictSummary: outcome.likelyVerdictSummary || ''
    },
    immediateActionPlan: arr<any>(raw.immediateActionPlan).filter(g => g && Array.isArray(g.actions)),
    mitigationAndLegalSteps: arr<any>(raw.mitigationAndLegalSteps).map((s, i) => ({ ...s, stepNumber: s.stepNumber || i + 1 })),
    whatNotToDo: arr(raw.whatNotToDo),
    outOfCourtSettlementGuide: {
      isSettlementRecommended: !!guide.isSettlementRecommended,
      negotiationStrategy: guide.negotiationStrategy || '',
      recommendedDamagesFormula: guide.recommendedDamagesFormula || '',
      keyTermsToIncludeInAgreement: arr(guide.keyTermsToIncludeInAgreement),
      sampleAgreementTemplate: guide.isSettlementRecommended ? guide.sampleAgreementTemplate || undefined : undefined
    },
    stepByStepTimeline: arr(raw.stepByStepTimeline),
    keyDeadlines: arr<any>(raw.keyDeadlines).filter(d => d?.deadline && d?.action),
    documentsChecklist: arr(raw.documentsChecklist),
    authoritiesToApproach: arr<any>(raw.authoritiesToApproach).filter(a => a?.authority),
    rightsAndProtections: arr(raw.rightsAndProtections),
    questionsToClarify: arr(raw.questionsToClarify),
    lawyerToConsult: raw.lawyerToConsult || undefined,
    applicableLawNote: raw.applicableLawNote || undefined
  };
}

function buildStrategyPrompt(input: StrategyRequestInput, judgments: SimilarCase[]): string {
  const today = new Date().toISOString().slice(0, 10);
  const judgmentBlock = judgments.length
    ? judgments.map((j, i) => `[J${i + 1}] ${j.title} | ${j.court || ''}\nOutcome: ${j.result}`).join('\n\n')
    : '(none found)';

  return `You are a senior Indian advocate giving a person a practical, lawful plan for a legal situation before (or at the start of) litigation. Today is ${today}.

THE SITUATION
${describeIncident(input)}

APPLICABLE LAW
${lawRegimeNote(input)}

JUDGMENTS ON THE SAME QUESTION (from Indian Kanoon)
${judgmentBlock}

RULES
- Be specific to these facts and this user's role. If the user is the victim/affected party, the plan is about enforcing their rights and remedies (complaint, compensation, consumer forum, civil suit); if the user is at fault, it is about meeting legal duties and limiting liability.
- Never advise anything unlawful or evasive: no concealing facts, not reporting when reporting is mandatory (e.g. Motor Vehicles Act s.134 duty to help the injured and inform police), destroying evidence, or pressuring witnesses. Put mandatory legal duties first in the immediate actions.
- Recommend out-of-court settlement only where the law allows it (civil disputes and compoundable offences). For non-compoundable offences say so, and explain the lawful route (e.g. High Court quashing under BNSS s.528 / CrPC s.482 is discretionary).
- Cite real sections accurately. Do not invent case names or citations; you may refer to the judgments above by their titles.
- Deadlines must be concrete (e.g. "15 days from receiving the notice"; give the calendar date when the incident/notice date is known).
- Probabilities are estimates and must add up to 100.
- Use plain English a non-lawyer understands; keep each item short and actionable.

Return JSON:
{
  "applicableLawNote": "1-2 sentences on which laws apply and why",
  "incidentSummary": "80-130 words: what happened in legal terms, the user's legal exposure or rights, and the decisive issue",
  "overallRiskLevel": "Low | Medium | High | Severe",
  "riskScore": 0-100,
  "potentialLegalCharges": [{"actOrSection": "...", "description": "why it applies here", "bailable": true, "bailableText": "bailable / non-bailable, cognizable or not, compoundable or not", "penaltyOrSentence": "..."}],
  "predictedCaseOutcome": {"probabilityOutofCourtSettlement": 0, "probabilityCivilFineOnly": 0, "probabilityCriminalTrial": 0, "likelyVerdictSummary": "what is most likely to happen and why, referring to the judgments above where relevant"},
  "keyDeadlines": [{"deadline": "...", "action": "...", "consequenceIfMissed": "..."}],
  "immediateActionPlan": [{"timeframe": "e.g. Today / Within 7 days / Within 30 days", "title": "...", "actions": ["..."]}],
  "documentsChecklist": ["documents and evidence to collect or keep"],
  "authoritiesToApproach": [{"authority": "e.g. jurisdictional police station, Consumer Commission, Magistrate court, insurer", "purpose": "..."}],
  "mitigationAndLegalSteps": [{"stepNumber": 1, "title": "...", "description": "...", "legalRationale": "section / principle", "recommendedDocumentOrActivity": "..."}],
  "rightsAndProtections": ["rights the user has in this situation, e.g. anticipatory bail, right to legal aid, right to a copy of the FIR"],
  "whatNotToDo": ["..."],
  "outOfCourtSettlementGuide": {"isSettlementRecommended": true, "negotiationStrategy": "...", "recommendedDamagesFormula": "...", "keyTermsToIncludeInAgreement": ["..."], "sampleAgreementTemplate": "a short usable draft only if settlement is recommended, else empty"},
  "stepByStepTimeline": [{"stage": "...", "estimatedTime": "...", "whatToExpect": "...", "howToRespond": "..."}],
  "questionsToClarify": ["3-5 facts not given that could change this advice"],
  "lawyerToConsult": "which kind of lawyer to consult and how urgently"
}`;
}

/** Builds the plan; falls back to a generic template when the AI service is unavailable. */
export async function predictFutureCaseStrategy(input: StrategyRequestInput): Promise<FutureCaseStrategy> {
  const client = getAiClient();
  if (!client) {
    return { ...generateFallbackFutureStrategy(input), isFallback: true };
  }

  const judgments = await researchJudgments(input);
  try {
    const response = await generateContentWithFallback(client, {
      contents: buildStrategyPrompt(input, judgments),
      config: { responseMimeType: 'application/json', temperature: 0.2 }
    });
    const text = response.text || '';
    const parsed = JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] || text);
    return { ...normalizeStrategy(parsed), relevantJudgments: judgments };
  } catch (err: any) {
    console.log(`[FUTURE_STRATEGY] Using fallback strategy generator. (Reason: ${err?.message || err})`);
    return { ...generateFallbackFutureStrategy(input), relevantJudgments: judgments, isFallback: true };
  }
}

/** Answers a follow-up question about a generated plan. */
export async function answerStrategyQuestion(
  input: StrategyRequestInput,
  strategy: Partial<FutureCaseStrategy>,
  history: { role: 'user' | 'advisor'; text: string }[],
  question: string
): Promise<string> {
  const client = getAiClient();
  if (!client) {
    return 'The AI advisor is not available right now. Please consult a lawyer about this question, using the plan above as your starting point.';
  }

  const plan = [
    `Summary: ${strategy.incidentSummary || ''}`,
    `Risk: ${strategy.overallRiskLevel || ''} (${strategy.riskScore ?? ''}/100)`,
    `Sections: ${(strategy.potentialLegalCharges || []).map(c => c.actOrSection).join('; ')}`,
    `Likely outcome: ${strategy.predictedCaseOutcome?.likelyVerdictSummary || ''}`,
    `Deadlines: ${(strategy.keyDeadlines || []).map(d => `${d.deadline} — ${d.action}`).join('; ')}`,
    `Settlement recommended: ${strategy.outOfCourtSettlementGuide?.isSettlementRecommended ? 'yes' : 'no'}`
  ].join('\n');
  const conversation = history.slice(-8).map(m => `${m.role === 'user' ? 'User' : 'Advisor'}: ${m.text}`).join('\n');

  const response = await generateContentWithFallback(client, {
    contents: `You are a senior Indian advocate answering a follow-up question about a person's legal situation and the plan already prepared for them. Today is ${new Date().toISOString().slice(0, 10)}.

SITUATION
${describeIncident(input)}

APPLICABLE LAW
${lawRegimeNote(input)}

PLAN ALREADY GIVEN
${plan}

CONVERSATION SO FAR
${conversation || '(none)'}

QUESTION
${question}

Answer directly in 2-4 short paragraphs or a short numbered list: the legal position (cite sections accurately), what the person should do, and any deadline or risk. Use plain English and **bold** for the key point. Never advise anything unlawful or evasive. Do not invent case names. If the answer depends on facts you do not have, say which facts. Say when they need a lawyer for this specific point.`,
    config: { temperature: 0.3 }
  });
  return (response.text || '').trim() || 'I could not form an answer to that. Please rephrase the question.';
}

function generateFallbackFutureStrategy(input: StrategyRequestInput): FutureCaseStrategy {
  const type = (input.incidentType || "").toLowerCase();
  const details = input.incidentDetails || "";

  const isAccident = type.includes("accident") || type.includes("collision") || details.toLowerCase().includes("accident") || details.toLowerCase().includes("car") || details.toLowerCase().includes("vehicle") || details.toLowerCase().includes("hit");
  const isFinancial = type.includes("financial") || type.includes("cheque") || type.includes("debt") || details.toLowerCase().includes("money") || details.toLowerCase().includes("cheque") || details.toLowerCase().includes("payment");

  if (isAccident) {
    return {
      incidentSummary: `The incident involves a motor vehicle collision / accident resulting in property damage and/or personal injury. Based on your account, the primary legal risks center on potential police intimation under Motor Vehicles Act provisions (e.g. Sec 134 duty of driver) and penal code provisions governing rash driving or causing hurt. Prompt legal action, early insurance intimation, and a structured out-of-court damage settlement can mitigate or completely quash criminal liability.`,
      overallRiskLevel: 'Medium',
      riskScore: 58,
      potentialLegalCharges: [
        {
          actOrSection: "Motor Vehicles Act, 1988 - Section 134 & 187",
          description: "Duty of driver in case of accident and injury to a person (failure to secure medical attention or inform police within 24 hours).",
          bailable: true,
          bailableText: "Bailable Offense - Police station bail applies",
          penaltyOrSentence: "Fine up to ₹5,000 and/or imprisonment up to 3 months for first offense."
        },
        {
          actOrSection: "Bhartiya Nyaya Sanhita (BNS) Sec 281 / IPC Sec 279",
          description: "Rash driving or riding on a public way in a manner endangering human life.",
          bailable: true,
          bailableText: "Bailable & Compounding possible with leave of court",
          penaltyOrSentence: "Imprisonment up to 6 months, or fine up to ₹1,000, or both."
        },
        {
          actOrSection: "BNS Sec 125 / IPC Sec 337 & 338",
          description: "Causing hurt or grievous hurt by act endangering life or personal safety of others.",
          bailable: true,
          bailableText: "Bailable - Compoundable with court permission",
          penaltyOrSentence: "Fine up to ₹10,000 and/or imprisonment up to 2 years depending on severity."
        }
      ],
      predictedCaseOutcome: {
        probabilityCriminalTrial: 15,
        probabilityOutofCourtSettlement: 75,
        probabilityCivilFineOnly: 10,
        likelyVerdictSummary: "High probability of complete out-of-court settlement via execution of a formal Compromise Deed / No Objection Certificate (NOC) signed by the injured party. Courts and police routinely drop rash driving charges when full medical expenses and property repair charges are reimbursed and documented."
      },
      immediateActionPlan: [
        {
          timeframe: "Immediate (0 - 24 Hours)",
          title: "Police Intimation & Evidence Preservation",
          actions: [
            "Visit the local police station having jurisdiction over the accident site and submit a simple written intimation detailing your version of the event, confirming you offered help and exchanged contact details.",
            "Take high-resolution photos and video of vehicle damage, road conditions, skid marks, and weather at the incident spot.",
            "Inform your motor insurance provider immediately to open a Third-Party Property Damage (TPPD) claim docket."
          ]
        },
        {
          timeframe: "Short Term (1 - 7 Days)",
          title: "Out-of-Court Outreach & Damage Assessment",
          actions: [
            "Reach out to the affected party or their legal representative politely to express willingness to resolve third-party repairs or medical bills fairly.",
            "Request official copies of medical discharge summaries, doctor prescriptions, and authorized vehicle repair estimate bills.",
            "Prepare a written Draft Compromise Deed (NOC) specifying full and final payment in exchange for withdrawing/refraining from filing FIRs."
          ]
        }
      ],
      mitigationAndLegalSteps: [
        {
          stepNumber: 1,
          title: "Formal Intimation Letter to Local Police Station",
          description: "Submit a formal written letter to the station house officer (SHO) stating the facts, date, time, and your contact details. This prevents the police from classifying the incident as a 'Hit & Run' or non-cooperative evasion.",
          legalRationale: "Demonstrates absence of criminal intent and complies with statutory duty under MV Act Section 134.",
          recommendedDocumentOrActivity: "Written Police Intimation Receipt (Stamped copy)"
        },
        {
          stepNumber: 2,
          title: "Execute Mutual Out-of-Court Settlement Deed (NOC)",
          description: "Pay the agreed medical/repair charges directly to the hospital or authorized garage via bank transfer (digital record). Have the injured/damaged party sign an unconditional Release & Indemnity Deed.",
          legalRationale: "Under Section 320 CrPC / BNS compounding guidelines, a signed settlement deed allows the police or Magistrate to close the case without trial.",
          recommendedDocumentOrActivity: "Stamped Compromise Memo & Receipt of Full Payment"
        },
        {
          stepNumber: 3,
          title: "Notify Insurance Third-Party Claim Desk",
          description: "Lodge a Third-Party Liability claim with your motor insurance company to cover any formal Motor Accident Claims Tribunal (MACT) notice that might be served later.",
          legalRationale: "Shifts financial liability for third-party bodily injury or property damage onto the insurance underwriter.",
          recommendedDocumentOrActivity: "Insurance Claim Intimation Number & Surveyor Report"
        }
      ],
      whatNotToDo: [
        "DO NOT flee the scene or go into hiding — under new penal statutes, fleeing without reporting can elevate charges to severe non-bailable offences.",
        "DO NOT make informal verbal promises or pay cash without getting a signed, written receipt or compromise deed.",
        "DO NOT admit criminal guilt or sign blank papers presented by aggressive third parties or middlemen.",
        "DO NOT delay notifying your insurance company beyond 48 hours, as delayed notice can void third-party policy coverage."
      ],
      outOfCourtSettlementGuide: {
        isSettlementRecommended: true,
        negotiationStrategy: "Approach the conversation with empathy and calm composure. State clearly: 'I want to ensure you receive complete medical care and repair for your vehicle, and I am ready to cover these costs directly so both of us can avoid long court delays.' Keep all payments strictly via bank transfers/UPI for audit verification.",
        recommendedDamagesFormula: "Actual Hospital/Doctor Bills + Genuine Vehicle Authorized Garage Repair Estimate + 10% Goodwill Medical Stipend",
        keyTermsToIncludeInAgreement: [
          "Full and final monetary settlement received with zero remaining balance",
          "Unconditional waiver of right to file police FIR, criminal complaint, or MACT claim",
          "Declaration that the incident was an unavoidable accident without malicious criminal intent",
          "Indemnity clause protecting first party against any future claims by third-party relatives"
        ],
        sampleAgreementTemplate: `MEMORANDUM OF COMPROMISE & OUT-OF-COURT SETTLEMENT

This Memorandum of Compromise is executed on this _____ day of ____________, 2026 at ____________ by and between:

FIRST PARTY (Driver/Vehicle Owner): _________________________, R/o _________________________________
AND
SECOND PARTY (Affected/Injured Party): _________________________, R/o _________________________________

WHEREAS on Date: ___________ at Time: __________, an accidental vehicle collision occurred at Location: _______________________ involving Vehicle No: ________________.

WHEREAS the First Party has voluntarily offered and paid an aggregate sum of ₹___________ (Rupees ___________________________________) via Bank Transfer Ref No: _____________________ towards full medical treatment and vehicle repair charges of the Second Party.

NOW THIS DEED WITNESSETH AS FOLLOWS:
1. The Second Party acknowledges receipt of the full payment and declares that all medical and property damage claims stand fully and finally satisfied.
2. The Second Party undertakes not to file or pursue any FIR, police complaint, civil suit, or MACT claim against the First Party arising out of the said incident.
3. Both parties agree that this settlement is entered into freely without coercion, threat, or undue influence.

IN WITNESS WHEREOF, the parties have signed this Deed in the presence of witnesses.

First Party: ___________________        Second Party: ___________________
Witness 1: _____________________        Witness 2: ______________________`
      },
      stepByStepTimeline: [
        {
          stage: "Stage 1: Immediate Police Intimation & Hospital Notice",
          estimatedTime: "Hours 0 - 24",
          whatToExpect: "Police officer or medical officer may record a preliminary statement if hospital treatment was sought.",
          howToRespond: "Provide honest facts, driver license copy, vehicle RC, and insurance details. State that you are cooperating fully and arranging settlement."
        },
        {
          stage: "Stage 2: Out-of-Court Negotiation & Compromise Signing",
          estimatedTime: "Days 2 - 7",
          whatToExpect: "Direct discussion with affected party to verify bills and execute the Compromise Deed.",
          howToRespond: "Transfer funds digitally against the signed Compromise Memorandum witnessed by two neutral individuals."
        },
        {
          stage: "Stage 3: Submission of Compromise to Police / Court Discharge",
          estimatedTime: "Weeks 1 - 3",
          whatToExpect: "Police SHO reviews the signed Compromise Deed and cancels/closes the preliminary inquiry diary.",
          howToRespond: "Obtain official Police Station closure report / A-Summary / Compromise Acceptance Certificate."
        }
      ]
    };
  }

  if (isFinancial) {
    return {
      incidentSummary: `The situation involves a financial disagreement, cheque bounce notice, or unpaid debt/contractual demand. Primary legal exposure includes Section 138 of the Negotiable Instruments Act or Civil Recovery Suits. Immediate response to legal notices, structured payment restructuring, and a compounding deed can resolve the matter legally without court trial.`,
      overallRiskLevel: 'Medium',
      riskScore: 52,
      potentialLegalCharges: [
        {
          actOrSection: "Negotiable Instruments Act, 1881 - Section 138",
          description: "Dishonour of cheque for insufficiency of funds or exceeding arrangements.",
          bailable: true,
          bailableText: "Bailable Offense - Compoundable under Section 147",
          penaltyOrSentence: "Imprisonment up to 2 years, or fine up to twice the amount of cheque, or both."
        },
        {
          actOrSection: "Civil Recovery Suit (Order 37 CPC / Summary Suit)",
          description: "Summary civil suit for recovery of liquidated debt based on written contract or cheque.",
          bailable: true,
          bailableText: "Civil Matter - Monetary Decree Risk",
          penaltyOrSentence: "Court decree for full principal + interest @ 9-18% per annum."
        }
      ],
      predictedCaseOutcome: {
        probabilityCriminalTrial: 20,
        probabilityOutofCourtSettlement: 70,
        probabilityCivilFineOnly: 10,
        likelyVerdictSummary: "High probability of complete out-of-court resolution. Section 147 of NI Act explicitly encourages compounding at any stage before final judgment upon settlement of principal debt."
      },
      immediateActionPlan: [
        {
          timeframe: "Immediate (0 - 15 Days from Notice)",
          title: "Formal Legal Reply & Settlement Offer",
          actions: [
            "Send a formal written Reply to the statutory Legal Notice within the mandatory 15-day window through an advocate.",
            "Propose a realistic, structured installment plan or lump-sum settlement offer.",
            "Gather bank statements and communication records showing genuine financial hardship or disputed invoice items."
          ]
        }
      ],
      mitigationAndLegalSteps: [
        {
          stepNumber: 1,
          title: "Dispatch Formal Advocate Reply to Notice",
          description: "Never ignore a statutory legal notice. Send an advocate's reply stating valid grounds (e.g. security cheque, disputed goods/services, or proposal for structured payment).",
          legalRationale: "Prevents ex-parte criminal complaint filing and establishes bona fide intention to resolve debt.",
          recommendedDocumentOrActivity: "Advocate Reply Notice with Speed Post Postal Proof"
        },
        {
          stepNumber: 2,
          title: "Execute Debt Restructuring & Compromise Deed",
          description: "Sign a formal Settlement Agreement specifying revised installment dates. Upon payment of final installment, retrieve the original cheque/document.",
          legalRationale: "Section 147 NI Act allows complete compounding and discharge of court proceedings upon filing the joint compromise deed.",
          recommendedDocumentOrActivity: "Compounding Deed & Cheque Return Receipt"
        }
      ],
      whatNotToDo: [
        "DO NOT ignore statutory legal notices delivered by registered post or email.",
        "DO NOT issue fresh cheques if bank account funds are currently insufficient.",
        "DO NOT pay cash without obtaining a stamped, signed receipt mentioning cheque reference numbers."
      ],
      outOfCourtSettlementGuide: {
        isSettlementRecommended: true,
        negotiationStrategy: "Communicate proactively: 'I acknowledge the financial commitment and want to settle this completely. I request a 3-month structured installment plan with 30% upfront payment today.'",
        recommendedDamagesFormula: "Principal Cheque Amount + 6% Annual Interest for Delay Period + Actual Legal Notice Overhead",
        keyTermsToIncludeInAgreement: [
          "Acknowledgment of revised payment schedule",
          "Covenant by creditor to withdraw court complaint upon realization of funds",
          "Return of original dishonoured cheques and security instruments"
        ],
        sampleAgreementTemplate: `DEED OF FINANCIAL SETTLEMENT & DEBT COMPOUNDING

This Deed is made on ____________ at ____________ between:
CREDITOR: __________________________________________________
DEBTOR: ____________________________________________________

WHEREAS the Debtor owes a sum of ₹___________ against Cheque No: ____________.

NOW IT IS AGREED:
1. Debtor shall pay the sum of ₹___________ in ___ installments as per schedule.
2. Upon receipt of full payment, Creditor shall withdraw all NI Act Sec 138 complaints and return all original documents.

Creditor: ___________________          Debtor: ___________________`
      },
      stepByStepTimeline: [
        {
          stage: "Stage 1: Statutory 15-Day Reply Window",
          estimatedTime: "Days 1 - 15",
          whatToExpect: "Statutory notice period following cheque return memo.",
          howToRespond: "Dispatch formal legal reply and offer structured settlement terms."
        },
        {
          stage: "Stage 2: Lok Adalat / Pre-Litigation Mediation",
          estimatedTime: "Weeks 2 - 4",
          whatToExpect: "Appearance before Lok Adalat or Mediation Center.",
          howToRespond: "Submit signed compounding terms for judicial recording."
        }
      ]
    };
  }

  // General default fallback strategy for any civil/criminal incident
  return {
    incidentSummary: `The situation described involves potential legal exposure or impending litigation under civil/criminal statutes. Based on your explanation, establishing early legal communication, preserving evidence, and exploring pre-litigation compounding or out-of-court settlement will minimize risk and avoid prolonged court trials.`,
    overallRiskLevel: 'Medium',
    riskScore: 50,
    potentialLegalCharges: [
      {
        actOrSection: "Civil Dispute & Statutory Breach Notice",
        description: "Potential civil damages, injunction petition, or regulatory breach notice.",
        bailable: true,
        bailableText: "Civil Matter / Bailable Proceedings",
        penaltyOrSentence: "Monetary compensation or compliance injunction order."
      }
    ],
    immediateActionPlan: [
      {
        timeframe: "Immediate (0 - 48 Hours)",
        title: "Document Preservation & Legal Consultation",
        actions: [
          "Compile all relevant messages, photos, financial transactions, and written notes into a secure legal folder.",
          "Avoid making informal public posts, social media comments, or unrecorded verbal admissions.",
          "Consult legal counsel to draft a formal response or proactive statement."
        ]
      }
    ],
    predictedCaseOutcome: {
      probabilityCriminalTrial: 10,
      probabilityOutofCourtSettlement: 80,
      probabilityCivilFineOnly: 10,
      likelyVerdictSummary: "High probability of amicable resolution through pre-litigation legal notice reply and structured out-of-court compromise deed."
    },
    mitigationAndLegalSteps: [
      {
        stepNumber: 1,
        title: "Draft Proactive Intimation or Reply Notice",
        description: "Respond formally to any notice received or file a proactive statement with relevant local authorities.",
        legalRationale: "Demonstrates good faith, transparency, and compliance with statutory procedures.",
        recommendedDocumentOrActivity: "Formal Legal Notice / Intimation Letter"
      },
      {
        stepNumber: 2,
        title: "Execute Mutual Out-of-Court Settlement",
        description: "Draft an agreement specifying terms of resolution, liability waiver, and mutual release of claims.",
        legalRationale: "Prevents initiation of formal litigation and binds parties legally.",
        recommendedDocumentOrActivity: "Mutual Settlement Deed & Release Form"
      }
    ],
    whatNotToDo: [
      "DO NOT ignore formal legal communications or notices.",
      "DO NOT destroy, alter, or hide relevant evidence or communication logs.",
      "DO NOT make informal unrecorded cash payments without obtaining written receipts."
    ],
    outOfCourtSettlementGuide: {
      isSettlementRecommended: true,
      negotiationStrategy: "Maintain a calm, professional approach focused on mutual resolution and clear documentation.",
      recommendedDamagesFormula: "Direct Actual Expenses / Losses + Reasonable Administrative Overhead",
      keyTermsToIncludeInAgreement: [
        "Full and final settlement declaration",
        "Waiver of right to file future legal proceedings",
        "Confidentiality and non-disparagement clause"
      ],
      sampleAgreementTemplate: "MEMORANDUM OF MUTUAL SETTLEMENT & WAIVER OF CLAIMS..."
    },
    stepByStepTimeline: [
      {
        stage: "Stage 1: Initial Response & Evidence Audit",
        estimatedTime: "Days 1 - 7",
        whatToExpect: "Exchange of formal notices or preliminary inquiry.",
        howToRespond: "Submit formal legal reply and initiate settlement dialogue."
      },
      {
        stage: "Stage 2: Mediation & Final Settlement",
        estimatedTime: "Weeks 2 - 4",
        whatToExpect: "Execution of settlement terms and document return.",
        howToRespond: "Sign mutual compromise deed and obtain formal discharge receipt."
      }
    ]
  };
}
