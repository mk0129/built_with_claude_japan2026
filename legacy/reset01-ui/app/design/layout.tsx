/**
 * デザイン比較用プレビュー（医療者のみ・本番の患者 UI とは独立）。
 * 患者画面と同じ外枠（patient-shell / max-w-md）で描画し、下部タブは出さない。
 * 本番の LearnClient / QuizClient には手を入れず、ここで案を並べて比較する。
 */
export default function DesignLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="patient-shell flex-1 flex flex-col w-full overflow-x-clip">
      <div className="flex-1 flex flex-col max-w-md w-full mx-auto">
        <div className="patient-content flex-1 px-4 pt-5">{children}</div>
      </div>
    </div>
  );
}
