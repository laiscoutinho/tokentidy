export function App() {
    return (
        <div style={{ padding: 12, color: '#4f46e5' }}> {/* expect: spacing/hardcoded, color/hardcoded */}
            <span style={{ width: 120 }}>x</span> {/* expect: size/no-context */}
            {/* tokentidy-ignore-next-line color/hardcoded -- chart legend */}
            <i style={{ color: '#22c55e' }} /> {/* expect: none */}
        </div>
    );
}
