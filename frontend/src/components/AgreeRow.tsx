import { Check } from "lucide-react";

interface Props {
  checked: boolean;
  onChange: (v: boolean) => void;
  title: string;
  body: React.ReactNode;
}

export default function AgreeRow({ checked, onChange, title, body }: Props) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className="w-full text-left p-4 rounded-xl transition"
      style={{
        background: checked ? "var(--sage-bg)" : "var(--bg-card)",
        border: checked ? "0.5px solid var(--sage-mid)" : "0.5px solid var(--border-mid)",
      }}
    >
      <div className="flex items-start gap-3">
        <div
          className="shrink-0 mt-0.5 transition flex items-center justify-center"
          style={{
            width: 20,
            height: 20,
            borderRadius: 6,
            background: checked ? "var(--sage)" : "transparent",
            border: checked ? "none" : "1.5px solid var(--border-strong)",
          }}
        >
          {checked && <Check size={13} color="white" strokeWidth={3} />}
        </div>
        <div className="flex-1">
          <div className="text-sm font-medium" style={{ color: checked ? "var(--sage)" : "var(--text-primary)" }}>
            {title}
          </div>
          <div className="text-xs mt-1 leading-relaxed" style={{ color: "var(--text-secondary)" }}>
            {body}
          </div>
        </div>
      </div>
    </button>
  );
}
