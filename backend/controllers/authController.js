  import supabase from '../config/supabase.js';
  import jwt from 'jsonwebtoken';

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
    console.log('📥 Login attempt:', { email, password });

    // ── Admin hardcoded ──
    if (email === 'admin' && password === 'admin') {
      const token = jwt.sign(
        { id: 'admin', email: 'admin' },
        process.env.JWT_SECRET,
        { expiresIn: '1d' }
      );
      return res.status(200).json({
        token,
        farmer: { id: 'admin', name: 'Admin' }
      });
    }

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

      // Generate your OWN JWT with the user's ID
      const customToken = jwt.sign(
        { id: data.user.id, email: data.user.email },
        process.env.JWT_SECRET,
        { expiresIn: '1d' }
      );

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