import express, { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import { verifyOTP, validateMalaysianPhone, generateOTP, storeOTP } from '../services/otp.service';
import { createMagicLink, verifyMagicLink, validateEmail } from '../services/magic-link.service';
import { generateToken } from '../middleware/auth.middleware';
import prisma from '../lib/prisma';

const router = express.Router();

/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     summary: Login with email and password
 *     description: Authenticates a user with email and password
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 description: User's email address
 *                 example: "sidiq@gantify.my"
 *               password:
 *                 type: string
 *                 description: User's password
 *                 example: "password"
 *     responses:
 *       200:
 *         description: Login successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Login successful"
 *                 token:
 *                   type: string
 *                   example: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
 *                   description: "JWT token for authentication (valid for 7 days)"
 *                 user:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     name:
 *                       type: string
 *                     email:
 *                       type: string
 *                     role:
 *                       type: string
 *       400:
 *         description: Invalid credentials or missing fields
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    // Validate required fields
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: 'Email and password are required'
      });
    }

    // Validate email format
    if (!validateEmail(email)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid email format'
      });
    }

    console.log('Processing login request for:', email);

    // Find user by email
    const user = await prisma.users.findUnique({
      where: { email },
      include: { roles: true }
    });

    if (!user) {
      return res.status(400).json({
        success: false,
        error: 'Invalid email or password'
      });
    }

    // Check if user has a password set
    if (!user.password) {
      return res.status(400).json({
        success: false,
        error: 'Password login not available for this account. Please use OTP or magic link.'
      });
    }

    // Compare password
    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      return res.status(400).json({
        success: false,
        error: 'Invalid email or password'
      });
    }

    console.log('Login successful for user:', email);

    // Generate JWT token
    const token = generateToken({
      userId: user.id,
      phone: user.phone ?? undefined,
      email: user.email ?? undefined,
      role: user.roles?.name
    });

    return res.status(200).json({
      success: true,
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        phoneVerified: user.phoneVerified,
        role: user.roles?.name
      }
    });
  } catch (error) {
    console.error('Error in login endpoint:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * @swagger
 * /api/auth/verify-otp:
 *   post:
 *     summary: Verify OTP and authenticate user
 *     description: Verifies a 6-digit OTP sent via WhatsApp and authenticates the user
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - phone
 *               - otp
 *             properties:
 *               phone:
 *                 type: string
 *                 description: Malaysian phone number (60XXXXXXXXX format)
 *                 example: "60123456789"
 *               otp:
 *                 type: string
 *                 description: 6-digit OTP code
 *                 example: "123456"
 *                 pattern: '^\d{6}$'
 *     responses:
 *       200:
 *         description: OTP verified successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "OTP verified successfully"
 *                 token:
 *                   type: string
 *                   example: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
 *                   description: "JWT token for authentication (valid for 7 days)"
 *                 user:
 *                   $ref: '#/components/schemas/User'
 *       400:
 *         description: Invalid phone number, OTP format, or expired OTP
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post('/verify-otp', async (req: Request, res: Response) => {
  try {
    const { phone, otp } = req.body;

    // Validate required fields
    if (!phone || !otp) {
      return res.status(400).json({
        success: false,
        error: 'Phone number and OTP are required'
      });
    }

    // Validate phone number format
    if (!validateMalaysianPhone(phone)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid Malaysian phone number format'
      });
    }

    // Validate OTP format (6 digits)
    if (!/^\d{6}$/.test(otp)) {
      return res.status(400).json({
        success: false,
        error: 'OTP must be 6 digits'
      });
    }

    console.log('Verifying OTP for phone:', phone);

    // Verify OTP
    const result = await verifyOTP(phone, otp);

    if (!result.success) {
      console.error('OTP verification failed:', result.error);
      return res.status(400).json({
        success: false,
        error: result.error || 'OTP verification failed'
      });
    }

    console.log('OTP verified successfully for phone:', phone);

    if (!result.user) {
      return res.status(400).json({
        success: false,
        error: 'User not found'
      });
    }

    // Fetch full user with roles for token generation
    const fullUser = await prisma.users.findUnique({
      where: { id: result.user.id },
      include: { roles: true }
    });

    if (!fullUser) {
      return res.status(400).json({
        success: false,
        error: 'User not found'
      });
    }

    // Generate JWT token
    const token = generateToken({
      userId: fullUser.id,
      phone: fullUser.phone ?? undefined,
      email: fullUser.email ?? undefined,
      role: fullUser.roles?.name
    });

    return res.status(200).json({
      success: true,
      message: 'OTP verified successfully',
      token,
      user: result.user
    });
  } catch (error) {
    console.error('Error in verify-otp endpoint:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * @swagger
 * /api/auth/magic-link:
 *   post:
 *     summary: Send magic link to user's email
 *     description: Generates and sends a magic link for passwordless authentication. Always returns success for security reasons.
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 description: User's email address
 *                 example: "user@example.com"
 *     responses:
 *       200:
 *         description: Magic link sent (or email not found - doesn't reveal which for security)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "If an account with that email exists, we've sent a magic link."
 *       400:
 *         description: Invalid email format
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post('/magic-link', async (req: Request, res: Response) => {
  try {
    const { email } = req.body;

    // Validate required fields
    if (!email) {
      return res.status(400).json({
        success: false,
        error: 'Email is required'
      });
    }

    // Validate email format
    if (!validateEmail(email)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid email format'
      });
    }

    console.log('Processing magic link request for:', email);

    // Create and send magic link
    const result = await createMagicLink(email);

    if (!result.success) {
      console.error('Failed to create magic link:', result.error);
      return res.status(500).json({
        success: false,
        error: result.error || 'Failed to send magic link'
      });
    }

    console.log('Magic link sent successfully to:', email);

    return res.status(200).json({
      success: true,
      message: result.message || 'If an account with that email exists, we\'ve sent a magic link.'
    });
  } catch (error) {
    console.error('Error in magic-link endpoint:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * POST /api/auth/verify-magic-link
 * Verify magic link token and authenticate user
 *
 * Request body:
 * {
 *   "token": "abc123..."
 * }
 *
 * Response:
 * {
 *   "success": true,
 *   "user": {
 *     "id": "user_123",
 *     "email": "user@example.com",
 *     "name": "John Doe",
 *     "phoneVerified": false
 *   }
 * }
 */
router.post('/verify-magic-link', async (req: Request, res: Response) => {
  try {
    const { token: magicToken } = req.body;

    // Validate required fields
    if (!magicToken) {
      return res.status(400).json({
        success: false,
        error: 'Magic link token is required'
      });
    }

    console.log('Processing magic link verification');

    // Verify magic link token
    const result = await verifyMagicLink(magicToken);

    if (!result.success) {
      console.error('Magic link verification failed:', result.error);
      return res.status(400).json({
        success: false,
        error: result.error || 'Invalid or expired magic link'
      });
    }

    if (!result.user) {
      return res.status(400).json({
        success: false,
        error: 'User not found'
      });
    }

    console.log('Magic link verified successfully for user:', result.user.email);

    // Fetch full user with roles for token generation
    const fullUser = await prisma.users.findUnique({
      where: { id: result.user.id },
      include: { roles: true }
    });

    if (!fullUser) {
      return res.status(400).json({
        success: false,
        error: 'User not found'
      });
    }

    // Generate JWT token
    const token = generateToken({
      userId: fullUser.id,
      phone: fullUser.phone ?? undefined,
      email: fullUser.email ?? undefined,
      role: fullUser.roles?.name
    });

    return res.status(200).json({
      success: true,
      token,
      user: result.user
    });
  } catch (error) {
    console.error('Error in verify-magic-link endpoint:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/auth/verify-magic-link
 * Verify magic link token (alternative GET method for email links)
 *
 * Query params:
 * ?token=abc123...
 *
 * Response:
 * {
 *   "success": true,
 *   "user": {
 *     "id": "user_123",
 *     "email": "user@example.com",
 *     "name": "John Doe"
 *   }
 * }
 */
router.get('/verify-magic-link', async (req: Request, res: Response) => {
  try {
    const { token: magicToken } = req.query;

    // Validate required fields
    if (!magicToken || typeof magicToken !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Magic link token is required'
      });
    }

    console.log('Processing magic link verification (GET)');

    // Verify magic link token
    const result = await verifyMagicLink(magicToken);

    if (!result.success) {
      console.error('Magic link verification failed:', result.error);
      return res.status(400).json({
        success: false,
        error: result.error || 'Invalid or expired magic link'
      });
    }

    if (!result.user) {
      return res.status(400).json({
        success: false,
        error: 'User not found'
      });
    }

    console.log('Magic link verified successfully for user:', result.user.email);

    // Fetch full user with roles for token generation
    const fullUser = await prisma.users.findUnique({
      where: { id: result.user.id },
      include: { roles: true }
    });

    if (!fullUser) {
      return res.status(400).json({
        success: false,
        error: 'User not found'
      });
    }

    // Generate JWT token
    const token = generateToken({
      userId: fullUser.id,
      phone: fullUser.phone ?? undefined,
      email: fullUser.email ?? undefined,
      role: fullUser.roles?.name
    });

    // Redirect to frontend with token and user email
    const frontendUrl = process.env.FRONTEND_URL || 'https://app.gantify.my';
    return res.redirect(`${frontendUrl}/auth/success?token=${encodeURIComponent(token)}&email=${encodeURIComponent(fullUser.email || '')}`);
  } catch (error) {
    console.error('Error in verify-magic-link endpoint:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * @swagger
 * /api/auth/center/signup/request-otp:
 *   post:
 *     summary: Request OTP for center sign-up (Step 1)
 *     description: Send WhatsApp OTP to phone number for center registration. No authentication required.
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - phone
 *             properties:
 *               phone:
 *                 type: string
 *                 description: Malaysian phone number (60XXXXXXXXX format)
 *                 example: "60123456789"
 *     responses:
 *       200:
 *         description: OTP sent successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "OTP sent to your phone. Valid for 5 minutes."
 *       400:
 *         description: Invalid phone number or phone already registered
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post('/center/signup/request-otp', async (req: Request, res: Response) => {
  try {
    const { phone } = req.body;

    // Validate phone number
    if (!phone) {
      return res.status(400).json({
        success: false,
        error: 'Phone number is required'
      });
    }

    if (!validateMalaysianPhone(phone)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid Malaysian phone number format. Use format: 60XXXXXXXXX'
      });
    }

    console.log('Center sign-up: OTP request for phone:', phone);

    // Check if phone already exists and is verified
    const existingUser = await prisma.users.findUnique({
      where: { phone }
    });

    if (existingUser && existingUser.phoneVerified) {
      return res.status(400).json({
        success: false,
        error: 'Phone number already registered. Please login instead.'
      });
    }

    // Generate OTP
    const otpCode = generateOTP();
    const expiryMinutes = 5;

    console.log('Generated OTP for sign-up:', { phone, otpCode }); // Remove in production

    // Store OTP in database
    const storeResult = await storeOTP(phone, otpCode, expiryMinutes);

    if (!storeResult.success) {
      return res.status(500).json({
        success: false,
        error: 'Failed to generate OTP',
        details: storeResult.error
      });
    }

    // Send OTP via WhatsApp
    const { sendAuthenticationOtp } = await import('../lib/whatsapp/templates');
    const whatsappResult = await sendAuthenticationOtp(phone, {
      otpCode,
      expiryMinutes: expiryMinutes.toString()
    });

    if (!whatsappResult.success) {
      console.error('Failed to send WhatsApp OTP:', whatsappResult.error);
      return res.status(500).json({
        success: false,
        error: 'Failed to send OTP via WhatsApp',
        details: whatsappResult.error
      });
    }

    console.log('OTP sent successfully via WhatsApp to:', phone);

    return res.status(200).json({
      success: true,
      message: `OTP sent to your phone. Valid for ${expiryMinutes} minutes.`
    });

  } catch (error) {
    console.error('Error in center signup request-otp:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * @swagger
 * /api/auth/center/signup/complete:
 *   post:
 *     summary: Complete center sign-up with OTP verification (Step 2)
 *     description: Verify OTP and create center account with all required details
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - phone
 *               - otp
 *               - name
 *               - email
 *               - address
 *               - postcode
 *               - city
 *               - state
 *               - whatsapp_number
 *             properties:
 *               phone:
 *                 type: string
 *                 description: Malaysian phone number used for OTP
 *                 example: "60123456789"
 *               otp:
 *                 type: string
 *                 description: 6-digit OTP code received via WhatsApp
 *                 example: "123456"
 *               name:
 *                 type: string
 *                 description: Center name
 *                 example: "CIC Presint 15"
 *               email:
 *                 type: string
 *                 format: email
 *                 description: Center email address
 *                 example: "center@example.com"
 *               address:
 *                 type: string
 *                 description: Center address
 *                 example: "Jalan Presint 15"
 *               postcode:
 *                 type: string
 *                 description: Postcode
 *                 example: "62000"
 *               city:
 *                 type: string
 *                 description: City
 *                 example: "Putrajaya"
 *               state:
 *                 type: string
 *                 description: State
 *                 example: "Putrajaya"
 *               whatsapp_number:
 *                 type: string
 *                 description: WhatsApp number for notifications
 *                 example: "60123456789"
 *               location:
 *                 type: string
 *                 description: Location coordinates (optional)
 *                 example: "2.9264,101.6964"
 *     responses:
 *       201:
 *         description: Center account created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Center account created successfully"
 *                 token:
 *                   type: string
 *                   example: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
 *                 user:
 *                   type: object
 *                 center:
 *                   type: object
 *       400:
 *         description: Invalid OTP or missing required fields
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post('/center/signup/complete', async (req: Request, res: Response) => {
  try {
    const {
      phone,
      otp,
      name,
      email,
      address,
      postcode,
      city,
      state,
      whatsapp_number,
      location
    } = req.body;

    // Validate required fields
    const requiredFields = ['phone', 'otp', 'name', 'email', 'address', 'postcode', 'city', 'state', 'whatsapp_number'];
    const missingFields = requiredFields.filter(field => !req.body[field]);

    if (missingFields.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields',
        missingFields
      });
    }

    // Validate phone number
    if (!validateMalaysianPhone(phone)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid Malaysian phone number format'
      });
    }

    // Validate email format
    if (!validateEmail(email)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid email format'
      });
    }

    // Validate OTP format
    if (!/^\d{6}$/.test(otp)) {
      return res.status(400).json({
        success: false,
        error: 'OTP must be 6 digits'
      });
    }

    console.log('Center sign-up: Verifying OTP for phone:', phone);

    // Verify OTP
    const otpResult = await verifyOTP(phone, otp);

    if (!otpResult.success) {
      return res.status(400).json({
        success: false,
        error: otpResult.error || 'OTP verification failed'
      });
    }

    console.log('OTP verified successfully. Creating center account...');

    // Check if email already exists
    const existingCenter = await prisma.centers.findUnique({
      where: { email }
    });

    if (existingCenter) {
      return res.status(400).json({
        success: false,
        error: 'Email already registered. Please use a different email.'
      });
    }

    // Get the verified user (created during OTP storage)
    const user = await prisma.users.findUnique({
      where: { phone }
    });

    if (!user) {
      return res.status(400).json({
        success: false,
        error: 'User not found. Please request OTP again.'
      });
    }

    // Update user with name and email
    const updatedUser = await prisma.users.update({
      where: { phone },
      data: {
        name,
        email,
        updated_at: new Date()
      },
      include: {
        roles: true
      }
    });

    // Create center record
    const center = await prisma.centers.create({
      data: {
        id: `center_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        name,
        email,
        phone,
        address,
        postcode,
        city,
        state,
        whatsapp_number,
        location: location || null,
        user_id: user.id
      },
      include: {
        users: true
      }
    });

    console.log('Center account created successfully:', center.id);

    // Generate JWT token
    const token = generateToken({
      userId: updatedUser.id,
      phone: updatedUser.phone ?? undefined,
      email: updatedUser.email ?? undefined,
      role: updatedUser.roles?.name
    });

    return res.status(201).json({
      success: true,
      message: 'Center account created successfully',
      token,
      user: {
        id: updatedUser.id,
        name: updatedUser.name,
        email: updatedUser.email,
        phone: updatedUser.phone,
        phoneVerified: updatedUser.phoneVerified
      },
      center: {
        id: center.id,
        name: center.name,
        email: center.email,
        phone: center.phone,
        address: center.address,
        city: center.city,
        state: center.state
      }
    });

  } catch (error) {
    console.error('Error in center signup complete:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * @swagger
 * /api/auth/request-login-otp:
 *   post:
 *     summary: Request OTP for login (existing users)
 *     description: Send WhatsApp OTP to existing user's phone number for login. No authentication required.
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - phone
 *             properties:
 *               phone:
 *                 type: string
 *                 description: Malaysian phone number (60XXXXXXXXX format)
 *                 example: "60123456789"
 *     responses:
 *       200:
 *         description: OTP sent successfully (always returns success for security)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "If an account exists with this phone, OTP has been sent. Valid for 5 minutes."
 *       400:
 *         description: Invalid phone number format
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post('/request-login-otp', async (req: Request, res: Response) => {
  try {
    const { phone } = req.body;

    // Validate phone number
    if (!phone) {
      return res.status(400).json({
        success: false,
        error: 'Phone number is required'
      });
    }

    if (!validateMalaysianPhone(phone)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid Malaysian phone number format. Use format: 60XXXXXXXXX'
      });
    }

    console.log('Login OTP request for phone:', phone);

    // Check if user exists
    const existingUser = await prisma.users.findUnique({
      where: { phone }
    });

    // For security, always return success even if user doesn't exist
    // This prevents phone number enumeration attacks
    if (!existingUser) {
      console.log('User not found for phone:', phone, '(returning success for security)');
      return res.status(200).json({
        success: true,
        message: 'If an account exists with this phone, OTP has been sent. Valid for 5 minutes.'
      });
    }

    // Generate OTP
    const otpCode = generateOTP();
    const expiryMinutes = 5;

    console.log('Generated OTP for login:', { phone, otpCode }); // Remove in production

    // Store OTP in database
    const storeResult = await storeOTP(phone, otpCode, expiryMinutes);

    if (!storeResult.success) {
      return res.status(500).json({
        success: false,
        error: 'Failed to generate OTP',
        details: storeResult.error
      });
    }

    // Send OTP via WhatsApp
    const { sendAuthenticationOtp } = await import('../lib/whatsapp/templates');
    const whatsappResult = await sendAuthenticationOtp(phone, {
      otpCode,
      expiryMinutes: expiryMinutes.toString()
    });

    if (!whatsappResult.success) {
      console.error('Failed to send WhatsApp OTP:', whatsappResult.error);
      return res.status(500).json({
        success: false,
        error: 'Failed to send OTP via WhatsApp',
        details: whatsappResult.error
      });
    }

    console.log('Login OTP sent successfully via WhatsApp to:', phone);

    return res.status(200).json({
      success: true,
      message: 'If an account exists with this phone, OTP has been sent. Valid for 5 minutes.'
    });

  } catch (error) {
    console.error('Error in request-login-otp:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;
