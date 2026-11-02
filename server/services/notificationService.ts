/**
 * Case notification emails: who receives them and the HTML detail blocks they carry.
 */
import { Case, CourtDocument, EmailLog, Hearing } from '../../src/types';
import { db } from '../db/database';
import { sendEmailNotification } from './emailService';
import { escapeHtml } from '../utils/html';

interface CaseEmail {
  subject: string;
  title: string;
  /** Sentence addressed to the reader, starting with a capital, e.g. "Your attorney has ..." */
  body: string;
  detailsHtml: string;
  type: EmailLog['type'];
}

function lowerFirst(text: string): string {
  return text.charAt(0).toLowerCase() + text.slice(1);
}

/**
 * Emails every user tracking the case. If nobody tracks it, the notice is
 * addressed to the petitioner and delivered to the default alert recipient.
 */
export async function notifyCaseFollowers(c: Case, email: CaseEmail): Promise<EmailLog[]> {
  const common = {
    subject: email.subject,
    title: email.title,
    caseNumber: c.caseNumber,
    caseTitle: c.title,
    detailsHtml: email.detailsHtml,
    type: email.type
  };

  const trackingUsers = db.getTrackingUsersForCase(c.id);
  if (trackingUsers.length === 0) {
    const recipientName = c.petitioner.split(' ')[0] || "Client";
    return [await sendEmailNotification({ ...common, recipientName, bodyText: email.body })];
  }

  const logs: EmailLog[] = [];
  for (const user of trackingUsers) {
    logs.push(await sendEmailNotification({
      ...common,
      recipientName: user.name,
      recipientEmail: user.email,
      bodyText: `Dear ${user.name}, ${lowerFirst(email.body)}`
    }));
  }
  return logs;
}

// ==========================================
// Email detail templates
// ==========================================

export function attorneyUpdateDetails(title: string, status: string, description: string, updatedBy: string): string {
  return `
    <p><strong>Update Logged:</strong></p>
    <div style="background-color: #f8fafc; border: 1px solid #cbd5e1; padding: 14px; border-radius: 4px;">
      <p style="margin: 0 0 6px 0;"><strong>Event Title:</strong> ${escapeHtml(title)}</p>
      <p style="margin: 0 0 6px 0;"><strong>New Status:</strong> <span style="color: #b45309; font-weight: 600;">${escapeHtml(status)}</span></p>
      <p style="margin: 0; font-size: 12px; color: #475569;">${escapeHtml(description)}</p>
      <p style="margin: 6px 0 0 0; font-size: 11px; color: #94a3b8; text-align: right;">Attorney: ${escapeHtml(updatedBy)}</p>
    </div>
  `;
}

export function registryUpdateDetails(title: string, status: string, description: string, updatedBy: string): string {
  return `
    <p><strong>New Judicial Event Record:</strong></p>
    <div style="background-color: #f8fafc; border: 1px solid #cbd5e1; padding: 14px; border-radius: 4px;">
      <p style="margin: 0 0 6px 0;"><strong>Event:</strong> ${escapeHtml(title)}</p>
      <p style="margin: 0 0 6px 0;"><strong>New Status:</strong> <span style="color: #b45309; font-weight: 600;">${escapeHtml(status)}</span></p>
      <p style="margin: 0 0 6px 0; font-size: 12px; color: #475569;">${escapeHtml(description)}</p>
      <p style="margin: 6px 0 0 0; font-size: 11px; color: #94a3b8; text-align: right;">Updated by: ${escapeHtml(updatedBy)}</p>
    </div>
  `;
}

export function documentDetails(doc: CourtDocument): string {
  return `
    <p><strong>Document Metadata:</strong></p>
    <table style="width: 100%; border: 1px solid #cbd5e1; font-size: 12px;">
      <tr style="background-color: #f8fafc;">
        <td style="padding: 6px; font-weight: 600;">File Name:</td>
        <td style="padding: 6px;">${escapeHtml(doc.name)}</td>
      </tr>
      <tr>
        <td style="padding: 6px; font-weight: 600;">Classification:</td>
        <td style="padding: 6px; font-weight: 600;">${escapeHtml(doc.category)}</td>
      </tr>
      <tr style="background-color: #f8fafc;">
        <td style="padding: 6px; font-weight: 600;">File Size:</td>
        <td style="padding: 6px;">${escapeHtml(doc.size)}</td>
      </tr>
      <tr>
        <td style="padding: 6px; font-weight: 600;">Description:</td>
        <td style="padding: 6px;">${escapeHtml(doc.description)}</td>
      </tr>
    </table>
  `;
}

export function newHearingDetails(title: string, date: string, time: string, courtRoom: string, description?: string): string {
  return `
    <p><strong>Hearing Information:</strong></p>
    <table style="width: 100%; border: 1px solid #cbd5e1; font-size: 12px;">
      <tr style="background-color: #f8fafc;">
        <td style="padding: 6px; font-weight: 600;">Session:</td>
        <td style="padding: 6px;">${escapeHtml(title)}</td>
      </tr>
      <tr>
        <td style="padding: 6px; font-weight: 600;">Date / Time:</td>
        <td style="padding: 6px; color: #b45309; font-weight: 600;">${escapeHtml(date)} at ${escapeHtml(time)}</td>
      </tr>
      <tr style="background-color: #f8fafc;">
        <td style="padding: 6px; font-weight: 600;">Court Hall:</td>
        <td style="padding: 6px;">${escapeHtml(courtRoom)}</td>
      </tr>
      <tr>
        <td style="padding: 6px; font-weight: 600;">Description:</td>
        <td style="padding: 6px;">${escapeHtml(description || "N/A")}</td>
      </tr>
    </table>
  `;
}

export function hearingReminderDetails(hearing: Hearing, c: Case): string {
  return `
    <p><strong>Hearing details:</strong></p>
    <table style="width: 100%; border: 1px solid #e2e8f0; font-size: 13px; border-radius: 4px;">
      <tr style="background-color: #f8fafc;">
        <td style="padding: 6px 12px; font-weight: 600;">Hearing Item:</td>
        <td style="padding: 6px 12px;">${escapeHtml(hearing.title)}</td>
      </tr>
      <tr>
        <td style="padding: 6px 12px; font-weight: 600;">Date & Time:</td>
        <td style="padding: 6px 12px; color: #b45309; font-weight: 600;">${escapeHtml(hearing.date)} at ${escapeHtml(hearing.time)}</td>
      </tr>
      <tr style="background-color: #f8fafc;">
        <td style="padding: 6px 12px; font-weight: 600;">Court Room:</td>
        <td style="padding: 6px 12px;">${escapeHtml(hearing.courtRoom || "TBD")}</td>
      </tr>
      <tr>
        <td style="padding: 6px 12px; font-weight: 600;">Presiding Bench:</td>
        <td style="padding: 6px 12px;">${escapeHtml(c.judge)}</td>
      </tr>
      <tr style="background-color: #f8fafc;">
        <td style="padding: 6px 12px; font-weight: 600;">Instructions:</td>
        <td style="padding: 6px 12px; font-style: italic;">${escapeHtml(hearing.description)}</td>
      </tr>
    </table>
  `;
}
