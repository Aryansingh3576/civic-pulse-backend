const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM = process.env.EMAIL_FROM || 'CivicPulse <onboarding@resend.dev>';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'weareteamclarity@gmail.com';

// ── Shared email wrapper ──
function emailLayout(title, bodyContent) {
    return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title></head>
<body style="margin:0;padding:0;background:#f4f6f8;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f8;padding:40px 0;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
<!-- Header -->
<tr><td style="background:linear-gradient(135deg,#0d7377 0%,#14919b 100%);padding:32px 40px;">
<h1 style="margin:0;color:#ffffff;font-size:24px;font-weight:700;">CivicPulse</h1>
<p style="margin:8px 0 0;color:rgba(255,255,255,0.85);font-size:14px;">Smart Civic Issue Reporting</p>
</td></tr>
<!-- Body -->
<tr><td style="padding:32px 40px;">
${bodyContent}
</td></tr>
<!-- Footer -->
<tr><td style="padding:24px 40px;background:#f8fafb;border-top:1px solid #e8ecf0;">
<p style="margin:0;color:#8896a4;font-size:12px;text-align:center;">
© ${new Date().getFullYear()} CivicPulse · Automated notification · Do not reply
</p>
</td></tr>
</table>
</td></tr></table></body></html>`;
}

// ── Status colors ──
const statusColors = {
    'Submitted': '#6366f1',
    'Assigned': '#3b82f6',
    'In Progress': '#f59e0b',
    'Resolved': '#10b981',
    'Closed': '#6b7280',
};

// ── 1. Complaint Confirmation → Citizen ──
exports.sendComplaintConfirmation = async (userEmail, complaint) => {
    const body = `
<h2 style="margin:0 0 16px;color:#1a2332;font-size:20px;">Your Report Has Been Filed ✅</h2>
<p style="color:#516275;font-size:15px;line-height:1.6;">
Thank you for reporting a civic issue. Your complaint has been registered and will be reviewed shortly.
</p>
<table width="100%" style="margin:24px 0;border-collapse:collapse;">
<tr><td style="padding:12px 16px;background:#f0fdf4;border-radius:8px 8px 0 0;border-bottom:1px solid #e8ecf0;">
<strong style="color:#065f46;">Report ID</strong></td>
<td style="padding:12px 16px;background:#f0fdf4;border-radius:8px 8px 0 0;border-bottom:1px solid #e8ecf0;text-align:right;">
<code style="color:#065f46;font-size:13px;">${String(complaint._id).substring(0, 12)}...</code></td></tr>
<tr><td style="padding:12px 16px;border-bottom:1px solid #f0f2f5;">
<strong style="color:#374151;">Title</strong></td>
<td style="padding:12px 16px;border-bottom:1px solid #f0f2f5;text-align:right;color:#516275;">
${complaint.title || 'Untitled'}</td></tr>
<tr><td style="padding:12px 16px;border-bottom:1px solid #f0f2f5;">
<strong style="color:#374151;">Status</strong></td>
<td style="padding:12px 16px;border-bottom:1px solid #f0f2f5;text-align:right;">
<span style="background:#6366f1;color:white;padding:4px 12px;border-radius:20px;font-size:12px;">Submitted</span></td></tr>
<tr><td style="padding:12px 16px;">
<strong style="color:#374151;">Location</strong></td>
<td style="padding:12px 16px;text-align:right;color:#516275;">
${complaint.address || 'Not specified'}</td></tr>
</table>
<p style="color:#516275;font-size:14px;">You will receive updates as your complaint progresses through the resolution pipeline.</p>`;

    try {
        await resend.emails.send({
            from: FROM,
            to: [userEmail],
            subject: `Report Filed: ${complaint.title || 'New Issue'} — CivicPulse`,
            html: emailLayout('Report Confirmation', body),
        });
        console.log(`✉️  Confirmation email sent to ${userEmail}`);
    } catch (err) {
        console.error('Failed to send confirmation email:', err.message);
    }
};

// ── 2. Status Update → Citizen ──
exports.sendStatusUpdate = async (userEmail, complaint, newStatus) => {
    const color = statusColors[newStatus] || '#6b7280';
    const body = `
<h2 style="margin:0 0 16px;color:#1a2332;font-size:20px;">Status Update 🔄</h2>
<p style="color:#516275;font-size:15px;line-height:1.6;">
Your complaint has been updated. Here's the latest:
</p>
<div style="margin:24px 0;padding:24px;background:#f8fafb;border-radius:12px;border-left:4px solid ${color};">
<p style="margin:0 0 8px;font-size:13px;color:#8896a4;text-transform:uppercase;letter-spacing:1px;">Report</p>
<p style="margin:0 0 16px;font-size:16px;font-weight:600;color:#1a2332;">${complaint.title || 'Untitled'}</p>
<p style="margin:0 0 8px;font-size:13px;color:#8896a4;text-transform:uppercase;letter-spacing:1px;">New Status</p>
<span style="background:${color};color:white;padding:6px 16px;border-radius:20px;font-size:13px;font-weight:600;">
${newStatus}</span>
</div>
${newStatus === 'Resolved' ? `
<div style="margin:16px 0;padding:16px;background:#f0fdf4;border-radius:8px;">
<p style="margin:0;color:#065f46;font-size:14px;">🎉 <strong>Great news!</strong> Your issue has been resolved. You earned <strong>+50 points</strong>!</p>
</div>` : ''}
<p style="color:#516275;font-size:14px;">Thank you for helping make your community better.</p>`;

    try {
        await resend.emails.send({
            from: FROM,
            to: [userEmail],
            subject: `Status Update: ${complaint.title || 'Issue'} → ${newStatus} — CivicPulse`,
            html: emailLayout('Status Update', body),
        });
        console.log(`✉️  Status update email sent to ${userEmail}`);
    } catch (err) {
        console.error('Failed to send status update email:', err.message);
    }
};

// ── 3. Admin Alert → Admin ──
exports.sendAdminAlert = async (complaint) => {
    const body = `
<h2 style="margin:0 0 16px;color:#1a2332;font-size:20px;">🚨 New Complaint Received</h2>
<p style="color:#516275;font-size:15px;line-height:1.6;">
A new civic issue has been reported and requires your attention.
</p>
<table width="100%" style="margin:24px 0;border-collapse:collapse;">
<tr><td style="padding:12px 16px;background:#fef3c7;border-radius:8px 8px 0 0;border-bottom:1px solid #e8ecf0;">
<strong style="color:#92400e;">Report ID</strong></td>
<td style="padding:12px 16px;background:#fef3c7;border-radius:8px 8px 0 0;border-bottom:1px solid #e8ecf0;text-align:right;">
<code style="color:#92400e;font-size:13px;">${String(complaint._id).substring(0, 12)}...</code></td></tr>
<tr><td style="padding:12px 16px;border-bottom:1px solid #f0f2f5;">
<strong style="color:#374151;">Title</strong></td>
<td style="padding:12px 16px;border-bottom:1px solid #f0f2f5;text-align:right;color:#516275;">
${complaint.title || 'Untitled'}</td></tr>
<tr><td style="padding:12px 16px;border-bottom:1px solid #f0f2f5;">
<strong style="color:#374151;">Location</strong></td>
<td style="padding:12px 16px;border-bottom:1px solid #f0f2f5;text-align:right;color:#516275;">
${complaint.address || 'Not specified'}</td></tr>
<tr><td style="padding:12px 16px;">
<strong style="color:#374151;">Description</strong></td>
<td style="padding:12px 16px;text-align:right;color:#516275;">
${(complaint.description || 'No description').substring(0, 120)}</td></tr>
</table>
<p style="color:#516275;font-size:14px;">Log in to the Admin Dashboard to review and assign this ticket.</p>`;

    try {
        await resend.emails.send({
            from: FROM,
            to: [ADMIN_EMAIL],
            subject: `🚨 New Report: ${complaint.title || 'Issue'} — CivicPulse Admin`,
            html: emailLayout('Admin Alert', body),
        });
        console.log(`✉️  Admin alert email sent to ${ADMIN_EMAIL}`);
    } catch (err) {
        console.error('Failed to send admin alert email:', err.message);
    }
};

// ── 4. OTP Verification Email ──
exports.sendOTPEmail = async (userEmail, otp, userName) => {
    const body = `
<h2 style="margin:0 0 16px;color:#1a2332;font-size:20px;">Verify Your Account 🔐</h2>
<p style="color:#516275;font-size:15px;line-height:1.6;">
Hi ${userName || 'there'},<br>
Thank you for registering with CivicPulse. Please use the following OTP to verify your email address:
</p>
<div style="margin:24px 0;text-align:center;">
<div style="display:inline-block;background:linear-gradient(135deg,#0d7377 0%,#14919b 100%);color:#ffffff;padding:20px 40px;border-radius:16px;font-size:36px;font-weight:700;letter-spacing:8px;font-family:'Courier New',monospace;">
${otp}
</div>
</div>
<p style="color:#516275;font-size:14px;text-align:center;">
This OTP is valid for <strong>10 minutes</strong>. Do not share it with anyone.
</p>
<div style="margin:24px 0;padding:16px;background:#fef3c7;border-radius:8px;">
<p style="margin:0;color:#92400e;font-size:13px;">
⚠️ If you didn't create an account on CivicPulse, please ignore this email.
</p>
</div>`;

    try {
        await resend.emails.send({
            from: FROM,
            to: [userEmail],
            subject: `Your CivicPulse OTP: ${otp}`,
            html: emailLayout('Email Verification', body),
        });
        console.log(`✉️  OTP email sent to ${userEmail}`);
    } catch (err) {
        console.error('Failed to send OTP email:', err.message);
    }
};

// ── 5. Welcome Email (after verification) ──
exports.sendWelcomeEmail = async (userEmail, userName) => {
    const body = `
<h2 style="margin:0 0 16px;color:#1a2332;font-size:20px;">Welcome to CivicPulse! 🎉</h2>
<p style="color:#516275;font-size:15px;line-height:1.6;">
Hi ${userName || 'there'},<br>
Your account has been verified successfully. You're now a part of the CivicPulse community!
</p>
<div style="margin:24px 0;padding:20px;background:#f0fdf4;border-radius:12px;">
<p style="margin:0 0 12px;color:#065f46;font-size:15px;font-weight:600;">Here's what you can do:</p>
<ul style="margin:0;padding:0 0 0 20px;color:#065f46;font-size:14px;line-height:2;">
<li>📝 Report civic issues in your area</li>
<li>👍 Upvote community posts to prioritize action</li>
<li>📊 Track your complaints in real-time</li>
<li>🏆 Earn points and climb the leaderboard</li>
</ul>
</div>
<div style="margin:24px 0;padding:16px;background:#eff6ff;border-radius:8px;">
<p style="margin:0;color:#1e40af;font-size:14px;">
🎁 You've been awarded <strong>10 welcome points</strong> to get started!
</p>
</div>
<p style="color:#516275;font-size:14px;">Start making your community better today!</p>`;

    try {
        await resend.emails.send({
            from: FROM,
            to: [userEmail],
            subject: `Welcome to CivicPulse, ${userName}! 🎉`,
            html: emailLayout('Welcome', body),
        });
        console.log(`✉️  Welcome email sent to ${userEmail}`);
    } catch (err) {
        console.error('Failed to send welcome email:', err.message);
    }
};

