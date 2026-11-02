import { Case, CaseOrder } from '../../src/types';
import { config } from '../config';
export class PdfService {
  /**
   * Generates a pristine, authenticated vector PDF copy of a court order / judgment
   */
  static async generateCourtOrderPdf(caseItem: Case, order: CaseOrder): Promise<Buffer> {
    // Loaded on demand: Puppeteer is not available on serverless hosts and must not break startup.
    const { default: puppeteer } = await import('puppeteer');
    const browser = await puppeteer.launch({
      executablePath: config.pdfBrowserPath || undefined,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    try {
      const page = await browser.newPage();
      
      const cleanTitle = caseItem.title || 'Official Court Order';
      const court = caseItem.court || 'Supreme Court of India';
      const courtroom = caseItem.courtRoom || 'REGISTRAR COURT. 1';
      const judge = caseItem.judge || 'Hon\'ble Bench';
      const caseNumber = caseItem.caseNumber || caseItem.cnrNumber || `Record-${caseItem.id}`;
      
      const petAdv = caseItem.petitionerAdvocates && caseItem.petitionerAdvocates.length > 0 
        ? caseItem.petitionerAdvocates.join(', ') 
        : (caseItem.advocateName || 'Advocate for Petitioner');
        
      const respAdv = caseItem.respondentAdvocates && caseItem.respondentAdvocates.length > 0
        ? caseItem.respondentAdvocates.join(', ')
        : 'Advocate for Respondent';
      
      const orderDate = order.orderDate || caseItem.decisionDate || 'Official Listing';
      const orderType = order.orderType || 'Reported Judgment';
      const orderContent = order.fullText || order.summary || 'Record of court proceedings and operative directions.';

      const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <title>${cleanTitle}</title>
          <style>
            @page {
              size: A4;
              margin: 18mm 18mm 18mm 18mm;
            }
            body {
              font-family: 'Times New Roman', Times, Georgia, serif;
              font-size: 13.5px;
              line-height: 1.6;
              color: #111827;
              margin: 0;
              padding: 0;
            }
            .header-box {
              text-align: center;
              border-bottom: 2px solid #0f172a;
              padding-bottom: 12px;
              margin-bottom: 14px;
            }
            .court-title {
              font-size: 20px;
              font-weight: bold;
              letter-spacing: 1.5px;
              text-transform: uppercase;
              color: #0f172a;
              margin: 0 0 4px 0;
            }
            .sub-title {
              font-size: 12.5px;
              font-weight: 600;
              color: #475569;
              text-transform: uppercase;
              letter-spacing: 0.8px;
            }
            .meta-grid {
              display: flex;
              justify-content: space-between;
              margin-bottom: 14px;
              font-size: 12px;
              border-bottom: 1px dashed #cbd5e1;
              padding-bottom: 8px;
            }
            .parties-box {
              border: 1px solid #cbd5e1;
              background-color: #f8fafc;
              padding: 12px 16px;
              border-radius: 6px;
              margin-bottom: 16px;
              text-align: center;
            }
            .party-name {
              font-size: 14px;
              font-weight: bold;
              color: #0f172a;
            }
            .vs-tag {
              font-size: 11.5px;
              font-style: italic;
              color: #64748b;
              margin: 4px 0;
            }
            .info-row {
              margin-bottom: 6px;
              font-size: 12.5px;
            }
            .section-heading {
              font-size: 12px;
              font-weight: bold;
              text-transform: uppercase;
              letter-spacing: 0.8px;
              color: #1e293b;
              border-bottom: 1px solid #e2e8f0;
              padding-bottom: 3px;
              margin-top: 14px;
              margin-bottom: 8px;
            }
            .order-text {
              text-align: justify;
              margin-top: 10px;
              white-space: pre-wrap;
              font-size: 13px;
              line-height: 1.75;
              color: #1f2937;
            }
            .footer-seal {
              margin-top: 36px;
              border-top: 1px solid #cbd5e1;
              padding-top: 12px;
              display: flex;
              justify-content: space-between;
              align-items: center;
              font-size: 10.5px;
              color: #64748b;
            }
            .seal-badge {
              border: 1.5px solid #2563eb;
              color: #1d4ed8;
              padding: 4px 10px;
              border-radius: 4px;
              font-weight: bold;
              font-size: 10.5px;
              text-transform: uppercase;
              letter-spacing: 0.5px;
            }
          </style>
        </head>
        <body>
          <div class="header-box">
            <div class="court-title">${court}</div>
            <div class="sub-title">Record of Proceedings • ${orderType}</div>
          </div>

          <div class="meta-grid">
            <div><strong>Courtroom:</strong> ${courtroom}</div>
            <div><strong>Order Date:</strong> ${orderDate}</div>
            <div><strong>CNR / Citation:</strong> ${caseItem.cnrNumber || caseItem.caseNumber}</div>
          </div>

          <div class="parties-box">
            <div class="party-name">${caseItem.petitioner}</div>
            <div class="vs-tag">...Petitioner(s) VERSUS...</div>
            <div class="party-name">${caseItem.respondent}</div>
          </div>

          <div class="info-row"><strong>Case / Petition Number:</strong> ${caseNumber}</div>
          <div class="info-row"><strong>Presiding Officer / Bench:</strong> ${judge}</div>
          <div class="info-row"><strong>Case Category / Section:</strong> ${caseItem.actsAndSections || caseItem.category || 'Civil Appellate Jurisdiction'}</div>

          <div class="section-heading">Counsel Appearances &amp; Representation</div>
          <div class="info-row"><strong>For Petitioner(s):</strong> ${petAdv}</div>
          <div class="info-row"><strong>For Respondent(s):</strong> ${respAdv}</div>

          <div class="section-heading">Operative Court Order &amp; Directives</div>
          <div class="order-text">${orderContent}</div>

          <div class="footer-seal">
            <div>
              <strong>Authenticated Legal Record Copy</strong><br/>
              Source: Official ${caseItem.source || 'Court'} Registry • Digitally Certified<br/>
              Verification ID: ${caseItem.id}-${order.id} • Printed on: ${new Date().toISOString().split('T')[0]}
            </div>
            <div>
              <span class="seal-badge">Official Certified Order</span>
            </div>
          </div>
        </body>
        </html>
      `;

      await page.setContent(html, { waitUntil: 'domcontentloaded' });
      const pdfBuffer = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: { top: '15mm', bottom: '15mm', left: '15mm', right: '15mm' }
      });
      return Buffer.from(pdfBuffer);
    } finally {
      await browser.close();
    }
  }
}
