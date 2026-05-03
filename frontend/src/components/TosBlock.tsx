interface Props {
  title: string;
  children: React.ReactNode;
}

export default function TosBlock({ title, children }: Props) {
  return (
    <div>
      <div className="font-display text-base mb-1.5" style={{ color: "var(--text-primary)" }}>{title}</div>
      <div>{children}</div>
    </div>
  );
}
