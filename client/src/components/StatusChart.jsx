const chartTone = (key) => {
  if (key === "available" || key === "pending") return "pending";
  if (key === "inProgress" || key === "in-progress") return "in-progress";
  if (key === "accepted" || key === "completed" || key === "rejected" || key === "cancelled") {
    return key;
  }
  return "pending";
};

const StatusChart = ({ title, items, emptyLabel }) => {
  const values = items.map((item) => item.value);
  const max = Math.max(1, ...values);
  const total = values.reduce((sum, value) => sum + value, 0);

  return (
    <section className="status-chart user-home-panel" aria-label={title}>
      <h3>{title}</h3>
      {total === 0 && <p className="help-request-note">{emptyLabel}</p>}
      <ul className="status-chart-list">
        {items.map((item) => {
          const tone = chartTone(item.key);
          return (
            <li key={item.key}>
              <span className="status-chart-label">{item.label}</span>
              <span className="status-chart-track">
                <span
                  className={`status-chart-fill is-${tone}`}
                  style={{ width: `${(item.value / max) * 100}%` }}
                />
              </span>
              <strong className={`is-${tone}`}>{item.value}</strong>
            </li>
          );
        })}
      </ul>
    </section>
  );
};

export default StatusChart;
