  import { randomUUID } from 'node:crypto';
import supabase from '../config/supabase.js';
  import jwt from 'jsonwebtoken';
  import { revokeToken } from '../middlewares/authMiddleware.js';

  // Register
  export const register = async (req, res) => {
    try {
      const { email, password } = req.body;

      const { data, error } = await supabase.auth.signUp({
        email,
        password
      });

      if (error) {
        return res.status(400).json({
          success: false,
          message: error.message
        });
      }

      res.status(201).json({
        success: true,
        message: 'User registered successfully',
        user: data.user
      });
    } catch (err) {
      console.error('Register Error:', err);
      res.status(500).json({
        success: false,
        message: err.message
      });
    }
  };

  // Login (updated)
  export const login = async (req, res) => {
    const { email, password } = req.body;

    // ── Normal Supabase login ──
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password
      });

      if (error) {
        return res.status(401).json({
          success: false,
          message: error.message
        });
      }

      const jti = randomUUID();
      const customToken = jwt.sign(
        { id: data.user.id, email: data.user.email, jti },
        process.env.JWT_SECRET,
        { expiresIn: '1d' }
      );

      const { error: sessionError } = await supabase
        .from('session_tokens')
        .insert({
          jti,
          user_id: data.user.id,
          expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        });
      if (sessionError) throw sessionError;

      res.status(200).json({
        token: customToken,
        farmer: {
          id: data.user.id,
          email: data.user.email,
          name: data.user.user_metadata?.name || data.user.email
        }
      });
    } catch (err) {
      console.error('Login Error:', err);
      res.status(500).json({
        success: false,
        message: err.message
      });
    }
  };

  // Logout
  export const logout = async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
      if (token) {
        const decoded = jwt.decode(token);
        revokeToken(token, decoded?.exp ? decoded.exp * 1000 : undefined);
        if (decoded?.jti) {
          const { error: revokeError } = await supabase
            .from('session_tokens')
            .update({ revoked_at: new Date().toISOString() })
            .eq('jti', decoded.jti)
            .eq('user_id', req.user.id)
            .is('revoked_at', null);
          if (revokeError) throw revokeError;
        }
      }
      const { error } = await supabase.auth.signOut();
      if (error) {
        return res.status(400).json({
          success: false,
          message: error.message
        });
      }
      res.status(200).json({
        success: true,
        message: 'Logged out successfully'
      });
    } catch (err) {
      console.error('Logout Error:', err);
      res.status(500).json({
        success: false,
        message: err.message
      });
    }
  };