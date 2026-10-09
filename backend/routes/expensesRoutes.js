import * as expenseController from '../controllers/expensesController.js';
import express from 'express';
import { authMiddleware } from '../middlewares/authMiddleware.js';
import { validateBody } from '../middlewares/validate.js';

const expensesRouter = express.Router();
expensesRouter.use(authMiddleware);

expensesRouter.post('/create', validateBody({ required: ['expense_type', 'amount', 'expense_date'], nonNegative: ['amount'] }), expenseController.createExpense);

expensesRouter.get('/all', expenseController.getAllExpenses);

expensesRouter.get('/summary', expenseController.getExpenseSummary);

expensesRouter.get('/:id', expenseController.getExpenseById);

expensesRouter.put('/:id', expenseController.updateExpense);

expensesRouter.delete('/:id', expenseController.deleteExpense);

export default expensesRouter;
