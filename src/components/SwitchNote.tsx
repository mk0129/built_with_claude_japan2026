import { SignOutButton } from "@/components/SignOutButton";

/** 別の種別でログイン中のときにログイン画面に出す案内。下のアカウントでログインすると切り替わる */
export function SwitchNote({ name, current }: { name: string; current: "患者" | "医療者" }) {
  return (
    <div className="au-card au-switch" role="status" data-switch-note>
      <p>
        いま <b>{name}</b> さん（{current}）としてログインしています。下のアカウントでログインすると切り替わります。
      </p>
      <SignOutButton to="/" variant="auth" />
    </div>
  );
}
