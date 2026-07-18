import supabase from '../config/supabase.js';

// CREATE
export const createExpense = async (req, res) => {
    try {
        const {
            batch_id,
            expense_type,
            amount,
            expense_date,
            description
        } = req.body;

        const { data, error } = await supabase
            .from('expenses')
            .insert([{
                batch_id,
                expense_type,
                amount,
                expense_date,
                description
            }])
            .select();

        if (error) throw error;

        res.status(201).json({
            success: true,
            data
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

// VIEW ALL
export const getAllExpenses = async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('expenses')
            .select('*')
            .order('expense_date', { ascending: false });

        if (error) throw error;

        res.status(200).json({
            success: true,
            count: data.length,
            data
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

// VIEW BY ID
export const getExpenseById = async (req, res) => {
    try {
        const { id } = req.params;

        const { data, error } = await supabase
            .from('expenses')
            .select('*')
            .eq('id', id)
            .single();

        if (error) throw error;

        res.status(200).json({
            success: true,
            data
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

// UPDATE
export const updateExpense = async (req, res) => {
    try {
        const { id } = req.params;

        const { data, error } = await supabase
            .from('expenses')
            .update(req.body)
            .eq('id', id)
            .select();

        if (error) throw error;

        res.status(200).json({
            success: true,
            message: 'Expense updated successfully',
            data
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

// DELETE
export const deleteExpense = async (req, res) => {
    try {
        const { id } = req.params;

        const { error } = await supabase
            .from('expenses')
            .delete()
            .eq('id', id);

        if (error) throw error;

        res.status(200).json({
            success: true,
            message: 'Expense deleted successfully'
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

// SUMMARY
export const getExpenseSummary = async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('expenses')
            .select('*');

        if (error) throw error;

        const totalExpenses = data.reduce(
            (sum, expense) => sum + Number(expense.amount),
            0
        );

        res.status(200).json({
            success: true,
            summary: {
                totalRecords: data.length,
                totalExpenses
            }
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};