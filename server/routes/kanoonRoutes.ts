import { createRouter } from '../http';
import { IndianKanoonService } from '../services/indianKanoonService';

export const kanoonRoutes = createRouter();

// Indian Kanoon search: https://api.indiankanoon.org/search/?formInput=<query>&pagenum=<pagenum>
kanoonRoutes.get('/search', async (req, res) => {
  try {
    const q = (req.query.q || req.query.formInput || '').toString().trim();
    const rawPage = req.query.page || req.query.pagenum || '0';
    const page = parseInt(rawPage.toString(), 10);

    const results = await IndianKanoonService.searchCasesAsync(q, page);
    res.json(results);
  } catch (error: any) {
    console.error("Indian Kanoon search endpoint error:", error);
    res.status(500).json({ error: error.message || "Failed to search Indian Kanoon API" });
  }
});

// Indian Kanoon document: https://api.indiankanoon.org/doc/<docid>/
kanoonRoutes.get('/doc/:docId', async (req, res) => {
  try {
    const { docId } = req.params;
    const document = await IndianKanoonService.getDocument(docId);
    if (!document) {
      return res.status(404).json({ error: "Document not found or access error" });
    }
    res.json(document);
  } catch (error: any) {
    console.error("Indian Kanoon document endpoint error:", error);
    res.status(500).json({ error: error.message || "Failed to fetch Indian Kanoon document" });
  }
});
