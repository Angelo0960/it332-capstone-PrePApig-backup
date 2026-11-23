import * as expenseController from '../controllers/expensesController.js';
import express from 'express';
import { authMiddleware } from '../middlewares/authMiddleware.js';
import { validateBody, validateBatchOwnership } from '../middlewares/validate.js';
import { generateExpenseAnalysis } from '../services/expenseAiService.js';

const expensesRouter = express.Router();
expensesRouter.use(authMiddleware);

expensesRouter.post('/create', validateBody({ required: ['expense_type', 'amount', 'expense_date'], nonNegative: ['amount'] }), expenseController.createExpense);

expensesRouter.get('/all', expenseController.getAllExpenses);

expensesRouter.get('/summary', expenseController.getExpenseSummary);

expensesRouter.post('/ai-analysis', async (req, res) => {
    try {
        const summary = req.body?.summary;
        if (!summary || !Array.isArray(summary.breakdown)) {
            return res.status(400).json({ success: false, message: 'Expense summary is required' });
        }
        const analysis = await generateExpenseAnalysis({ summary });
        res.json(analysis);
    } catch (error) {
        const safeMessage = String(error.message || 'AI provider request failed')
            .replace(/sk-(?:or-v1|proj|live)-[A-Za-z0-9_-]+/g, '[REDACTED]')
            .slice(0, 300);
        const missingKey = String(error.message || '').includes('API key is not configured');
        console.error(JSON.stringify({
            event: 'expense_ai_analysis_failed',
            requestId: req.requestId || null,
            providerStatus: error.providerStatus || null,
            providerContentType: error.providerContentType || null,
            providerEndpointHost: error.providerEndpointHost || null,
            providerEndpointPath: error.providerEndpointPath || null,
            message: safeMessage,
        }));
        res.status(missingKey ? 503 : 502).json({
            success: false,
            message: missingKey ? 'Expense AI analysis is not configured' : 'Expense AI analysis is temporarily unavailable',
        });
    }
});

expensesRouter.get('/:id', expenseController.getExpenseById);

expensesRouter.put('/:id', validateBody({ update: true, nonNegative: ['amount'] }), validateBatchOwnership, expenseController.updateExpense);

expensesRouter.delete('/:id', expenseController.deleteExpense);

export default expensesRouter;
