export function FilterCard({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="card"
      style={{
        padding: 16,
        marginBottom: 18,
      }}
    >
      {children}
    </div>
  );
}

