function StatCard({ value = 0, label }) {
  return (
    <article className="rio_blanco-stat-card">
      <strong className="rio_blanco-stat-number">{value}</strong>
      <span className="rio_blanco-stat-label">{label}</span>
    </article>
  )
}

export default StatCard
