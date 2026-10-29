import type { Status } from '../status.js';
import type { DigestCounts } from '../digest/types.js';

export function StatusBoard({
  status,
  nightSummaries,
}: {
  status: Status;
  nightSummaries: Array<{ night: string; counts: DigestCounts }>;
}) {
  return (
    <>
      <h1>status</h1>
      <table>
        <tbody>
          <tr><th>adapter</th><td>{status.adapter}</td></tr>
          <tr><th>installed</th><td>{status.installed}</td></tr>
          <tr>
            <th>last beat</th>
            <td>{status.lastBeat ? `${status.lastBeat.at} · pid ${status.lastBeat.pid}` : <span class="warn">none</span>}</td>
          </tr>
        </tbody>
      </table>
      <h2>nights on disk</h2>
      {status.nights.length === 0 ? (
        <p class="mute">nothing in runs/</p>
      ) : (
        <ul>
          {nightSummaries.map(({ night, counts }) => (
            <li>
              <a href={`/digest/${night}`}>{night}</a>
              {' · '}ok {counts.ok} / retry {counts.retry} / fail {counts.fail}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
