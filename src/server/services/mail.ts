
/** P1: Resend 接続。本文に機微情報を含めない（NOTIFY-02） */
export async function sendOtpMail(to: string, otp: string): Promise<void> {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: process.env.MAIL_FROM ?? "noreply@example.com",
      to,
      subject: "ログイン用の確認コード",
      text: `確認コード: ${otp}\n5分以内に入力してください。心当たりがない場合は無視してください。`,
    }),
  });
  if (!res.ok) throw new Error(`mail send failed: ${res.status}`);
}
