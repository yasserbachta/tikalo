import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);
const fromEmail = process.env.EMAIL_FROM || "noreply@example.com";

export const sendMagicLinkEmail = async (email: string, token: string) => {
  const confirmLink = `${process.env.AUTH_URL}/api/auth/callback/email?token=${token}&email=${email}`;

  await resend.emails.send({
    from: fromEmail,
    to: email,
    subject: "Your login link - Tikalo",
    html: `<p>Click <a href="${confirmLink}">here</a> to log in.</p>`,
  });
};
