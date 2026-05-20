import { NextResponse } from 'next/server';
import { Resend } from 'resend';
import nodemailer from 'nodemailer';

const PROJECT_ID = 'ritik-coffe-db';
const firestoreBase = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

async function saveOtp(docId: string, otp: string) {
  const expiresAt = new Date();
  expiresAt.setMinutes(expiresAt.getMinutes() + 10); // 10 min expiry
  const url = `${firestoreBase}/otps/${encodeURIComponent(docId)}`;
  await fetch(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fields: {
        otp: { stringValue: otp },
        expiresAt: { stringValue: expiresAt.toISOString() },
        createdAt: { stringValue: new Date().toISOString() },
      },
    }),
  });
}

async function sendEmailOtp(email: string, otp: string): Promise<boolean> {
  const gmailUser = process.env.EMAIL_USER;
  const gmailPass = process.env.EMAIL_PASS;
  const resendApiKey = process.env.RESEND_API_KEY;

  const htmlContent = `
    <div style="font-family:'Helvetica Neue',sans-serif;background:#050505;padding:48px 40px;color:#fff;border-radius:16px;max-width:500px;margin:auto;">
      <div style="margin-bottom:32px;">
        <h1 style="color:#EAC678;font-size:22px;font-weight:600;margin:0 0 4px;">Ritik Coffee Shop</h1>
        <p style="color:#555;font-size:13px;margin:0;">Crafting experiences that defy gravity ☕</p>
      </div>
      <hr style="border:none;border-top:1px solid #1a1a1a;margin-bottom:32px;"/>
      <h2 style="color:#fff;font-size:18px;font-weight:500;margin:0 0 8px;">Your Verification Code</h2>
      <p style="color:#777;font-size:14px;margin:0 0 28px;line-height:1.6;">
        Use the code below to verify your identity. This code expires in <strong style="color:#EAC678;">10 minutes</strong>.
      </p>
      <div style="font-size:42px;font-weight:700;letter-spacing:16px;color:#EAC678;background:#0d0d0d;border:1px solid #222;padding:24px 20px;border-radius:12px;text-align:center;margin-bottom:28px;">
        ${otp}
      </div>
      <p style="color:#444;font-size:12px;line-height:1.6;margin:0;">
        If you didn't request this code, you can safely ignore this email.
      </p>
      <hr style="border:none;border-top:1px solid #1a1a1a;margin-top:32px;margin-bottom:20px;"/>
      <p style="color:#333;font-size:11px;text-align:center;margin:0;">Ritik Coffee Shop · Secure Access System</p>
    </div>
  `;

  let gmailErrDetail = '';
  // 1. Try Gmail (Nodemailer) first if credentials are set
  if (gmailUser && gmailPass) {
    try {
      console.log(`Attempting to send OTP via Gmail to ${email}...`);
      const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
          user: gmailUser,
          pass: gmailPass,
        },
      });

      await transporter.sendMail({
        from: `"Ritik Coffee Shop" <${gmailUser}>`,
        to: email,
        subject: '☕ Your OTP – Ritik Coffee Shop',
        html: htmlContent,
      });

      console.log(`OTP successfully sent via Gmail to ${email}`);
      return true;
    } catch (gmailError: any) {
      console.error('Gmail sending failed, falling back to Resend if available:', gmailError);
      gmailErrDetail = gmailError.message || String(gmailError);
    }
  }

  let resendErrDetail = '';
  // 2. Try Resend if Gmail failed or was not configured
  if (resendApiKey) {
    try {
      console.log(`Attempting to send OTP via Resend to ${email}...`);
      const resend = new Resend(resendApiKey);
      const { data, error } = await resend.emails.send({
        from: 'Ritik Coffee Shop <onboarding@resend.dev>',
        to: email,
        subject: '☕ Your OTP – Ritik Coffee Shop',
        html: htmlContent,
      });

      if (error) {
        throw new Error(error.message);
      }
      console.log(`OTP successfully sent via Resend to ${email}`);
      return true;
    } catch (resendError: any) {
      console.error('Resend sending failed:', resendError);
      resendErrDetail = resendError.message || String(resendError);
    }
  }

  // If one or both was attempted but failed, compile and throw the errors
  if (gmailErrDetail || resendErrDetail) {
    const errorMsg = [
      gmailErrDetail ? `Gmail: ${gmailErrDetail}` : null,
      resendErrDetail ? `Resend: ${resendErrDetail}` : null,
    ].filter(Boolean).join(' | ');
    
    throw new Error(`Email delivery failed (${errorMsg})`);
  }

  // 3. Dev mode fallback if no email providers are configured
  if (process.env.NODE_ENV !== 'production') {
    console.log(`\n📧 [DEV] No email providers configured. OTP for ${email} → ${otp}\n`);
    return true;
  }

  throw new Error('No email provider (Gmail/Resend) is configured.');
}

export async function POST(request: Request) {
  try {
    const { contact } = await request.json();
    if (!contact) return NextResponse.json({ error: 'Email is required' }, { status: 400 });

    const email = contact.trim().toLowerCase();
    if (!email.includes('@')) {
      return NextResponse.json({ error: 'Please enter a valid email address' }, { status: 400 });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    await saveOtp(email, otp);

    const sent = await sendEmailOtp(email, otp);
    if (!sent) {
      return NextResponse.json({ error: 'Failed to send OTP email' }, { status: 500 });
    }

    // NEVER send OTP back to client
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error in /api/send-otp:', error);
    return NextResponse.json({ error: 'Failed to send OTP: ' + error.message }, { status: 500 });
  }
}
