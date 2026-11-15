import nodemailer from 'nodemailer';

const FEEDBACK_DESTINATION = 'aimeofficial4@gmail.com';

export interface FeedbackEmailPayload {
  referenceNumber: string;
  senderName: string;
  senderEmail: string;
  category: string;
  subject: string;
  message: string;
  submittedAt: string;
}

export function isSmtpConfigured(): boolean {
  return Boolean(
    process.env.SMTP_HOST &&
    process.env.SMTP_USER &&
    process.env.SMTP_PASS
  );
}

function createTransporter() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: process.env.SMTP_PORT === '465',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

export async function sendFeedbackNotificationEmail(payload: FeedbackEmailPayload): Promise<{
  sent: boolean;
  status: string;
}> {
  if (!isSmtpConfigured()) {
    return {
      sent: false,
      status: 'smtp_not_configured_saved_to_admin_inbox',
    };
  }

  try {
    const transporter = createTransporter();
    const fromAddr = process.env.SMTP_FROM || process.env.SMTP_USER || 'no-reply@2mr.org';

    await transporter.sendMail({
      from: fromAddr,
      to: FEEDBACK_DESTINATION,
      replyTo: payload.senderEmail,
      subject: `[2MR Feedback ${payload.referenceNumber}] ${payload.category}: ${payload.subject}`,
      text: [
        `New feedback submission received on 2MR – To Master Research`,
        ``,
        `Reference Number: ${payload.referenceNumber}`,
        `Sender Name: ${payload.senderName}`,
        `Sender Email: ${payload.senderEmail}`,
        `Category: ${payload.category}`,
        `Subject: ${payload.subject}`,
        `Submission Date: ${payload.submittedAt}`,
        ``,
        `Message:`,
        payload.message,
      ].join('\n'),
    });

    return { sent: true, status: 'sent' };
  } catch (error) {
    console.error('SMTP feedback email error:', error);
    return { sent: false, status: 'smtp_delivery_failed_saved_to_db' };
  }
}

export async function sendAdminReplyEmail(params: {
  recipientEmail: string;
  recipientName: string;
  referenceNumber: string;
  originalSubject: string;
  replyMessage: string;
}): Promise<{ sent: boolean; status: string }> {
  const lowerRecipient = params.recipientEmail.toLowerCase().trim();
  if (lowerRecipient.endsWith('@example.com') || lowerRecipient.endsWith('.example')) {
    return {
      sent: false,
      status: 'blocked_synthetic_domain',
    };
  }
  if (!isSmtpConfigured()) {
    return {
      sent: false,
      status: 'smtp_not_configured_reply_recorded',
    };
  }

  try {
    const transporter = createTransporter();
    const fromAddr = process.env.SMTP_FROM || process.env.SMTP_USER || 'no-reply@2mr.org';

    await transporter.sendMail({
      from: fromAddr,
      to: params.recipientEmail,
      replyTo: '2mr@proton.me',
      subject: `Re: [${params.referenceNumber}] ${params.originalSubject} — 2MR Support`,
      text: [
        `Hello ${params.recipientName || 'Researcher'},`,
        ``,
        `Thank you for contacting 2MR – To Master Research (Ref: ${params.referenceNumber}).`,
        ``,
        params.replyMessage,
        ``,
        `Best regards,`,
        `2MR Support & Administration Team`,
        `2mr@proton.me | Tel: 0780558358`,
      ].join('\n'),
    });

    return { sent: true, status: 'sent' };
  } catch (error) {
    console.error('SMTP reply email error:', error);
    return { sent: false, status: 'smtp_delivery_failed' };
  }
}
