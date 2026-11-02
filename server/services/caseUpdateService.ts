/**
 * Automated case activity: hearing reminders and simulated live registry updates.
 */
import { Case, CaseHistoryEvent, EmailLog } from '../../src/types';
import { db } from '../db/database';
import { notifyCaseFollowers, hearingReminderDetails, registryUpdateDetails } from './notificationService';

/**
 * Checks upcoming hearings and emails a reminder for each one that has not
 * been reminded yet. Runs on an interval and can be triggered from the UI.
 */
export async function runHearingReminders(): Promise<{ sentCount: number; logs: EmailLog[] }> {
  console.log(`[SCHEDULER] Running automated audit of hearings and deadlines...`);
  const upcomingHearings = db.getHearings().filter(h => h.status === 'upcoming');
  const sentLogs: EmailLog[] = [];

  for (const hearing of upcomingHearings) {
    const associatedCase = db.getCaseById(hearing.caseId);
    if (!associatedCase) continue;

    // The email log doubles as the record of reminders already sent
    const subject = `Court Hearing Reminder: ${associatedCase.caseNumber} - ${hearing.title}`;
    const alreadySent = db.getEmailLogs().some(log => log.subject === subject);
    if (alreadySent) continue;

    const logs = await notifyCaseFollowers(associatedCase, {
      subject,
      title: "Upcoming Hearing Notice & Legal Deadline",
      body: `This is an automated judicial schedule alert. An upcoming court hearing has been listed for your tracked case: "${associatedCase.title}". Please ensure all legal files are compiled before the deadline.`,
      detailsHtml: hearingReminderDetails(hearing, associatedCase),
      type: 'hearing'
    });
    sentLogs.push(...logs);
  }

  return {
    sentCount: sentLogs.length,
    logs: sentLogs
  };
}

const SIMULATED_REGISTRY_UPDATES = [
  {
    status: "Pending - Counter Affidavit Filed",
    title: "Counter Affidavit Submitted",
    desc: "Respondent submitted a comprehensive reply detailing objections to the interim injunction appeal."
  },
  {
    status: "Pending - Adjourned",
    title: "Hearing Adjourned due to Non-Availability of Bench",
    desc: "Case adjourned. Next date will be specified by the registrar in the daily listing sheet."
  },
  {
    status: "Pending - Under Review",
    title: "Written Clarifications Sought",
    desc: "The Hon'ble Justice requested certified copies of the physical land title and tax ledger reports."
  },
  {
    status: "Decided - Order Reserved",
    title: "Final Arguments Completed - Order Reserved",
    desc: "Both petitioner and respondent finished final oral arguments. The court has reserved the final verdict."
  }
];

/**
 * Simulates a real-time status change arriving from the court registry,
 * records it in the case history and notifies followers.
 */
export async function simulateRegistryUpdate(caseId: string, authorName: string): Promise<Case | null> {
  const item = db.getCaseById(caseId);
  if (!item) return null;

  const chosenUpdate = SIMULATED_REGISTRY_UPDATES[Math.floor(Math.random() * SIMULATED_REGISTRY_UPDATES.length)];

  const newEvent: CaseHistoryEvent = {
    id: `h-rand-${Math.random().toString(36).substr(2, 9)}`,
    date: new Date().toISOString(),
    title: chosenUpdate.title,
    description: chosenUpdate.desc,
    status: chosenUpdate.status,
    updatedBy: authorName
  };

  const updatedCase: Case = {
    ...item,
    currentStatus: chosenUpdate.status,
    lastUpdated: new Date().toISOString(),
    history: [newEvent, ...item.history]
  };

  db.updateCase(updatedCase);

  await notifyCaseFollowers(updatedCase, {
    subject: `CRITICAL CASE UPDATE: ${updatedCase.caseNumber} - ${chosenUpdate.title}`,
    title: "Real-time Court Update Received",
    body: `We detected a real-time change in your case tracking dashboard via the E-Court API registry. The status of your tracked case has been modified.`,
    detailsHtml: registryUpdateDetails(chosenUpdate.title, chosenUpdate.status, chosenUpdate.desc, authorName),
    type: 'alert'
  });

  return updatedCase;
}
