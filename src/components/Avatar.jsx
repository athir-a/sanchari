export function Avatar({ name, me = false, small = false }) {
  return (
    <span className={`avatar${me ? ' me' : ''}${small ? ' sm' : ''}`} aria-hidden>
      {name?.[0]?.toUpperCase() || '?'}
    </span>
  );
}
