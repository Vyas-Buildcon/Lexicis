import nodemailer from 'nodemailer';
import { db } from '../db/database';
import { EmailLog } from '../../src/types';
import { config } from '../config';
import { escapeHtml } from '../utils/html';

// Helper to check if SMTP credentials are fully configured in the environment
function isSmtpConfigured(): boolean {
  return Boolean(config.smtp.host && config.smtp.user);
}

// Lazily obtain nodemailer transporter if configured
function getTransporter() {
  if (!isSmtpConfigured()) {
    return null;
  }
  const port = config.smtp.port;
  const secure = port === 465;

  return nodemailer.createTransport({
    host: config.smtp.host,
    port,
    secure,
    auth: {
      user: config.smtp.user,
      pass: config.smtp.pass,
    },
    connectionTimeout: 6000,
    greetingTimeout: 6000,
    socketTimeout: 10000,
  });
}

/**
 * Handles sending alerts and hearing scheduler emails.
 */
export async function sendEmailNotification(params: {
  recipientName: string;
  recipientEmail?: string;
  subject: string;
  title: string;
  caseNumber: string;
  caseTitle: string;
  bodyText: string;
  detailsHtml: string;
  type: 'alert' | 'hearing' | 'system';
}) {
  const targetEmail = params.recipientEmail || config.alertEmailRecipient;
  const timestamp = new Date().toISOString();
  const logId = `email-${Math.random().toString(36).substr(2, 9)}`;

  const contentHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: 'Inter', Arial, sans-serif; background-color: #f8fafc; color: #1e293b; padding: 20px; margin: 0; }
        .container { max-width: 600px; margin: 0 auto; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); }
        .header { background-color: #0f172a; color: #ffffff; padding: 24px; text-align: center; border-bottom: 3px solid #b45309; }
        .header h1 { margin: 0; font-size: 20px; tracking: tight; text-transform: uppercase; letter-spacing: 0.05em; font-weight: 600; }
        .header p { margin: 4px 0 0; font-size: 12px; color: #94a3b8; }
        .content { padding: 24px; line-height: 1.6; }
        .greeting { font-size: 16px; font-weight: 500; color: #0f172a; margin-bottom: 12px; }
        .case-pill { display: inline-block; background-color: #fef3c7; color: #b45309; padding: 4px 10px; border-radius: 4px; font-size: 12px; font-weight: 600; margin-bottom: 16px; border: 1px solid #fcd34d; }
        .info-table { width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 13px; }
        .info-table td { padding: 10px 12px; border-bottom: 1px solid #f1f5f9; }
        .info-table td.label { font-weight: 600; color: #475569; width: 30%; }
        .info-table td.value { color: #0f172a; }
        .action-box { background-color: #f8fafc; border-left: 4px solid #0f172a; padding: 16px; margin: 20px 0; border-radius: 0 4px 4px 0; }
        .footer { background-color: #f1f5f9; padding: 16px; text-align: center; font-size: 11px; color: #64748b; border-top: 1px solid #e2e8f0; }
        .disclaimer { font-size: 10px; color: #94a3b8; margin-top: 12px; line-height: 1.4; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>E-COURT CASE UPDATE SYSTEM</h1>
          <p>Real-Time Judicial Alert Service</p>
        </div>
        <div class="content">
          <div class="greeting">Dear ${escapeHtml(params.recipientName)},</div>
          <p>${escapeHtml(params.bodyText)}</p>

          <div class="case-pill">Case ID: ${escapeHtml(params.caseNumber)}</div>

          <table class="info-table">
            <tr>
              <td class="label">Case Name:</td>
              <td class="value"><strong>${escapeHtml(params.caseTitle)}</strong></td>
            </tr>
            <tr>
              <td class="label">Case Number:</td>
              <td class="value">${escapeHtml(params.caseNumber)}</td>
            </tr>
            <tr>
              <td class="label">Recipient:</td>
              <td class="value">${escapeHtml(targetEmail)}</td>
            </tr>
            <tr>
              <td class="label">Timestamp:</td>
              <td class="value">${new Date(timestamp).toLocaleString()}</td>
            </tr>
          </table>

          <div class="action-box">
            <h4 style="margin: 0 0 8px 0; color: #0f172a; font-size: 14px;">Updates & Required Actions</h4>
            ${params.detailsHtml}
          </div>

          <p style="font-size: 13px; color: #475569;">Please log in to your Case Tracker & AI Insights Dashboard to view associated court documents, review your legal analysis, and read custom suggestions on how to recover from this stage.</p>
        </div>
        <div class="footer">
          <p>This is an automated notification from the Case Tracker & AI Insights System.</p>
        </div>
      </div>
    </body>
    </html>
  `;

  const newLog: EmailLog = {
    id: logId,
    recipient: targetEmail,
    subject: params.subject,
    contentHtml,
    timestamp,
    type: params.type
  };

  // Persist to local JSON DB
  db.addEmailLog(newLog);

  // Send real email if SMTP is configured
  const transporter = getTransporter();
  if (transporter) {
    try {
      await transporter.sendMail({
        from: `"Legal Notices & Court Alert System" <${config.smtp.user}>`,
        to: targetEmail,
        subject: params.subject,
        html: contentHtml,
      });
      console.log(`[EmailService] Live email dispatched successfully to ${targetEmail}: "${params.subject}"`);
    } catch (error: any) {
      console.warn(`[EmailService] SMTP delivery attempted but failed for ${targetEmail}:`, error?.message || error);
    }
  } else {
    console.log(`[EmailService] SMTP credentials not set. Notification recorded in Email Outbox for ${targetEmail}: "${params.subject}"`);
  }

  return newLog;
}
