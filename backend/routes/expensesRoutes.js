import * as expenseController from '../controllers/expensesController.js';
import express from 'express';

const expensesRouter = express.Router();

expensesRouter.post('/create', expenseController.createExpense);

expensesRouter.get('/all', expenseController.getAllExpenses);

// Summary must come before :id
expensesRouter.get('/summary', expenseController.getExpenseSummary);

expensesRouter.get('/:id', expenseController.getExpenseById);

expensesRouter.put('/:id', expenseController.updateExpense);

expensesRouter.delete('/:id', expenseController.deleteExpense);

export default expensesRouter;
