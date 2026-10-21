const styles = { gap: 12 };

export function Card({ big }: { big: boolean }) {
  return (
    <div className="card" style={{ padding: 8, marginTop: '16px', color: big ? '#111827' : 'var(--muted)', lineHeight: 1.5, opacity: 0.5 }}>
      <span style={styles}>x</span>
    </div>
  );
}
