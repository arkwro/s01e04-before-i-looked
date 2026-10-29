import type { DigestRow } from '../digest/types.js';

export function DigestTable({ rows }: { rows: DigestRow[] }) {
  return (
    <table>
      <thead>
        <tr>
          <th>job</th>
          <th>owner</th>
          <th>runs</th>
          <th>retries</th>
          <th>last status</th>
          <th>last error</th>
          <th>first time</th>
          <th>last time</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr class={row.lastStatus === 'fail' || row.retries >= 3 ? 'warn' : undefined}>
            <td>{row.job}</td>
            <td>{row.owner ?? '—'}</td>
            <td>{row.runs}</td>
            <td>{row.retries}</td>
            <td>{row.lastStatus}</td>
            <td>{row.lastError ?? '—'}</td>
            <td>{row.firstAt}</td>
            <td>{row.lastAt}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
