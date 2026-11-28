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
        const analysis = await generateExpenseAnalysis({
            summary,
            ownerId: req.user.id,
            cacheScope: String(req.body?.cache_scope || 'expense-summary').slice(0, 160),
        });
        res.json(analysis);
    } catch (error) {
        const missingKey = String(error.message || '').includes('API key is not configured');
        const category = error.category || (missingKey ? 'not_configured' : 'provider_error');
        const status = ({ quota_rpm: 429, quota_daily: 429, quota_unknown: 429, authentication: 401, permission: 403, budget_unavailable: 503, not_configured: 503 })[category] || 502;
        console.error(JSON.stringify({
            event: 'expense_ai_analysis_failed',
            requestId: req.requestId || null,
            category,
            providerStatus: error.providerStatus || null,
            model: error.model || null,
        }));
        res.status(status).json({
            success: false,
            message: error.category ? error.message : missingKey ? 'Expense AI analysis is not configured' : 'Expense AI analysis is temporarily unavailable',
            errorCategory: category,
            requestId: req.requestId || null,
        });
    }
});

expensesRouter.get('/:id', expenseController.getExpenseById);

expensesRouter.put('/:id', validateBody({ update: true, nonNegative: ['amount'] }), validateBatchOwnership, expenseController.updateExpense);

expensesRouter.delete('/:id', expenseController.deleteExpense);

export default expensesRouter;
