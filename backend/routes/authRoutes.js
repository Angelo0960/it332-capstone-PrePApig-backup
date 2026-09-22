import * as authController from '../controllers/authController.js';
import express from 'express';

const authRouter = express.Router();

authRouter.post('/register', authController.register);
authRouter.post('/login', authController.login);
authRouter.post('/refresh', authController.refreshToken);


export default authRouter;