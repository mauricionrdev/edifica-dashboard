import styles from './Table.module.css';

export default function Table({ columns = [], rows = [], rowKey = 'id', className = '', empty = null }) {
  return (
    <div className={[styles.tableWrap, className].filter(Boolean).join(' ')}>
      <table className={styles.table}>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.key} className={column.align === 'right' ? styles.alignRight : ''}>
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length ? rows.map((row, index) => {
            const key = typeof rowKey === 'function' ? rowKey(row, index) : row[rowKey] ?? index;
            return (
              <tr key={key}>
                {columns.map((column) => (
                  <td key={column.key} className={column.align === 'right' ? styles.alignRight : ''}>
                    {column.render ? column.render(row, index) : row[column.key]}
                  </td>
                ))}
              </tr>
            );
          }) : (
            <tr>
              <td className={styles.empty} colSpan={Math.max(columns.length, 1)}>{empty || 'Sem registros'}</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
