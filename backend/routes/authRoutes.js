import * as authController from '../controllers/authController.js';
import express from 'express';
import { authMiddleware } from '../middlewares/authMiddleware.js';
import { validateBody } from '../middlewares/validate.js';

const authRouter = express.Router();

authRouter.post('/register', validateBody({ required: ['email', 'password'] }), authController.register);
authRouter.post('/login', validateBody({ required: ['email', 'password'] }), authController.login);
authRouter.post('/logout', authMiddleware, authController.logout);

export default authRouter;