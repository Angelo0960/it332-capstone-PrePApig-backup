import * as expenseController from '../controllers/expensesController.js';
import express from 'express';
import { authMiddleware } from '../middlewares/authMiddleware.js';

const expensesRouter = express.Router();

expensesRouter.post('/create', authMiddleware, expenseController.createExpense);

expensesRouter.get('/all', authMiddleware, expenseController.getAllExpenses);

// Summary must come before :id
expensesRouter.get('/summary', authMiddleware, expenseController.getExpenseSummary);

expensesRouter.get('/:id', authMiddleware, expenseController.getExpenseById);

expensesRouter.put('/:id', authMiddleware, expenseController.updateExpense);

expensesRouter.delete('/:id', authMiddleware, expenseController.deleteExpense);

export default expensesRouter;
